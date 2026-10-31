/* Best-effort replacement for the Apps Script LockService.getScriptLock().
 * Google Sheets has no transactions or compare-and-swap, so this uses a
 * token+timestamp written to a cell as an advisory lock: whoever's token
 * survives a short re-read "wins". Fine for a small internal team clicking
 * buttons; not a real distributed lock. A lock older than 20s is treated as
 * abandoned (e.g. a crashed request) and can be taken over, same timeout
 * LockService used. */
import { sheetsApi } from "./google.js";
import { ensureSheets } from "./sheets.js";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const LOCK_RANGE = "Settings!D1:E1";
const STALE_MS = 20000;
const OVERALL_TIMEOUT_MS = 20000;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function readLock(api) {
  const res = await api.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: LOCK_RANGE });
  const [token, at] = (res.data.values || [[]])[0] || [];
  return { token, at };
}

export async function withLock(fn) {
  await ensureSheets();
  const api = sheetsApi();
  const myToken = Math.random().toString(36).slice(2) + "-" + Date.now();
  const deadline = Date.now() + OVERALL_TIMEOUT_MS;
  let acquired = false;

  while (Date.now() < deadline) {
    const { token, at } = await readLock(api);
    const free = !token || (at && Date.now() - new Date(at).getTime() > STALE_MS);
    if (free) {
      await api.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: LOCK_RANGE, valueInputOption: "RAW", requestBody: { values: [[myToken, new Date().toISOString()]] } });
      await sleep(150 + Math.random() * 150);
      const check = await readLock(api);
      if (check.token === myToken) { acquired = true; break; }
    }
    await sleep(300 + Math.random() * 400);
  }
  if (!acquired) throw new Error("The desk is busy right now. Try again in a moment.");

  try {
    return await fn();
  } finally {
    try {
      const check = await readLock(api);
      if (check.token === myToken) await api.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: LOCK_RANGE });
    } catch { /* it will expire on its own after STALE_MS even if this fails */ }
  }
}
