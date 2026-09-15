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

## Test infrastructure

- `pgTestDb` loads the legacy `.ts` migrations via `import.meta.glob` (no `dist-be` build needed) in `setupDB` order: `initSchema` → `initInitialData` → migrations. Replaced by `0001-baseline.sql` in task 0.2.
- `layouts.migration.spec.ts` no longer re-runs the layouts table migration (not re-runnable: `ADD COLUMN`); it asserts the migrated state and re-runs the seed twice for idempotency.
- Local install: `npm ci --ignore-scripts && npm rebuild sqlite3 esbuild` (the `postinstall` Electron rebuild breaks `sqlite3` under Node; removed in 0.5).
