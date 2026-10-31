/* Reads/writes the same "Kenzen Payment Desk – Data" Google Sheet the Apps
 * Script version uses, via the Sheets API (service account), instead of a
 * database. Tab layout and column order match Code.js exactly so the sheet
 * stays readable/editable by hand the same way. */
import { sheetsApi } from "./google.js";
import { statusLabel, kindLabel, termsLabel, verdict } from "../../shared/logic.js";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const REQ_HEAD = ["Request ID", "Raised on", "Raised by", "Raised by (name)", "Status", "Can be paid?", "Reasons", "Payment type", "Advance / balance link", "Document", "Document no.", "Document date", "Payee", "Payee GSTIN", "Payee PAN", "Nature of payment", "Cost centre", "Taxable value", "GST", "Invoice total", "TDS section", "TDS rate %", "TDS on full invoice", "This payment (incl. GST)", "TDS on this payment", "Net payable", "Terms of payment", "Pay by", "Priority", "Instagram handle", "Reel link", "Level 1 by", "Level 2 by", "Paid on", "UTR", "Paid by", "Data (do not edit)"];
const PAYEE_HEAD = ["ID", "Payee", "GSTIN", "PAN", "Email", "Instagram", "Beneficiary", "Account no.", "IFSC", "Bank & branch", "Default nature ID", "Default cost centre", "Default terms", "Added on", "Added by", "Updated on", "Updated by", "Bank changed on", "Bank changed by"];
const PAYEE_KEYS = ["id", "name", "gstin", "pan", "email", "igHandle", "beneficiary", "account", "ifsc", "bank", "defaultNatureId", "defaultCc", "defaultTerms", "createdAt", "createdBy", "updatedAt", "updatedBy", "bankChangedAt", "bankChangedBy"];
const NAT_HEAD = ["ID", "Nature of payment", "TDS section", "Rate % individual/HUF", "Rate % company/firm", "Per-invoice limit", "Annual limit", "Influencer", "In use"];
const LOG_HEAD = ["When", "Request ID", "Payee", "Action", "By", "Note"];

function colLetter(n) {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
const REQ_LAST_COL = colLetter(REQ_HEAD.length);
const PAYEE_LAST_COL = colLetter(PAYEE_HEAD.length);
const NAT_LAST_COL = colLetter(NAT_HEAD.length);

// loadCtx() fires readSettingsRaw/readNatures/readPayees/readRequests
// concurrently, and each calls ensureSheets() first — without a shared
// in-flight promise, every one of them would race to create the same
// missing tabs and collide with "sheet already exists" errors. Caching the
// promise (not just a boolean) means concurrent callers all await the same
// single run.
let setupPromise = null;
export function ensureSheets() {
  if (!setupPromise) setupPromise = doEnsureSheets().catch((e) => { setupPromise = null; throw e; });
  return setupPromise;
}
async function doEnsureSheets() {
  const api = sheetsApi();
  const meta = await api.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existing = new Set((meta.data.sheets || []).map((s) => s.properties.title));
  const want = [["Requests", REQ_HEAD], ["Payees", PAYEE_HEAD], ["Nature master", NAT_HEAD], ["Audit log", LOG_HEAD], ["Settings", ["Key", "Value"]]];
  const toAdd = want.filter(([name]) => !existing.has(name));
  if (toAdd.length) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: toAdd.map(([title]) => ({ addSheet: { properties: { title } } })) },
    });
  }
  for (const [name, head] of want) {
    if (existing.has(name)) continue; // only seed the header on a freshly created tab
    await api.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `'${name}'!A1`, valueInputOption: "RAW", requestBody: { values: [head] },
    });
  }
}

async function getValues(range) {
  const api = sheetsApi();
  const res = await api.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  return res.data.values || [];
}

export async function readSettingsRaw() {
  await ensureSheets();
  const vals = await getValues("Settings!B2");
  const raw = (vals[0] || [])[0];
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export async function writeSettingsRaw(obj) {
  await ensureSheets();
  await sheetsApi().spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: "Settings!A2:B2", valueInputOption: "RAW", requestBody: { values: [["settings", JSON.stringify(obj)]] },
  });
}

// Used both at sign-in (does this email's domain get in?) and when sharing
// uploaded files/exports (Drive's "domain" permission type). Admin-editable
// via Approvals & settings once saved there; until then, falls back to the
// ALLOWED_DOMAIN env var so existing deployments don't suddenly open up.
export async function getAllowedDomains() {
  const raw = await readSettingsRaw();
  const configured = Array.isArray(raw.allowedDomains) ? raw.allowedDomains.map((d) => String(d).trim().toLowerCase()).filter(Boolean) : [];
  if (configured.length) return configured;
  return (process.env.ALLOWED_DOMAIN || "").toLowerCase().split(",").map((d) => d.trim()).filter(Boolean);
}

export async function readNatures() {
  await ensureSheets();
  const rows = await getValues(`'Nature master'!A2:${NAT_LAST_COL}`);
  return rows.filter((r) => r[1]).map((r) => ({
    id: String(r[0] || ("n-" + Math.random().toString(36).slice(2, 8))), name: String(r[1] || ""), section: String(r[2] || ""),
    rateInd: Number(r[3]) || 0, rateOther: Number(r[4]) || 0, single: Number(r[5]) || 0, annual: Number(r[6]) || 0,
    influencer: /^y/i.test(String(r[7] || "")), inactive: /^n/i.test(String(r[8] || "")),
  }));
}

export async function writeNatures(list) {
  await ensureSheets();
  const api = sheetsApi();
  await api.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `'Nature master'!A2:${NAT_LAST_COL}` });
  if (!list.length) return;
  const values = list.map((x) => [x.id, x.name, x.section || "", Number(x.rateInd) || 0, Number(x.rateOther) || 0, Number(x.single) || 0, Number(x.annual) || 0, x.influencer ? "Yes" : "No", x.inactive ? "No" : "Yes"]);
  await api.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `'Nature master'!A2`, valueInputOption: "RAW", requestBody: { values } });
}

export async function readPayees() {
  await ensureSheets();
  const rows = await getValues(`Payees!A2:${PAYEE_LAST_COL}`);
  return rows.filter((r) => r[0]).map((r) => { const o = {}; PAYEE_KEYS.forEach((k, i) => { o[k] = r[i] != null ? String(r[i]) : ""; }); return o; });
}

async function payeeSheetId() {
  const api = sheetsApi();
  const meta = await api.spreadsheets.get({ spreadsheetId: SHEET_ID });
  return meta.data.sheets.find((s) => s.properties.title === "Payees").properties.sheetId;
}

export async function writePayeeRow(o) {
  await ensureSheets();
  const api = sheetsApi();
  const rows = await getValues("Payees!A2:A");
  const ids = rows.map((r) => r[0]);
  const idx = ids.indexOf(o.id);
  const row = PAYEE_KEYS.map((k) => (o[k] == null ? "" : String(o[k])));
  const rowNumber = idx >= 0 ? idx + 2 : ids.length + 2;
  const sheetId = await payeeSheetId();
  await api.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        repeatCell: {
          range: { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: 0, endColumnIndex: PAYEE_HEAD.length },
          cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
          fields: "userEnteredFormat.numberFormat",
        },
      }],
    },
  });
  await api.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `Payees!A${rowNumber}`, valueInputOption: "RAW", requestBody: { values: [row] },
  });
}

function reqRow(ctx, r) {
  const v = verdict(ctx, r); const p = r.payee || {};
  return [r.id, r.createdAt, r.requestedBy, r.uploadedByName || "", statusLabel(r.status), v.label, v.reasons.join("; "), kindLabel(r), r.parentId || r.balanceId || "",
    r.docType === "pi" ? "Proforma invoice" : "Tax invoice", r.invoiceNo, r.invoiceDate, p.name || "", p.gstin || "", p.pan || "", r.nature || "", r.costCentre || "",
    Number(r.taxable) || 0, Number(r.gstAmount) || 0, Number(r.invoiceTotal) || 0, r.tdsSectionCode || "", Number(r.tdsRate) || 0, Number(r.tdsAmount) || 0,
    Number(r.payGross) || 0, Number(r.payTds) || 0, Number(r.netPayable) || 0, termsLabel(r), r.dueDate || "", r.priority === "urgent" ? "Urgent" : "Normal",
    r.igHandle || "", r.reelLink || "", r.l1By || "", r.l2By || "", r.paidOn || "", r.utr || "", r.paidBy || "", JSON.stringify(r)];
}

export async function readRequests() {
  await ensureSheets();
  const rows = await getValues(`Requests!${REQ_LAST_COL}2:${REQ_LAST_COL}`);
  return rows.map((r) => { try { return r[0] ? JSON.parse(r[0]) : null; } catch { return null; } }).filter(Boolean);
}

export async function appendAuditEntries(entries) {
  if (!entries || !entries.length) return;
  await ensureSheets();
  const rows = entries.map((e) => [e.at, e.id, e.payeeName || "", e.label, e.by, e.note || ""]);
  await sheetsApi().spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: "Audit log!A2", valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: rows },
  });
}

// Saves one request row (by id), appends its new history entries to the Audit
// log, then rewrites the "Can be paid?"/"Reasons" columns for every row —
// same two-step write the Apps Script saveReq_()/refreshVerdicts_() did.
export async function saveRequest(ctx, r, newEntries, ACT_LABEL) {
  await ensureSheets();
  const api = sheetsApi();
  const rows = await getValues("Requests!A2:A");
  const ids = rows.map((x) => x[0]);
  const idx = ids.indexOf(r.id);
  const rowNumber = idx >= 0 ? idx + 2 : ids.length + 2;
  const row = reqRow(ctx, r);
  await api.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `Requests!A${rowNumber}`, valueInputOption: "RAW", requestBody: { values: [row] } });
  if (newEntries && newEntries.length) {
    await appendAuditEntries(newEntries.map((h) => ({ at: h.at, id: r.id, payeeName: (r.payee || {}).name, label: ACT_LABEL[h.action] || h.action, by: h.by, note: h.note })));
  }
}

export async function refreshVerdicts(ctx) {
  const rows = await getValues("Requests!A2:A");
  if (!rows.length) return;
  const byId = new Map(ctx.requests.map((r) => [r.id, r]));
  const values = rows.map((row) => {
    const r = byId.get(row[0]);
    if (!r) return ["", ""];
    const v = verdict(ctx, r);
    return [v.label, v.reasons.join("; ")];
  });
  // Computed from REQ_HEAD instead of hardcoded letters, so this stays
  // correct if columns are ever added/reordered again.
  const statusCol = colLetter(REQ_HEAD.indexOf("Can be paid?") + 1);
  const reasonsCol = colLetter(REQ_HEAD.indexOf("Reasons") + 1);
  await sheetsApi().spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `Requests!${statusCol}2:${reasonsCol}${rows.length + 1}`, valueInputOption: "RAW", requestBody: { values } });
}
