# Invoice + Office Expense + Reimbursement System — Design

- **Date:** 2026-09-15
- **Status:** Revision 2. Approved by multi-agent review (Arbiter: APPROVED with binding conditions). Items marked ⚠ were signed off by the user on 2026-09-15 (see §3a).
- **Review log:** `docs/design/2026-09-15-design-review.md`. Its detailed responses are normative for sessions, uploads, RLS policies and UX wording.
- **Repository:** fork of `piratuks/invoice-builder` → `Deepak-kumbla208/invoice-builder-expense`
- **Base commit inspected:** `f7045f7` (invoice-builder v2.8.0)

---

## 1. Understanding Summary

- **What:** Extend the existing invoice-builder fork into a **web-only, PostgreSQL-only** business application: invoices (+ quotes, credit notes), office expenses, reimbursements, dashboard, reports, and audit log. The existing invoice form, PDF engine, layouts and style profiles are preserved and reused.
- **Why:** The organisation runs three Indian companies that invoice domestic and foreign clients. It needs GST-correct invoicing and accountable tracking and repayment of office spending in one system.
- **Who:** Super Admins, Office Admins and employees. Up to about 100 users, about 3 companies, about 10 offices.
- **Structure:** Company (brand, logo, customers, items, bank accounts) → Office (state, GSTIN, billing address, invoice numbering) → Users.
- **Access:** Users see data only for the offices they are assigned to. Each user has one role (a set of permission checkboxes) plus optional extra permissions granted individually. Enforced by API checks **and** PostgreSQL row-level security.
- **Invoices:** Numbering per office, per document type, per financial year (April–March). Full Indian GST (CGST+SGST, IGST, export with LUT or with IGST, HSN/SAC). Any currency, with a locked exchange rate to INR. Reports total in INR.
- **Expenses:** INR only. One approval step, and nobody approves their own expense. Employee-paid expenses create a reimbursement when approved; several reimbursements can be paid in one payout. Company-paid and direct-supplier expenses move to Completed on approval.

## 2. Assumptions (confirmed)

1. Fresh install; no existing invoice-builder data to import.
2. Hosted with Docker Compose on the organisation's own Linux server, behind HTTPS.
3. Login is email + password (argon2 hashing). The `__Host-sid` cookie is Secure, HttpOnly and SameSite=Lax, with a 12 h idle and 7 day absolute session lifetime. CSRF uses an `X-CSRF-Token` header. Logins are rate-limited by IP+email. No self sign-up. Super Admins, and ⚠ Office Admins (for users within their own offices), reset passwords using a one-time temporary password shown once.
4. Attachments are stored on the server disk outside the web root and served only through authorised endpoints. Allowed types are JPG, PNG, WEBP and PDF, checked by magic bytes, up to 10 MB each.
5. Nightly backups: `pg_dump` first, then the attachments snapshot, encrypted with `age` and ⚠ copied to an off-host target the organisation provides. Kept 30 days. The restore drill verifies that every attachment file exists.
6. Scale is up to about 100 users and a few thousand invoices and expenses per year. Lists are paginated on the server, with page responses in under about 1 second.
7. English UI only (i18n infrastructure kept).
8. All issuing offices are in India. Expenses are INR only. Invoices may be in any currency.
9. Every company's turnover is below ₹5 crore, so IRN e-invoicing is not required in v1.
10. EU e-invoice exports (UBL, Peppol, XRechnung) are hidden. Thermal receipt printing, which is Electron-only, is removed.
11. Expenses record optional vendor GSTIN and GST amount, so input tax credit can be tracked later.
12. Notifications are in-app only in v1, with a data model ready for email.
13. The team does not keep merging from upstream after the fork diverges. The MIT licence and attribution are retained.
14. The organisation owns maintenance, so the design favours familiar, boring technology.

## 3. Non-Goals (v1)

Desktop/Electron app · SQLite · overseas entities or foreign tax regimes · IRN e-invoicing and e-way bills · live FX rates · expense claim batches · multi-step or threshold approvals · departments · ERP/accounting sync · SSO and 2FA · cloud object storage · multi-tenant SaaS / public sign-up.

---

## 3a. Changes from Review — User Sign-off ⚠ (all confirmed 2026-09-15)

| # | Change | Affects | Needed before |
|---|---|---|---|
| A1 | Remove full JSON import/export and invoice XLSX import (keep scoped XLSX export and customer/item XLSX import) | Existing features, S12 | Phase 1 |
| A2 | Remove manual invoice number entry; drafts have no number | Existing features, S6 | Phase 2 |
| A3 | GST scope: B2B, B2C, intra/inter-state, export and **SEZ** (LUT or IGST). **Out of scope:** reverse charge, deemed exports, e-commerce operator supplies | D7, S10 | Phase 2 |
| A4 | Cancel only if the invoice has no recorded payments; no GSTR-1 filing tracking in v1 | D13, S9 | Phase 2 |
| A5 | An invoice cannot be dated earlier than the latest issued document in its series | S8 | Phase 2 |
| A6 | An office without a GSTIN can record expenses and quotes but cannot issue invoices or credit notes | D4, S5 | Phase 2 |
| A7 | Encrypted backups copied to an off-host target (organisation provides the target and keeps the private key) | Ops, C10 | Phase 6 |
| A8 | Office Admins can reset passwords for users within their own offices | C11, U2 | Phase 1 |

## 4. Current System Assessment (as inspected)

### Stack
- **Frontend:** React 19, MUI 9, Redux Toolkit, react-router 7, Vite 8, i18next, recharts, `@react-pdf/renderer` (PDFs are generated in the browser).
- **Backend:** Express 5 REST server (`src/backend/webserver`) and an Electron main process with IPC (`src/backend/main`). Both call a shared service layer (`src/backend/shared/services`).
- **Data:** Raw SQL through a `DatabaseAdapter` supporting both SQLite and PostgreSQL (`?` placeholders are converted to `$n`). TypeScript migrations (30 files) run when the app connects. The base schema is in `shared/db/setup.ts`.
- **Deploy:** Dockerfile (nginx + Node), docker-compose, and GitHub Actions (tests, lint, prettier, image publish, Electron releases).
- **Tests:** about 6 unit/component tests and 2 Playwright specs (one Electron-only).

### Useful existing capabilities (preserve)
- `businesses` entity with logo, address and contacts, plus **per-invoice snapshots** of business, client, bank, currency, items, layout and style profile.
- Invoices and quotes, partial payments, payment statuses (unpaid, partially, paid, closed), discounts, surcharge, shipping, inclusive and exclusive tax, duplication, attachments, signatures.
- JSON-driven PDF layouts (V1 and V2), style profiles, presets, custom labels, QR codes.
- XLSX import/export, full JSON export/import, and basic revenue reports.

### Limitations and defects relevant to this project
| # | Issue | Location |
|---|---|---|
| L1 | No authentication, users or roles | whole app |
| L2 | Any browser can repoint the server's global database via `POST /api/databases` | `webserver/controllers/database.ts` |
| L3 | The PostgreSQL adapter shares one `clientInTransaction` across all concurrent requests, so transactions from different users can interleave | `shared/db/client.ts:64` |
| L4 | SQL string interpolation (`i."id" = ${id}`, type) | `shared/services/invoices.ts:669-670` |
| L5 | `GET /api/invoices` returns every invoice with all snapshots and attachments as base64; no pagination | `services/invoices.ts` `getInvoices` |
| L6 | Binary data stored in the database and transported as base64 JSON with a 50 MB body limit | `webserver/main.ts`, `platformApi.ts` |
| L7 | Dual-dialect SQL doubles the effort for every schema change | `shared/utils/dbHelper.ts`, migrations |
| L8 | Invoice numbering is scoped to business + client; the prefix is global | `invoice_sequences`, `settings` |
| L9 | Tax model is generic (one rate), not GST | `invoices`, `invoice_items` |
| L10 | Invoice totals are calculated in the browser, not stored for server-side reporting | renderer invoice form |

---

## 5. Decision Log

| # | Decision | Alternatives considered | Rationale |
|---|---|---|---|
| D1 | **Web + PostgreSQL only.** Remove Electron and SQLite. The server connects to one configured database. | (B) keep Electron compiling for existing features; (C) keep both databases | One security model and one SQL dialect; removes L2 and L7. Cost: upstream merges become manual. |
| D2 | **Access comes from assigned offices.** Company access follows from office. Invoices and expenses record `business_id` + `office_id`. `all_offices` bypasses the scope. | Company-level access; separate company and office grants | Matches Company → Office → User; keeps Office Admins limited; one mapping table |
| D3 | **Role = editable set of permission checkboxes. User = one role + optional extra grants (grants only, no denies).** | Roles only; per-user copies of permissions | Role edits reach everyone; exceptions don't need new roles; no deny logic |
| D4 | **The company holds the brand. Each office holds GSTIN, billing address, prefix and number series. Numbering is per office, per document type, per financial year.** | One series per company; keep current numbering | GST requires a unique series per GSTIN per financial year; companies may have offices in several states |
| D5 | **One reimbursement per approved employee-paid expense; many reimbursements can be settled in one payout.** Company-paid and direct-supplier expenses complete on approval. | Claim batches; reimbursement as fields on the expense | Simple approvals, one payment action for many items, clean reports |
| D6 | **All issuing offices are in India. Expenses are INR only. Invoices are multi-currency, with a locked exchange rate to INR.** | Overseas entities with local tax; both | Keeps tax India-only; reports total in INR |
| D7 | **Full Indian GST on invoices** (customer GSTIN and place of supply, HSN/SAC and rate per item, automatic CGST+SGST, IGST or export with LUT or IGST, tax summary on PDF). | Keep generic tax; add IRN e-invoicing now | Compliant invoices without portal integration |
| D8 | **Customers, items and presets belong to one company. Bank accounts belong to a company and are selected per office. Layouts, style profiles and expense categories are shared, with per-company defaults and toggles.** | Shared customer list linked to companies; everything shared | Company isolation with the simplest queries |
| D9 | **One approval step. No self-approval.** An approver's own expense routes to another approver for that office or a Super Admin. | Threshold second approval; configurable chains | Sufficient for v1; thresholds can be added later without changing the schema |
| D10 | **No departments.** | Departments on expenses | Office + category is sufficient |
| D11 | **No IRN e-invoicing in v1.** | Build the IRP/GSP integration now | Turnover is below ₹5 crore |
| D12 | **Approach C: extend in place + PostgreSQL row-level security.** | (A) app-layer scoping only; (B) rewrite data access with a query builder; rebuild on a new framework (rejected: breaks the preserve-invoices rule) | Defence in depth: a missing filter cannot leak another office's rows. Preserves the working invoice code. |
| D13 | **v1 also includes draft → issued invoices locked after issue, credit notes and cancellation, and receivables ageing.** | Defer all extra features; add more | GST correctness for little extra work |
| D14 | No service-level transactions. `Db` is bound to one transaction and throws when used outside it. `withSystemTx` (explicit system context) is used only by internal jobs and cannot be imported from controllers. | Keep per-service BEGIN/COMMIT | Review S1/C2; 11 services verified |
| D15 | DB roles: `app_owner` (owner, BYPASSRLS, used only by one-shot `migrate`/`backup`/`admin-cli` containers) and `app_user` (API). Definer functions pin `search_path`, revoke from PUBLIC and return minimal columns. Auth audit events are written in their own transaction. | Owner without BYPASSRLS | C1/C5/C9 |
| D16 | Invoice-side binaries stay in the DB with a 15 MB per-route JSON limit (1 MB elsewhere, 20 MB at Caddy). Expense files go on disk. | Move all binaries to disk | S2/C7; preserve rule |
| D17 | At issue, the server rebuilds all snapshots from the DB, assigns the number and validates the date (IST calendar, ≤ today, ≥ last issued in series). Drafts, duplicates and quote conversions have no number. | Number at draft save; browser snapshots | S6/S8/C13 |
| D18 | Supply type is derived from an editable place of supply (default: client state, or 96 for foreign clients). Covers B2B, B2C, intra/inter, export and SEZ (LUT or IGST). Integer-paisa shared tax module. Legacy tax fields are dropped. GST rates are seeded from current slabs and admin-editable (`NUMERIC`). | Country-based rule | S7/S10/U7/Arbiter cond. 8 |
| D19 | Credit notes: positive amounts, exactly one original invoice, capped at uncredited value, with a warning after the statutory deadline. Cancel is only allowed without payments. | Negative amounts; cancel anytime | S9 |
| D20 | Series per office. GSTIN may repeat across offices. Office code is 2–3 characters and globally unique. Format `{code}{T}/{YY-YY}/{seq4}` (T = "", CN, Q). | Series per GSTIN | S5/S15 |
| D21 | Remove full JSON import/export and invoice import; keep scoped XLSX export and customer/item XLSX import | Keep all | S12 ⚠ A1 |
| D22 | Caddy only (static SPA + `/api` proxy). No nginx, no CORS. `trust proxy 1`. | Caddy + nginx | C4/C14 |
| D23 | Sessions and resets per assumption 3. Revoke a user's sessions only when that user's password, active flag, role assignment or offices change. Office Admin resets are allowed within scope, with anti-escalation rules. | Revoke on role edit | C11/U2/Arbiter cond. 5 |
| D24 | Uploads: temp file written before the transaction; detected MIME type; `sharp` re-encode for images; sandboxed attachment download; iOS-safe `accept` list; 24 h grace before orphan cleanup | Magic bytes only | C6/C8/U10 |
| D25 | Encrypted off-host backups; dump then files; restore drill checks files | Same-host backups | C10 ⚠ A7 |
| D26 | Seed data plus a setup checklist in the Super Admin dashboard empty state, and empty-state messages on blocked screens | Setup wizard | U1 |
| D27 | UX rules: combined employee status wording, stored `returned` expense status, DRAFT watermark, permission screen (role-locked, "affects N users", dependency map enforced by the server as well), switcher rules, notification bell | — | U3–U14/Arbiter cond. 7, 10 |

---

## 6. Architecture

```
Browser (React SPA, MUI)
   │  HTTPS, session cookie + X-CSRF-Token
   ▼
Caddy (TLS, static SPA, /api/* proxy, 20 MB body cap)  →  Node/Express API
                                                   │  middleware: helmet, session, CSRF, requirePermission
                                                   │  controllers: zod validation
                                                   │  withRequestTx(ctx) → services(db, ctx, input)
                                                   ▼
                                    PostgreSQL 17 (connected as app_user, RLS forced)
                                    Attachments volume (ATTACHMENTS_DIR)
```

### 6.1 Code layout (evolves the existing structure)
- `src/backend/webserver` — HTTP server, controllers, middleware (auth, CSRF, permission guard, error handler).
- `src/backend/shared/services` — business logic (existing invoice services plus new modules).
- `src/backend/shared/db` — `pg` Pool, `withRequestTx`, migration runner (PostgreSQL only).
- `src/backend/shared/auth` — password hashing, sessions, permission resolution.
- `src/backend/shared/workflow` — expense, reimbursement and invoice document status transition tables.
- `src/backend/shared/tax` — **shared** GST calculation module, imported by both the server and the renderer (resolves L10 drift).
- `src/renderer` — existing React app; `DatabaseChooser` replaced by Login.
- **Removed:** `src/backend/main`, `src/preload`, Electron Vite configs, `electron-builder.yml`, SQLite code paths, `/api/databases` endpoints.

### 6.2 Database roles and row-level security
- **`app_owner`** owns the schema, has `BYPASSRLS`, and is used only by the one-shot `migrate`, `backup` and `admin-cli` containers (`MIGRATION_DATABASE_URL`). It owns all `SECURITY DEFINER` functions (`SET search_path = pg_catalog, public`, `REVOKE EXECUTE FROM PUBLIC`, `GRANT EXECUTE TO app_user`).
- **Internal jobs** (session cleanup, orphan-file sweep) run in the API process through `withSystemTx(jobName, fn)`. It calls only dedicated definer functions (`auth_cleanup_sessions()`, `sys_attachment_keys()`), sets `app.system = jobName`, and lives in a module that controllers cannot import (enforced by an ESLint `no-restricted-imports` rule).
- Helper functions treat `NULL` and `''` settings as empty. Each operation has its own policy (`USING` + `WITH CHECK`). Views use `security_invoker = true`.
- **`app_user`** is used by the API (`DATABASE_URL`). It is not a superuser, has no `BYPASSRLS`, and does not own the tables.
- `ENABLE` **and** `FORCE ROW LEVEL SECURITY` on all scoped tables.
- Per request, inside the transaction:
  `set_config('app.user_id', …, true)`, `app.office_ids` (comma list), `app.business_ids`, `app.all_offices`. These settings are transaction-local, so they cannot leak across pooled connections.
- Helper functions `app_office_visible(office_id)` and `app_business_visible(business_id)` are `STABLE` and read those settings. A missing setting means **no rows**.
- Pre-authentication lookups (login, session validation) use narrow `SECURITY DEFINER` functions: `auth_find_user_by_email(email)` and `auth_session(token_hash)`.
- RLS scopes **rows**. **Action permissions** (e.g. `expense.approve`) and the own-versus-all rule are enforced in the API and services. Services still add office filters explicitly; RLS is the backstop.

### 6.3 Request flow
1. `helmet`. JSON body limit is 1 MB, except 15 MB on `invoices`, `businesses`, `presets` and `styleProfiles` write routes (D16). Multipart uploads stream to a temp dir **before** any transaction opens. No CORS (same origin).
2. Session: hash the cookie token → `auth_session` → build `ctx = { userId, roleId, permissions:Set, officeIds, businessIds, allOffices, ip, requestId }`.
3. CSRF: non-GET requests must send `X-CSRF-Token` matching the session secret.
4. `requirePermission(key)` on each route.
5. `withRequestTx(ctx, db => service(db, ctx, input))`: BEGIN → set_config ×4 → run → COMMIT, or ROLLBACK on error. Each transaction uses its own pooled client (resolves L3).
6. Services apply record-level rules and transition checks, and write `audit_logs` and `notifications` in the same transaction.
7. All SQL is parameterised (resolves L4).

### 6.4 Error handling
Response shape stays `{ success, data, key, message }` for compatibility with existing screens.

| Case | HTTP |
|---|---|
| Validation failure (zod) | 400 with field errors |
| No or expired session | 401 |
| Missing permission | 403 |
| Not found **or** hidden by RLS | 404 (identical response, so IDs cannot be enumerated) |
| Invalid status transition, sequence conflict, stale update | 409 |
| Unexpected error | 500; logged with requestId; no stack trace to client |

### 6.5 Configuration (env)
The API container receives only `DATABASE_URL` (`app_user`), `ATTACHMENTS_DIR`, `APP_ORIGIN` and `NODE_ENV`. `MIGRATION_DATABASE_URL` exists only in the one-shot `migrate`, `backup` and `admin-cli` services. Secrets live in a root-only `.env` (mode 600); only `.env.example` is committed. Pool `max = 20`. `app_user` has `statement_timeout = 15s` and `idle_in_transaction_session_timeout = 30s`. The first run uses `docker compose run --rm admin-cli create-super-admin`; no users are hard-coded. Logs never include bodies, cookies, tokens or passwords, and are kept 30 days.

---

## 7. Database Schema

Conventions: new tables use snake_case (existing invoice tables keep their camelCase columns); integer primary keys; `created_at` and `updated_at` on all tables; master data is archived rather than deleted. `uuid` columns on invoices, clients, expenses, reimbursements and payouts support future integrations. Money is stored as integer minor units (`*_cents`).

Because this is a fresh install, the 30 legacy migrations and `setup.ts` are consolidated into **one PostgreSQL baseline migration**. Normal forward migrations follow from there.

### 7.1 Organisation and access

```
businesses  (existing; "Company" in UI)
  + legal_name, pan, default_layout_id, default_style_profile_id

offices
  id, business_id → businesses, name, code ("BLR"), state_code (GST 2-digit),
  address, phone, email, gstin NULL (may repeat across offices), lut_reference, lut_valid_until,
  -- code: 2–3 uppercase alphanumerics, globally UNIQUE; no GSTIN ⇒ cannot issue invoices/credit notes
  is_archived
  UNIQUE (id, business_id)            -- target of composite FKs

users
  id, email CITEXT UNIQUE, full_name, password_hash, role_id → roles,
  all_offices BOOL, is_active, must_change_password, last_login_at

roles              id, name UNIQUE, description, is_system
permissions        key PK, group_name, label, sort_order    -- seeded by migrations
role_permissions   (role_id, permission_key) PK
user_permissions   (user_id, permission_key) PK             -- extra grants only
user_offices       (user_id, office_id) PK
sessions           token_hash PK, user_id, csrf_secret, expires_at, ip, user_agent, created_at
```

- The Super Admin role is `is_system` (cannot be deleted) and holds every permission. Super Admin users have `all_offices = true`.
- The last active Super Admin cannot be deactivated or demoted.
- RLS: `offices` and `businesses` are visible if within the user's scope. `users` is visible to the user themself, or to holders of `admin.users` who share an office. `roles` and `permissions` are readable by any authenticated user.

**Initial permission keys**

| Group | Keys |
|---|---|
| Invoices | `invoice.create`, `invoice.view`, `invoice.view_all`, `invoice.edit`, `invoice.issue`, `invoice.cancel`, `invoice.delete` (drafts only), `invoice.print`, `invoice.download`, `credit_note.create` |
| Customers | `customer.view`, `customer.manage` |
| Expenses | `expense.create`, `expense.view_own`, `expense.view_all`, `expense.edit`, `expense.delete` (draft only), `expense.approve`, `expense.reject` |
| Reimbursements | `reimbursement.view_own`, `reimbursement.view_all`, `reimbursement.pay`, `reimbursement.cancel` |
| Reports | `report.view` |
| Administration | `admin.users`, `admin.roles`, `admin.companies`, `admin.offices`, `admin.settings`, `admin.invoice_setup`, `admin.expense_categories`, `audit.view` |

The "Request reimbursement" permission is implied by `expense.create` with payment type *employee paid*. "Approve reimbursement" is folded into `expense.approve` (D5).

**Seeded roles** (editable): *Super Admin* (all), *Office Admin* (invoice.*, customer.*, expense.* incl. approve and reject, reimbursement.view_all and pay, report.view, audit.view), *User* (expense.create, expense.view_own, reimbursement.view_own; invoice permissions off by default).

### 7.2 Invoices (changes to existing tables)

```
invoices
  + office_id NOT NULL, created_by → users, uuid
  + document_status ('draft','issued','cancelled')     -- separate from payment status
  + invoiceType adds 'credit_note'; original_invoice_id → invoices NULL
  + supply_type ('intra_state','inter_state','export_lut','export_igst','sez_lut','sez_igst')
  + prices_include_tax BOOL, exchange_rate_source TEXT, exchange_rate_date DATE
  - legacy taxName/taxRate/taxType (invoice) and taxRate/taxType (items) dropped in baseline
gst_rates (new)       id, rate NUMERIC(5,2), label, is_active   -- seeded from current slabs, admin-editable
  + place_of_supply_state_code, exchange_rate_to_inr NUMERIC(18,6)
  + subtotal_cents, tax_cents, total_cents, total_inr_cents
  + issued_by, issued_at, cancelled_by, cancelled_at, cancel_reason
  FK (office_id, businessId) → offices (id, business_id)
  invoiceNumber NULL while draft; UNIQUE (office_id, invoiceType, invoiceNumber)

invoice_office_snapshots (new)
  parentInvoiceId, office_name, gstin, state_code, address, lut_reference

invoice_items     + hsn_sac, gst_rate, cgst_cents, sgst_cents, igst_cents
invoice_payments  + amount_inr_cents, reference
invoice_sequences key → (office_id, invoice_type, financial_year) UNIQUE; nextSequence

clients           + business_id NOT NULL, gstin, state_code, country_code, uuid
                  (client snapshot also stores gstin, state_code, country_code)
items             + business_id, hsn_sac, gst_rate
banks             + business_id
office_bank_accounts (office_id, bank_id) PK
presets           + business_id
```

- **Numbering (D17, D20):** assigned **at issue**. Drafts, duplicates and quote-to-invoice conversions have no number, and manual number entry is removed ⚠ A2. `SELECT … FOR UPDATE` locks the sequence row. The format is `{code}{T}/{YY-YY}/{seq4}`, where T is "" for invoices, `CN` for credit notes and `Q` for quotes (maximum `ABCCN/25-26/9999` = 16 characters). The financial year comes from `issuedAt` (a `DATE`, IST calendar, 1 April boundary). At issue, `issuedAt` must be ≤ today and ≥ the latest issued date in the series ⚠ A5, and `dueDate >= issuedAt` is validated with a clear message. The office must have a GSTIN ⚠ A6. At issue the server **rebuilds every snapshot** (business, office, client, bank, currency, items) from the DB. Legacy code paths to replace: `getDuplicateInvoiceNumber`, `processSequence`, `processSequenceOnUpdate`, number handling in `duplicateInvoice`, and the unique keys from legacy migrations 22, 24 and 25 → `UNIQUE (office_id, invoiceType, invoiceNumber) WHERE invoiceNumber IS NOT NULL`.
- **GST calculation (D18, shared `tax` module, integer paisa, half-up per line and per tax head):**
  - **Place of supply (POS)** defaults to the client's state, or `96 – Other country` for foreign clients. It is editable, with a hint.
  - POS = 96 → export; client `is_sez` → SEZ. For both, the user chooses "Without tax (LUT)", which needs a valid office LUT, or "Pay IGST".
  - Otherwise, office state = POS → CGST = SGST = rate/2; else IGST = rate. B2C (no client GSTIN) uses the same maths.
  - **Out of scope ⚠ A3:** reverse charge, deemed exports, e-commerce operator supplies, e-way bills.
  - Source of truth: `invoice_items.gst_rate` (NUMERIC) + `invoices.prices_include_tax`. Preview, PDF and server all call the same module, and a unit test asserts preview totals equal stored totals. Stored totals are authoritative.
  - Foreign currency: the exchange rate is manual, with `exchange_rate_source` and date, and is locked at issue. INR taxable value = amount × rate. Reports and ageing use INR at the issue rate; the invoice report shows the forex difference against the INR received on payments.
  - UI shows plain wording ("Same state – CGST + SGST", "Export without tax (LUT)").
- **Locking (D19):** issued invoices cannot be edited except for payments and notes.
  - **Cancel** is allowed only when the invoice has no recorded payments ⚠ A4. The UI warns that cancellation must happen before the invoice is reported in GSTR-1; otherwise a credit note is needed.
  - **Credit notes** store positive amounts, reference exactly one original invoice, and are capped at its uncredited value. A warning appears after 30 November following the invoice's FY.
  - Balance = total − payments − credit notes.
  - Only drafts can be deleted.
  - Draft PDFs carry a "DRAFT – not a tax invoice" watermark.
- **Scope checks (C3):** composite FK `invoices(clientId, businessId) → clients(id, business_id)` and `invoices(original_invoice_id, office_id) → invoices(id, office_id)`. Item, bank and preset references get a service same-company check. Every such reference has a cross-company IDOR test.
- **Import/export (D21 ⚠ A1):** full JSON import/export and invoice import are removed. XLSX export of lists is scoped. XLSX import is kept for customers and items only, into the selected company, with an audit event.
- **Lists:** a new paged `GET /api/invoices?page&pageSize&filters` returns summaries without binary data. `GET /api/invoices/:id` returns the full detail.
- **PDF:** a new layout block `gstSummary` is added, plus GST fields in `businessInfo` and `clientInfo` blocks. The layout validator and `LAYOUT.md` are extended.
- **Hidden:** generic tax name, rate and "deducted" options on the form; EU e-invoice exports.
- **RLS:** `invoices` by `office_id`. Child tables (`invoice_items`, `invoice_payments`, `attachments`, all `invoice_*_snapshots`, `invoice_customizations`) via an EXISTS check on the parent invoice. `clients`, `items`, `banks` and `presets` by `business_id`.

### 7.3 Expenses and reimbursements

```
expense_categories   id, name UNIQUE, is_archived
category_businesses  (category_id, business_id) PK, is_enabled BOOL   -- toggle via flag, never delete rows

expenses
  id, uuid, business_id, office_id, category_id, submitted_by → users,
  expense_date, amount_cents (INR), gst_cents NULL, vendor_name, vendor_gstin NULL,
  bill_number, description,
  payment_type ('employee_paid','company_paid','direct_supplier'),
  status ('draft','submitted','returned','approved','rejected','completed'),
  FK (category_id, business_id) → category_businesses (category_id, business_id)
  submitted_at, decided_by, decided_at, rejection_reason
  FK (office_id, business_id) → offices (id, business_id)
  CHECK (decided_by IS NULL OR decided_by <> submitted_by)

expense_attachments
  id, expense_id, storage_key, original_name, mime_type, size_bytes, sha256, uploaded_by

reimbursements
  id, uuid, expense_id, business_id, office_id, employee_id,
  amount_cents, status ('pending','paid','cancelled'), payout_id NULL, notes
  UNIQUE (expense_id) WHERE status <> 'cancelled'
  FK (expense_id, office_id) → expenses (id, office_id); FK (payout_id, office_id) → reimbursement_payouts (id, office_id)

reimbursement_payouts
  id, uuid, business_id, office_id, employee_id, paid_at, paid_by,
  payment_method, reference, total_cents, notes
```

**Expense workflow**

```
draft ──submit──► submitted ──approve──► approved ──(payout paid)──► completed   [employee_paid]
                      │                     └──────(immediately)────► completed   [company_paid / direct_supplier]
                      └──reject(reason)──► rejected ──edit+resubmit──► submitted
```

- Approving an `employee_paid` expense creates a `reimbursements` row (`pending`).
- **Record payout:** select pending reimbursements for **one employee in one office**. This creates a payout, marks them `paid`, and marks their expenses `completed`, all in one transaction.
- Cancelling an unpaid reimbursement (`reimbursement.cancel`) moves the expense to **`returned`** ("Returned for correction") with a reason. It also notifies the employee (`reimbursement.cancelled`). The employee edits and resubmits. Approved and completed expenses are otherwise immutable.
- Employee-facing combined status: Draft · Awaiting approval · Returned for correction · Rejected · Approved – awaiting payment · Paid on <date> (ref) · Completed.
- Payment type labels: "I paid (reimburse me)" (default) · "Company paid" · "Paid directly to supplier".
- If the submitter is the only approver in the office, the expense appears in the Super Admin approval queue.
- RLS: expenses, reimbursements and payouts by `office_id`; attachments via the parent expense. `view_own` versus `view_all` is enforced in services.

### 7.4 Audit and notifications

```
audit_logs
  id BIGSERIAL, occurred_at, actor_user_id, action, entity_type, entity_id,
  business_id, office_id, before JSONB, after JSONB, ip, request_id

notifications
  id, user_id, type, entity_type, entity_id, title, body, read_at, created_at
```

- `app_user` has **INSERT and SELECT only** on `audit_logs`; no UPDATE or DELETE grants. Audit rows are written in the same transaction as the change.
- Audited actions: invoice create, edit, issue, cancel, delete, credit note, payment; expense create, edit, submit, approve, reject; reimbursement cancel; payout; user, role, permission and office-assignment changes; company, office, category and settings changes; login success and failure.
- RLS: `audit_logs` is visible to `audit.view` holders within office scope. `notifications` has `user_id = app.user_id`.
- Notification events in v1: expense submitted (to approvers), approved or rejected (to the submitter), reimbursement paid (to the employee). Email delivery can later consume the same rows.

---

## 8. API Surface (summary)

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password` |
| Admin | `/api/users`, `/api/roles`, `/api/permissions`, `/api/companies`, `/api/offices`, `/api/expense-categories`, `/api/settings`, `/api/audit-logs` |
| Invoices | `GET /api/invoices` (paged), `GET/PUT/DELETE /api/invoices/:id`, `POST /api/invoices`, `POST /api/invoices/:id/issue`, `POST /api/invoices/:id/cancel`, `POST /api/invoices/:id/credit-notes`, `POST /api/invoices/:id/duplicate`, `POST /api/invoices/:id/payments` |
| Invoice setup | existing `/api/clients`, `/api/items`, `/api/banks`, `/api/presets`, `/api/layouts`, `/api/styleProfiles`, `/api/currencies`, `/api/units`, `/api/categories` (now company-scoped where applicable) |
| Expenses | `GET/POST /api/expenses`, `GET/PUT/DELETE /api/expenses/:id`, `POST /api/expenses/:id/submit`, `/approve`, `/reject`, `POST /api/expenses/:id/attachments`, `GET /api/expenses/:id/attachments/:attachmentId` |
| Reimbursements | `GET /api/reimbursements`, `POST /api/reimbursements/:id/cancel`, `GET/POST /api/payouts`, `GET /api/payouts/:id` |
| Dashboard and reports | `GET /api/dashboard`, `GET /api/reports/{invoices,expenses,reimbursements,ageing}`, `…?format=csv` |
| Notifications | `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all` |

All list endpoints accept `page`, `pageSize`, `sort` and typed filters, validated by zod.

---

## 9. Frontend

- **Login** replaces `DatabaseChooser`. `authSlice` holds the user, permissions and offices from `/api/auth/me`. A forced password change applies when `must_change_password` is set.
- **API client** (`platformApi.ts`): `credentials: 'include'`, CSRF header, redirect to Login on 401. Electron branches are removed.
- **Permission helpers:** `usePermission(key)` and a `<RequirePermission>` route wrapper. These are for UX only; the server is the authority.
- **Navigation** (config array with the required permission per item; the sidebar filters it):
  - Dashboard
  - Invoices: All invoices, Create invoice, Quotes, Credit notes
  - Expenses: All expenses, Add expense, Approvals
  - Reimbursements: My reimbursements, Pending (with Record payout), History
  - Reports: Invoices, Receivables ageing, Expenses, Reimbursements
  - Customers
  - Administration: Users, Roles & permissions, Companies, Offices, Expense categories, Invoice setup (Items, Banks, Currencies, Units, Layouts, Style profiles, Presets), Audit log, Settings
- **Office switcher** in the top bar ("All my offices" or one office) filters lists and the dashboard and sets defaults for new records.
- **Invoice form:** the existing form is reused. It adds an office picker, place of supply and supply type, currency with an INR rate, and HSN/SAC and GST columns. It also gains Save draft, Issue and Cancel actions, plus credit note creation from an issued invoice. The live PDF preview uses the shared tax module.
- **Expenses:** paged filterable list; form with receipt upload (`accept="image/*,application/pdf"` with camera capture on mobile); approvals queue.
- **Dashboard:** widgets are chosen server-side by permission. Super Admin sees group totals by company; Office Admin sees their office scope; User sees their own expenses and reimbursements and, if permitted, recent invoices. Charts use recharts.
- **Reports:** server-side aggregation; filters for date range, company, office, employee, category and status; CSV via the server; PDF via `@react-pdf`.
- **Responsive:** below `md`, the sidebar becomes a drawer; below `sm`, tables become cards and the invoice preview is a separate view.
- **Kept:** MUI theme and dark mode, i18n (English), existing shared components.

---

## 10. Edge Cases

| Situation | Behaviour |
|---|---|
| User removed from an office or permissions changed | Resolved per request, so effective on the next request |
| User deactivated | All sessions revoked |
| Last active Super Admin | Cannot be deactivated or demoted |
| Office archived | No new invoices or expenses; history visible |
| Approved or completed expense | Immutable; correct by cancelling an unpaid reimbursement |
| Only approver submits own expense | Routes to the Super Admin queue |
| Non-INR invoice | Exchange rate required before issue; locked on issue |
| Issued invoice needs correction | Credit note or cancellation; no edit, no delete |
| Draft abandoned | No number consumed |
| Issue on 31 Mar vs 1 Apr | Financial year is derived from the issue date |
| Concurrent issue | Sequence row lock gives unique, consecutive numbers |
| LUT expired | `export_lut` is blocked; user must choose `export_igst` or update the LUT |
| Interrupted upload | Temp file removed; a daily job removes orphaned storage files |
| Request with no session context reaching the DB | RLS helpers return no rows |

---

## 11. Testing Strategy

1. **Unit (vitest):** GST engine (intra, inter, export LUT, export IGST, inclusive and exclusive, rounding, HSN summary); number formatting, the financial year boundary and the 16-character limit; workflow transition tables; self-approval; payout totals.
2. **Integration against real PostgreSQL** (CI service container, migrations applied, seed: 2 companies, 3 offices, one user per role):
   - **RLS suite:** for every scoped table, as `app_user` with an Office A context, confirm no SELECT, UPDATE or DELETE of Office B rows, INSERT into Office B is blocked by `WITH CHECK`, and a missing context returns zero rows.
   - **API isolation (IDOR):** every `:id` route with another company's ID returns 404.
   - **Permission matrix:** generated from route permission metadata; route × role gives the expected 2xx or 403.
   - **Concurrency:** 20 parallel issues produce unique, consecutive numbers.
3. **Invoice regression:** existing `invoices.spec`, `invoiceTemplates`, `v2PdfLayout` and component tests are kept and updated.
4. **E2E (Playwright, web):** login → create draft → issue → preview → download PDF → record payment → credit note; submit expense with receipt → approve → record payout → reimbursed. The Electron spec is removed.
5. **CI pipeline:** lint → typecheck → unit → integration (PostgreSQL) → build → docker build.

**Phase gate (every phase):** run tests, fix errors, confirm the build succeeds, verify existing invoice functionality, verify new functionality, and check authorisation and security.

---

## 12. Deployment

- `docker-compose.yml`:
  - `caddy`: TLS with automatic certificates, serves the SPA (`file_server`, SPA fallback) and proxies `/api/*` to `app:3000`, with a 20 MB request body cap
  - `app`: the Node API (only `DATABASE_URL`), with a healthcheck and `restart: unless-stopped`
  - `migrate`, `admin-cli`: one-shot services using `MIGRATION_DATABASE_URL`
  - `db`: PostgreSQL 17, internal network only, named volume
  - `backup`: nightly `pg_dump` plus attachments archive, 30-day rotation
- Volumes: `pgdata`, `attachments`, `backups`.
- Startup: `migrate` (as `app_owner`) → `server` (as `app_user`).
- README sections: install, `.env` setup, create Super Admin, backup and restore procedure, upgrade procedure.

---

## 13. Additional Features

| # | Feature | Value / users | Priority |
|---|---|---|---|
| 1 | Draft → Issued invoices, lock after issue | GST integrity; accountants and auditors | **v1** |
| 2 | Credit notes and cancellation | Legal corrections without deletes | **v1** |
| 3 | Receivables ageing (0–30, 31–60, 61–90, 90+) | Collections; admins and management | **v1** |
| 4 | GSTR-1 export (B2B, B2CS, EXP, HSN) | Monthly filing effort; accountant | Next |
| 5 | Tally / Zoho Books export | Accounting handoff; first ERP step | Next |
| 6 | Vendor master (name, GSTIN, autocomplete) | Clean expense data | Next |
| 7 | Recurring expenses (rent, internet, utilities) | Less manual entry; Office Admins | Next |
| 8 | Recurring invoices (retainers) | Repeat billing | Next |
| 9 | Email notifications and emailing invoices to clients | Faster approvals and delivery | Next |
| 10 | Monthly budgets per office and category | Spend control; Office Admins and management | Later |
| 11 | Petty cash / office float | Common Indian office practice | Later |
| 12 | Employee advances settled against expenses | Travel | Later |
| 13 | 2FA and Google/Microsoft SSO | Account security | Later |
| 14 | API tokens and webhooks | ERP integration | Later |
| 15 | IRN e-invoicing | Required if turnover exceeds ₹5 crore | Later |

---

## 14. Delivery Phases

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Foundation** | Remove Electron and SQLite; PostgreSQL-only adapter with `withRequestTx`; consolidated baseline migration; parameterised SQL; Docker Compose with PostgreSQL; CI with a PostgreSQL service | Existing invoice flow works in the browser on PostgreSQL; existing tests pass; build passes |
| **1. Access** | Users, roles, permissions, offices, user_offices, sessions, CSRF; RLS policies and DB roles; login UI; admin screens; permission-filtered navigation; audit log base | RLS suite and permission matrix green |
| **2. Invoices** | Office and company scoping of invoices, clients, items, banks and presets; shared GST module; per-office per-FY numbering; INR rate; paged lists and detail endpoint; draft/issue/cancel; credit notes; PDF `gstSummary` block; invoice audit | GST, numbering, concurrency and invoice regression tests green; E2E invoice flow green |
| **3. Expenses** | Categories, expenses, attachments, approvals, reimbursements, payouts, in-app notifications, audit | Workflow tests and E2E expense-to-payout green |
| **4. UX** | Dashboard, office switcher, search and filters, receivables ageing, responsive layouts | Manual pass at phone, tablet and desktop widths; no permission leaks in the UI |
| **5. Reports** | Invoice, expense, reimbursement and ageing reports; CSV and PDF export | Report totals reconcile with seeded data |
| **6. Hardening** | Security checklist (IDOR, CSRF, uploads, headers, rate limits, session expiry); backup and restore drill; docs | Checklist complete; restore verified |

---

## 15. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Invoice service (1,431 lines) core changes for GST and numbering | Characterisation tests before edits; narrow changes; keep snapshot model |
| R2 | Browser preview versus server totals drift | One shared `tax` module used by both |
| R3 | Layout JSON lacks GST blocks | Extend validator, renderer and `LAYOUT.md` with backward-compatible additions |
| R4 | RLS debugging and performance complexity | Policy test suite; `STABLE` helper functions; indexes on `office_id` and `business_id`; explicit errors when context is missing |
| R5 | Loss of upstream merges | Accepted (D1); cherry-pick specific upstream fixes manually if needed |
| R6 | Client-side PDF generation on low-end phones | Separate preview view on mobile; server-side PDF can be added later if needed |
| R7 | Baseline migration diverges from legacy schema assumptions in services | Phase 0 regression tests exercise every invoice service function on PostgreSQL |
