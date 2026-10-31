import { extractText, getDocumentProxy } from "unpdf";
import { getEmailFromReq } from "./_lib/auth.js";
import { loadCtx, readJsonBody, sendJson, sendError } from "./_lib/state.js";
import { driveApi } from "./_lib/google.js";

// Only "digital" PDFs (ones with a real text layer) can be read this way. A
// scanned/photographed invoice saved as PDF has no extractable text, so
// extraction returns little or nothing for it — treated as a skip, not an
// error. Other file types (PNG/JPG/WebP) are skipped outright.
// unpdf (not pdf-parse/pdfjs-dist directly) is used here deliberately: it has
// zero dependencies and no optional native canvas binary, which crashed this
// function outright on Vercel (pdfjs-dist's legacy build throws
// "DOMMatrix is not defined" at import time when @napi-rs/canvas isn't
// bundled into the serverless function).
const MIN_TEXT_LENGTH = 40;
const MAX_TEXT_CHARS = 12000; // invoices are short; this just bounds the LLM prompt size for an unusually long PDF

const PROMPT = `You are reading the text of an Indian vendor tax invoice or proforma invoice (PI) for an accounts team. The text below was extracted from a digital PDF, so layout/spacing may be imperfect.
Return ONLY a compact JSON object (no markdown, no commentary) with these keys:
{
  "docType": "tax" | "pi",
  "invoiceNo": string,
  "invoiceDate": "YYYY-MM-DD",
  "payeeName": string,
  "payeeGstin": string | "",
  "taxable": number,
  "gstRate": number | null,
  "gstAmount": number,
  "invoiceTotal": number
}
Use the taxable value (before GST) for "taxable". If GST is a single uniform rate, put it in "gstRate" (0, 5, 18, 40); otherwise set "gstRate" to null and still fill "gstAmount" with the total GST charged. If a field can't be read, use an empty string or 0. Respond with JSON only.

--- Invoice text ---
`;

export default async function handler(req, res) {
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed.");
  const email = getEmailFromReq(req);
  if (!email) return sendError(res, 401, "Sign in with your Kenzen Google account.");

  const { fileId, mime } = readJsonBody(req);
  if (!fileId) return sendError(res, 400, "Missing file.");

  try {
    const { ctx } = await loadCtx(email);
    if (!ctx.settings.aiExtraction) return sendError(res, 400, "AI invoice reading is turned off. An admin can turn it on under Approvals & settings.");

    if (mime !== "application/pdf") {
      return sendJson(res, 200, { skipped: true, reason: "Only digital PDF invoices can be read automatically. Fill in the details by hand for this file type." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return sendError(res, 500, "AI invoice reading isn't configured (missing OPENROUTER_API_KEY).");
    const model = process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet";

    const fileRes = await driveApi().files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
    const buf = Buffer.from(fileRes.data);

    let text = "";
    try {
      const doc = await getDocumentProxy(new Uint8Array(buf));
      const result = await extractText(doc, { mergePages: true });
      text = (result.text || "").trim();
    } catch {
      text = "";
    }

    if (text.length < MIN_TEXT_LENGTH) {
      return sendJson(res, 200, { skipped: true, reason: "This looks like a scanned PDF with no selectable text, so it can't be read automatically. Fill in the details by hand." });
    }

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://kenzenventures.com",
        "X-Title": "Kenzen Payment Desk",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: PROMPT + text }],
        temperature: 0,
        // The free "thinking" models OpenRouter routes to by default spend
        // several seconds on a chain-of-thought before answering (measured
        // ~8x slower). We only need the compact JSON, so turn that off —
        // cuts typical latency from ~10s to ~1-2s. Harmless no-op for models
        // that don't support reasoning at all.
        reasoning: { enabled: false },
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error("AI reading failed (" + resp.status + "): " + t.slice(0, 200));
    }
    const data = await resp.json();
    const out = data?.choices?.[0]?.message?.content || "{}";
    const match = out.match(/\{[\s\S]*\}/);
    const parsedJson = JSON.parse(match ? match[0] : out);
    return sendJson(res, 200, { skipped: false, ...parsedJson });
  } catch (e) {
    return sendError(res, 400, e.message || "Couldn't read the invoice.");
  }
}
