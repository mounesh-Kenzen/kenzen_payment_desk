/* ===== Shared business logic: ported from the Apps Script shared.js. =====
 * Used identically on the Node API (api/) and in the browser (src/). No GAS/DOM APIs.
 * Functions that need global data (payees, requests, settings, current user) take a
 * `ctx` object as their first argument: { settings, payees:Map, requests:Array, me:{id}, isAdmin }
 */

export const DEFAULT_NATURES = [
  { id: "n-whs", name: "Warehousing & fulfilment charges", section: "194C", rateInd: 1, rateOther: 2, single: 30000, annual: 100000 },
  { id: "n-frt", name: "Freight, transport & courier", section: "194C", rateInd: 1, rateOther: 2, single: 30000, annual: 100000 },
  { id: "n-job", name: "Contract manufacturing / job work", section: "194C", rateInd: 1, rateOther: 2, single: 30000, annual: 100000 },
  { id: "n-pkg", name: "Packaging & printing", section: "194C", rateInd: 1, rateOther: 2, single: 30000, annual: 100000 },
  { id: "n-adv", name: "Advertising, photoshoots & ad production", section: "194C", rateInd: 1, rateOther: 2, single: 30000, annual: 100000 },
  { id: "n-inf", name: "Influencer / creator fees", section: "194J", rateInd: 10, rateOther: 10, single: 0, annual: 50000, influencer: true },
  { id: "n-prof", name: "Professional fees (legal, audit, consulting)", section: "194J", rateInd: 10, rateOther: 10, single: 0, annual: 50000 },
  { id: "n-tech", name: "Technical services & IT support", section: "194J", rateInd: 2, rateOther: 2, single: 0, annual: 50000 },
  { id: "n-rent", name: "Rent – office, warehouse, building", section: "194I", rateInd: 10, rateOther: 10, single: 50000, annual: 0 },
  { id: "n-hire", name: "Hire – plant, machinery, vehicles", section: "194I", rateInd: 2, rateOther: 2, single: 50000, annual: 0 },
  { id: "n-comm", name: "Commission & brokerage", section: "194H", rateInd: 2, rateOther: 2, single: 0, annual: 20000 },
  { id: "n-goods", name: "Raw material / goods purchase", section: "", rateInd: 0, rateOther: 0, single: 0, annual: 0 },
  { id: "n-util", name: "Utilities & reimbursements", section: "", rateInd: 0, rateOther: 0, single: 0, annual: 0 },
];

export const DEFAULT_COST_CENTRES = ["Warehousing & logistics", "Marketing & ads", "Influencer marketing", "Raw material", "Packaging", "Contract manufacturing", "Salaries & contractors", "Rent & utilities", "Software & subscriptions", "Professional fees", "Other"];

export const TERMS = [
  { v: "advance", l: "Advance (before delivery)", days: 0 },
  { v: "receipt", l: "On receipt of invoice", days: 0 },
  { v: "net7", l: "Net 7 days", days: 7 },
  { v: "net15", l: "Net 15 days", days: 15 },
  { v: "net30", l: "Net 30 days", days: 30 },
  { v: "net45", l: "Net 45 days", days: 45 },
  { v: "net60", l: "Net 60 days", days: 60 },
  { v: "net90", l: "Net 90 days", days: 90 },
  { v: "live", l: "After content goes live", days: null },
  { v: "custom", l: "Other terms…", days: null },
];

export const STATUS = {
  pending_l1: { label: "Awaiting Level 1", cls: "s-pending" },
  pending_l2: { label: "Awaiting Level 2", cls: "s-pending" },
  approved: { label: "Approved", cls: "s-approved" },
  rejected: { label: "Sent back", cls: "s-rejected" },
  withdrawn: { label: "Withdrawn", cls: "s-muted" },
  paid: { label: "Paid", cls: "s-paid" },
};

export const ACT_LABEL = {
  submitted: "Raised the request", resubmitted: "Edited and resubmitted", approved_l1: "Approved at Level 1",
  approved_l2: "Approved at Level 2", rejected: "Sent it back", withdrawn: "Withdrew the request", paid: "Marked as paid",
  terms_changed: "Changed the terms of payment", reel_checked: "Confirmed the reel is live", balance_raised: "Raised the balance payment",
};

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const HANDLE_RE = /^@?[A-Za-z0-9._]{1,30}$/;
export const REEL_RE = /^https?:\/\/(www\.)?instagram\.com\/(reel|reels|p|tv)\/[A-Za-z0-9_-]{5,}\/?(\?.*)?$/i;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
export function inr(n, dp) {
  n = Number(n) || 0; const neg = n < 0; n = Math.abs(n);
  const parts = n.toFixed(dp).split("."); let i = parts[0]; let last3 = i.slice(-3); let rest = i.slice(0, -3);
  if (rest) last3 = "," + last3;
  rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return (neg ? "-" : "") + "₹" + rest + last3 + (dp ? "." + parts[1] : "");
}
export function money(n) { return inr(n, 2); }
export function money0(n) { return inr(Math.round(Number(n) || 0), 0); }
function pad2(n) { return String(n).padStart(2, "0"); }
function isoLocal(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
export function todayISO() { return isoLocal(new Date()); }
export function addDays(iso, n) { const p = iso.split("-"); const d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return isoLocal(d); }
export function fmtDate(iso) {
  if (!iso) return "—";
  const d = String(iso).length === 10 ? (p => new Date(+p[0], +p[1] - 1, +p[2]))(String(iso).split("-")) : new Date(iso);
  if (isNaN(d)) return "—";
  return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
}
export function fmtWhen(iso) { const d = new Date(iso); if (isNaN(d)) return ""; const h = d.getHours(); const m = pad2(d.getMinutes()); return fmtDate(iso) + ", " + ((h % 12) || 12) + ":" + m + (h < 12 ? " am" : " pm"); }
export function normInv(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
export function panEntity(pan) { if (!pan || !PAN_RE.test(pan)) return null; const c = pan[3]; return (c === "P" || c === "H") ? "individual" : "other"; }
export function handleClean(h) { return String(h || "").trim().replace(/^@/, ""); }
export function last4(a) { return a ? "••" + String(a).slice(-4) : "—"; }
export function termsLabel(r) { if (r.termsCode === "custom") return r.termsText || "Other terms"; const t = TERMS.filter(x => x.v === r.termsCode)[0]; return t ? t.l : "—"; }
export function fyOf(iso) { const d = iso || todayISO(); const y = +String(d).slice(0, 4); const m = +String(d).slice(5, 7); return m >= 4 ? y : y - 1; }
export function fyLabel(y) { return "FY " + y + "-" + pad2((y + 1) % 100); }
export function familyId(r) { return r.parentId || r.id; }
export function tdsText(r) { return r.tdsApplied ? (r.tdsSectionCode + " @ " + r.tdsRate + "%") : (r.tdsSectionCode ? (r.tdsSectionCode + ": below threshold") : "No TDS"); }
export function kindLabel(r) { return r.kind === "advance" ? "Advance" : r.kind === "balance" ? "Balance" : "Full payment"; }
export function statusLabel(s) { return (STATUS[s] || { label: s }).label; }

export function mergeSettings(x, natures) {
  x = x || {};
  const nats = (natures && natures.length ? natures : DEFAULT_NATURES).map(n => ({
    id: String(n.id || ""), name: String(n.name || ""), section: String(n.section || "").toUpperCase().trim(),
    rateInd: Number(n.rateInd) || 0, rateOther: Number(n.rateOther) || 0, single: Number(n.single) || 0, annual: Number(n.annual) || 0,
    influencer: !!n.influencer, inactive: !!n.inactive,
  }));
  const roles = x.roles || {};
  const lc = a => (a || []).map(e => String(e).trim().toLowerCase()).filter(Boolean);
  return {
    tierLimit: Number(x.tierLimit) > 0 ? Number(x.tierLimit) : 50000,
    companyGstins: Array.isArray(x.companyGstins) ? x.companyGstins : [],
    costCentres: Array.isArray(x.costCentres) && x.costCentres.length ? x.costCentres : DEFAULT_COST_CENTRES.slice(),
    names: x.names || {},
    natures: nats,
    aiExtraction: !!x.aiExtraction,
    // Google email domains allowed to sign in. Empty here means "not yet
    // configured by an admin" — the server falls back to the ALLOWED_DOMAIN
    // env var in that case (see api/_lib/sheets.js getAllowedDomains()).
    allowedDomains: lc(x.allowedDomains),
    roles: { admin: lc(roles.admin), approver1: lc(roles.approver1), approver2: lc(roles.approver2), finance: lc(roles.finance) },
  };
}

export function natureById(ctx, id) { return ctx.settings.natures.filter(n => n.id === id)[0]; }
export function roleIds(ctx, r) { return (ctx.settings.roles && ctx.settings.roles[r]) || []; }
export function hasRole(ctx, r) { return !!ctx.me.id && roleIds(ctx, r).indexOf(ctx.me.id) >= 0; }

export function tdsPlan(ctx, nat, payee, taxable, invDate, opts) {
  opts = opts || {};
  if (!nat || !nat.section) return { applies: false, rate: 0, section: "", prior: 0, text: "No TDS for this nature of payment." };
  const ent = panEntity(payee && payee.pan);
  const base = ent === "individual" ? nat.rateInd : nat.rateOther;
  const noPan = !!payee && !payee.pan;
  const rate = noPan ? Math.max(base, 20) : base;
  const fy = fyOf(invDate);
  let prior = 0;
  if (payee) ctx.requests.forEach(r => {
    if (r.id === opts.excludeId) return;
    if (opts.before && !(String(r.createdAt) < opts.before)) return;
    if (r.payeeId !== payee.id || r.kind === "balance" || r.status === "withdrawn" || r.status === "rejected") return;
    if (fyOf(r.invoiceDate) !== fy || (r.tdsSectionCode || "") !== nat.section) return;
    prior += Number(r.taxable) || 0;
  });
  const t = Number(taxable) || 0;
  const overSingle = nat.single > 0 && t > nat.single;
  const overAnnual = nat.annual > 0 && prior + t > nat.annual;
  const applies = (!nat.single && !nat.annual) || overSingle || overAnnual;
  const crossing = overAnnual && prior > 0 && prior <= nat.annual;
  let text;
  if (applies) {
    const why = [];
    if (overSingle) why.push("invoice above the " + money0(nat.single) + " limit");
    if (overAnnual) why.push(fyLabel(fy) + " total with this payee " + money0(prior + t) + " is above " + money0(nat.annual));
    text = nat.section + " @ " + rate + "%" + (noPan ? " (20%: no PAN on file)" : ent ? (" (" + (ent === "individual" ? "individual/HUF" : "company/firm") + " rate)") : "") + (why.length ? " · " + why.join("; ") : "") + ".";
  } else {
    const parts = [];
    if (nat.single) parts.push("invoice limit " + money0(nat.single));
    if (nat.annual) parts.push(money0(prior + t) + " of " + money0(nat.annual) + " used in " + fyLabel(fy));
    text = "Below the " + nat.section + " threshold, so no TDS (" + parts.join("; ") + ").";
  }
  return { applies, rate, section: nat.section, prior, crossing, fy, text };
}

export function checks(ctx, r) {
  const L = [];
  function add(id, ok, label, reason, sev, ovr, detail) { L.push({ id, ok: !!ok, label, reason, sev: sev || "block", ovr: ovr === undefined ? true : ovr, detail: detail || "" }); }
  const p = r.payee || {}; const cur = ctx.payees.get(r.payeeId);
  add("att", (r.attachments || []).length, "Invoice or PI attached", "No invoice or PI attached", "block", false);
  if (cur && (cur.pan || "") !== (p.pan || "")) add("panchg", false, "", "Payee PAN changed after submission. Send back to resubmit", "block", false);
  if (p.account) {
    add("bank", /^[0-9]{6,18}$/.test(p.account) && IFSC_RE.test(p.ifsc || ""), "Bank details on file and valid", "Bank account or IFSC invalid", "block", false);
    if (cur) add("bankchg", (cur.account || "") === p.account && (cur.ifsc || "") === (p.ifsc || ""), "Bank details unchanged since submission", "Payee bank details changed after submission. Send back to resubmit", "block", false);
  } else add("nobank", false, "", "No bank details on file. Confirm the account with the vendor before paying", "warn");
  const fam = familyId(r);
  const dup = ctx.requests.filter(x => x.id !== r.id && familyId(x) !== fam && x.payeeId === r.payeeId && normInv(x.invoiceNo) === normInv(r.invoiceNo) && x.status !== "withdrawn" && x.status !== "rejected")[0];
  add("dup", !dup, "Invoice not already raised or paid", dup ? ("Duplicate of " + dup.id + " (" + statusLabel(dup.status) + ")") : "", "block", false);
  add("date", !r.invoiceDate || r.invoiceDate <= todayISO(), "Invoice date isn't in the future", "Invoice date is in the future");
  if (r.kind === "advance") add("adv", Number(r.payGross) > 0 && Number(r.payGross) < Number(r.invoiceTotal), "Advance " + money0(r.payGross) + " is below the " + (r.docType === "pi" ? "PI" : "invoice") + " total", "Advance amount must be below the invoice total", "block", false);
  if (r.kind === "balance") { const par = ctx.requests.filter(x => x.id === r.parentId)[0]; add("par", par && par.status === "paid", "Advance " + r.parentId + " is paid", "Advance " + r.parentId + " isn't marked paid yet", "block", false); }
  if (Number(r.gstAmount) > 0) add("gstreg", !!p.gstin, "Payee GSTIN on file (GST is charged)", "GST charged but payee has no GSTIN");
  const nat = r.natureId && r.natureId !== "other" ? natureById(ctx, r.natureId) : null;
  if (r.kind === "balance") {
    const pr = ctx.requests.filter(x => x.id === r.parentId)[0];
    if (pr && pr.tdsApplied) add("tdsbal", r.tdsApplied && Number(r.tdsRate) >= Number(pr.tdsRate), "TDS matches the advance", "TDS should stay at " + pr.tdsSectionCode + " @ " + pr.tdsRate + "% as on the advance");
  } else if (nat) {
    const pl = tdsPlan(ctx, nat, { id: r.payeeId, pan: p.pan }, r.taxable, r.invoiceDate, { excludeId: r.id, before: r.createdAt });
    if (pl.applies) add("tds", r.tdsApplied && Number(r.tdsRate) + 1e-9 >= pl.rate, "TDS " + pl.section + " @ " + pl.rate + "% applied", "TDS should be " + pl.section + " @ " + pl.rate + "% (" + (r.tdsApplied ? (r.tdsRate + "% used") : "none deducted") + ")", "block", true, pl.text);
    else if (r.tdsApplied) add("tdsx", false, "", "TDS deducted although below the " + pl.section + " threshold", "warn", true, pl.text);
    else add("tds", true, pl.section ? ("Below " + pl.section + " threshold, no TDS needed") : "No TDS for this nature", "", "block");
    if (pl.applies && pl.crossing) add("cross", false, "", "This invoice crosses the " + fyLabel(pl.fy) + " limit. TDS on earlier invoices this year (" + money0(pl.prior) + ") may also be due", "warn");
  } else add("natm", false, "", "Nature of payment isn't in the master. TDS was set by hand", "warn");
  if (r.isInfluencer) {
    add("ighandle", HANDLE_RE.test(r.igHandle || ""), "Instagram handle given", "Instagram handle missing", "block", false);
    add("reel", REEL_RE.test(r.reelLink || ""), "Reel link is a valid Instagram reel/post link", "Reel link missing or not an Instagram reel link", "block", false);
    add("reelok", !!r.reelCheckedBy, "Reel opened and confirmed live by an approver", "Reel not yet confirmed live by an approver", "block", false);
  }
  return L;
}
export function passes(c, r) { return c.ok || (c.ovr && r.overrides && r.overrides[c.id]); }
export function balanceLeft(r) { return r2((Number(r.invoiceTotal) || 0) - (Number(r.payGross) || 0)); }
export function verdict(ctx, r) {
  if (r.status === "paid") {
    const rs = ["UTR " + (r.utr || "—") + " · " + fmtDate(r.paidOn)];
    if (r.kind === "advance") rs.push(r.balanceId ? ("Balance raised on " + r.balanceId) : ("Balance " + money0(balanceLeft(r)) + " not raised yet"));
    return { k: "paid", label: r.kind === "advance" ? "Advance paid" : "Paid", reasons: rs };
  }
  if (r.status === "withdrawn") return { k: "no", label: "No", reasons: ["Request withdrawn"] };
  const pending = r.status === "pending_l1" || r.status === "pending_l2";
  let reasons = checks(ctx, r).filter(c => c.sev === "block" && !passes(c, r) && !(c.id === "reelok" && pending)).map(c => c.reason);
  if (r.status === "rejected") reasons.unshift("Sent back to the requester");
  if (reasons.length) return { k: "no", label: "No", reasons };
  if (r.status === "pending_l1") return { k: "wait", label: "Not yet", reasons: ["Awaiting Level 1 approval" + (r.isInfluencer && !r.reelCheckedBy ? " and reel check" : "")] };
  if (r.status === "pending_l2") return { k: "wait", label: "Not yet", reasons: ["Awaiting Level 2 approval"] };
  const due = r.dueDate && r.dueDate > todayISO() ? ("Due " + fmtDate(r.dueDate)) : "Due now";
  return { k: "yes", label: "Yes", reasons: ["All checks passed · " + due] };
}
export function canRaiseBalance(ctx, r) { return !!ctx.me.id && r.status === "paid" && r.kind === "advance" && !r.balanceId && (r.requestedBy === ctx.me.id || ctx.isAdmin); }
export function myAction(ctx, r) {
  const me = ctx.me.id; if (!me) return null;
  if (r.status === "pending_l1" && hasRole(ctx, "approver1") && r.requestedBy !== me) return "approve";
  if (r.status === "pending_l2" && hasRole(ctx, "approver2") && r.requestedBy !== me && r.l1By !== me) return "approve";
  if (r.status === "approved" && hasRole(ctx, "finance")) return "pay";
  if (r.status === "rejected" && r.requestedBy === me) return "fix";
  if (r.status === "paid" && r.kind === "advance" && !r.balanceId && r.requestedBy === me) return "balance";
  return null;
}
export function canEditTerms(ctx, r) { return (hasRole(ctx, "approver1") || hasRole(ctx, "approver2")) && ["pending_l1", "pending_l2", "approved"].indexOf(r.status) >= 0; }
export function waitingOn(ctx, r) {
  if (r.status === "pending_l1") return roleIds(ctx, "approver1").filter(id => id !== r.requestedBy);
  if (r.status === "pending_l2") return roleIds(ctx, "approver2").filter(id => id !== r.requestedBy && id !== r.l1By);
  if (r.status === "approved") return roleIds(ctx, "finance");
  if (r.status === "rejected") return [r.requestedBy];
  return [];
}
export function isOverdue(r) { return r.dueDate && r.dueDate < todayISO() && ["pending_l1", "pending_l2", "approved"].indexOf(r.status) >= 0; }

/* ---------- request-form computation (ported from client.js compute()) ---------- */
export function compute(d, parent) {
  const taxable = r2(d.taxable);
  const gst = d.gstRate === "custom" ? r2(d.gstAmount) : r2(taxable * Number(d.gstRate || 0) / 100);
  const total = r2(taxable + gst);
  const rate = d.tdsApplied ? (Number(d.tdsRate) || 0) : 0;
  const tds = d.tdsApplied ? Math.round(taxable * rate / 100) : 0;
  const net = r2(total - tds);
  let payGross = total, payTds = tds;
  if (d.kind === "advance") { payGross = r2(d.payGross); payTds = total > 0 ? Math.round(payGross * (taxable / total) * rate / 100) : 0; }
  if (d.kind === "balance" && parent) { payGross = r2(total - (Number(parent.payGross) || 0)); payTds = Math.max(0, tds - (Number(parent.payTds) || 0)); }
  return { taxable, gst, total, rate, tds, net, payGross, payTds, payNet: r2(payGross - payTds) };
}

export function makeCtx({ settings, payees, requests, me, isAdmin }) {
  return { settings, payees: payees instanceof Map ? payees : new Map((payees || []).map(p => [p.id, p])), requests: requests || [], me: me || { id: null }, isAdmin: !!isAdmin };
}
