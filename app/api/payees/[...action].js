import { randomUUID } from "crypto";
import { getEmailFromReq } from "../_lib/auth.js";
import { loadCtx, publicState, readJsonBody, sendJson, sendError, actionFromUrl } from "../_lib/state.js";
import { withLock } from "../_lib/lock.js";
import { writePayeeRow } from "../_lib/sheets.js";
import { GSTIN_RE, PAN_RE, IFSC_RE } from "../../shared/logic.js";

export default async function handler(req, res) {
  const action = actionFromUrl(req, "/api/payees/");
  const email = getEmailFromReq(req);
  if (!email) return sendError(res, 401, "Sign in with your Kenzen Google account to use the desk.");
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed.");
  const body = readJsonBody(req);

  try {
    if (action === "save") return sendJson(res, 200, await doSave(email, body));
    return sendError(res, 404, "Unknown action.");
  } catch (e) {
    return sendError(res, 400, e.message || "Something went wrong.");
  }
}

async function doSave(email, { rec, id }) {
  rec = rec || {};
  if (!String(rec.name || "").trim()) throw new Error("Enter the payee name.");
  if (rec.gstin && !GSTIN_RE.test(rec.gstin)) throw new Error("That GSTIN doesn't look right.");
  if (rec.pan && !PAN_RE.test(rec.pan)) throw new Error("PAN should be 5 letters, 4 digits, 1 letter.");
  if (rec.account && (!/^[0-9]{6,18}$/.test(rec.account) || !IFSC_RE.test(rec.ifsc || ""))) throw new Error("Check the account number and IFSC.");

  return withLock(async () => {
    const { ctx } = await loadCtx(email);
    const dup = Array.from(ctx.payees.values()).filter(
      (p) => p.id !== id && ((rec.gstin && p.gstin === rec.gstin) || (!rec.gstin && rec.pan && !p.gstin && p.pan === rec.pan))
    )[0];
    if (dup) throw new Error((rec.gstin ? "This GSTIN" : "This PAN") + " is already saved for " + dup.name + ".");

    const now = new Date().toISOString();
    let o;
    if (id) {
      const old = ctx.payees.get(id);
      if (!old) throw new Error("That payee no longer exists.");
      o = { ...old, ...rec, updatedAt: now, updatedBy: email };
      const bankChanged = (old.account || "") !== (rec.account || "") || (old.ifsc || "") !== (rec.ifsc || "") || (old.beneficiary || "") !== (rec.beneficiary || "");
      if (bankChanged) { o.bankChangedAt = now; o.bankChangedBy = email; }
    } else {
      o = { ...rec, id: "py-" + randomUUID().slice(0, 8), createdAt: now, createdBy: email, updatedAt: now, updatedBy: email };
    }
    await writePayeeRow(o);
    return { state: await publicState(email), id: o.id };
  });
}
