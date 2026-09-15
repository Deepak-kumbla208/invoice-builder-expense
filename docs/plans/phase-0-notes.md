# Phase 0 notes

Failures seen only on PostgreSQL while porting tests (task 0.1), and the minimum fix applied.

| #   | Symptom                                                          | Cause                                                                                                        | Fix                                                      |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 1   | `syntax error at or near "RETURNING"` in `invoices.spec.ts`      | Test insert helpers ended SQL with `;`; the PG adapter appends ` RETURNING id` after it                      | Removed the trailing `;` in the test helpers (test-only) |
| 2   | `addInvoice` → `error.sqlSyntaxError` for invoices with no items | `getInvoices` built `"parentInvoiceItemId" IN ()` from an empty list; SQLite accepts it, PostgreSQL does not | Skip the snapshot query when the id list is empty        |

3. **Stale unique constraint (legacy PG bug).** Migration 22 adds `invoices_businessId_invoiceFullNumber_clientId_key` unquoted (PG stores it lower-case); migration 24 drops the quoted camel-case name, so the old 3-column constraint survived next to the new 4-column one and a quotation → invoice conversion hit `duplicate key`. Fix: migration 24 also drops the unquoted name. The 0.2 baseline must contain only the 4-column constraint.
4. **`nextSequence` is `BIGINT`**, which `pg` returns as a string. Services already wrap it in `Number()`; only the test's raw read was changed.
5. **Silent legacy migration failures.** Legacy `up()` functions catch errors and return `{ success:false }`, which the old runner ignored. `pgTestDb` now throws on that; all 30 migrations apply cleanly on PG.
6. **Migration 28 is not re-runnable after 29** (its backfill reads `invoice_customizations."layout"`, dropped by 29). The layouts spec now builds the DB with `stopBefore: '20260902-28'`, then runs 28 twice and asserts neither run fails, as the original SQLite test did.

## Decisions

- **S7 tax columns (user, 2026-09-15):** review S7 drops legacy invoice `taxName/taxRate/taxType` and item `taxRate/taxType` "from the baseline", but Phase 0 must not change invoice behaviour. Ruling: `0001-baseline.sql` keeps these columns (`INTENTIONAL_DROPS` stays empty in Phase 0); Phase 2 drops them with a forward migration when the GST tax module replaces them.

## Task 0.2 deviations

- `0001-baseline.sql` = `pg_dump --schema-only` + `--data-only --column-inserts` of the legacy schema on PG 17, with `SET`/`\restrict`/comments/`public.` stripped, no-op `setval`s removed, seed `createdAt/updatedAt` set to `now()`, and the legacy `migrations` table removed (the SQL runner owns it). Seeds: categories 2, currencies 10, layouts 6, settings 1, units 13 (no template rows exist).
- New `runSqlMigrations(connectionString, dir)` in `migrationRunner.ts` uses `pg` directly (the adapter rewrites every `?` to `$n`, which would corrupt SQL text). The legacy `runMigrations` stays until 0.3.
- `setup.ts` is trimmed, not deleted: `initSchema`/`initInitialData`/`openSqlLite` are gone, but `testPostgresConnection`/`openPostgreSql` stay until 0.4 deletes their web callers, so `tsc -p tsconfig.webserver.json` keeps passing. Web `setupDB` now runs the SQL migrations and rejects SQLite.
- Known breakage until later tasks: Electron `src/backend/main/database.ts` (removed in 0.5); CI `npm run test` needs a PostgreSQL service (0.6); `tsc` does not copy `.sql` files into `dist-be`, so the Docker image must ship `src/backend/shared/migrations/*.sql` (0.6); `.github/copilot-instructions.md` still describes legacy migrations (0.5 docs pass).
- `layouts.migration.spec.ts` now asserts the baseline layout seeds.

## Test infrastructure

- `pgTestDb` loads the legacy `.ts` migrations via `import.meta.glob` (no `dist-be` build needed) in `setupDB` order: `initSchema` → `initInitialData` → migrations. Replaced by `0001-baseline.sql` in task 0.2.
- `layouts.migration.spec.ts` no longer re-runs the layouts table migration (not re-runnable: `ADD COLUMN`); it asserts the migrated state and re-runs the seed twice for idempotency.
- Local install: `npm ci --ignore-scripts && npm rebuild sqlite3 esbuild` (the `postinstall` Electron rebuild breaks `sqlite3` under Node; removed in 0.5).
