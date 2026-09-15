# CLAUDE.md — Invoice + Office Expense System

A web-only, PostgreSQL-only fork of `piratuks/invoice-builder`, extended for 3 Indian companies: invoices with GST, office expenses, reimbursements, RBAC and RLS.

## Read first (only what the current task needs)
1. `docs/plans/STATUS.md`: current phase, what is done, what is next. **Start here.**
2. `docs/plans/phase-<n>-*.md`: the task list for the active phase. Work task by task.
3. `docs/design/2026-09-15-invoice-expense-system.md`: the design. Open only the section referenced by the task.
4. `docs/design/2026-09-15-design-review.md`: review rulings and D14–D27. The **binding conditions** at the end override the design doc where they conflict.

Do not re-explore the whole repo or re-litigate decisions D1–D27. If a decision looks wrong, stop and ask the user.

## Repo map (post Phase 0)
- `src/renderer`: React 19 + MUI 9 SPA (`pages/`, `shared/api/platformApi.ts`, `state/`)
- `src/backend/webserver`: Express 5 (controllers, middleware)
- `src/backend/shared/services`: business logic (`invoices.ts` is the large, sensitive one)
- `src/backend/shared/db`: `pool.ts`, `tx.ts` (`withTx` / `withRequestTx`), migration runner
- `src/backend/shared/migrations`: forward-only `.sql` migrations (`0001-baseline.sql` onwards)
- `src/backend/shared/tax`: shared GST calculation module (Phase 2), imported by server and renderer
- `docs/`: design, review, plans

## Rules
- **Preserve the existing invoice behaviour.** Change `invoices.ts` narrowly and add or adjust tests first.
- All DB access goes through a `Db` from `withTx` / `withRequestTx`. **No** `BEGIN/COMMIT` in services. **No** string-interpolated SQL values.
- Every new scoped table gets: `business_id`/`office_id`, RLS policies (separate SELECT/INSERT/UPDATE/DELETE with USING + WITH CHECK), a composite FK or a service same-scope check, and an IDOR test.
- Every mutating route declares `requirePermission(key)`, and every state change writes `audit_logs` in the same transaction.
- No hard-coded companies, offices, users, categories or permission lists in UI code (permission keys live in migrations plus `shared/auth/permissions.ts`).
- Money is integer paisa or cents. Business dates use `DATE`, with the IST calendar (`Asia/Kolkata`).
- UI wording is "Company", never "Business" (the DB table stays `businesses`).
- Follow the existing code style (Prettier config, ESLint). Default to no comments.

## Commands
```bash
docker compose -f docker-compose.dev.yml up -d   # postgres :5432, postgres-test :5433
npm run migrate                                  # apply migrations (dev DB)
npm run dev                                      # vite :5173 + API :3000
npm run lint && npm run typecheck && npm test     # unit + integration (needs postgres-test)
npm run test:e2e                                 # Playwright web
npm run build
```

## Phase gate (run before marking any phase done)
lint → typecheck → tests → build → invoice regression e2e → new feature tests → RLS/IDOR/permission tests (from Phase 1). Record results in `docs/plans/STATUS.md`.

## Token-efficient working agreement
- Work one plan task per commit; don't read files the task doesn't list unless blocked.
- Prefer `Grep` with narrow patterns over reading large files; `invoices.ts` is 1,400+ lines, so read only the functions you're changing.
- Update `docs/plans/STATUS.md` at the end of each session (done / next / blockers), in 10 lines or fewer.
