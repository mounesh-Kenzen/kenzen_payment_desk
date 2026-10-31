import { Readable } from "stream";
import { getAuth, driveApi } from "./google.js";

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
const DOMAIN = process.env.ALLOWED_DOMAIN || "";

// The "Kenzen Payment Desk" folder lives in a Shared Drive, not the service
// account's own My Drive (which has no storage of its own — see README §1.3
// for why). Every Drive call below needs `supportsAllDrives: true` or Google
// silently excludes/rejects Shared Drive items.
const ALL_DRIVES = { supportsAllDrives: true, includeItemsFromAllDrives: true };

const folderCache = new Map();
export async function folder(name) {
  if (folderCache.has(name)) return folderCache.get(name);
  const api = driveApi();
  const res = await api.files.list({
    q: `'${ROOT_FOLDER_ID}' in parents and name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    ...ALL_DRIVES,
  });
  let id;
  if (res.data.files && res.data.files.length) id = res.data.files[0].id;
  else {
    const created = await api.files.create({
      requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [ROOT_FOLDER_ID] },
      fields: "id",
      supportsAllDrives: true,
    });
    id = created.data.id;
  }
  folderCache.set(name, id);
  return id;
}

async function shareDomainWithLink(fileId) {
  if (!DOMAIN) return;
  try {
    await driveApi().permissions.create({ fileId, supportsAllDrives: true, requestBody: { type: "domain", domain: DOMAIN, role: "reader" } });
  } catch { /* sharing is best-effort; the file still works for people with direct access */ }
}

// Step 1 of a client-side upload: get a Google Drive resumable session URI
// so the browser can PUT the file bytes directly to Drive, bypassing our
// serverless function's ~4.5MB request body limit.
export async function initResumableUpload({ name, mime, size, origin }) {
  const invoicesFolderId = await folder("Invoices");
  const auth = getAuth();
  const { token } = await auth.getAccessToken();
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Type": mime,
    "X-Upload-Content-Length": String(size),
  };
  // Google only CORS-enables a resumable session for the Origin present when
  // the session was CREATED — the browser's later PUT must come from that
  // same origin, or it gets blocked client-side even though the session
  // itself is otherwise valid.
  if (origin) headers["Origin"] = origin;
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,size,webViewLink", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: `${stamp} ${String(name).slice(0, 120)}`, parents: [invoicesFolderId], mimeType: mime }),
  });
  if (!res.ok) throw new Error("Couldn't start the upload (" + res.status + "): " + (await res.text()).slice(0, 200));
  const location = res.headers.get("location");
  if (!location) throw new Error("Drive didn't return an upload URL.");
  return { uploadUrl: location };
}

// Step 2: after the browser has PUT the bytes to that session URI and Drive
// confirms the file, share it and return the attachment record.
export async function finalizeUpload(fileId) {
  const api = driveApi();
  const meta = await api.files.get({ fileId, fields: "id,name,size,mimeType,webViewLink", supportsAllDrives: true });
  await shareDomainWithLink(fileId);
  return { id: meta.data.id, name: meta.data.name, type: meta.data.mimeType, size: Number(meta.data.size) || 0, url: meta.data.webViewLink };
}

export async function exportSheetToXlsx(sheetId) {
  const api = driveApi();
  // The Sheet itself can stay wherever it already lives (editing an existing
  // file needs no storage quota) — only the exported COPY needs to land in
  // the Shared Drive, which saveExportToDrive() below handles.
  const res = await api.files.export(
    { fileId: sheetId, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data);
}

export async function saveExportToDrive(buffer, filename) {
  const logsFolderId = await folder("Excel logs");
  const api = driveApi();
  const created = await api.files.create({
    requestBody: { name: filename, parents: [logsFolderId] },
    media: { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: Readable.from(buffer) },
    fields: "id,webViewLink,name",
    supportsAllDrives: true,
  });
  await shareDomainWithLink(created.data.id);
  return { id: created.data.id, url: created.data.webViewLink, name: created.data.name };
}
