# Implementation Status

| Phase                                             | Plan                    | Status                                 |
| ------------------------------------------------- | ----------------------- | -------------------------------------- |
| 0 Foundation                                      | `phase-0-foundation.md` | **Done** (branch `phase-0-foundation`) |
| 1 Access (auth, RBAC, RLS)                        | `phase-1-access.md`     | In progress (branch `phase-1-access`)  |
| 2 Invoices (office, GST, numbering, credit notes) | `phase-2-invoices.md`   | Not started                            |
| 3 Expenses & reimbursements                       | `phase-3-expenses.md`   | Not started                            |
| 4 UX (dashboard, switcher, ageing, responsive)    | `phase-4-ux.md`         | Not started                            |
| 5 Reports & exports                               | `phase-5-reports.md`    | Not started                            |
| 6 Hardening & ops                                 | `phase-6-hardening.md`  | Not started                            |

## User sign-off (design §3a)

| Item                                                      | Needed before | Status               |
| --------------------------------------------------------- | ------------- | -------------------- |
| A1 Remove JSON import/export + invoice import             | Phase 1       | Confirmed 2026-09-15 |
| A2 Remove manual invoice numbers; drafts unnumbered       | Phase 2       | Confirmed 2026-09-15 |
| A3 GST scope (SEZ in; reverse charge etc. out)            | Phase 2       | Confirmed 2026-09-15 |
| A4 Cancel only without payments; no GSTR-1 tracking       | Phase 2       | Confirmed 2026-09-15 |
| A5 No backdating before last issued in series             | Phase 2       | Confirmed 2026-09-15 |
| A6 Office without GSTIN can't issue invoices              | Phase 2       | Confirmed 2026-09-15 |
| A7 Encrypted off-host backups (org provides target + key) | Phase 6       | Confirmed 2026-09-15 |
| A8 Office Admins reset passwords within their offices     | Phase 1       | Confirmed 2026-09-15 |

## Current

- **Active phase:** 1 (branch `phase-1-access`)
- **Next task:** 1.9 (phase gate), per `docs/plans/phase-1-access.md`
- **Blockers:** none (note: host port 5432 is held by an unrelated `i-ticket-postgres-1` container, so the dev database is unreachable until that port is freed or remapped; a data volume created before 1.1 has no `app_owner`/`app_user` until it is recreated, see `phase-1-notes.md`)

### Phase 0 gate (2026-09-16)

| Check                    | Command                        | Result                                                |
| ------------------------ | ------------------------------ | ----------------------------------------------------- |
| Formatting               | `npx prettier --check .`       | clean                                                 |
| Lint                     | `npm run lint`                 | clean                                                 |
| Types                    | `npm run typecheck`            | clean (3 tsconfigs)                                   |
| Unit + integration       | `npm test`                     | 8 files, 38/38                                        |
| Build                    | `npm run build`                | `dist-fe` + `dist-be` (migrations copied)             |
| Invoice regression e2e   | `npm run test:e2e`             | 2/2, PDF downloaded, numbers `1` then `2`             |
| Docker stack             | `docker compose up -d --build` | `https://localhost` serves the SPA and the API        |
| Responsive 375 / 1280 px | manual                         | list, form and preview render, no overflow, no errors |

New feature tests and RLS/IDOR/permission tests do not apply to Phase 0.

## Session log

<!-- newest first, ≤10 lines per session: date · tasks done · checks run/results · next · blockers -->

- 2026-09-23 · 1.8 done (A1): deleted `GET /api/export` + `POST /api/import`, their controller and `services/importExport.ts`, and the settings "App backup" card with its `useExportJson`/`useImportJson` hooks and `exportAllData`/`importAllData` API-client calls. The import confirmation dialog and the settings re-fetch that only existed to refresh after a restore went with them
- 1.8 kept, per the task: list XLSX export everywhere and customer/item XLSX import. Invoice XLSX import was already off (`showOnlyExport` on the invoices page), and there was never an invoice import route — the JSON restore was the only way to write invoices in bulk, and it is gone
- 1.8 also: `encodeInvoiceExport`/`decodeInvoiceImport` (dead once the service went) removed from `dataUrlFunctions.ts`; `multer`, `pako` and their `@types` uninstalled, now unused; 8 orphaned i18n keys pruned in 5 locales
- 1.8 check: 2 new cases (the router registers no `/api/export|import`; both answer 404 to a Super Admin) → `npm test` 21 files, 160/160; prettier/lint/typecheck clean; `npm run build` green. E2E not run — it needs the dev DB on 5432, still held by another container; it belongs to the 1.9 gate and no e2e spec touches the removed UI. Not committed

- 2026-09-23 · fixed the intermittent `admin.api.spec.ts` failures under `npm test`. Cause was **not** the login limiter (erin peaks at 4 of 5 in every run, and a standalone probe never saw a late decrement): it is vitest's 5 s default `testTimeout` against argon2-heavy cases that take ~1 s idle. `testTimeout`/`hookTimeout` → 30 s in `vite.config.ts`; the v2 PDF test's local 20 s override removed
- The `expected 401 to be 403` in the audit test was a cascade — the timed-out reset-password test never re-logs erin in, leaving a revoked cookie. That assertion now uses `carol`, a User the admin tests never mutate
- Hardening: `createApp` takes `loginRateLimit` (defaults unchanged at 50/IP and 5/IP+email); only `admin.api.spec.ts` relaxes it. `auth.api.spec.ts` keeps the defaults, so the lockout case still tests the real limits
- Check: 3 full-suite runs under 10 busy-loop processes (the load that failed 4-5 tests every run before) all green, then 5 × `lint` + `typecheck` + `npm test` → 21 files, 158/158 each. Not committed

- 2026-09-22 · 1.7 done: login, forced/voluntary password change, no-access page; `authSlice` + CSRF/401/must-change handling in `platformApi.ts`; `navConfig.ts` drives the sidebar (design §9, Invoice setup nested under Administration) and every route guard; admin pages Users (temp password shown once, reset, extra grants "from role"), Roles & permissions (auto-ticked dependencies, "Affects N users" confirm), Offices, Audit log; Companies = old Businesses page (no delete/import, + legal name/PAN, `/companies`); dashboard setup checklist
- 1.7 fix: signing out left `returnTo` at the previous user's page (found by e2e); explicit sign-out now goes to plain `/login`. All English "Business" wording → "Company"
- 1.7 check: prettier/lint/typecheck clean, `npm run build` green, `npm test` 21 files 158/158 (new: nav, permission logic, API client auth, shell/grid components); `npm run test:e2e` 3/3 on a scratch DB with `E2E_MIGRATION_DATABASE_URL` (new `auth-shell.spec.ts`; invoice regression passes again, as Super Admin)
- 1.7 flakes: v2 PDF multi-page test given 20 s (fails on the 1.6 baseline under load too); `admin.api.spec` login-limiter race under full-suite load, flagged, not fixed. Details in `phase-1-notes.md`

- 2026-09-22 · 1.6 done: admin APIs, all zod-validated and audited in the request transaction — companies (`/api/businesses`, archive-only, `DELETE`/`batch` removed), `/api/offices` (GSTIN/state/LUT rules, `gstStates.ts`), `/api/roles` + `/api/permissions` (closed sets, system role locked, `affectedUsers`), `/api/users` (temp password 24 h, anti-escalation, revocation rules, last Super Admin), `/api/audit-logs` (paged); `0005-access-admin.sql`
- 1.6 change: `*.view_all` now `includes` the own-records key in effective permissions (the seeded Office Admin otherwise couldn't assign the User role)
- 1.6 check: new `api/admin.api.spec.ts` (18 cases); prettier/lint/typecheck clean, `npm test` 17 files 127/127, `npm run build` green (5 migrations). Details in `phase-1-notes.md`

- 2026-09-22 · 1.5 done: `src/backend/admin-cli` (`npm run admin -- create-super-admin`; prompts email, name, hidden password twice; `MIGRATION_DATABASE_URL` only; `is_system` role, `all_offices`, audit row), compiled into `dist-be`, compose service `admin-cli` (profile `tools`), README first-run steps
- 1.5 check: new `adminCli.spec.ts` (function, API login as the new admin, validation/duplicates, real entry point with piped stdin); prettier/lint/typecheck clean, `npm test` 16 files 108/108, `npm run build` green; Docker end to end in a throwaway project: init roles → migrate → admin-cli → login via the `app` container (argon2 on Alpine) all green

- 2026-09-22 · 1.4 done: `withRequestTx`/`withSystemTx`, `createApp(deps)` + session/CSRF/permission/error middleware, `/api/auth/{login,logout,me,change-password}` (argon2id, origin check, 50/IP + 5 failures/IP+email per 15 min, token rotation, must-change gate), all 62 existing routes run in `requestTx` behind exactly one permission guard, hourly session cleanup; deps `argon2`, `zod`
- 1.4 check: new `api/auth.api.spec.ts` (15 cases: public/401, login origin/validation/failures/cookie/rotation, CSRF, logout, route permissions, RLS through the API, forced change, lockout), `api/routes.permissions.spec.ts` (walks the router), `tx.spec.ts` (+request/system tx); prettier/lint/typecheck clean, `npm test` 15 files 102/102, `npm run build` green; browser smoke test of the real dev server confirmed the `__Host-` cookie over http://localhost
- 1.4 note: app now requires login — no first user until 1.5, no login page until 1.7, invoice e2e resumes at 1.7/1.9. Details in `phase-1-notes.md`

- 2026-09-22 · 1.3 done: `0004-rls-access.sql` — 8 definer helpers (plan's 4 + `app_office_visible`, `app_business_visible`, `app_shares_office`, `app_can_manage_user`), ENABLE+FORCE RLS with one `TO app_user` policy per granted command on the 7 access tables, and the 7 `auth_*` functions (12 h sliding idle / 7 d absolute sessions)
- 1.3 check: new `rls/access.rls.spec.ts` (structure, helpers, empty/office/all-offices reads, cross-office writes, Office Admin user-creation flow) and `auth.functions.spec.ts` (lookup, ctx contents, expiry, sliding, revocation, cleanup, event log); prettier/lint/typecheck clean, `npm test` 13 files 82/82, `npm run build` green (4 migrations)
- 1.3 **expected breakage until 1.4:** the API as `app_user` sets no ctx yet, so companies/offices/users are hidden and the app/e2e fail until 1.4 wires `withRequestTx` + login. `INSERT … RETURNING` needs SELECT visibility (matters for 1.6). Details in `phase-1-notes.md`

- 2026-09-22 · 1.2 done: `shared/auth/permissions.ts` (32 keys from design §7.1 with group, label, sortOrder, `requires`; `resolveDependencies`, `isPermissionKey`), `0003-permissions.sql` seeds permissions + Super Admin (system, all), Office Admin (§7.1 + `admin.users` for A8 + `credit_note.create`, user ruling), User; renderer reaches the map through the new `@shared` alias; ESLint forbids imports in the map
- 1.2 check: `permissions.sync.spec.ts` (DB rows = map, exact seeded role sets, closed under `requires`) and `permissions.test.ts` (map shape, dependency resolution); both fail when a label or a `requires` entry is changed on purpose; prettier/lint/typecheck clean, `npm test` 11 files 54/54, `npm run build` green (3 migrations copied)

- 2026-09-22 · 1.1 done: `db/init/00-roles.sql` (`app_owner` BYPASSRLS, `app_user` NOBYPASSRLS with 15s/30s timeouts, passwords from env, re-runnable) mounted in both compose files and run by CI; `0002-access.sql` (businesses columns, offices, roles, permissions, role/user permissions, users `citext`, user_offices, sessions, audit_logs, notifications, grants); API now logs in as `app_user`
- 1.1 check: fresh `postgres:17` + init → `npm run migrate` as `app_owner` applied 0001+0002, second run no-op; `\dp` matches the plan (sessions/migrations none, audit_logs `ar`, permissions `r`); new `access.schema.spec.ts` (roles, ownership, exact grants, re-run, constraints)
- 1.1 check: prettier/lint/typecheck clean, `npm test` 9 files 46/46, `npm run build` green (2 migrations copied), `npm run test:e2e` 2/2 **with the API as `app_user`**
- 1.1 note: JSON import's `setval` fails as `app_user` until 1.8 deletes it; test DB helper runs migrations as `app_owner`. Details in `phase-1-notes.md`

- 2026-09-16 · 0.7 done, **Phase 0 complete**: `e2e/invoice-regression.spec.ts` drives the whole flow through the UI — company, client, currency, bank and item, then an invoice with 2 lines, a fixed discount and a partial payment, an edit re-read from the list, a PDF preview and download, and a duplicate; it asserts the numbers end up `['1','2']`
- 0.7 check: prettier/lint/typecheck clean, `npm test` 8 files 38/38, `npm run build` green, `npm run test:e2e` 2/2 (stable over 3 consecutive runs), Docker stack green, 375 px and 1280 px render with no overflow and no console errors
- 0.7 bug fixed: payments carry a client-generated `Date.now()` id, and `processPayments` compared it to an `integer` column, so **every invoice saved with a payment failed on PostgreSQL**. Both comparison sites now cast to `bigint`; new spec case fails without the fix
- 0.7 known upstream behaviour, not fixed: `Form.tsx` debounces the form→page handoff by 250 ms, so a Save fired inside that window persists the previous state. Documented in `phase-0-notes.md`; belongs to Phase 4 UX

- 2026-09-16 · 0.6 done: one Dockerfile with `runner` (API) and `web` (Caddy + built SPA) targets; `docker-compose.yml` = `db` + one-shot `migrate` + `app` + `caddy`, only Caddy publishes 80/443; `Caddyfile` with `{$APP_DOMAIN}`, SPA fallback, `/api/*` proxy and D16's 20 MB limit; `.env.example`; CI on Node 22 with a `postgres:17` service; `docker-publish.yml` builds both targets, tags/dispatch only
- 0.6 check: `docker compose up -d --build` → db healthy → migrate applied `0001-baseline.sql` → app healthy → caddy; `https://localhost` serves the SPA over Caddy's internal CA, `/invoices` renders the list through the SPA fallback, `/api/health`, `/api/version`, `/api/invoices`, `/api/currencies` all answer through the proxy
- 0.6 check: `prettier --check .` → clean (the 11 long-standing files formatted), `lint`, `typecheck`, `test` (8 files, 37/37), `build`, `test:e2e` (1/1) all green
- 0.6 fixed a loop introduced in 0.5: `/invoices` re-fetched settings/presets/invoices forever because `useAsync`'s `execute` depended on `t` and `App.tsx` called `i18n.changeLanguage` on every settings result. Callbacks moved to refs, `changeLanguage` now guarded. Verified in a browser: 5 API calls total, no console errors
- 0.6 also: `.sql` migrations are copied into `dist-be` by `scripts/copy-webserver-assets.js` (a built image had none); `DEV_SERVER_URL` renamed to `HOST`. Details in `phase-0-notes.md`

- 2026-09-16 · 0.5 done: Electron, preload, SQLite and the database-chooser flow deleted (60 files); `getApi()` is `webApi()` only, `isWebMode`/`electronAPI`/`global.d.ts` gone; `App.tsx` renders `AppLayout` directly; receipt-printing and updater UI removed; `package.json` scripts/deps/metadata reworked (`test` = `vitest run`, new `typecheck`, no `docker:*`/`package`/`release:*`/`postinstall`)
- 0.5 check: `npm ci` (no `--ignore-scripts` needed any more) → `npm run typecheck` → `npm run lint` → `npm test` (8 files, 37/37) → `npm run build` all green; `grep -rniE "electron|sqlite" src package.json` returns only the UBL `<cbc:ElectronicMail>` tag
- 0.5 also: Vite now proxies `/api/*` in dev (0.4 removed CORS and dev is cross-origin — the e2e spec caught it), `base` `./` → `/`, `e2e/v2-layout.spec.ts` rewritten for web mode and passing, 4 pre-existing type errors fixed (incl. a real preset-response decoding bug), 21 orphaned i18n keys pruned in 5 locales, README + agent docs rewritten
- 0.5 note: Sidebar logout removed with the database chooser — Phase 1 re-adds it with real authentication. Details in `phase-0-notes.md`

- 2026-09-16 · 0.4 done: `main.ts` rewired — CORS removed, `helmet()`, `trust proxy 1`, per-request `requestId`, `express.json` 1mb global + 15mb on write routes of `invoices`/`businesses`/`presets`/`styleProfiles`, central error handler `{ success:false, key, message }`; new `webserver/migrate.ts` + `npm run migrate` (`MIGRATION_DATABASE_URL ?? DATABASE_URL`); `cors`/`@types/cors` dropped, `helmet` added
- 0.4 check: `tsc -p tsconfig.webserver.json` clean; `eslint .` clean; `vitest run src/backend` → 4 files, 14/14 pass; `npm run migrate` applied `0001-baseline.sql` then reported no-op on re-run; server up → `/api/health` `{ok:true}`, `/api/invoices` `{"success":true,"data":[]}`, `/api/currencies` seeded rows, helmet headers present, no CORS header
- 0.4 body limits verified: 2MB→`/api/categories` 413 `error.fileTooLarge`; 2MB→`/api/invoices` parsed (500 from the service, not 413); 16MB→`/api/invoices` 413; malformed JSON 400 `error.invalidFile`; logs show `[requestId] METHOD path status key` with no bodies
- 0.4 env: host 5432 belongs to another project's container, so the smoke test ran against a scratch DB on the test instance (5433). Details in `phase-0-notes.md`

- 2026-09-15 · 0.3 done: `db/pool.ts` + `db/tx.ts` (`Db`, `withTx`, `DbUsedOutsideTransaction`); baseline booleans converted to real `BOOLEAN`; all 11 services + `layouts`/`settings` moved off `DatabaseAdapter`/dialect branches/`BEGIN·COMMIT·ROLLBACK`; `getInvoices`/`presets.getPresets` id/type interpolation and all of `filterFunctions.ts` parameterized
- 0.3 check: `tsc -p tsconfig.webserver.json` clean; `eslint src/backend` clean; `vitest run src/backend` → 4 files, 14/14 pass (added `db/__tests__/tx.spec.ts`); manual smoke test of the running server (health, filtered list, create) green
- Pulled forward from 0.4 of necessity (deleting `client.ts` breaks the old `dbInstance` pattern): all 13 controllers now use `withTx`; deleted `webserver/database.ts`, `webserver/migration.ts`, `webserver/controllers/database.ts`; `requireDB` removed
- 2 pre-existing bugs fixed in `invoices.ts` (sequence-failure branch returned the wrong result's `.key`) and 1 correctness fix (`duplicateInvoice` validated the new number after already writing `status='closed'`) — all narrow, details in `phase-0-notes.md`
- 2026-09-15 · 0.1 done: `docker-compose.dev.yml`, `pgTestDb` helper, invoices + layouts specs ported to PostgreSQL
- 0.1 check: `vitest run src/backend` → 10/10 pass on postgres-test, no PG errors; fixed 2 PG-only legacy bugs (empty `IN ()` in `getInvoices`; stale unique constraint in migration 24)
- 0.2 done: `0001-baseline.sql` + `runSqlMigrations`; `legacy-columns.json` + `baseline.schema.spec.ts`; 30 legacy migrations and `vite.migrations.config.ts` deleted
- 0.2 check: `vitest run src/backend` → 3 files, 11/11 pass on the baseline; `tsc -p tsconfig.webserver.json` clean
- Decision: S7 tax columns stay in the baseline, dropped in Phase 2 (user); `setup.ts` trimmed, not deleted, until 0.4. Details and known breakage in `phase-0-notes.md`
- Local setup: Docker Desktop running; `npm ci --ignore-scripts && npm rebuild sqlite3 esbuild` until 0.5
- 2026-09-15 · Design, multi-agent review and plans written · no code changed · next: Phase 0 task 0.1
