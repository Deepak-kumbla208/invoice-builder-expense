# Copilot instructions

This repository is a web-only, PostgreSQL-only invoice and office expense system: a React SPA
served as static files plus an Express REST API. There is no Electron, no preload bridge and no
SQLite.

**Read [CLAUDE.md](../CLAUDE.md) first**, then [docs/plans/STATUS.md](../docs/plans/STATUS.md) for
the active phase. Those files own the project rules and take precedence over this document.

## Runtime pieces

- Renderer: `src/renderer` (React 19 + MUI 9), built by `vite` into `dist-fe`
- API: `src/backend/webserver` (Express 5 controllers), compiled by `tsc -p tsconfig.webserver.json`
  into `dist-be/backend/server`
- Shared services and database layer: `src/backend/shared` (`services/`, `db/`, `migrations/`)
- The renderer talks to the API over `fetch` only, through `src/renderer/shared/api/platformApi.ts`

## Database

- PostgreSQL only, reached through `DATABASE_URL`.
- Every request runs in one transaction: controllers call `withTx(db => service(db, …))` from
  `src/backend/shared/db/tx.ts`. Services never issue `BEGIN`/`COMMIT` and never interpolate SQL
  values.
- Schema changes are forward-only `.sql` files in `src/backend/shared/migrations`, applied by
  `npm run migrate` (`MIGRATION_DATABASE_URL`, falling back to `DATABASE_URL`).

## Commands

- `docker compose -f docker-compose.dev.yml up -d` — PostgreSQL on 5432, test PostgreSQL on 5433
- `npm run dev` — Vite on 5173 and the API on 3000
- `npm run migrate` — apply migrations
- `npm run lint && npm run typecheck && npm test` — unit and integration tests (need the test DB)
- `npm run test:e2e` — Playwright
- `npm run build` — `dist-fe` and `dist-be`

## Conventions

- Money is integer paisa or cents; business dates are `DATE` on the `Asia/Kolkata` calendar.
- UI wording is "Company", never "Business" (the table stays `businesses`).
- Follow the existing Prettier and ESLint setup; default to no comments.

## When to ask for human input

- Schema changes that need a migration strategy.
- Anything touching `src/backend/shared/services/invoices.ts` beyond a narrow change.
- Deployment, Docker or release changes.
