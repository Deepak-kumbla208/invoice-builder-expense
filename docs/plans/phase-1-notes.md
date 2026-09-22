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
