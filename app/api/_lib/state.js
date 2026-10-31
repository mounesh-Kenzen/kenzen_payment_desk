import { mergeSettings, makeCtx } from "../../shared/logic.js";
import { readSettingsRaw, readNatures, readPayees, readRequests } from "./sheets.js";

export async function loadCtx(email) {
  const [settingsRaw, natures, payees, requests] = await Promise.all([readSettingsRaw(), readNatures(), readPayees(), readRequests()]);
  const settings = mergeSettings(settingsRaw, natures);
  const owner = (process.env.OWNER_EMAIL || "").toLowerCase();
  const isAdmin = !!email && (email === owner || settings.roles.admin.indexOf(email) >= 0);
  const ctx = makeCtx({ settings, payees, requests, me: { id: email || null }, isAdmin });
  return { ctx, owner };
}

export async function publicState(email) {
  const { ctx, owner } = await loadCtx(email);
  // Mirrors getAllowedDomains()'s fallback without another Sheets read (this
  // is polled every 30s by the client) — shows the effective list (env
  // default pre-first-save, Sheet-stored list after) so the settings screen
  // never looks empty.
  const allowedDomains = ctx.settings.allowedDomains.length
    ? ctx.settings.allowedDomains
    : (process.env.ALLOWED_DOMAIN || "").toLowerCase().split(",").map((d) => d.trim()).filter(Boolean);
  return {
    me: { id: ctx.me.id, isAdmin: ctx.isAdmin, owner },
    settings: {
      tierLimit: ctx.settings.tierLimit, companyGstins: ctx.settings.companyGstins, costCentres: ctx.settings.costCentres,
      names: ctx.settings.names, roles: ctx.settings.roles, aiExtraction: ctx.settings.aiExtraction, allowedDomains,
    },
    natures: ctx.settings.natures,
    payees: Array.from(ctx.payees.values()),
    requests: ctx.requests,
  };
}

// Vercel's [...action].js catch-all routes don't reliably populate
// req.query.action for this project's plain (non-Next.js) function setup —
// confirmed directly against the deployed API. Parsing the action straight
// out of req.url works regardless of how Vercel (or the local dev-api-server)
// handles dynamic route query population.
export function actionFromUrl(req, prefix) {
  const pathname = String(req.url || "").split("?")[0];
  const idx = pathname.indexOf(prefix);
  const rest = idx >= 0 ? pathname.slice(idx + prefix.length) : "";
  return rest.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

export function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(obj));
}

export function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}
