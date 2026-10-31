import { getEmailFromReq } from "./_lib/auth.js";
import { publicState, sendJson, sendError } from "./_lib/state.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return sendError(res, 405, "Method not allowed.");
  const email = getEmailFromReq(req);
  if (!email) return sendError(res, 401, "Sign in with your Kenzen Google account to use the desk.");
  try {
    const state = await publicState(email);
    return sendJson(res, 200, state);
  } catch (e) {
    console.error(e);
    return sendError(res, 500, "Couldn't load the desk. Try again.");
  }
}
