import { getEmailFromReq } from "./_lib/auth.js";
import { loadCtx, sendJson, sendError } from "./_lib/state.js";
import { refreshVerdicts } from "./_lib/sheets.js";
import { hasRole } from "../shared/logic.js";
import { exportSheetToXlsx, saveExportToDrive } from "./_lib/drive.js";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Same flow as the Apps Script api_export(): save a dated .xlsx copy of the
// live sheet into the "Excel logs" Drive folder and hand back a link to it,
// rather than streaming a file straight to the browser.
export default async function handler(req, res) {
  if (req.method !== "GET") return sendError(res, 405, "Method not allowed.");
  const email = getEmailFromReq(req);
  if (!email) return sendError(res, 401, "Sign in with your Kenzen Google account to use the desk.");

  const { ctx } = await loadCtx(email);
  if (!(ctx.isAdmin || hasRole(ctx, "finance") || hasRole(ctx, "approver1") || hasRole(ctx, "approver2"))) {
    return sendError(res, 403, "Only approvers, Finance and admins can export the log.");
  }
  try {
    await refreshVerdicts(ctx);
    const buf = await exportSheetToXlsx(SHEET_ID);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    const file = await saveExportToDrive(buf, `Payment Desk log ${stamp}.xlsx`);
    return sendJson(res, 200, { url: file.url, name: file.name });
  } catch (e) {
    console.error(e);
    return sendError(res, 500, e.message || "Couldn't export the log.");
  }
}
