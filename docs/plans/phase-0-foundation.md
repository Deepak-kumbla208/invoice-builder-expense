# Phase 0 — Foundation (web + PostgreSQL only)

**Goal:** The existing invoice app runs in the browser against PostgreSQL only. It has per-request transactions and no Electron or SQLite code. The existing invoice behaviour is unchanged and covered by tests running on PostgreSQL.

**Design refs:** D1, D14, D16 (body limits), D22 (Caddy), S13 (baseline). Review log §1–§3.
**Branch:** `phase-0-foundation`
**Out of scope:** auth, RLS, offices, GST (Phases 1–2). Do not change invoice business logic beyond removing transactions and dialect branches.

---

## Tasks

Do the tasks in order. Commit after each task once its check passes.

### 0.1 Safety net first: run existing invoice tests on PostgreSQL

- Add `docker-compose.dev.yml` with `postgres:17` on port 5432 (volume `pgdata-dev`) and a `postgres-test` service on port 5433 using tmpfs.
- Add `src/backend/__tests__/helpers/pgTestDb.ts`. It creates a fresh database per test file (`CREATE DATABASE t_<random>`), runs migrations and returns a `Db`, then drops the database in `afterAll`. It reads `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5433/postgres`).
- Port `src/backend/shared/services/__tests__/invoices.spec.ts` and `src/backend/__tests__/layouts.migration.spec.ts` from SQLite `:memory:` to `pgTestDb`. Mark backend tests with `// @vitest-environment node`.
- **Check:** `docker compose -f docker-compose.dev.yml up -d postgres-test && npx vitest run src/backend` passes **before** any removal. If a test fails only on PostgreSQL, record it in `docs/plans/phase-0-notes.md` and fix the minimum needed.

### 0.2 Baseline schema

- Apply the legacy schema (`initSchema` + all 30 migrations + `initInitialData`) to a scratch PostgreSQL database, then export it with `pg_dump --schema-only --no-owner` and a data-only dump of the seed tables (currencies, units, categories, layouts/templates seeds, settings row).
- Create `src/backend/shared/migrations/0001-baseline.sql` from these, cleaned and in plain PostgreSQL. The runner applies `.sql` files in a transaction and records them in `migrations`.
- Generate the **named reference** `src/backend/__tests__/fixtures/legacy-columns.json` (table → sorted column names, from `information_schema.columns` of the legacy-built database). Add `baseline.schema.spec.ts`, which asserts that the baseline's tables and columns equal the reference minus an explicit `INTENTIONAL_DROPS` list (empty in Phase 0). Types may differ, e.g. INTEGER 0/1 → BOOLEAN. Delete the fixture and test at the end of Phase 2.
- Delete `shared/db/setup.ts` (`initSchema`/`initInitialData`), the 30 legacy `.ts` migrations, `vite.migrations.config.ts` and `build:migrations`.
- **Check:** schema diff test passes; ported invoice tests pass on the baseline.

### 0.3 PostgreSQL-only database layer with request transactions

- Replace `shared/db/client.ts` with `shared/db/pool.ts` (`pg.Pool`, `max: 20`, from `DATABASE_URL`) and `shared/db/tx.ts`:
  - `type Db = { get, all, run, query }`, keeping the **same method signatures** as `DatabaseAdapter` so services compile unchanged. Placeholder `?` → `$n` conversion is kept.
  - `withTx(fn)` checks out one `PoolClient`, runs `BEGIN`, calls `fn(db)`, then `COMMIT`, or `ROLLBACK` on throw, and always releases the client.
  - A `Db` created by `withTx` is invalidated after the transaction ends (any call throws `DbUsedOutsideTransaction`).
- Remove **every** `db.run('BEGIN'|'COMMIT'|'ROLLBACK')` and `rollbackOrThrow` use in `banks, businesses, categories, clients, currencies, importExport, invoices, items, presets, styleProfiles, units` (verify with `grep -rnE "'(BEGIN|COMMIT|ROLLBACK)'" src/backend/shared/services` → no output). In `invoices.ts`, sequence updates now run inside the same transaction as the insert or update.
- Remove dialect branches: all `getColumnType`, `getDefaultValue`, `insertOrIgnore`, `db.type`, `DatabaseType`, `boolToInt` and `convertBooleanFields` uses. Replace `datetime('now')` with `now()`. Convert booleans to real `BOOLEAN` in the baseline, and adjust the row mappers that expected 0/1.
- Fix string-interpolated SQL (`services/invoices.ts` `getInvoices`: `i."id" = ${id}`, `invoiceType = '${type}'`) to parameters. `grep -rn '\${' src/backend/shared/services | grep -i "where\|=\s*'"` must show no interpolated values.
- Delete `shared/db/migrationRunner.ts`'s SQLite paths and keep a PostgreSQL runner that reads `.sql` files, ordered by name, using `MIGRATION_DATABASE_URL` (falls back to `DATABASE_URL` in dev).
- **Check:** `npx tsc -p tsconfig.webserver.json --noEmit` passes; backend tests pass.

### 0.4 Server wiring

- `webserver/main.ts`: remove CORS; `express.json({ limit: '1mb' })` globally, with a `15mb` parser only on write routes for `invoices`, `businesses`, `presets`, `styleProfiles` (D16); add `helmet()`; keep `trust proxy 1`; add a central error handler returning `{ success:false, key, message }` and logging `requestId` without request bodies.
- Controllers: replace `dbInstance!` with `withTx(db => service(db, …))`. Delete `requireDB` and `controllers/database.ts` (`/api/databases*`). Delete `webserver/database.ts` and `webserver/migration.ts`.
- New script `src/backend/webserver/migrate.ts` (entry `npm run migrate`).
- **Check:** `npm run dev:webserver` starts; `curl localhost:3000/api/health` → `{ ok: true }`; `curl localhost:3000/api/invoices` returns JSON from PostgreSQL.

### 0.5 Remove Electron and SQLite from the repo

- Delete: `src/backend/main/`, `src/preload/`, `vite.electron.config.ts`, `vite.preload.config.ts`, `electron-builder.yml`, `scripts/after-pack.cjs`, `scripts/backup-data.cjs`, `scripts/remove-db.cjs`, `e2e/electron.spec.ts`, `.github/workflows/release.yml`, `docker-compose.standalone.yml`, `src/renderer/app/Updater.tsx`, `src/renderer/app/DatabaseChooser/`, `src/renderer/shared/hooks/print/usePrintReceipt.ts` (and receipt settings UI), `src/renderer/shared/enums/databaseType.ts`, `src/backend/shared/enums/databaseType.ts`, `src/backend/shared/enums/dbInitType.ts` (if unused).
- `src/renderer/shared/api/restApi.ts`: `getApi()` returns `webApi()` only; delete `isWebMode` and all `electronAPI` branches (`main.tsx`, `invoices/Form/Dropdowns/MoreActionDropdown.tsx`, `invoices/Preview/index.tsx`, `settings/menu/Menu.tsx`, `shared/types/global.d.ts`). Remove the updater, db-dialog and receipt methods from `platformApi.ts`.
- `App.tsx`: render `AppLayout` directly (a temporary open app until Phase 1 adds login); remove `dbReady`.
- `package.json`: remove deps `electron`, `electron-builder`, `electron-updater`, `electronmon`, `@electron/rebuild`, `sqlite3`, `wait-on`; remove scripts `dev`, `dev:electron*`, `dev:preload`, `dev:migrations`, `build`, `build:preload`, `build:migrations`, `build:electron`, `package`, `release:*`, `postinstall`, `docker:*` except the new ones. New scripts: `dev` (`concurrently "vite" "tsx watch src/backend/webserver/main.ts"`), `build` (`vite build && tsc -p tsconfig.webserver.json`), `migrate`, `test`, `test:e2e`, `lint`, `typecheck`.
- `package.json` `description`, `keywords` and README: web + PostgreSQL. Keep MIT licence and upstream credit.
- **Check:** `npm ci && npm run typecheck && npm run lint && npm test && npm run build` all pass; `grep -rniE "electron|sqlite" src package.json` → no output.

### 0.6 Docker and CI

- `Dockerfile`: multi-stage; runtime image contains `dist-fe` and `dist-be` and runs `node dist-be/backend/server/webserver/main.js`. Delete `scripts/docker-start.sh` and `scripts/nginx.conf.template`.
- `docker-compose.yml`:
  - `db` (postgres:17, healthcheck, internal network only)
  - `migrate` (one-shot, `MIGRATION_DATABASE_URL`)
  - `app` (`DATABASE_URL`, depends on migrate completing, healthcheck `/api/health`, `restart: unless-stopped`)
  - `caddy` (serves `dist-fe` via `file_server` with SPA fallback, `reverse_proxy /api/* app:3000`, ports 80/443, `Caddyfile` with `{$APP_DOMAIN}`)
- `.env.example`: `APP_DOMAIN`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `MIGRATION_DATABASE_URL`. `.gitignore` covers `.env`.
- `.github/workflows/main.yml`: Node 22; Postgres 17 service; `npm ci → lint → typecheck → test (TEST_DATABASE_URL) → build`. Change Prettier to `prettier --check .`. Keep `docker-publish.yml` but point the image name at the fork (or disable until needed).
- **Check:** `docker compose up -d --build` locally → `https://localhost` (Caddy internal TLS) loads the SPA and invoices list.

### 0.7 Regression check (phase gate)

- Playwright web spec `e2e/invoice-regression.spec.ts` (replaces the Electron spec; keep `e2e/v2-layout.spec.ts` working in web mode):
  - create business, client, currency, bank, item
  - create an invoice with 2 items, a discount and a partial payment
  - edit it
  - duplicate it
  - preview the PDF, then download it (assert the file downloaded and is non-empty)
  - check the invoice number increments
- Manual check at 375 px and 1280 px widths: invoice list, form and preview render.
- Update `docs/plans/STATUS.md`: Phase 0 → done, with the command outputs summary.

## Exit criteria

- [ ] `npm run lint && npm run typecheck && npm test && npm run build` green locally and in CI
- [ ] No `electron`, `sqlite`, `DatabaseType`, service-level `BEGIN/COMMIT`, or interpolated SQL values remain
- [ ] `Db` throws when used outside `withTx`
- [ ] Invoice regression e2e green; PDF downloads
- [ ] `docker compose up` serves the app over Caddy with a PostgreSQL volume
