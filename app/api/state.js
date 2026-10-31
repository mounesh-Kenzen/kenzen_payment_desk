import { getEmailFromReq, clearCookie } from "./_lib/auth.js";
import { publicState, sendJson, sendError } from "./_lib/state.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return sendError(res, 405, "Method not allowed.");
  const email = getEmailFromReq(req);
  if (!email) return sendError(res, 401, "Sign in with your Kenzen Google account to use the desk.");
  try {
    const state = await publicState(email);
    // publicState() already read Settings to build the response, so this
    // re-checks "is this email's domain still allowed" for free, right here
    // on every load AND every 30s poll — a revoked domain takes effect on
    // the next refresh, not just on the next sign-in.
    const allowed = state.settings.allowedDomains;
    if (allowed.length && !allowed.some((d) => email.endsWith("@" + d))) {
      res.setHeader("set-cookie", clearCookie());
      return sendJson(res, 403, {
        error: "Your account's domain is no longer allowed to use this app. Contact an admin if this is unexpected.",
        blocked: true,
      });
    }
    return sendJson(res, 200, state);
  } catch (e) {
    console.error(e);
    return sendError(res, 500, "Couldn't load the desk. Try again.");
  }
}
