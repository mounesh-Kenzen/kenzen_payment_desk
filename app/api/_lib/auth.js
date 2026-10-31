import jwt from "jsonwebtoken";
import cookie from "cookie";

const COOKIE_NAME = "kpd_session";
const SECRET = process.env.JWT_SECRET;
const SECURE = process.env.NODE_ENV === "production";

export function signSession(email) {
  return jwt.sign({ email }, SECRET, { expiresIn: "30d" });
}

export function sessionCookie(token) {
  return cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

export function clearCookie() {
  return cookie.serialize(COOKIE_NAME, "", { httpOnly: true, secure: SECURE, sameSite: "lax", path: "/", maxAge: 0 });
}

// TESTING ONLY: when DEV_BYPASS_EMAIL is set, every request is treated as that
// email and Google sign-in is skipped entirely. There is no per-visitor
// identity in this mode anyone who can reach the app acts as this one user.
// Do not set this env var once real people other than you are using the app.
const DEV_BYPASS_EMAIL = (process.env.DEV_BYPASS_EMAIL || "").trim().toLowerCase();

export function getEmailFromReq(req) {
  if (DEV_BYPASS_EMAIL) return DEV_BYPASS_EMAIL;
  const raw = req.headers.cookie || "";
  const parsed = cookie.parse(raw);
  const token = parsed[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, SECRET);
    return (payload.email || "").toLowerCase();
  } catch {
    return null;
  }
}

export function requireAuth(req, res) {
  const email = getEmailFromReq(req);
  if (!email) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "Sign in with your Kenzen Google account to use the desk." }));
    return null;
  }
  return email;
}
