async function req(path, options) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || "Something went wrong.");
    if (data && data.blocked) err.blocked = true;
    throw err;
  }
  return data;
}

export const api = {
  state: () => req("/api/state"),
  authGoogle: (credential) => req("/api/auth/google", { method: "POST", body: JSON.stringify({ credential }) }),
  me: () => req("/api/auth/me"),
  logout: () => req("/api/auth/logout", { method: "POST" }),
  saveRequest: (base, editId) => req("/api/requests/save", { method: "POST", body: JSON.stringify({ base, editId }) }),
  act: (id, kind, opts) => req("/api/requests/act", { method: "POST", body: JSON.stringify({ id, kind, opts }) }),
  terms: (id, code, text, due, note) => req("/api/requests/terms", { method: "POST", body: JSON.stringify({ id, code, text, due, note }) }),
  savePayee: (rec, id) => req("/api/payees/save", { method: "POST", body: JSON.stringify({ rec, id }) }),
  saveSettings: (settings, natures) => req("/api/settings", { method: "POST", body: JSON.stringify({ settings, natures }) }),
  extract: (fileId, mime) => req("/api/extract", { method: "POST", body: JSON.stringify({ fileId, mime }) }),
  // Saves a dated .xlsx copy of the live sheet to the "Excel logs" Drive
  // folder and returns {url, name} to it — same as the Apps Script version's
  // "Download Excel log" button (it doesn't download a file to your device,
  // it saves one to Drive and gives you the link).
  exportLog: () => req("/api/export"),
};
