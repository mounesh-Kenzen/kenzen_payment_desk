import { getEmailFromReq } from "./_lib/auth.js";
import { readJsonBody, sendJson, sendError } from "./_lib/state.js";
import { initResumableUpload, finalizeUpload } from "./_lib/drive.js";

const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_MB = 10;

export default async function handler(req, res) {
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed.");
  const email = getEmailFromReq(req);
  if (!email) return sendError(res, 401, "Sign in with your Kenzen Google account.");

  const body = readJsonBody(req);
  try {
    if (body.step === "init") {
      const { name, mime, size } = body;
      if (ALLOWED.indexOf(mime) < 0) throw new Error("Attach a PDF, PNG, JPG or WebP.");
      if (Number(size) > MAX_MB * 1024 * 1024) throw new Error("Files must be under " + MAX_MB + " MB.");
      // Google only allows the browser's follow-up PUT across origins if the
      // SAME Origin was present when the upload session was created — our
      // server's own fetch() doesn't send one, so we forward the browser's.
      const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : "");
      const { uploadUrl } = await initResumableUpload({ name, mime, size, origin });
      return sendJson(res, 200, { uploadUrl });
    }
    if (body.step === "finalize") {
      const att = await finalizeUpload(body.fileId);
      return sendJson(res, 200, att);
    }
    return sendError(res, 400, "Unknown upload step.");
  } catch (e) {
    return sendError(res, 400, e.message || "Upload failed.");
  }
}
