# Implementation Status

| Phase                                             | Plan                    | Status                                    |
| ------------------------------------------------- | ----------------------- | ----------------------------------------- |
| 0 Foundation                                      | `phase-0-foundation.md` | In progress (branch `phase-0-foundation`) |
| 1 Access (auth, RBAC, RLS)                        | `phase-1-access.md`     | Not started                               |
| 2 Invoices (office, GST, numbering, credit notes) | `phase-2-invoices.md`   | Not started                               |
| 3 Expenses & reimbursements                       | `phase-3-expenses.md`   | Not started                               |
| 4 UX (dashboard, switcher, ageing, responsive)    | `phase-4-ux.md`         | Not started                               |
| 5 Reports & exports                               | `phase-5-reports.md`    | Not started                               |
| 6 Hardening & ops                                 | `phase-6-hardening.md`  | Not started                               |

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

- **Active phase:** 0
- **Next task:** 0.5 Remove Electron and SQLite from the repo
- **Blockers:** none (note: host port 5432 is held by an unrelated `i-ticket-postgres-1` container, so the dev database is unreachable until that port is freed or remapped)

## Session log

<!-- newest first, ≤10 lines per session: date · tasks done · checks run/results · next · blockers -->

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
