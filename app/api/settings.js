import { getEmailFromReq } from "./_lib/auth.js";
import { loadCtx, publicState, readJsonBody, sendJson, sendError } from "./_lib/state.js";
import { withLock } from "./_lib/lock.js";
import { writeSettingsRaw, writeNatures } from "./_lib/sheets.js";
import { mergeSettings, GSTIN_RE, DOMAIN_RE } from "../shared/logic.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed.");
  const email = getEmailFromReq(req);
  if (!email) return sendError(res, 401, "Sign in with your Kenzen Google account to use the desk.");
  const { settings, natures } = readJsonBody(req);

  try {
    const result = await withLock(async () => {
      const { ctx } = await loadCtx(email);
      if (!ctx.isAdmin) throw new Error("Only admins can change settings.");
      const s = mergeSettings(settings, natures);
      if (!(s.tierLimit > 0)) throw new Error("Enter a threshold above ₹0.");
      s.companyGstins.forEach((g) => { if (!GSTIN_RE.test(g)) throw new Error(g + " isn't a valid GSTIN."); });
      if (!s.allowedDomains.length) throw new Error("Add at least one allowed sign-in domain.");
      s.allowedDomains.forEach((d) => { if (!DOMAIN_RE.test(d)) throw new Error(d + " isn't a valid domain."); });
      const owner = (process.env.OWNER_EMAIL || "").toLowerCase();
      if (owner && s.roles.admin.indexOf(owner) < 0) s.roles.admin.unshift(owner);

      await writeSettingsRaw({
        tierLimit: s.tierLimit, companyGstins: s.companyGstins, costCentres: s.costCentres,
        names: s.names, roles: s.roles, aiExtraction: !!s.aiExtraction, allowedDomains: s.allowedDomains,
        updatedAt: new Date().toISOString(), updatedBy: email,
      });
      await writeNatures(s.natures.map((n) => ({ ...n, id: n.id || ("n-" + Math.random().toString(36).slice(2, 8)) })));
      return publicState(email);
    });
    return sendJson(res, 200, result);
  } catch (e) {
    return sendError(res, 400, e.message || "Couldn't save settings.");
  }
}
