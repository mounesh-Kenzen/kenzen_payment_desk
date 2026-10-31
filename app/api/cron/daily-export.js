import { loadCtx, sendJson, sendError } from "../_lib/state.js";
import { refreshVerdicts } from "../_lib/sheets.js";
import { exportSheetToXlsx, saveExportToDrive } from "../_lib/drive.js";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Not scheduled by default (see vercel.json / README §3). Add a "crons" entry
// back to vercel.json if you want the daily Drive backup running again, same
// as the Apps Script dailyExport() trigger.
export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) return sendError(res, 401, "Unauthorized.");
  }
  try {
    const { ctx } = await loadCtx(process.env.OWNER_EMAIL || null);
    await refreshVerdicts(ctx);
    const buf = await exportSheetToXlsx(SHEET_ID);
    const stamp = new Date().toISOString().slice(0, 10);
    const file = await saveExportToDrive(buf, `Payment Desk log ${stamp}.xlsx`);
    return sendJson(res, 200, { ok: true, url: file.url });
  } catch (e) {
    console.error(e);
    return sendError(res, 500, e.message || "Export failed.");
  }
}
