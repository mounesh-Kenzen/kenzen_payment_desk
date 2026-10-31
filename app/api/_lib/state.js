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
  return {
    me: { id: ctx.me.id, isAdmin: ctx.isAdmin, owner },
    settings: {
      tierLimit: ctx.settings.tierLimit, companyGstins: ctx.settings.companyGstins, costCentres: ctx.settings.costCentres,
      names: ctx.settings.names, roles: ctx.settings.roles, aiExtraction: ctx.settings.aiExtraction,
    },
    natures: ctx.settings.natures,
    payees: Array.from(ctx.payees.values()),
    requests: ctx.requests,
  };
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
