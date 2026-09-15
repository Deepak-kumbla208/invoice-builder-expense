# Implementation Status

| Phase | Plan | Status |
|---|---|---|
| 0 Foundation | `phase-0-foundation.md` | In progress (branch `phase-0-foundation`) |
| 1 Access (auth, RBAC, RLS) | `phase-1-access.md` | Not started |
| 2 Invoices (office, GST, numbering, credit notes) | `phase-2-invoices.md` | Not started |
| 3 Expenses & reimbursements | `phase-3-expenses.md` | Not started |
| 4 UX (dashboard, switcher, ageing, responsive) | `phase-4-ux.md` | Not started |
| 5 Reports & exports | `phase-5-reports.md` | Not started |
| 6 Hardening & ops | `phase-6-hardening.md` | Not started |

## User sign-off (design §3a)
| Item | Needed before | Status |
|---|---|---|
| A1 Remove JSON import/export + invoice import | Phase 1 | Confirmed 2026-09-15 |
| A2 Remove manual invoice numbers; drafts unnumbered | Phase 2 | Confirmed 2026-09-15 |
| A3 GST scope (SEZ in; reverse charge etc. out) | Phase 2 | Confirmed 2026-09-15 |
| A4 Cancel only without payments; no GSTR-1 tracking | Phase 2 | Confirmed 2026-09-15 |
| A5 No backdating before last issued in series | Phase 2 | Confirmed 2026-09-15 |
| A6 Office without GSTIN can't issue invoices | Phase 2 | Confirmed 2026-09-15 |
| A7 Encrypted off-host backups (org provides target + key) | Phase 6 | Confirmed 2026-09-15 |
| A8 Office Admins reset passwords within their offices | Phase 1 | Confirmed 2026-09-15 |

## Current
- **Active phase:** 0
- **Next task:** 0.2 Baseline schema
- **Blockers:** none

## Session log
<!-- newest first, ≤10 lines per session: date · tasks done · checks run/results · next · blockers -->
- 2026-09-15 · 0.1 done: `docker-compose.dev.yml`, `pgTestDb` helper, invoices + layouts specs ported to PostgreSQL
- Check: `vitest run src/backend` → 2 files, 10/10 pass on postgres-test; no PG errors logged; eslint/prettier clean
- Plan deviations (see `phase-0-notes.md`): fixed 2 PG-only legacy bugs (empty `IN ()` in `getInvoices`; stale 3-col unique constraint in migration 24); layouts spec builds DB up to migration 27
- Local setup: Docker Desktop must be running; `npm ci --ignore-scripts && npm rebuild sqlite3 esbuild` until 0.5
- 2026-09-15 · Design, multi-agent review and plans written · no code changed · next: Phase 0 task 0.1
