# Design Review Log — Invoice + Office Expense System

- **Design under review:** `docs/design/2026-09-15-invoice-expense-system.md` (D1–D13)
- **Process:** multi-agent brainstorming. Skeptic (S), Constraint Guardian (C) and User Advocate (U) reviewed independently; the Primary Designer responded; the Integrator/Arbiter decided.
- **Verified in code by the designer:** service-level `BEGIN/COMMIT` in 11 service files (`invoices.ts` ×10, `presets.ts` ×9, others ×3–4); `trust proxy 1` at `webserver/main.ts:21`; nginx does not forward `X-Forwarded-Proto` and allows a 50 MB body (`scripts/nginx.conf.template:7,15`); invoice tests run on SQLite in-memory (`services/__tests__/invoices.spec.ts`).

Response codes: **ACCEPT** = design changed as described · **PARTIAL** = accepted with a narrower resolution · **REJECT** = no change (reason given).

---

## 1. Transactions, RLS and database roles

| ID | Sev | Objection (short) | Designer response |
|---|---|---|---|
| S1 / C2 | Blocker | Services run their own BEGIN/COMMIT; the adapter releases the client on COMMIT and falls back to `pool.query`. The request context would be lost partway through, and addInvoice/updateInvoice update the sequence after COMMIT. | **ACCEPT.** Phase 0 removes every service-level `BEGIN/COMMIT/ROLLBACK` in `banks, businesses, categories, clients, currencies, importExport, invoices, items, presets, styleProfiles, units`. The new `Db` handle wraps one transaction-bound `PoolClient` and **throws if used outside `withRequestTx` / `withSystemTx`**. Sequence work in add/update moves inside the same transaction. RLS is enabled only in Phase 1, after this lands. |
| C1 | Blocker | FORCE RLS also blocks the owner, so migrations, definer functions, `create-super-admin` and `pg_dump` see zero rows or fail. | **ACCEPT.** Roles: `app_owner` (owns schema, **BYPASSRLS**, NOLOGIN from the API; used only by the one-shot `migrate`, `backup` and `create-super-admin` containers) and `app_user` (API, no BYPASSRLS, not owner). `SECURITY DEFINER` functions are owned by `app_owner`, use `SET search_path = pg_catalog, public`, have `REVOKE EXECUTE … FROM PUBLIC` then `GRANT EXECUTE … TO app_user`, and return minimal columns. |
| S4 / C9 / C12 | Major | One notification policy blocks inserts for other users; audit rows for failed logins can't pass WITH CHECK; the users policy recurses; `''` from `current_setting`; views; upserts. | **ACCEPT.** Separate `SELECT / INSERT / UPDATE / DELETE` policies with explicit `USING` and `WITH CHECK`. `notifications`: INSERT requires a set `app.user_id`; SELECT/UPDATE require `user_id = app.user_id`. Auth events (login ok/fail, logout, password change) are written by definer function `auth_log_event()` in its own statement, outside request rollback. The helpers `app_office_ids()` etc. are `STABLE` `SECURITY DEFINER` functions that treat `NULL` or `''` as empty (no recursion). `users` is visible when the user is themself, is `all_offices`, or shares an office via `user_offices`; changes need `admin.users` checked in the app. Views use `security_invoker = true`. `invoice_sequences` gets INSERT/UPDATE grants plus `ON CONFLICT`. The audit log is described as **append-only for the application role**, not tamper-proof. `password_hash`, tokens and secrets are excluded from `before/after`. |
| C3 | Major | FKs ignore RLS, so an invoice could reference another company's client, bank, item, category or original invoice. | **ACCEPT.** Composite FKs wherever both sides carry scope: `invoices(clientId, businessId) → clients(id, business_id)`; `expenses(category_id, business_id) → category_businesses`; `reimbursements(expense_id, office_id) → expenses(id, office_id)`; `reimbursements(payout_id, office_id) → reimbursement_payouts(id, office_id)`; `invoices(original_invoice_id, office_id) → invoices(id, office_id)`. Where a composite FK is impractical (`invoice_items.itemId`, bank and preset selection), the service does a same-company check. Every such reference gets a cross-company case in the IDOR suite. |
| C6 | Major | 10 MB uploads inside a request transaction exhaust the pool; no timeouts are set. | **ACCEPT.** Multer streams to a temp dir **before** any transaction opens. Pool `max = 20`. On `app_user`: `statement_timeout = 15s`, `idle_in_transaction_session_timeout = 30s`. |
| S3 | Blocker | `reimbursements.expense_id UNIQUE` blocks re-approval after a cancel. | **ACCEPT.** Replace it with a partial unique index `(expense_id) WHERE status <> 'cancelled'`. A cancelled reimbursement row stays as history. |

## 2. Invoices, numbering and GST

| ID | Sev | Objection | Designer response |
|---|---|---|---|
| S2 / C7 | Blocker | A 1 MB JSON limit breaks logos, signatures, watermarks and invoice attachments, which are still base64 in the DB. | **ACCEPT.** Invoice-side binaries **stay in the DB** (preserve rule). Per-route JSON limit is **15 MB** for `invoices`, `businesses`, `presets` and `styleProfiles` write routes, and 1 MB everywhere else. Proxy body limit is 20 MB. List endpoints never return binaries. |
| S5 | Major | `gstin UNIQUE` forbids several branches under one GSTIN; rules for offices without a GSTIN are missing. | **ACCEPT.** Drop the UNIQUE on `gstin`. The series stays **per office** (D4 unchanged): GST permits multiple series per GSTIN as long as numbers are unique, and office codes are globally unique so strings never collide. An office **without a GSTIN cannot issue invoices or credit notes** (it can still record expenses and quotes). |
| S6 | Major | Existing code: browser-supplied snapshots overwritten on update, quote→invoice reuses the number, duplicate assigns a number, manual number entry, unique key includes clientId. | **ACCEPT.** At **issue**, the server rebuilds every snapshot (business, office, client, bank, currency, items) from the DB and ignores browser snapshot payloads. Drafts may refresh snapshots; issued invoices never do. Quote→invoice and duplicate create a **draft with no number**. Manual number entry is removed. The existing unique keys and the full-number computed column are replaced by `UNIQUE (office_id, invoiceType, invoiceNumber) WHERE invoiceNumber IS NOT NULL`. The Phase 2 plan lists these code paths (`invoices.ts` getDuplicateInvoiceNumber, processSequence, processSequenceOnUpdate, duplicateInvoice; migrations 22, 24, 25). |
| S7 | Major | Float, unrounded two-level tax including "deducted"; unclear source of truth; browser-side report aggregation. | **ACCEPT.** The source of truth is `invoice_items.gst_rate` plus invoice-level `prices_include_tax`. Legacy item `taxRate/taxType`, invoice `taxName/taxRate/taxType` and "deducted" are **dropped from the baseline schema** (fresh install). The shared `tax` module uses **integer paisa** with half-up rounding per line and per tax head. Preview, PDF and server all call it; a unit test asserts preview totals equal stored totals. Reports move server-side in Phase 5 (`aggregateInvoicesByCurrency` removed). |
| S8 / C13 | Major | Issue date source, backdating across FY, `dueDate >= issuedAt` check at issue; UTC timezone. | **ACCEPT.** `issuedAt` is a **date** chosen on the draft, defaulting to today in **Asia/Kolkata**. At issue it must be ≤ today and ≥ the latest issued date in that series (keeps numbers chronological). The FY is derived from that date. The due-date check is validated at issue with a clear message. All date-only business fields use `DATE` with the IST calendar. |
| S9 | Major | Cancel vs GSTR-1, credit-note sign, multi-invoice notes, time limit, payments on cancel. | **PARTIAL.** Cancel is allowed only when the invoice has **no recorded payments**. The UI warns: "Only cancel if this invoice has not been reported in GSTR-1; otherwise raise a credit note." Credit notes store **positive** amounts, reference **exactly one** original invoice, and cannot exceed that invoice's uncredited value. Balance = total − payments − credit notes; ageing uses that balance. A **warning** (not a block) appears after 30 November following the invoice's FY. **REJECT** GSTR-1 filing-status tracking in v1 (it is a period-lock feature; see feature #4). |
| S10 / U7 | Major | "Client country ≠ IN → export" misses SEZ, POS 96, services with POS in India, B2C, reverse charge; who sets POS? | **ACCEPT.** Supply type is **derived from place of supply (POS), not client country**. POS defaults to the client's state, or `96 – Other country` for foreign clients, and is **editable** with a hint. Handled in v1: B2B and B2C (unregistered: no GSTIN, same tax maths), intra/inter-state, export (POS 96) with LUT or IGST, and **SEZ** (client flag `is_sez`, with LUT or IGST, like export). **Out of scope in v1, documented:** reverse charge, deemed exports, e-commerce operator supplies, goods-specific rules (e-way bill). Users see plain wording ("Same state – CGST + SGST", "Export without tax (LUT)"). The only tax choice a user makes is LUT vs pay IGST, when applicable. |
| S11 | Major | Rate source for export IGST valuation; forex difference; which INR figure reports use. | **PARTIAL.** The rate stays **manually entered** and must be "the rate your accountant uses for the invoice date". The invoice stores `exchange_rate_source` (free text, e.g. "RBI ref 2026-09-15") and the rate date. The INR taxable value is computed from it and locked at issue. Reports and ageing use the **INR value at the issue rate**. Payments store the actual INR received, and the invoice report shows a *forex difference* column. **REJECT** automatic notified-rate lookup (live FX is a non-goal, D6). |
| S15 | Minor | Code length unbounded; invoice and credit note strings can collide. | **ACCEPT.** Office code is **2–3 uppercase alphanumerics**, globally unique. Format `{code}{T}/{YY-YY}/{seq4}`, where T = none for invoice, `CN` credit note, `Q` quote. Max `ABCCN/25-26/9999` = 16 chars. A series beyond 9999 per FY is rejected with an admin-facing error (well above stated scale). |
| S16 | Minor | `invoice.view` scope undefined. | **ACCEPT.** `invoice.view` = invoices where `created_by = me` in my offices; `invoice.view_all` = all invoices in my offices. The same pattern applies to quotes and credit notes. |
| S12 | Major | Full JSON import/export and XLSX import bypass scope, locking, numbering and audit. | **ACCEPT.** **Remove** full JSON import/export and invoice import (backups replace them). **Keep** XLSX **export** of lists (scoped, via the list endpoints) and XLSX **import** only for customers and items, into the currently selected company, with an audit event. |
| S13 | Major | The baseline must reproduce seeds; SQLite-only SQL remains in services; migration count is off. | **ACCEPT.** The baseline is produced by applying the legacy migrations to PostgreSQL, `pg_dump --schema-only` plus the seed-data statements (currencies, units, categories, layout and template seeds), then edited. A CI check diffs the schema. Phase 0 removes every `getColumnType/getDefaultValue/db.type` use in services (9 files) and migrations. Corrected count: **30 legacy migration files (two share prefix 21)**. |

## 3. Security, operations and deployment

| ID | Sev | Objection | Designer response |
|---|---|---|---|
| C4 / C14 | Major | Caddy → nginx → Node breaks per-IP limits and `req.secure`; CORS unneeded; three hops. | **ACCEPT.** **Drop nginx.** Caddy serves the built SPA (`file_server`), `reverse_proxy /api/* app:3000`, and sets `X-Forwarded-Proto`. Express `trust proxy = 1` is now correct. **Remove CORS** (same origin). The login limiter is keyed by IP + email (5 / 15 min) plus a broader per-IP limit (50 / 15 min). Healthchecks on `db` and `app`, `restart: unless-stopped`. |
| C5 | Major | Owner credentials in the API environment. | **ACCEPT.** The API container gets only `DATABASE_URL` (`app_user`). `MIGRATION_DATABASE_URL` exists only in the one-shot `migrate` / `backup` / `admin-cli` services. Secrets live in a root-only `.env` (mode 600) that is never committed. |
| C8 / U10 | Major | Polyglots, active PDFs, EXIF/GPS, filenames, orphan-cleanup race; HEIC. | **ACCEPT.** Random storage keys; the stored MIME type is **detected** from bytes. Images are **re-encoded with `sharp`** (strips EXIF/GPS). PDFs are stored as-is but served with `Content-Disposition: attachment` (RFC 5987 filename), `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`. Input `accept="image/jpeg,image/png,image/webp,application/pdf"`; iOS converts HEIC to JPEG for such inputs. Rejected files get the message "Use JPG, PNG, WEBP or PDF up to 10 MB". Orphan cleanup only removes files older than 24 h with no DB row. |
| C10 | Major | Backups on the same host, unencrypted; ordering and consistency. | **ACCEPT.** Order: `pg_dump` first, then an attachments snapshot (files are write-once). The archive is encrypted with `age` (public key in env) and copied to a configurable **off-host target** (rclone remote or mounted NAS). The restore drill verifies every `expense_attachments.storage_key` exists. |
| C11 / U2 | Major | Session TTLs, rotation, revocation, CSRF bootstrap, sessions under RLS, cleanup; reset channel and who resets. | **ACCEPT.** Cookie `__Host-sid`: Secure, HttpOnly, SameSite=Lax, Path=/. **Idle timeout 12 h, absolute 7 days**, new token on every login. All of a user's sessions are revoked on password change, admin reset, deactivation or role/office change. The CSRF token is returned by `POST /api/auth/login` and `GET /api/auth/me`, held in memory, and sent as `X-CSRF-Token`. The login POST is protected by a strict `Origin` check plus SameSite. The `sessions` table is reachable **only via definer functions** (no table grants to `app_user`). Hourly cleanup of expired sessions. **Password reset:** Super Admins, and Office Admins for users whose offices are all within their own, can reset. Reset generates a random **one-time temporary password shown once** to the resetting admin, sets `must_change_password`, expires in 24 h and revokes sessions; the reset is audited. The login page says "Forgot password? Contact your office admin." Anti-escalation: a non-Super-Admin with `admin.users` cannot set `all_offices`, assign offices outside their own, or assign a role or grants containing permissions they don't hold. |
| C15 | Minor | Log redaction. | **ACCEPT.** Never log bodies, cookies, CSRF tokens, passwords or attachment names; log method, route, status, duration, userId, requestId. 30-day log retention via the Docker log driver. |
| C16 | Minor | Client PDF of large reports. | **ACCEPT.** PDF export is capped at 2,000 rows; above that, only CSV is offered. |

## 4. User experience

| ID | Sev | Objection | Designer response |
|---|---|---|---|
| U1 | Blocker | Fresh-install path to the first invoice and expense is undefined. | **ACCEPT.** **Seeded data:** INR plus USD/SGD/AED/NGN/EUR/GBP, units, current GST rates (corrected by the Arbiter, see §6: 0, 0.25, 1.5, 3, 5, 18, 40, admin-editable), a default layout and style profile, and a starter expense-category set (enabled for every company on company creation). **Setup order** (shown as a checklist in the Super Admin dashboard **empty state**, not a wizard): 1 Company → 2 Office (code, state, GSTIN) → 3 Bank account → 4 Users → 5 Customers & items. **Empty states** on blocked screens say what's missing and who can fix it (e.g. "No office with a GSTIN yet – ask a Super Admin"). |
| U3 | Major | A 404 from RLS is unexplained. | **ACCEPT.** One UI message: "This record doesn't exist or you no longer have access to it", with a "Back to list" button. |
| U4 | Major | Office switcher on "All" and in Approvals. | **ACCEPT.** With "All my offices" selected, new-record forms **require** choosing an office (pre-filled if the user has one office). The switcher is **hidden** for single-office users. The **Approvals queue and notifications ignore the switcher** (they always show every office in scope, with an Office column). The active filter is shown as a chip. |
| U5 | Major | Reimbursement cancel isn't notified and appears as "rejected". | **ACCEPT.** `reimbursement.cancelled` is added to v1 notification events. The expense shows "Returned for correction" (distinct from "Rejected") with the reason. |
| U6 | Major | Two status vocabularies; "All expenses" label. | **ACCEPT.** The employee-facing combined status is **Draft · Awaiting approval · Returned for correction · Rejected · Approved – awaiting payment · Paid on <date> (ref) · Completed**. The nav label is "My expenses" without `expense.view_all`. |
| U8 | Major | Draft PDF sent by mistake; irreversible issue; cancel vs credit note guidance. | **ACCEPT.** Draft PDFs carry a **"DRAFT – not a tax invoice"** watermark and have no number. Issue shows a confirm dialog ("This locks the invoice and assigns number …"). Issued invoices show one help line on when to cancel versus raise a credit note. |
| U9 | Major | Permission screen comprehension. | **ACCEPT.** Role permissions show as checked, greyed and labelled "from role"; extra grants are normal checkboxes. Editing a role warns "Affects N users". Labels are shown, not keys. Dependencies are auto-ticked (e.g. `expense.approve` ⇒ `expense.view_all`; `invoice.edit` ⇒ `invoice.view`). |
| U11 / S14 | Minor | Who an expense waits on; only Super Admin submits; routing time. | **ACCEPT.** The "Awaiting approval by <Office Admin, BLR> / <Super Admin>" label is computed when read. If **no eligible approver exists** (e.g. the sole Super Admin submits), submit is allowed but a banner says "No other approver exists – ask a Super Admin to add one". The setup checklist recommends at least 2 approvers per office. |
| U12 | Minor | Business/company wording, jargon, default payment type. | **ACCEPT.** "Company" everywhere in UI and new code; the DB table stays `businesses` (glossary in docs). Employees see "Payment" rather than "payout". Payment-type labels: "I paid (reimburse me)" (**default**), "Company paid", "Paid directly to supplier". |
| U13 | Minor | Payout selection across employees. | **ACCEPT.** The Pending list is grouped by employee and office; selection is limited to one group. |
| U14 | Minor | Notification discoverability. | **ACCEPT.** Top-bar bell with an unread badge, polled every 60 s; dashboard "Pending approvals" count. |

---

## 5. Decision log additions (proposed; pending Arbiter)

| # | Decision | Alternatives | Rationale / source |
|---|---|---|---|
| D14 | No service-level transactions; `Db` bound to request transaction, throws outside it | Keep per-service transactions | S1/C2 |
| D15 | DB roles: `app_owner` (BYPASSRLS, used only by one-shot migrate/backup/admin-cli containers), `app_user` (API); definer functions hardened | Owner without BYPASSRLS | C1/C5 |
| D16 | Invoice binaries stay in the DB, 15 MB per-route limit; expense files on disk | Move all binaries to disk | S2/C7, preserve rule |
| D17 | At issue: server rebuilds snapshots, assigns number, validates date (IST, chronological, ≤ today); drafts have no number | Number at draft save | S6/S8/C13 |
| D18 | Tax model: supply type derived from editable place of supply; B2B, B2C, intra/inter, export and SEZ (LUT/IGST); reverse charge etc. out of scope; integer paisa shared module; legacy tax fields dropped | Country-based rule | S7/S10/U7 |
| D19 | Credit notes positive, one original invoice, capped; cancel only without payments; FY-deadline warning | Negative amounts; cancel anytime | S9 |
| D20 | Series per office; GSTIN may repeat across offices; office code 2–3 chars; format `{code}{T}/{YY-YY}/{seq4}` | Series per GSTIN | S5/S15 |
| D21 | Remove full JSON import/export and invoice import; keep scoped XLSX export and customer/item XLSX import | Keep all | S12 |
| D22 | Caddy only (no nginx); no CORS; trust proxy 1; login limits by IP+email | Caddy + nginx | C4/C14 |
| D23 | Session and reset rules as in C11/U2 response, including Office Admin resets within scope and anti-escalation | Super Admin only | C11/U2 |
| D24 | Uploads: temp before transaction, sharp re-encode, sandboxed download, iOS-safe accept list | Magic bytes only | C6/C8/U10 |
| D25 | Encrypted off-host backups, dump then files, restore drill checks files | Same-host backups | C10 |
| D26 | Seeds + setup checklist in empty state + empty-state messages | Setup wizard | U1 |
| D27 | Employee-facing combined status; "Returned for correction"; draft watermark; permission screen rules; switcher rules; bell | — | U3–U14 |

## 6. Arbiter Decision

**Final disposition: APPROVED** (with binding conditions).

Every objection was ruled Accepted or Accepted-with-condition. The two PARTIAL responses are upheld: S9 defers GSTR-1 filing tracking, and S11 keeps the exchange rate manual with no live FX (per D6).

### Contradictions found by the Arbiter, and how they were resolved
| Contradiction | Resolution (folded into design Rev 2) |
|---|---|
| Auth events cannot be logged "outside rollback" from inside the same transaction | `auth_log_event` runs in its **own** transaction, never inside `withRequestTx` (D15) |
| Background jobs have no credentials or context | `withSystemTx(jobName)` calls only dedicated definer functions and cannot be imported by controllers (design §6.2) |
| Revoking sessions on role edit would log out whole roles | Revoke only when that user's own password, active flag, role assignment or offices change (D23) |
| Category composite FK vs per-company toggle | `category_businesses.is_enabled` flag; rows are never deleted |
| "Returned for correction" not stored | New expense status `returned` |
| Seeded GST rates 0/5/12/18/28 are outdated (rate rationalisation effective 22 Sep 2025) | Seed current notified rates (0, 0.25, 1.5, 3, 5, 18, 40) in `gst_rates`, admin-editable. **Verify the list with your accountant at setup.** |
| Schema-diff reference unspecified | Reference is **`fixtures/legacy-columns.json`** (table → column names from legacy migrations applied to PostgreSQL). The test asserts that baseline columns equal legacy columns minus a listed set of intentional drops. Removed at the end of Phase 2. |
| `invoices.spec.ts` runs on SQLite | Ported to PostgreSQL in Phase 0 task 0.1, before any SQLite removal |
| Design doc stale sections | Fixed in design Revision 2 |

### Binding conditions (must be honoured by the plans)
1. D14–D27 are folded into the design doc, and stale sections are fixed. ✅ Done (Revision 2).
2. User sign-off on design §3a items A1–A8 before the phase listed there.
3. `withSystemTx` has an explicit context, is used only by internal jobs and cannot be reached from routes. Session cleanup goes through definer functions.
4. Auth audit events are written in a separate transaction.
5. Revoke sessions only when the user's own role assignment, offices, password or active status changes.
6. `category_businesses` rows are kept; toggles use a flag.
7. "Returned for correction" is a stored status.
8. GST rates are seeded from currently notified slabs, admin-editable, `NUMERIC`.
9. `invoices.spec.ts` is ported to PostgreSQL in Phase 0 before SQLite removal; the schema diff has a named reference.
10. The server enforces permission dependencies from the same map as the UI.
11. Every composite-FK reference and every service-checked reference has a cross-company IDOR test.

### Exit criteria check
- [x] Understanding Lock completed
- [x] All reviewer agents invoked (Skeptic, Constraint Guardian, User Advocate)
- [x] All objections resolved or explicitly ruled
- [x] Decision Log complete (D1–D27)
- [x] Arbiter declared the design acceptable
