# Kenzen Payment Desk — hosted version

React (Vite + React Router) frontend and Node serverless API (deployed as
Vercel Functions). **Data lives in the same "Kenzen Payment Desk – Data"
Google Sheet the Apps Script version uses** — same tabs, same columns — read
and written via the Sheets API with a service account, instead of a database.
Invoice attachments go into an `Invoices` subfolder inside the same Drive
folder the Apps Script version uses (alongside `Excel logs`); both are
created automatically on first use if missing. Same TDS/GST/approval logic
as the Apps Script and claude.ai
versions, ported to `shared/logic.js` and used by both the client and the API.

Google sign-in is restricted to `@kenzenventures.com`. Roles (admin, Level 1,
Level 2, Finance) are assigned inside the app under **Approvals & settings**,
same as before — that's stored in the Sheet's `Settings` tab too.

## 1. One-time setup

### 1.1 Push this code to GitHub
Create a repo (e.g. `kenzen-payment-desk`) and push the contents of this `app/`
folder to it (it should be the repo root, not a subfolder).

### 1.2 Create a Google Cloud service account
This lets the web app read/write the Sheet and Drive folder without anyone
having to sign in through Apps Script.
1. https://console.cloud.google.com/ → create a project (or reuse one).
2. **APIs & Services → Library** → enable **Google Sheets API** and
   **Google Drive API**.
3. **APIs & Services → Credentials → Create Credentials → Service account**.
   Give it any name (e.g. "payment-desk-server"). You don't need to grant it
   any project-level IAM roles.
4. Open the new service account → **Keys** tab → **Add key → Create new key**
   → **JSON**. This downloads a `.json` file — keep it secret, it's a
   credential.
5. Note the service account's email address (looks like
   `payment-desk-server@your-project.iam.gserviceaccount.com`).
### 1.3 Move the Drive folder into a Shared Drive (required for uploads/exports)
Service accounts have **no Drive storage of their own** — creating a file
(an invoice upload, an Excel export) under the service account's own identity
fails with `storageQuotaExceeded`, even once it has Editor access to a
regular "My Drive" folder. A Shared Drive is the fix: its storage belongs to
the Shared Drive itself, not to whoever created a file in it, so the service
account can create files there with no quota issue. (The alternative is
domain-wide delegation — acting *as* a real person instead — which is more
setup but doesn't require restructuring folders; see the note at the end of
this section if you'd rather do that.)

1. **Create a Shared Drive** (needs a Workspace plan that includes Shared
   Drives — Business Standard and up): in Google Drive, left sidebar →
   **Shared drives → + New** → name it (e.g. "Kenzen Payment Desk").
   (If your plan doesn't support Shared Drives, use domain-wide delegation
   instead — see the note below.)
2. **Move the existing "Kenzen Payment Desk" folder into it**: in Drive,
   right-click the folder → **Organize → Move to** → pick the new Shared
   Drive. (Dragging it in works too.) Its contents — the old `Attachments`
   and `Excel logs` subfolders, and the `Invoices` one this app creates on
   first use — all come with it. **The folder keeps the same ID**
   (`1e9lIWVV2Q5C0Rx3MNIAvxN8E9BnQlWCU`), so `GOOGLE_DRIVE_ROOT_FOLDER_ID`
   doesn't need to change. (If you instead create a brand-new folder inside
   the Shared Drive rather than moving the old one, use its ID instead.)
3. **Add the service account as a member of the Shared Drive**: open the
   Shared Drive → **Manage members** → add the service account's email
   (from §1.2) → role **Content manager** (or **Manager**) → Send.

No domain-wide delegation needed for this path — leave
`GOOGLE_IMPERSONATE_EMAIL` **blank** in your env vars; the service account
acts as itself, which is fine once it's a Shared Drive member.

<details>
<summary>Alternative: domain-wide delegation instead of a Shared Drive</summary>

1. On the service account page, **Advanced settings → Enable Google Workspace
   Domain-wide Delegation**. Copy the **Client ID** (a long number) it shows.
2. A **Google Workspace super admin** for kenzenventures.com goes to
   [admin.google.com](https://admin.google.com) → **Security → Access and
   data control → API controls → Domain-wide delegation → Add new**:
   - Client ID: the number from step 1.
   - OAuth scopes: `https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive`
   - Authorize.
3. Set `GOOGLE_IMPERSONATE_EMAIL` to the Sheet/folder owner's email (e.g.
   `mounesh@kenzenventures.com`) — the service account then acts as that
   person, using their storage.
</details>

### 1.4 Share the Sheet with the service account
Sheet edits don't need storage quota, so the Sheet itself doesn't need to
move anywhere — just share it directly:
1. Open the **Kenzen Payment Desk – Data** Sheet → **Share** → add the
   service account's email (from §1.2) as **Editor**.

### 1.5 Create the Vercel project
1. Go to vercel.com → **Add New… → Project** → import the GitHub repo.
2. Framework preset: **Vite**. Leave build settings as detected (`npm run build`, output `dist`).
3. Don't deploy yet — add the env vars first (next step), then deploy.

### 1.6 Sign-in: deferred to a later phase
Real Google sign-in (§1.7 below) is being done in a later phase. For now the
app runs with `DEV_BYPASS_EMAIL` set — every visitor is treated as that one
email, no sign-in screen at all, and no OAuth client is needed yet. There is
no per-user identity while this is set, so it's only meant for one person
testing solo (whoever's email is in `DEV_BYPASS_EMAIL` shows as every
request's "requested by", every approval's "approved by", etc.). **Before
real people other than you use this, come back and do §1.7, then remove
`DEV_BYPASS_EMAIL`.**

### 1.7 Create a Google OAuth client (for real sign-in) — later phase
Skip this for now per §1.6. This is a *separate* Google Cloud credential from
the service account above — it identifies people signing in, the service
account above just does the data read/writes.
1. Same Google Cloud project (or a different one) → **APIs & Services →
   OAuth consent screen**: User type "Internal" if your Workspace allows it
   (restricts sign-in to kenzenventures.com automatically), otherwise
   "External" — the app also checks the email domain itself as a second gate.
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**,
   type **Web application**.
   - Authorized JavaScript origins: your Vercel URL, e.g.
     `https://kenzen-payment-desk.vercel.app`, plus `http://localhost:5173`
     for local dev.
   - No redirect URI needed (uses Google Identity Services' button sign-in,
     not the redirect flow).
3. Copy the **Client ID** — this goes in `GOOGLE_CLIENT_ID` /
   `VITE_GOOGLE_CLIENT_ID` below. It looks like
   `123456789-abcdefg.apps.googleusercontent.com` — don't confuse it with the
   service account's own Client ID from §1.3 (a plain number), which is a
   different credential for a different purpose.

### 1.8 Set environment variables on Vercel
Project → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `GOOGLE_SHEET_ID` | `1_8ix-jc6U2-TUrFvagGKmp9MIQQxQr0NiZzaq2_KGX8` (the existing sheet) |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | `1e9lIWVV2Q5C0Rx3MNIAvxN8E9BnQlWCU` (the existing folder, now moved into a Shared Drive per §1.3) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | the **whole contents** of the JSON key file from 1.2, base64-encoded (see below) |
| `GOOGLE_IMPERSONATE_EMAIL` | **leave blank** if you used the Shared Drive approach (§1.3); only set this if you used the domain-wide delegation alternative instead |
| `GOOGLE_CLIENT_ID` | the OAuth client ID from 1.7 (skip if using `DEV_BYPASS_EMAIL`) |
| `VITE_GOOGLE_CLIENT_ID` | same value as above (skip if using `DEV_BYPASS_EMAIL`) |
| `ALLOWED_DOMAIN` | `kenzenventures.com` |
| `JWT_SECRET` | a random string, e.g. output of `openssl rand -hex 32` |
| `OWNER_EMAIL` | `accounts@kenzenventures.com` (always treated as admin) |
| `DEV_BYPASS_EMAIL` | *(testing only, see 1.6)* set to skip sign-in; leave unset for real use |
| `OPENROUTER_API_KEY` | *(optional)* your key from https://openrouter.ai/keys, only needed if you turn on AI invoice reading |
| `OPENROUTER_MODEL` | *(optional)* defaults to `anthropic/claude-3.5-sonnet` |
| `CRON_SECRET` | *(optional, only if you re-enable the daily export cron — see §3)* |

To base64-encode the JSON key file:
```
# macOS/Linux
base64 -i service-account.json | tr -d '\n'
# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))
```
Paste the single resulting line as `GOOGLE_SERVICE_ACCOUNT_KEY`.

### 1.9 Deploy
Trigger a deploy from Vercel (push to the connected branch, or click Deploy).
Open the URL once it's live — the first admin sign-in should be
`accounts@kenzenventures.com` (set as `OWNER_EMAIL`), since that account is
always treated as admin. From **Approvals & settings**, add the Level 1,
Level 2 and Finance people by their Kenzen email. The first request to load
also creates any missing tabs in the Sheet automatically (same headers as
the Apps Script `setup()`), so an existing sheet or a brand-new blank one
both work.

## 2. Local development

### 2.1 Without a Vercel account (recommended for now)
No `vercel login`/`vercel link` needed — just your own `.env` file (copy
`.env.example` to `.env` and fill it in with the values from §1.2–1.4 and
§1.8; you don't need a Vercel project to exist yet for this). Requires
Node 20.6+ (for `--env-file`; check with `node -v`).

```bash
cd app
npm install          # one-time

npm run dev:all      # runs the Vite frontend AND the local API server together
```
Open **http://localhost:5173**.

Under the hood this runs two things at once (`npm run dev:all` is shorthand
for both): `vite` (`dev:client`) on port 5173 for the React app, and
`node --env-file=.env scripts/dev-api-server.mjs` (`dev:server`) on port
3001, a small local stand-in for Vercel's function routing (it loads each
file under `api/` the same way Vercel would) — `vite.config.js` proxies
`/api/*` calls from 5173 to 3001 so the browser only ever talks to one
origin. You can also run them in two separate terminals with
`npm run dev:client` and `npm run dev:server` if you want separate logs.
(3001, not 3000 — 3000 collides easily with other things, including leftover
processes from an earlier run you forgot to stop.)

**This local API server doesn't hot-reload** code under `api/` or
`shared/logic.js` — restart `npm run dev:server` (or `dev:all`) after editing
those. Vite's frontend hot-reload still works as normal for everything in `src/`.

This stand-in server is a convenience for local dev only — the real
deployment on Vercel uses actual Vercel Functions (§1.5 onward), not this
script.

### 2.2 With `vercel dev` (closer to production, needs a Vercel account)
Useful once you want to test things exactly as they'll run in production
(e.g. the daily export cron, or Vercel-specific behaviour). Needs the Vercel
project created and its env vars set (§1.5–1.8) first.

```bash
npx vercel login            # one-time, opens a browser to sign into your Vercel account
npx vercel link             # one-time, links this folder to the Vercel project you created
npx vercel env pull .env.local   # pulls down the env vars you set in §1.8

npx vercel dev               # starts the app at http://localhost:3000
```
Open **http://localhost:3000** (not 5173 this time — `vercel dev` serves the
frontend and the `/api` functions together on one port).

Whenever you change an env var in the Vercel dashboard, re-run
`npx vercel env pull .env.local` and restart `vercel dev` to pick it up.

### 2.3 Either way
**If you haven't set up Google OAuth yet**, set `DEV_BYPASS_EMAIL` in your
`.env`/`.env.local` (see README §1.6) — the app then skips the sign-in screen
entirely and treats every visitor as that one email.

**Common local issues:**
- *"GOOGLE_SERVICE_ACCOUNT_KEY is not set"* — your `.env`/`.env.local` is
  missing or stale.
- *"unauthorized_client" error from Google* — domain-wide delegation (§1.3)
  hasn't been approved yet by a Workspace admin, or the scopes/Client ID
  don't match exactly what's in the Admin Console.
- *Port 3001 or 5173 already in use* — usually a previous `dev:server`/
  `dev:all`/`vite` you forgot to stop (closing the terminal tab doesn't always
  kill it on Windows). Find and stop it:
  `Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess | Stop-Process -Force`
  (swap `3001` for `5173` for the frontend). Or just pick a different port:
  set `API_PORT=3002` before running `dev:server`, and update the proxy
  target in `vite.config.js` to match.
- *Port 3000 already in use when running `vercel dev`* (§2.2) — that's a
  separate, unrelated port from the local `dev:server` above; same fix,
  substituting 3000.
- Changes to env files require restarting the dev server(s) — neither option
  hot-reloads env vars.

## 3. What's different from the Apps Script / claude.ai versions
- **Hosting**: Vercel (frontend + API) instead of being served from inside
  Apps Script or claude.ai — but **the data itself still lives in the same
  Google Sheet and Drive folder**, read/written by the server with a service
  account instead of `SpreadsheetApp`/`DriveApp`.
- **Locking**: the Apps Script version used `LockService` to serialize writes.
  Sheets API has no real transactions, so `api/_lib/lock.js` uses a small
  advisory lock (a token+timestamp written to a cell) with the same 20-second
  timeout `LockService` used. It's best-effort, not a true distributed lock —
  fine for a small team clicking buttons, not meant for high concurrency.
- **Attachments**: uploaded straight from the browser into the `Invoices`
  subfolder of the Drive folder, using a resumable-upload session the server
  requests on your behalf, so files up to the 10MB limit never have to pass
  through the serverless function's ~4.5MB request body cap. Shared
  "anyone at kenzenventures.com with the link", same as the original.
- **Auth**: Google sign-in restricted to `@kenzenventures.com`, enforced both
  by the OAuth consent screen (if set to Internal) and by the server checking
  the email domain on every sign-in. This is separate from the service
  account used for Sheets/Drive — people never need Sheet access themselves.
- **Excel export**: "Download Excel log" button saves a dated `.xlsx` copy of
  the live Sheet into the "Excel logs" Drive folder and shows a link to it —
  same behaviour as `api_export()` in Code.js (it doesn't download a file to
  your device). The code for a daily backup cron is included
  (`api/cron/daily-export.js`, same idea as the old Apps Script
  `dailyExport`) but it's **not scheduled** — `vercel.json` has no `crons`
  entry. To turn it on later: add back
  ```json
  "crons": [{ "path": "/api/cron/daily-export", "schedule": "13 18 * * *" }]
  ```
  to `vercel.json` (that's 18:13 UTC = 23:43 IST) and set `CRON_SECRET`.
- **Settings cache**: the browser caches the last-seen settings (tier limit,
  cost centres, nature-of-payment master, roles, display names) in
  `localStorage` so dropdowns and the settings screen render instantly on
  reload instead of flashing empty while the first `/api/state` call is in
  flight. Requests and payees (which include amounts and bank details) are
  never cached client-side — always fetched fresh.
- **Invoice reading**: off by default (manual entry, same as the Apps Script
  version). An admin can turn on **AI invoice reading** in Approvals &
  settings, which uses the `OPENROUTER_API_KEY` you configure — this is billed
  to whoever owns that OpenRouter account per invoice read, unlike the
  claude.ai version's built-in (free, in-app) PDF reading.

## 4. Known gaps (carried over from the original handoff notes)
- The server recomputes nothing from the client amounts on submit, same as
  the Apps Script version's own known-gaps list (the server trusts the
  amounts the client computed with the same shared logic) — a hardening step
  for later would be to recompute taxable/GST/TDS/net server-side from
  `shared/logic.js` and reject mismatches.
- No email notifications when a request reaches an approver.
- No 194Q logic beyond a manually added nature of payment.
- Every write re-reads the whole `Requests` sheet (same scaling note as the
  original handoff doc: fine for hundreds of rows, add caching if you grow
  into the thousands).
