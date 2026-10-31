# Kenzen Payment Desk – handoff

A payment initiation and approval app for Kenzen Ventures Pvt Ltd (finance team, India). Staff raise payment requests against vendor invoices or proforma invoices (PIs). The app works out GST, TDS and net payable. Requests then go through amount-based approval, and Finance records the payment with its UTR. Everything is logged and exported to Excel.

There are two implementations. **The Google Apps Script version is the current direction.** The owner wants it hosted on Google Drive.

| | Google Apps Script (current) | claude.ai artifact (earlier) |
|---|---|---|
| Status | Code written and tested with a mock. **Not deployed yet**: the owner has to paste the files in and deploy (steps below). | Live at https://claude.ai/artifact/6sXDb2oJW8nX9SZy9BVJyo (version 5). No real data yet. |
| Hosting | Apps Script web app owned by `mounesh@kenzenventures.com`, access "Anyone within Kenzen Ventures" | claude.ai, shared through the artifact Share menu |
| Data | Google Sheet | Artifact database (document store) |
| Invoice reading | None; amounts are typed in | Claude reads the PDF or image and fills in the amounts |
| Code | `apps-script/` | `claude-artifact/payment-desk.html` (one self-contained file) |

---

## 1. Features (both versions unless noted)

- **Requests** have these fields:
  - payee (from the payee master)
  - document type (Tax invoice or Proforma invoice)
  - payment type (Full, Advance, or Balance)
  - document number and date
  - nature of payment (from the master, or "Other")
  - cost centre and details
  - taxable value, GST rate (0/5/18/40%, or a custom amount)
  - TDS (auto or manual)
  - terms of payment, pay-by date, priority
  - optional influencer fields (Instagram handle, reel link)
  - attachments (required)
- **Nature of payment master:** each nature has a TDS section, a rate for individual/HUF payees, a rate for company/firm payees, a per-invoice limit, an annual limit, an influencer flag and an in-use flag. Admins edit it in the app; in the Apps Script version it can also be edited in the Sheet. The defaults follow FY 2025-26 rules: 194C at 1%/2% with ₹30k per invoice and ₹1L a year; 194J at 10% with ₹50k a year; 194J technical at 2%; 194I at 10%/2% with ₹50k; 194H at 2% with ₹20k. Influencer fees are 194J at 10%. The owner's CA has to confirm these.
- **TDS logic** (`tdsPlan` in `shared.js`):
  - **Rate:** the individual rate applies when the 4th character of the PAN is P or H; otherwise the company rate. With no PAN, the rate is at least 20% (section 206AA).
  - **When it applies:** if the taxable value is above the per-invoice limit, or if the payee's taxable total for the same section in the same Indian financial year (April to March) goes above the annual limit. Balance requests, withdrawn requests and rejected requests don't count towards that total. If the nature has no limits but has a section, TDS always applies.
  - **Crossing the limit:** if this invoice is the one that crosses the annual limit, a warning says TDS on earlier invoices may be due.
  - **Calculation:** TDS = round(taxable × rate). It is worked out on the taxable value only, not the GST.
- **Advance and balance:**
  - **Advance:** the user enters `payGross`, which includes GST and must be below the invoice total. TDS on the advance is worked out on the taxable portion.
  - **Raising the balance:** once the advance is paid, the requester (or an admin) clicks "Raise balance payment". That creates a new request with `kind:"balance"` and `parentId` set to the advance; the advance gets `balanceId`.
  - **Balance amount:** balance payGross = new invoice total − advance payGross. Balance TDS = full TDS − advance payTds.
  - **Approval and duplicates:** the balance goes through fresh approval. Duplicate checks skip requests in the same advance/balance family (`familyId`).
- **Approval:**
  - **Routing:** Level 1 always. Level 2 too if the invoice total is above `tierLimit` (default ₹50,000); the route is fixed at submission.
  - **Who can't approve:** nobody approves their own request, and the Level 2 approver must differ from the Level 1 approver.
  - **Outcomes:** Approve, or Send back with a required comment. The requester edits and resubmits, or withdraws.
- **Terms of payment:** options are advance, on receipt, net 7/15/30/45/60/90, after content goes live, or custom text. The pay-by date is filled in from the document date. Approvers can change the terms while a request is pending or approved; a reason is required and it's logged.
- **Influencer requests:** need a valid handle (`HANDLE_RE`) and reel link (`REEL_RE`). An approver must tick "reel confirmed live" when approving, which sets `reelCheckedBy`.
- **"Can be paid?" verdict** (`checks()` and `verdict()` in `shared.js`): Yes, Not yet, No or Paid, with reasons.
  - Checks:
    - attachment present
    - PAN unchanged since submission
    - bank details valid and unchanged, if present (missing bank details is only a warning)
    - no duplicate invoice number for the same payee
    - document date not in the future
    - advance below the total
    - parent advance paid, for a balance
    - GST charged only if the payee has a GSTIN
    - TDS meets what the master requires
    - influencer handle, link and reel confirmation
    - in the artifact version only: invoice-read comparison and buyer GSTIN
  - Checks are either "block" or "warn". Some block checks can be overridden: the approver ticks "accept exceptions" and must write a comment, which is stored in `overrides[checkId]`.
  - Finance can only mark a request paid when the verdict is Yes.
- **Payees** have these fields:
  - name, GSTIN, PAN (taken from the GSTIN if blank), email, Instagram handle
  - optional bank details (beneficiary, account, IFSC, bank), remembered for later requests
  - defaults: nature, cost centre, terms

  A bank change is recorded in `bankChangedAt`, and open requests then fail the "bank unchanged" check. Requests store a snapshot of the payee at submission.
- **Payment:** Finance records the UTR and the paid-on date. There is no bank file; that was removed at the owner's request.
- **Audit trail:** each request has `history: [{at, by, action, note}]`. The action values are `submitted`, `resubmitted`, `approved_l1`, `approved_l2`, `rejected`, `withdrawn`, `paid`, `terms_changed`, `reel_checked`, `balance_raised`, plus `invoice_checked` in the artifact version only.
- **Excel log:** has four sheets: Requests, Audit log, Payees and Nature master.
  - **Apps Script version:**
    - The button saves an .xlsx export of the Sheet to Drive.
    - A time trigger runs `dailyExport` at 11 pm IST.
  - **Artifact version:**
    - The button downloads an .xlsx built with SheetJS.
    - A separate scheduled Claude task (see section 4) runs daily at 23:43 IST and uploads to the Drive folder "Kenzen Payment Desk – Excel logs".

## 2. Google Apps Script version

**Google resources** (owned by `mounesh@kenzenventures.com`):
- Drive folder **Kenzen Payment Desk**, ID `1e9lIWVV2Q5C0Rx3MNIAvxN8E9BnQlWCU` (`ROOT_FOLDER_ID`). `setup()` creates the sub-folders `Attachments` and `Excel logs`.
- Sheet **Kenzen Payment Desk – Data**, ID `1_8ix-jc6U2-TUrFvagGKmp9MIQQxQr0NiZzaq2_KGX8` (`SHEET_ID`). Its tabs are created by `setup()`:
  - `Requests`: readable columns, then a **hidden last column "Data (do not edit)" holding the full request JSON. That JSON is the source of truth**; the visible columns are rewritten from it on every save, and `refreshVerdicts_()` rewrites columns E and F for every row on each write.
  - `Payees`: the source of truth is the visible columns, in `PAYEE_KEYS` order, stored as plain text.
  - `Nature master`: the source of truth is the visible columns; it can be edited by hand.
  - `Audit log`: append-only.
  - `Settings`: B2 holds JSON with `tierLimit`, `companyGstins`, `costCentres`, `names` (email → display name) and `roles` (admin/approver1/approver2/finance as lowercase email lists).

**Files** (`apps-script/`):
- `src/shared.js`: constants, TDS logic, checks, verdict and role helpers. **The same code runs on the server and in the browser.** Both rely on a global `S` (`S.settings`, `S.payees` Map, `S.requests`, `S.me.id`, `S.isAdmin`).
- `src/Code.js`: the server.
  - `doGet`
  - `setup()`, run once
  - API functions called from the page through `google.script.run`: `api_state`, `api_saveRequest(base, editId)`, `api_act(id, kind, opts)` (kind is approve, reject, withdraw or paid), `api_terms`, `api_savePayee`, `api_saveSettings`, `api_upload(name, mime, base64)`, `api_export`
  - `dailyExport`

  Writes go through `withLock_` (a script lock, then reloading everything from the Sheet). **Roles, duplicates, checks and state changes are enforced on the server.** Identity is `Session.getActiveUser().getEmail()`. The deploying owner is always an admin.
- `src/client.js`: page logic. Uses vanilla JS with string-built HTML, a slide-in drawer for detail and form views, and polls `api_state` every 30 seconds.
- `src/page-head.html`: fonts, CSS (light and dark tokens) and page markup, shared with the artifact version.
- `build.py`: builds `dist/` (`Code.gs`, `Shared.gs`, `Index.html`, `appsscript.json`) from `src/`. **Edit `src/`, then rebuild.** There is no clasp setup yet; the owner pastes the `dist/` files into the script editor.
- `test/test_server.js`: Node mock of SpreadsheetApp, Session, LockService and similar. It runs the whole flow: setup, settings, payee, then advance → Level 1 → Level 2 → paid → balance, then the duplicate block and the self-approval block. Run `python3 build.py && node test/test_server.js`.

**Deployment steps given to the owner:**
1. Create an Apps Script project inside the Drive folder.
2. Show the manifest and paste in the four `dist/` files.
3. Run `setup()` and authorise it.
4. Deploy as a web app: execute as Me, access Anyone within Kenzen Ventures.
5. Add roles in the app.

To update the app later: Manage deployments → New version.

## 3. claude.ai artifact version

- A single HTML file using the claude.ai runtime capabilities `db`, `user`, `assets`, `sample` (invoice reading, images on) and `downloads`. The db access rule is `config` writable by admin only. Pdf.js 2.16.105 and SheetJS 0.18.5 are loaded from cdnjs.
- The db collections are `config/settings`, `payees/{id}` and `requests/{id}`. The request shape matches the Apps Script version, plus `extracted` (the invoice-read result).
- **Stale stored settings:** the `config/settings` document in the live artifact still has the old schema (`tdsSections`, `debitAccount`, no `natures`). `mergeSettings` falls back to the default natures until an admin saves the settings.
- The owner currently holds all three roles in the artifact, so Level 2 will stall.

## 4. Other moving parts

- **Scheduled Claude task** `trig_01Js9JAc5tUjMm29zXpHCspb`, "Payment Desk – daily Excel log to Drive". It runs at 23:43 IST, reads the artifact database and uploads an .xlsx to the Drive folder "Kenzen Payment Desk – Excel logs". **Turn it off once the Apps Script version is live.**

## 5. Known gaps and ideas for next steps

1. **Server trusts client amounts.** In Apps Script, `api_saveRequest` accepts the amounts (taxable, GST, TDS, payGross, net) as the client worked them out. The server should recompute them with `tdsPlan` and the compute logic, and reject any mismatch.
2. **No invoice reading in Apps Script.** It could be added with the Gemini API (the owner declined for now), or Google Document AI.
3. **No notifications.** Possible additions:
   - an email to approvers when something reaches them, using MailApp
   - a daily digest of overdue items
4. **Performance.** Every call reads the whole Sheet; that's fine for hundreds of requests. For thousands, add caching (CacheService) or split by financial year.
5. **No user-facing field-level edit history** for payees or the nature master. Only the bank change timestamp is kept, plus bankHistory in the artifact version.
6. **No 194Q (purchase of goods) logic** beyond a manually added nature. 194Q is based on the ₹50L annual purchases threshold and the buyer's turnover.
7. **TDS sections use the old numbering.** The Income-tax Act, 2025 renumbers TDS sections from 1 April 2026; the labels are free text in the master.
8. **Deployment is manual.** Consider clasp with `apps-script/` as the project root.
9. **Attachments are shared domain-wide with the link** (`DOMAIN_WITH_LINK` view). Tighten this if needed.
