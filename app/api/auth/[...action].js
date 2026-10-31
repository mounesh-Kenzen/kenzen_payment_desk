import { OAuth2Client } from "google-auth-library";
import { signSession, sessionCookie, clearCookie, getEmailFromReq } from "../_lib/auth.js";
import { sendJson, sendError, readJsonBody, actionFromUrl } from "../_lib/state.js";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || "").toLowerCase();

export default async function handler(req, res) {
  const action = actionFromUrl(req, "/api/auth/");

  if (action === "google" && req.method === "POST") {
    try {
      const { credential } = readJsonBody(req);
      if (!credential) return sendError(res, 400, "Missing credential.");
      const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      const email = (payload.email || "").toLowerCase();
      if (!payload.email_verified) return sendError(res, 403, "Your Google email isn't verified.");
      if (ALLOWED_DOMAIN && !email.endsWith("@" + ALLOWED_DOMAIN)) {
        return sendError(res, 403, "Sign in with your @" + ALLOWED_DOMAIN + " Google account.");
      }
      const token = signSession(email);
      res.setHeader("set-cookie", sessionCookie(token));
      return sendJson(res, 200, { email, name: payload.name || "", picture: payload.picture || "" });
    } catch (e) {
      return sendError(res, 401, "Couldn't verify that Google sign-in. Try again.");
    }
  }

  if (action === "me" && req.method === "GET") {
    const email = getEmailFromReq(req);
    return sendJson(res, 200, { email });
  }

  if (action === "logout" && req.method === "POST") {
    res.setHeader("set-cookie", clearCookie());
    return sendJson(res, 200, { ok: true });
  }

  return sendError(res, 404, "Unknown auth action.");
}
