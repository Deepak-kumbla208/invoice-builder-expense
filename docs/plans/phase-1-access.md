# Phase 1: Access (auth, RBAC, offices, RLS, audit base)

**Goal:** Only logged-in users can use the app. Companies and offices exist. Roles, checkbox permissions, office assignment and the RLS machinery are in place and tested. Invoices keep working for users with invoice permissions; office scoping of invoices comes in Phase 2.

**Design refs:** D2, D3, D12, D14, D15, D22, D23, D26, D27. Design §6.2–6.4, §7.1, §7.4, §8 Auth/Admin, §9 shell. Review C1, C9, C11, C12, U2, U3, U9.
**Prereqs:** Phase 0 done. **User sign-off A1 and A8** (design §3a).
**Branch:** `phase-1-access`

---

## Tasks

### 1.1 DB roles and access schema
- `db/init/00-roles.sql`, run by the postgres container on first start and by CI before migrations:
  - Create `app_owner` (LOGIN, BYPASSRLS) and `app_user` (LOGIN, NOBYPASSRLS).
  - On `app_user`, set `statement_timeout = '15s'` and `idle_in_transaction_session_timeout = '30s'`.
  - Passwords come from env.
- `migrations/0002-access.sql`, run as `app_owner`:
  - Extend `businesses` with `legal_name`, `pan`, `default_layout_id`, `default_style_profile_id`.
  - Create `offices` (code CHECK `^[A-Z0-9]{2,3}$` UNIQUE, `UNIQUE(id, business_id)`), `roles`, `permissions`, `role_permissions`, `user_permissions`, `users` (`citext` email), `user_offices`, `sessions` (`token_hash`, `csrf_secret`, `last_seen_at`, `expires_at`, `absolute_expires_at`), `audit_logs`, `notifications`.
  - Grants to `app_user`:
    - `sessions`: no table grants.
    - `audit_logs`: SELECT and INSERT only.
    - Other tables: SELECT, INSERT, UPDATE, DELETE as needed.
- **Check:** migration applies cleanly twice (idempotency guard via the `migrations` table); `\dp` shows the expected grants.

### 1.2 Permission map (single source)
- `src/backend/shared/auth/permissions.ts`: `PERMISSIONS` (key, group, label, sortOrder, `requires: string[]`) using the keys from design §7.1, plus `resolveDependencies(keys)`.
- Import the map in the renderer through a path alias (no node imports inside it).
- Migration seeds `permissions` and the three roles (Super Admin `is_system` = all keys; Office Admin; User) exactly as in design §7.1, **plus `admin.users` for Office Admin** (A8).
- Test `permissions.sync.spec.ts`: DB keys equal map keys; seeded role sets are closed under `requires`.

### 1.3 RLS helpers and policies (access tables)
- `migrations/0003-rls-access.sql`:
  - `STABLE SECURITY DEFINER` helpers `app_user_id()`, `app_office_ids() → int[]`, `app_business_ids() → int[]` and `app_all_offices() → bool`. They read `current_setting('app.*', true)` and treat NULL or `''` as empty. Each has a pinned `search_path` and `REVOKE FROM PUBLIC`.
  - `ENABLE` + `FORCE ROW LEVEL SECURITY` on `businesses`, `offices`, `users`, `user_offices`, `user_permissions`, `audit_logs`, `notifications`.
  - Separate SELECT, INSERT, UPDATE and DELETE policies (USING + WITH CHECK) per design §6.2, §7.1 and review S4.
  - `users` SELECT: self, `app_all_offices()`, or shares an office (the helper reads `user_offices` via definer; no recursion).
  - `notifications` INSERT: `app_user_id() IS NOT NULL`. SELECT and UPDATE: `user_id = app_user_id()`.
- Definer auth functions, owned by `app_owner`:
  - `auth_find_user_by_email(email)` returns id, password_hash, is_active and must_change_password only.
  - `auth_create_session(user_id, token_hash, csrf_secret, ip, ua)` and `auth_session(token_hash)`: the latter validates idle and absolute expiry, touches `last_seen_at`, and returns the ctx (user, role, permissions incl. grants, office_ids, business_ids, all_offices, csrf_secret).
  - `auth_revoke_sessions(user_id)`, `auth_revoke_session(token_hash)` and `auth_cleanup_sessions()`.
  - `auth_log_event(actor_id NULL, action, ip, meta jsonb)`.

### 1.4 Server auth middleware and transactions
- `shared/db/tx.ts`:
  - `withRequestTx(ctx, fn)` runs BEGIN, `set_config('app.user_id'|'app.office_ids'|'app.business_ids'|'app.all_offices', …, true)`, then `fn`, then COMMIT.
  - `withSystemTx(jobName, fn)` lives in `shared/db/systemTx.ts`, sets `app.system`, and may only call `auth_cleanup_sessions` and `sys_*` functions.
  - ESLint `no-restricted-imports`: `webserver/controllers/**` cannot import `systemTx`.
- `webserver/middleware/`:
  - `session.ts`: `__Host-sid` cookie; `auth_session` runs in its own short transaction and sets `req.ctx`.
  - `csrf.ts`: non-GET requests need `X-CSRF-Token` equal to the ctx `csrf_secret` (constant-time compare). The login POST needs a strict `Origin` check instead.
  - `requirePermission(...keys)`.
  - `errors.ts`: `AppError(kind)` → 400/401/403/404/409/500; not-found and RLS-hidden give the same 404 body.
- Routes `auth.ts`:
  - `POST /api/auth/login`: argon2 verify, rotate the token, rate limit IP+email 5/15 min plus IP 50/15 min, `auth_log_event` in a separate transaction.
  - `POST /api/auth/logout`.
  - `GET /api/auth/me` returns user, permissions, offices, companies and csrfToken.
  - `POST /api/auth/change-password`: clears `must_change_password` and revokes other sessions.
  - While `must_change_password` is set, every route except `me`, `change-password` and `logout` returns 403 `key: auth.mustChangePassword`.
- Wrap **all existing controllers** in `withRequestTx`, and add `requirePermission` using the invoice-setup permission keys (`admin.invoice_setup` for banks, items, units, currencies, layouts, styleProfiles and presets; `customer.*` for clients; `invoice.*` for invoices).
- Session cleanup job: hourly `setInterval` calling `withSystemTx('session-cleanup', …)`.

### 1.5 Admin CLI
- `src/backend/admin-cli/index.ts` (`npm run admin -- create-super-admin`): prompts for email and password (min 12 chars), connects with `MIGRATION_DATABASE_URL`, creates the user with `all_offices = true` and the Super Admin role. Compose service `admin-cli` (profile `tools`).

### 1.6 Admin APIs (zod-validated, audited in the same transaction)
- **Companies:** CRUD on `businesses` (UI name "Company"); archive only.
- **Offices:**
  - CRUD. Validate `code` (`^[A-Z0-9]{2,3}$`) and GSTIN format (15 chars, state code prefix matches `state_code`); LUT fields.
  - The state list lives in `shared/constants/gstStates.ts`, including code 96 "Other country".
- **Roles:**
  - CRUD. Permission sets are closed under `requires` **on the server**; `is_system` cannot be deleted.
  - The response includes `affectedUsers`.
- **Users:**
  - CRUD, role, offices, extra grants, activate/deactivate.
  - Password reset returns a one-time temp password (24 h, `must_change_password`).
  - Anti-escalation: a non-Super-Admin cannot set `all_offices`, assign offices outside their own, or assign a role or grants with permissions they lack.
  - A user's sessions are revoked when **that user's** role, offices, active flag or password changes.
  - The last active Super Admin cannot be deactivated or demoted.
- **Permissions:** `GET /api/permissions` (grouped, labels).
- **Audit:** `GET /api/audit-logs` (paged; `audit.view`).

### 1.7 Frontend shell
- `state/authSlice.ts`. `platformApi.ts` adds `credentials: 'include'`, sends `X-CSRF-Token` from memory, and on 401 clears auth and routes to `/login` (keeping `returnTo`).
- Pages:
  - `Login` (with "Forgot password? Contact your office admin."), `ChangePassword` (forced).
  - `NoAccess`: "This record doesn't exist or you no longer have access to it", with Back to list.
- `usePermission`, `<RequirePermission>` and `navConfig.ts` (item → permission). `Sidebar` renders from `navConfig`, using the menu structure in design §9. "Businesses" becomes **Companies** in every label. Existing setup pages move under Administration → Invoice setup.
- Admin pages:
  - Users: list, form, reset password dialog showing the temp password once.
  - Roles & permissions: checkbox grid grouped by module, labels not keys; auto-tick dependencies; "Affects N users" confirm.
  - User extra grants: role permissions checked and disabled, labelled "from role".
  - Companies (reuse the existing Businesses page and form) and Offices.
- Super Admin dashboard placeholder with a **setup checklist empty state** (Company → Office with GSTIN → Bank → Users → Customers & items), computed from counts.

### 1.8 Remove unscoped import/export (A1)
- Delete the full JSON export/import routes, service functions and UI menu items, and invoice import. Keep list XLSX export and customer/item XLSX import (company scoping is completed in Phase 2).

### 1.9 Tests (phase gate)
- **Auth:** wrong password; lockout after limit; rotation on login; idle and absolute expiry; CSRF missing or invalid → 403; logout revokes; `must_change_password` gate; revocation on role/office/password/deactivate; no revocation on role *edit*.
- **Anti-escalation cases.**
- **RLS suite harness** `__tests__/rls/`: table-driven. For each scoped table, define `seed(officeA, officeB)` and assert, as `app_user` with the Office A ctx: no SELECT/UPDATE/DELETE of B rows, INSERT into B is rejected, and an empty ctx returns 0 rows. Cover every table from 1.3.
- **Permission matrix** `__tests__/permissions.matrix.spec.ts`: iterate the registered routes' permission metadata × seeded roles → expected 2xx/403.
- **E2E:** create super admin via CLI → login → create company, office and user → login as that user → nav shows only permitted items → invoice regression spec still passes as Super Admin.

## Exit criteria
- [ ] Phase gate green (lint, typecheck, tests, build, invoice regression e2e)
- [ ] RLS suite, permission matrix and auth tests green
- [ ] No route without `requirePermission` (except auth and health); a test enumerates the Express router to enforce this
- [ ] `docs/plans/STATUS.md` updated
