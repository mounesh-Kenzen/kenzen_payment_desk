import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

function loadCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set. See README for how to create and encode the service account key.");
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(text);
}

let auth;
export function getAuth() {
  if (!auth) {
    const creds = loadCredentials();
    // Domain-wide delegation: acts AS this Kenzen user (the sheet/folder owner),
    // so files it creates use that person's Drive storage, not the service
    // account's own (service accounts have ~0 storage of their own).
    const subject = process.env.GOOGLE_IMPERSONATE_EMAIL || undefined;
    auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: SCOPES,
      subject,
    });
  }
  return auth;
}

let sheetsClient = null;
export function sheetsApi() {
  if (!sheetsClient) sheetsClient = google.sheets({ version: "v4", auth: getAuth() });
  return sheetsClient;
}

let driveClient = null;
export function driveApi() {
  if (!driveClient) driveClient = google.drive({ version: "v3", auth: getAuth() });
  return driveClient;
}
