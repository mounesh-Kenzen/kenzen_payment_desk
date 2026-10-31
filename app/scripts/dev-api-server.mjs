/* Minimal local stand-in for Vercel's serverless function routing, so the
 * app can be run with plain `node` + `vite` — no `vercel login`/`vercel dev`
 * needed. Every api/*.js file still exports the same `(req, res)` handler
 * Vercel expects; this just does the URL -> file + req.query/req.body
 * plumbing Vercel normally does for you.
 *
 * Run with: node --env-file=.env scripts/dev-api-server.mjs
 * (Node 20.6+ for --env-file; use `npm run dev:api` which does this for you.)
 */
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

// 3001, not 3000: 3000 is a very commonly-used default (other apps, old
// leftover processes) and collides easily. Override with API_PORT if needed.
const PORT = process.env.API_PORT || 3001;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Catch-all routes: path prefix -> the "[...action].js" file that handles it.
// Matches api/auth/[...action].js etc: everything after the prefix becomes
// req.query.action, split into segments, same as Vercel's dynamic routes.
const catchAll = [
  { prefix: "/api/auth/", file: "api/auth/[...action].js" },
  { prefix: "/api/requests/", file: "api/requests/[...action].js" },
  { prefix: "/api/payees/", file: "api/payees/[...action].js" },
];

// Fixed single-file routes.
const fixed = {
  "/api/state": "api/state.js",
  "/api/settings": "api/settings.js",
  "/api/upload": "api/upload.js",
  "/api/extract": "api/extract.js",
  "/api/export": "api/export.js",
  "/api/cron/daily-export": "api/cron/daily-export.js",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// Modules are cached after first import (same as a warm Vercel function) —
// restart this server after editing files under api/ or shared/.
const handlerCache = new Map();
async function loadHandler(relFile) {
  if (!handlerCache.has(relFile)) {
    const mod = await import(pathToFileURL(path.join(ROOT, relFile)).href);
    handlerCache.set(relFile, mod.default);
  }
  return handlerCache.get(relFile);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    req.query = Object.fromEntries(url.searchParams);

    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      req.body = await readBody(req); // handlers JSON.parse this themselves
    }

    let relFile = fixed[url.pathname];
    if (!relFile) {
      const match = catchAll.find((r) => url.pathname.startsWith(r.prefix));
      if (match) {
        relFile = match.file;
        req.query.action = url.pathname.slice(match.prefix.length).split("/").filter(Boolean);
      }
    }

    if (!relFile) {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "No such API route: " + url.pathname }));
      return;
    }

    const handler = await loadHandler(relFile);
    await handler(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: e.message || "Internal error" }));
    } else {
      res.end();
    }
  }
});

server.listen(PORT, () => {
  console.log(`API dev server listening on http://localhost:${PORT}`);
  console.log(`Run "npm run dev:client" (Vite) in another terminal, or "npm run dev:all" for both — open http://localhost:5173`);
});
