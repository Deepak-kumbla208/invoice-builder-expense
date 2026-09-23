# Phase 1 notes

## Task 1.1 decisions

- **`db/init/00-roles.sql`** is a psql script (`\getenv`, `\gexec`), so it needs psql 15+. It is re-runnable and fails with exit 3 if either password is unset or empty. It grants `app_owner` `CONNECT, CREATE` on the current database and `CREATE` on `public` (PG 15+ no longer grants `CREATE` on `public` to everyone), so `app_owner` owns every table it migrates and can create the trusted `citext` extension. The database itself stays owned by `postgres`. CRLF line endings (a Windows checkout with `core.autocrlf`) were tested and work.
- **Where it runs:** both containers in `docker-compose.dev.yml` and `db` in `docker-compose.yml` mount `db/init` into `/docker-entrypoint-initdb.d`, and CI runs it with psql before `npm test`. Postgres only runs init scripts against an empty data directory, so a volume created before 1.1 (the dev `pgdata-dev`, or the Phase 0 `pgdata` stack) has no roles until it is recreated (`down -v`) or the script is run by hand.
- **Test databases:** `pgTestDb` checks that the roles exist and throws a clear error if they don't. It creates each database owned by `postgres`, applies the same two grants as the script, and runs migrations as `app_owner` through `options=-c role=app_owner` on the superuser connection, so no role passwords are needed. The test pool still connects as the superuser; `SET LOCAL ROLE app_user` gives the unprivileged view (used in `access.schema.spec.ts`, and later by the RLS suite).
- **The API now logs in as `app_user`** (`.env.example`, README). Grants: full CRUD on the 24 baseline tables, which keeps current behaviour including hard deletes; access tables exactly as in the plan; nothing on `migrations` or `sessions`. Identity columns need no sequence grant (verified). Invoice regression e2e passes with the API as `app_user`.
- **Known gap until 1.8:** JSON import calls `setval`, which needs `UPDATE` on sequences, so it fails as `app_user`. 1.8 deletes it (A1), so no grant was added.
- **Column choices:** new tables use `timestamptz`; `sessions.token_hash` is text with a CHECK for 64 lower-case hex characters (SHA-256), so a raw token cannot be stored by mistake; `ip` is `inet`; `audit_logs.entity_id` and `notifications.entity_id` are `text`. `audit_logs` has a composite FK `(office_id, business_id) → offices(id, business_id)` plus `CHECK (office_id IS NULL OR business_id IS NOT NULL)`, so an audit row cannot pair an office with another company.
- **Not added (belongs to later tasks):** the 24 h expiry of temporary passwords (1.6) needs a column or a sessions rule, so it arrives with 1.6's migration. The permission and role seeds are 1.2. RLS is 1.3.
- `baseline.schema.spec.ts` now compares only the legacy tables and ignores the columns later migrations add (`LATER_ADDITIONS`).

## Task 1.2 decisions

- **Seeded Office Admin includes `credit_note.create`** (user, 2026-09-22). The design says `invoice.*`, and the user ruled that this means the whole Invoices group.
- **`requires` map.** It follows the design's examples (`expense.approve` ⇒ `expense.view_all`, `invoice.edit` ⇒ `invoice.view`). Every action needs the matching view permission, and `invoice.create`/`invoice.edit` also need `customer.view`, because the form has to list customers. `*.view_all` does **not** require `*.view`/`*.view_own`: they are alternatives, and services must accept either one. Otherwise the seeded Office Admin (`reimbursement.view_all` without `view_own`) would not be closed. Admin keys have no dependencies, so `admin.users` alone (A8) stays closed.
- **Migration numbering:** the seed is `0003-permissions.sql`, so 1.3's RLS migration becomes `0004-rls-access.sql` (the plan is updated). Labels are stored in English, the same as the map; translating them is out of scope.
- **Renderer import:** the `@shared/*` alias (`vite.config.ts` + `tsconfig.app.json` `paths`) points at `src/backend/shared`. `permissions.ts` has an ESLint rule that forbids **any** import, so the renderer can never pull in node code through it. The map's unit tests live in `src/renderer/__tests__/permissions.test.ts` and import through the alias, which also proves the alias works.
- **For 1.4:** users who can create invoices must still be able to _read_ banks, items, units, currencies, layouts, style profiles and presets. Only the write routes for those should require `admin.invoice_setup`, or `invoice.create` breaks for anyone who isn't an admin.

## Task 1.3 decisions

- **Helpers.** The four from the plan are there. `app_all_offices()` is false whenever `app.user_id` is missing. Four more helpers were added:
  - `app_office_visible(id)` and `app_business_visible(id)`, which design §6.2 names.
  - `app_shares_office(user_id)`, used by the `users` policy. It reads `user_offices` as the owner, so the policy doesn't recurse.
  - `app_can_manage_user(user_id)`, the backstop for writes. It is true for all-offices callers. Otherwise the target must be someone else, must not be all-offices, and all of the target's offices must be among the caller's. That matches the C11/U2 reset rule. It is trivially true for a user with no offices yet, which is how a new user gets assigned.
  - All 15 `app_*`/`auth_*` functions are `SECURITY DEFINER`, owned by `app_owner`, with `search_path = pg_catalog, public`, no `EXECUTE` for `PUBLIC`, and `EXECUTE` for `app_user`. A test checks all of this.
- **Policies exist only for granted commands.** Anything not granted is denied by default. The structure test asserts that each table's policy commands equal `app_user`'s grants, that every policy is `TO app_user`, and that there are no `FOR ALL` policies.
- **Rules per table:**
  - `businesses` and `offices`: read and update within scope. Only all-offices users can insert, because a new company or office is outside any office-based scope. An office can't be moved to a company outside scope.
  - `users`: read if self, all-offices, or sharing an office (per the plan). Update if self or `app_can_manage_user`, so an Office Admin can see a user who also belongs to an office outside their scope but can't edit them. Only all-offices users can set `all_offices`.
  - `user_offices`: requires office scope plus `app_can_manage_user`.
  - `user_permissions`: requires `app_can_manage_user`, so users can't grant permissions to themselves.
  - `audit_logs`: readable if the office is in scope, or if it's a company-level row for a company in scope. Rows with neither are visible only to all-offices users. On insert, the actor must be the current user and the row must be in scope.
  - `notifications`: personal, even for Super Admin.
- **`INSERT … RETURNING` also checks the SELECT policy** (verified). An Office Admin therefore creates a user without `RETURNING` and reads the id back through `auth_find_user_by_email`. `access.rls.spec.ts` runs that whole flow. Notifications for other users must likewise be inserted without `RETURNING`. This matters for 1.6.
- **Auth functions:**
  - `auth_session` extends the idle expiry to 12 h on every call, capped at the 7-day absolute expiry. Inactive users get no context. All-offices users get every office and every company, including companies with no offices. Permissions are the role's plus the user's extra grants, sorted with `COLLATE "C"`. It also returns `must_change_password`, `email`, `full_name` and `role_name`.
  - `auth_create_session` refuses inactive or unknown users (SQLSTATE 28000) and sets `last_login_at`.
  - `auth_revoke_sessions(user_id, except_token_hash DEFAULT NULL)` lets change-password keep the current session.
  - `auth_log_event` records only `auth.*` actions (otherwise 22023) and stores `meta` in `after`.
- **Known breakage until 1.4:** the API connects as `app_user` but doesn't set a context yet, so companies, offices and users are hidden and companies can't be created. The running app and the e2e suite (when run as `app_user`) therefore fail until 1.4 adds `withRequestTx` and login. Unit and integration tests run as the superuser and still pass.
- **Test setup:** vitest now finds tests anywhere under `__tests__/**`. `helpers/asAppUser.ts` switches to `app_user` and sets a context. `rls/access.rls.spec.ts` is the start of 1.9's RLS suite, and `auth.functions.spec.ts` covers the auth functions. The 1.1 grants test no longer inserts an audit row without a context.

## Task 1.4 decisions

- **Structure.**
  - `webserver/app.ts` exports `createApp(deps, { appOrigin })`, so tests run the real app against a test pool.
  - `main.ts` wires the global pool, starts the hourly session-cleanup job and listens.
  - `webserver/deps.ts` provides `withTx`, a transaction with no context that is used only for `auth_*` definer calls, and `requestTx(req, fn)`, which is `withRequestTx(req.ctx, fn)`. Every controller receives these instead of importing `withTx`.
- **Middleware order:** helmet → request id → body limits → health/version → session (loads `req.ctx` from `__Host-sid` in its own short transaction and clears a stale cookie) → auth routes → `requireAuth` → must-change-password gate → CSRF → controllers → a JSON 404 for any other `/api` path → error handler.
- **Guards.** There are three:
  - `requirePermission(...keys)`: needs all of the keys.
  - `requireAnyPermission(...keys)`: needs at least one.
  - `requireAuthenticated()`: any signed-in user. It is used only for `GET /api/settings`, which every screen needs.

  Each guard carries its rule as metadata. `routes.permissions.spec.ts` walks the Express router and fails if any route other than auth, health and version lacks exactly one guard. That covers the phase exit criterion.

- **Permissions on the existing routes:**
  - Setup data (banks, items, units, currencies, layouts, style profiles, presets, categories): reading needs any of `invoice.view`, `invoice.view_all` or `admin.invoice_setup` (see the 1.2 note); writing needs `admin.invoice_setup`.
  - Companies: reading needs any of `invoice.view`, `invoice.view_all` or `admin.companies`; writing needs `admin.companies`.
  - Clients: reading needs `customer.view`; writing needs `customer.manage`.
  - Invoices: listing and headers need `invoice.view` or `invoice.view_all`; next number needs `create` or `edit`; create and duplicate need `invoice.create`; update needs `edit`; delete needs `delete`; XML needs `download`.
  - Settings: `PUT` needs `admin.settings`.
  - JSON export and import need `admin.settings` until 1.8 deletes them.
- **Errors.** `AppError(kind, key, fields)` maps to 400/401/403/404/409/500. A zod failure returns `errors` keyed by field. Postgres error 42501 (an RLS `WITH CHECK` failure or a missing grant) returns the standard 404 body, so an ID hidden by RLS can't be told apart from one that doesn't exist. Existing services still return `{ success: false, key }` with 200, as before.
- **Login.**
  - A strict `Origin` check applies: `APP_ORIGIN` if set (compose sets it to `https://${APP_DOMAIN}`), otherwise the request's own origin. That own-origin fallback is what keeps dev behind the Vite proxy working.
  - Rate limits are in memory, per 15 minutes: 50 per IP, and 5 _failed_ attempts per IP+email. An in-memory limiter is fine with a single API process.
  - An unknown email still runs one argon2 verify against a throwaway hash, so response timing doesn't reveal whether the email exists.
  - The response is always the generic `auth.invalidCredentials`. The actual reason (`unknown_email`/`wrong_password`/`inactive`) goes only into the audit event's `after`.
  - Every login issues a new token and revokes the one in the incoming cookie. The response body is the same as `/me`.
- **Change password:** at least 12 characters, and it must differ from the current one (`auth.passwordUnchanged`). The current password is checked outside any transaction, so argon2 never holds a transaction open. The user's other sessions are revoked and the current one is kept. **Logout** requires a session and the CSRF token.
- **Cookie in dev (verified):** Chromium in the desktop app accepts and sends the `Secure` `__Host-sid` cookie over `http://localhost` through the Vite proxy. The cookie is HttpOnly, so JavaScript can't read it. A full login → `/me` → guarded GET → CSRF POST → logout run against the real `main.ts` as `app_user` worked. This matters for 1.7.
- **`withSystemTx`** hands the job a `call(name, ...args)` function instead of a raw `Db`. The name must match `auth_cleanup_sessions` or `sys_*`, and the arguments are parameterised. ESLint forbids importing `systemTx` in controllers and services. The cleanup timer is `unref`'d.
- **New dependencies:** `argon2` (argon2id; ships prebuilt binaries, including for Alpine/musl) and `zod` 4.
- **Current state:** the app now requires login. Until 1.5 (admin CLI) there is no supported way to create the first user, and until 1.7 there is no login page, so the invoice e2e can't run again until 1.7/1.9.
- **Test setup:** `helpers/testServer.ts` starts the real app on a random port with an `app_user` pool and provides a small `fetch` client that handles cookies and CSRF. `pgTestDb.rolePool(role, max)` opens a pool as `app_user` or `app_owner`.

## Task 1.5 decisions

- **Prompts:** the CLI asks for email, full name (`users.full_name` is NOT NULL), password and the password again. Email and name are validated before the password is requested. The password is read hidden on a terminal: readline writes through a mutable output stream, so no private readline APIs are involved. When stdin is piped, lines are read in order, which lets tests and scripts drive it. Ctrl+C exits with code 130.
- **Behaviour:** it connects only with `MIGRATION_DATABASE_URL`, with no fallback to `DATABASE_URL` (`app_user` would fail RLS). It finds the role by `is_system`, not by name. Argon2 hashing happens outside the transaction. It refuses an existing email (case-insensitive, including a race on 23505). It writes `audit_logs` (`user.create`, no actor, `request_id = 'admin-cli'`, no hash) in the same transaction. The new user has `must_change_password = false`, since they chose the password.
- **Build and Docker:** `tsconfig.webserver.json` now also compiles `src/backend/admin-cli`, so the runner image contains `dist-be/backend/server/admin-cli/index.js`. The compose service `admin-cli` (profile `tools`, `stdin_open` + `tty`) uses that file as its entrypoint.
- **Verified end to end in Docker** with a throwaway compose project, since torn down:
  - The database container ran `00-roles.sql` on first start.
  - `migrate` applied 0001–0004 as `app_owner`.
  - `admin-cli create-super-admin` with piped input created the user and its audit row. A second run with the same email exited 1.
  - The production `app` container logged the new admin in (argon2 on Alpine) and returned 32 permissions.
- **Not automated:** hidden echo on a real terminal. Tests cover piped input only.

## Task 1.6 decisions

- **Effective permissions (corrects the 1.2 note).** Each `*.view_all` key now declares `includes` for the matching own-records key (`invoice.view`, `expense.view_own`, `reimbursement.view_own`). The session context expands them with `expandPermissions`. Without this, the seeded Office Admin (which has `reimbursement.view_all` but not `view_own`) could not assign the User role under the anti-escalation rule. Services can now check the own-records key directly instead of accepting either key.
- **Companies** stay at `/api/businesses`, because the existing page is reused in 1.7.
  - `POST` and `PUT` are validated with zod. Unknown keys are stripped, `''` becomes `null`, and the PAN is upper-cased and checked. The four new columns keep their snake_case keys (`legal_name`, `pan`, `default_layout_id`, `default_style_profile_id`), matching what `GET` returns.
  - Only all-offices users can create companies.
  - `company.create` and `company.update` are audited with `business_id`.
  - **`DELETE` and `/batch` are removed** (archive through `isArchived`). The old page's delete button and the business XLSX import now get 404 until 1.7/1.8 remove them.
- **Offices:** `/api/offices` (reads need `admin.offices` or `admin.users`; writes need `admin.offices`).
  - The code is upper-cased.
  - `stateCode` must be in `shared/constants/gstStates.ts`: 01–24, 26, 27, 29–38, 97 and 96 "Other country". 25 and 28 are no longer issued. The file is import-free, enforced by lint, so the renderer can import it.
  - The GSTIN must match the format and start with the state code. The checksum is not checked.
  - The LUT reference and date must be given together and need a GSTIN. `lutValidUntil` is returned as a `YYYY-MM-DD` string, so there is no timezone shift.
  - Only all-offices users can create offices, and `businessId` can't be changed afterwards.
  - `office.create` and `office.update` are audited with the office's scope.
- **Roles:** `/api/roles` and `/api/permissions` (grouped by module, with labels and `requires`).
  - Permission sets are stored closed under `requires`.
  - The system role's permissions are locked (`role.systemLocked`) and it can't be deleted. A role still in use gives `role.inUse`.
  - `affectedUsers` comes from the new definer `app_role_user_count`, which counts active users in every office.
  - An editor can't add permissions they don't hold; removing is allowed.
  - Role edits never revoke sessions (D23).
- **Users:** `/api/users`, `/api/users/:id` and `POST /api/users/:id/reset-password`.
  - **New users also get a one-time temporary password** of 16 unambiguous characters, the same as a reset, with `must_change_password` set and `password_expires_at = now() + 24 h`.
  - Migration `0005` adds the column and returns it from `auth_find_user_by_email`.
  - A login after the expiry gets 401 `auth.temporaryPasswordExpired`, but only after the password has been checked, so it reveals nothing to someone who doesn't know the password. Changing the password clears the expiry.
- **Anti-escalation and scope for users:**
  - Only all-offices callers can set `allOffices`.
  - Assigned offices must be within the caller's offices.
  - The role's permissions and any _added_ extra grants must be within the caller's effective permissions.
  - The target user must pass `app_can_manage_user`.
  - Users can't change their own role, offices, active flag or grants through the admin API; name and email are fine.
  - Extra grants are stored as closure(role ∪ requested) − role.
- **Sessions are revoked** when a user's role, offices (including `allOffices`) or active flag changes, and on a password reset. They are not revoked for name, email or grant changes.
- **The last active Super Admin** (system role, active, all offices) can't be deactivated or demoted. The check locks the other Super Admins' rows `FOR UPDATE`.
- **Audit rows for users** (`user.create`, `user.update`, `user.password_reset`) are scoped to the user's lowest office id, or are global for all-offices users. That way an Office Admin with `audit.view` sees changes in their office. No hashes are ever written to the log.
- **Audit log:** `GET /api/audit-logs` (`audit.view`) is paged, newest first. It filters by `action`, `entityType`, `entityId` or `actorUserId`, is scoped by RLS, and includes the actor's name and email. Ids are returned as numbers.
- `AppError` moved to `shared/errors.ts`, so services can throw it; the middleware maps it to a response.

## Task 1.7 decisions

- **Routes and navigation.** `app/navConfig.ts` is the single source for the sidebar and for each route's permission rule; `app/routes.tsx` guards every page with `<RequirePermission rule={navRuleFor(path)}>`, and `navConfig.test.ts` fails if a nav item has no route or rule.
  - Existing pages keep their paths, except `/businesses`, which is now `/companies`. New: `/` (dashboard), `/login`, `/change-password`, `/users`, `/roles`, `/offices`, `/audit-log`. Any other path shows the no-access page.
  - The menu follows design §9 without items from later phases (Create invoice, Credit notes, Expenses, Reimbursements, report sub-pages, Expense categories). Reports stays one item until Phase 5. Invoice setup is a nested group under Administration and includes the existing item categories.
  - Feature flags still hide Quotes, Reports, Presets and Style profiles from the menu without blocking the routes, as before. Settings now needs `admin.settings`. A group with one visible child is shown as that child, under the group's label.
- **Auth state.** `authSlice` holds the status, user, permissions, offices, companies and a `signedOut` flag. The CSRF token lives in a module variable in `platformApi.ts`, set from login or `/me` and cleared on logout or a 401. `AuthRoot` loads `/api/auth/me` once on start.
  - A 401 from any call except login, `/me` and logout clears the auth state, and `RequireAuth` redirects to `/login?returnTo=…`. A 403 `auth.mustChangePassword` flips the flag, and `RequireAuth` sends the user to the forced change page.
  - **Bug found by the e2e spec and fixed:** signing out used to leave `returnTo` pointing at the previous user's page, so the next person to sign in landed there. An explicit sign-out now sets `signedOut`, and the guard redirects to plain `/login`.
  - `returnTo` only accepts same-app paths and never points back to `/login` or `/change-password`.
- **Errors.** For non-2xx JSON responses the client sets `message` to the error key (or the first field key of a validation error), so the existing toasts translate them. `error.notFound` uses the U3 wording.
- **Admin pages** reuse `CRUDPage` through two new helpers, `useApiQuery` and `useApiMutation`. Callers must pass stable functions, or the mutation effects fire twice. Forms memoise their output object, because a new object on every render makes `PageAppBar` loop. Users and Roles add inline, since their forms are wide. Required-field errors appear once a field is touched.
- **Users:** the temporary password is shown once after create and after reset, with a copy button; the dialog doesn't close on a backdrop click.
  - When editing yourself, role, offices, active and grants are locked (the server forbids them).
  - Roles containing permissions the editor lacks are disabled in the role picker.
  - Office choices come from `/me` (RLS-scoped). The profile is refreshed after company or office saves.
- **Roles:** ticking a permission ticks what it needs; unticking removes what depends on it. Permissions the editor can't grant are disabled. Changing the permissions of a role that has users shows an "Affects N users" warning and asks for confirmation. The system role is read-only and can't be deleted.
- **Companies:** the form adds legal name and PAN. The delete button and the XLSX import are gone, since their routes were removed in 1.6. Add is shown only to all-offices users. Every English "Business" string is now "Company"; the other locales are unchanged.
- **Dashboard:** a placeholder, plus a setup checklist (Company → Office with GSTIN → Bank → Users (more than one active) → Customers & items) computed from list counts. It is shown to users with `admin.companies`, `admin.offices`, `admin.users`, `admin.invoice_setup` and `customer.view`.
- **Audit log page:** a paged table with action and record-type filters and before/after JSON.
- `MIN_PASSWORD_LENGTH` and `MAX_PASSWORD_LENGTH` moved to the import-free `shared/auth/passwordPolicy.ts`, so the renderer can use them.
- **E2E:** `e2e/helpers/auth.ts` creates a Super Admin through the CLI (it needs `E2E_MIGRATION_DATABASE_URL`, and specs skip without it) and signs in.
  - The new `auth-shell.spec.ts` covers: returnTo, a wrong password, company, office (GSTIN check), a user with a temporary password, sign-out, the forced change, the User role's menu, the no-access page, and signing in again.
  - The invoice regression and layouts specs now sign in first. They also use `/companies` and `COMPANY *`, with timeouts of 180 s and 60 s.
- **Test flakes:** diagnosed and fixed in the 2026-09-23 session below. The 1.7 guess (a login-limiter race) was wrong; the cause was the 5 s default test timeout.
- **Not in 1.7:** the office switcher and the mobile drawer (Phase 4); hiding write buttons from read-only users inside pages (the server enforces this); the invoice XLSX export sheet still called "Business Snapshots" (1.8 reworks import/export).

## Suite flakiness under load (2026-09-23)

`admin.api.spec.ts` intermittently failed two cases under `npm test` while passing alone:
"resets passwords within scope…" and, right after it, "shows office admins only their scope and
requires audit.view" with `expected 401 to be 403`.

- **Not the cause.** The suspect was the 5-per-15-min login limiter (`skipSuccessfulRequests`
  decrements on the response's `finish` promise, so in principle a later login can be counted
  before the decrement lands). Instrumenting `req.rateLimit` showed erin peaks at `used=4`
  against a limit of 5 (blocked at 6) in every run, loaded or not, and a standalone probe that
  hammered a limiter with a hogged event loop never saw a decrement land late. Connection
  exhaustion was ruled out too: the suite peaks at 13 of 100 postgres connections.
- **The cause.** Vitest's 5 s default `testTimeout`. The argon2-heavy cases run ~1 s on an idle
  machine ("resets passwords…" 1029 ms, "revokes a user's sessions…" 766 ms, auth's "forced
  password change" 947 ms). One fork per core, each hashing with argon2's own 4 threads, eats
  that 5x margin. Reproduced reliably by running the suite against 10 busy-loop processes: the
  same two admin cases plus auth's forced-password-change and two jsdom renderer tests timed out
  in every run.
- **The 401 was a cascade.** The reset-password test revokes erin's session and re-logs her in on
  its last line. When the test times out before that line, `sessions.erin` still holds the revoked
  cookie, so the next describe's call answers 401 instead of 403 — a misleading second failure
  from a single root cause.
- **Fixes.**
  - `vite.config.ts`: `testTimeout` and `hookTimeout` raised to 30 s. The per-test 20 s override on
    the v2 PDF multi-page case is removed — it was a local workaround for the same 5 s default and
    would now be tighter than the suite.
  - `admin.api.spec.ts` asserts the audit-view 403 as `carol`, a plain User the admin tests never
    mutate, so it no longer depends on how the password tests ended. `carol` joins the `beforeAll`
    login loop.
  - `createApp` takes `loginRateLimit: { ipLimit, emailLimit }`, defaulting to the production 50
    and 5, threaded to `loginLimiters()`. `admin.api.spec.ts` relaxes both to 1000, since it logs
    the same users in repeatedly and is not testing rate limits. Two spare hits out of five was
    thin enough to become the next flake as the spec grows. `auth.api.spec.ts` passes no options,
    so its lockout case still exercises the real limits.
- **Verified.** 3 full-suite runs under the 10-hog load that previously failed 4-5 tests every run,
  then 5 clean `lint` + `typecheck` + `npm test` runs: 21 files, 158/158 each time.
