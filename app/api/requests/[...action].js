import { randomUUID } from "crypto";
import { getEmailFromReq } from "../_lib/auth.js";
import { loadCtx, publicState, readJsonBody, sendJson, sendError } from "../_lib/state.js";
import { withLock } from "../_lib/lock.js";
import { saveRequest as saveRequestRow, refreshVerdicts } from "../_lib/sheets.js";
import {
  familyId, normInv, statusLabel, checks, passes, myAction, canEditTerms, verdict,
  termsLabel, fmtDate, money, todayISO, TERMS, ACT_LABEL,
} from "../../shared/logic.js";

function pad2(n) { return String(n).padStart(2, "0"); }
function newRequestId() {
  const d = new Date();
  const stamp = String(d.getFullYear()).slice(2) + pad2(d.getMonth() + 1) + pad2(d.getDate());
  return "PR-" + stamp + "-" + randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
}

export default async function handler(req, res) {
  const action = (req.query.action || []).join("/");
  const email = getEmailFromReq(req);
  if (!email) return sendError(res, 401, "Sign in with your Kenzen Google account to use the desk.");
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed.");
  const body = readJsonBody(req);

  try {
    if (action === "save") return sendJson(res, 200, await doSave(email, body));
    if (action === "act") return sendJson(res, 200, await doAct(email, body));
    if (action === "terms") return sendJson(res, 200, await doTerms(email, body));
    return sendError(res, 404, "Unknown action.");
  } catch (e) {
    return sendError(res, 400, e.message || "Something went wrong.");
  }
}

async function doSave(email, { base, editId }) {
  return withLock(async () => {
    const { ctx } = await loadCtx(email);
    const p = ctx.payees.get(base.payeeId);
    if (!p) throw new Error("Choose a payee that's saved in the desk.");
    const isBal = base.kind === "balance";
    const parent = isBal ? ctx.requests.filter((x) => x.id === base.parentId)[0] : null;
    if (isBal && (!parent || parent.status !== "paid" || parent.kind !== "advance")) throw new Error("The advance must be paid before its balance is raised.");
    if (isBal && parent.balanceId && parent.balanceId !== editId) throw new Error("A balance is already raised for " + parent.id + ".");
    const fam = isBal ? parent.id : editId ? (() => { const e = ctx.requests.filter((x) => x.id === editId)[0]; return e ? familyId(e) : null; })() : null;
    const dup = ctx.requests.filter((x) => x.id !== editId && (!fam || familyId(x) !== fam) && x.payeeId === base.payeeId && normInv(x.invoiceNo) === normInv(base.invoiceNo) && x.status !== "withdrawn" && x.status !== "rejected")[0];
    if (dup) throw new Error("This invoice from " + p.name + " is already on " + dup.id + " (" + statusLabel(dup.status) + "). Duplicate payments are blocked.");

    const now = new Date().toISOString();
    const r = { ...base };
    r.payee = { name: p.name, email: p.email || "", gstin: p.gstin || "", pan: p.pan || "", beneficiary: p.beneficiary || "", account: p.account || "", ifsc: p.ifsc || "", bank: p.bank || "" };
    r.levels = Number(r.invoiceTotal) > ctx.settings.tierLimit ? 2 : 1;
    r.tierLimit = ctx.settings.tierLimit;
    r.status = "pending_l1"; r.l1By = null; r.l1At = null; r.l2By = null; r.l2At = null; r.reelCheckedBy = null; r.reelCheckedAt = null; r.overrides = {};
    r.updatedAt = now;

    if (editId) {
      const old = ctx.requests.filter((x) => x.id === editId)[0];
      if (!old || old.requestedBy !== email || old.status !== "rejected") throw new Error("Only a request that was sent back to you can be resubmitted.");
      r.id = old.id; r.requestedBy = old.requestedBy; r.createdAt = old.createdAt; r.balanceId = old.balanceId || null; r.parentId = old.parentId || null;
      r.history = (old.history || []).concat([{ at: now, by: email, action: "resubmitted", note: "" }]);
    } else {
      r.id = newRequestId();
      r.requestedBy = email; r.createdAt = now; r.balanceId = null; r.parentId = isBal ? parent.id : null;
      r.history = [{ at: now, by: email, action: "submitted", note: isBal ? "Balance against advance " + parent.id : "" }];
    }
    await saveRequestRow(ctx, r, r.history.slice(-1), ACT_LABEL);
    ctx.requests = editId ? ctx.requests.map((x) => (x.id === r.id ? r : x)) : [...ctx.requests, r];

    if (isBal && !editId) {
      const hb = { at: now, by: email, action: "balance_raised", note: r.id + " · " + money(r.netPayable) + " net" };
      parent.balanceId = r.id; parent.updatedAt = now; parent.history = (parent.history || []).concat([hb]);
      await saveRequestRow(ctx, parent, [hb], ACT_LABEL);
    }
    await refreshVerdicts(ctx);
    return { state: await publicState(email), id: r.id };
  });
}

async function doAct(email, { id, kind, opts }) {
  opts = opts || {};
  return withLock(async () => {
    const { ctx } = await loadCtx(email);
    const r = ctx.requests.filter((x) => x.id === id)[0];
    if (!r) throw new Error("This request no longer exists.");
    const now = new Date().toISOString();
    const note = String(opts.note || "").trim();
    const a = myAction(ctx, r);
    function log(action, n) { r.history = (r.history || []).concat([{ at: now, by: email, action, note: n || "" }]); }

    if (kind === "approve") {
      if (a !== "approve") throw new Error("You can't approve this request at its current stage.");
      const cs = checks(ctx, r);
      const hard = cs.filter((c) => c.sev === "block" && !c.ovr && !c.ok && c.id !== "reelok");
      if (hard.length) throw new Error("Can't approve: " + hard[0].reason + ". Send it back instead.");
      if (r.isInfluencer && !r.reelCheckedBy) {
        if (!opts.reel) throw new Error("Open the reel and tick the confirmation before approving.");
        r.reelCheckedBy = email; r.reelCheckedAt = now; log("reel_checked", r.reelLink);
      }
      const soft = cs.filter((c) => c.sev === "block" && c.ovr && !passes(c, r));
      if (soft.length) {
        if (!opts.accept || !note) throw new Error("Tick “Accept these exceptions” and explain why in the comment, or send it back.");
        r.overrides = r.overrides || {};
        soft.forEach((c) => { r.overrides[c.id] = { by: email, at: now, note, reason: c.reason }; });
      }
      const n2 = soft.length ? "Accepted exceptions: " + soft.map((c) => c.reason).join("; ") + ". " + note : note;
      if (r.status === "pending_l1") { r.l1By = email; r.l1At = now; r.status = r.levels === 2 ? "pending_l2" : "approved"; log("approved_l1", n2); }
      else { r.l2By = email; r.l2At = now; r.status = "approved"; log("approved_l2", n2); }
    } else if (kind === "reject") {
      if (a !== "approve") throw new Error("You can't send this request back at its current stage.");
      if (!note) throw new Error("Add a comment so the requester knows what to fix.");
      r.status = "rejected"; r.rejectedBy = email; r.rejectedAt = now; log("rejected", note);
    } else if (kind === "withdraw") {
      if (r.requestedBy !== email || ["pending_l1", "pending_l2", "rejected"].indexOf(r.status) < 0) throw new Error("Only the requester can withdraw a request before it's approved.");
      r.status = "withdrawn"; log("withdrawn", note);
      if (r.kind === "balance" && r.parentId) {
        const par = ctx.requests.filter((x) => x.id === r.parentId)[0];
        if (par && par.balanceId === r.id) {
          par.balanceId = null; par.history = (par.history || []).concat([{ at: now, by: email, action: "withdrawn", note: "Balance " + r.id + " withdrawn" }]);
          await saveRequestRow(ctx, par, par.history.slice(-1), ACT_LABEL);
        }
      }
    } else if (kind === "paid") {
      if (a !== "pay") throw new Error("Only Finance can mark an approved request paid.");
      const v = verdict(ctx, r);
      if (v.k !== "yes") throw new Error("Can't mark paid: " + v.reasons.join("; "));
      const utr = String(opts.utr || "").trim().toUpperCase();
      if (utr.length < 6) throw new Error("Enter the UTR or bank reference from the bank statement.");
      r.status = "paid"; r.paidBy = email; r.paidOn = opts.paidOn || todayISO(); r.utr = utr;
      log("paid", "UTR " + utr + " · " + fmtDate(r.paidOn) + " · " + money(r.netPayable));
    } else throw new Error("Unknown action.");

    r.updatedAt = now;
    await saveRequestRow(ctx, r, r.history.slice(-1), ACT_LABEL);
    await refreshVerdicts(ctx);
    return await publicState(email);
  });
}

async function doTerms(email, { id, code, text, due, note }) {
  return withLock(async () => {
    const { ctx } = await loadCtx(email);
    const r = ctx.requests.filter((x) => x.id === id)[0];
    if (!r) throw new Error("This request no longer exists.");
    if (!canEditTerms(ctx, r)) throw new Error("Only approvers can change the terms, and only before payment.");
    if (!TERMS.some((t) => t.v === code)) throw new Error("Choose valid terms.");
    if (code === "custom" && !String(text || "").trim()) throw new Error("Describe the terms.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due || "")) throw new Error("Enter the pay-by date.");
    if (!String(note || "").trim()) throw new Error("Add a reason for the change.");
    const now = new Date().toISOString();
    const before = termsLabel(r) + ", due " + fmtDate(r.dueDate);
    r.termsCode = code; r.termsText = code === "custom" ? String(text).trim() : ""; r.dueDate = due; r.updatedAt = now;
    r.history = (r.history || []).concat([{ at: now, by: email, action: "terms_changed", note: before + " → " + termsLabel(r) + ", due " + fmtDate(due) + ". " + String(note).trim() }]);
    await saveRequestRow(ctx, r, r.history.slice(-1), ACT_LABEL);
    await refreshVerdicts(ctx);
    return await publicState(email);
  });
}
