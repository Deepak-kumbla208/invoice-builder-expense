# Invoice + Office Expense System

A web-only, PostgreSQL-only fork of [piratuks/invoice-builder](https://github.com/piratuks/invoice-builder),
extended for three Indian companies: GST invoices, office expenses, reimbursements, role-based access
control and row-level security.

The upstream project is an offline-first Electron desktop app. This fork is neither: it is a React
single-page app served as static files, an Express REST API, and one PostgreSQL database shared by
everyone who uses it.

> **Status:** under active development. See [docs/plans/STATUS.md](docs/plans/STATUS.md) for the
> current phase and what works today.

## 📸 Screenshots

![Invoice Form](tutorial/invoice_form.jpg)
![Invoice PDF Preview](tutorial/invoice_pdf_preview.jpg)
![Quote PDF Preview](tutorial/quote_pdf_preview.jpg)

## ✨ Features

### Invoicing (inherited from upstream)

- Create and manage **Invoices** and **Quotes**, with per-document currency and language
- Automatic snapshotting of business, bank, style profile, layout, client, item and currency data
  onto each invoice or quote
- Highly customizable PDFs: branding, layout, colors, typography, watermarks, signatures, attachments
- UBL 2.1 / Peppol BIS Billing 3.0 and XRechnung XML export
- Fixed or percentage discounts and surcharges, shipping fees, part payments
- Banks, Businesses, Clients, Items, Categories, Units, Currencies, with persistent search, sort,
  filter and non-destructive archiving
- XLSX import/export for most entities
- Reports and ageing views

### Added by this fork

- Indian GST: CGST/SGST/IGST, place of supply, SEZ, HSN/SAC and per-office GSTIN
- Multiple companies and offices, with per-office invoice numbering series
- Office expenses, receipts and reimbursement approvals
- Users, roles and permissions, enforced in the API and backed by PostgreSQL row-level security
- Audit logging of every state change

See [docs/design/2026-09-15-invoice-expense-system.md](docs/design/2026-09-15-invoice-expense-system.md)
for the design and [docs/plans](docs/plans) for the phased implementation plan.

## 🧱 Architecture

| Piece                   | What it is                                                     |
| ----------------------- | -------------------------------------------------------------- |
| `src/renderer`          | React 19 + MUI 9 single-page app, built by Vite into `dist-fe` |
| `src/backend/webserver` | Express 5 REST API, compiled by `tsc` into `dist-be`           |
| `src/backend/shared`    | Services, the database layer and forward-only SQL migrations   |
| PostgreSQL 17           | The only supported database, reached through `DATABASE_URL`    |

The renderer talks to the API over `fetch` only. Every request runs inside a single transaction
(`withTx`), all SQL is parameterised, and schema changes are forward-only `.sql` migrations applied
by `npm run migrate`.

## 🚀 Development

Requires Node.js 22+, npm and Docker.

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres :5432, postgres-test :5433
npm ci
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/invoice_expense
npm run migrate                                  # apply migrations
npm run dev                                      # vite :5173 + API :3000
```

| Command             | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Vite dev server and the API, together              |
| `npm run migrate`   | Apply pending SQL migrations                       |
| `npm run lint`      | ESLint over the whole repo                         |
| `npm run typecheck` | TypeScript, renderer and server                    |
| `npm test`          | Unit and integration tests (needs `postgres-test`) |
| `npm run test:e2e`  | Playwright end-to-end tests                        |
| `npm run build`     | Production `dist-fe` and `dist-be`                 |

## 🐳 Running the stack

`docker compose up` runs four services: `db` (PostgreSQL 17, internal network only), a one-shot
`migrate`, `app` (the API), and `caddy`, which serves the built SPA, terminates TLS and proxies
`/api/*` to the API. Only Caddy publishes ports (80 and 443).

```bash
cp .env.example .env     # set APP_DOMAIN and POSTGRES_PASSWORD
docker compose up -d --build
```

With `APP_DOMAIN=localhost` Caddy issues a certificate from its own internal CA, so
`https://localhost` works immediately; the browser warns about the CA unless you trust it. For a
real deployment set `APP_DOMAIN` to the public hostname and Caddy obtains a Let's Encrypt
certificate on first start.

Migrations run as their own service before the API starts — `app` waits for `migrate` to complete
successfully. To apply migrations without restarting the API, run `docker compose run --rm migrate`.

### ⚙️ Environment variables

| Variable                 | Used by   | Meaning                                                                          |
| ------------------------ | --------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`           | API       | PostgreSQL connection string for the application user                            |
| `MIGRATION_DATABASE_URL` | `migrate` | Connection string for migrations; falls back to `DATABASE_URL`                   |
| `HOST`                   | API       | Bind address (default `127.0.0.1`; the image sets `0.0.0.0`)                     |
| `PORT`                   | API       | API port (default `3000`)                                                        |
| `APP_DOMAIN`             | Caddy     | Hostname Caddy serves and requests a certificate for                             |
| `POSTGRES_PASSWORD`      | `db`      | Password for the PostgreSQL superuser inside the container                       |
| `TEST_DATABASE_URL`      | tests     | Test PostgreSQL (default `postgres://postgres:postgres@localhost:5433/postgres`) |
| `API_PROXY_TARGET`       | dev only  | Where the Vite dev server proxies `/api/*` (default `http://127.0.0.1:3000`)     |
| `VITE_API_URL`           | renderer  | API origin, for split-origin deployments; defaults to the page origin            |

## 🤝 Contributing

Read [CLAUDE.md](CLAUDE.md) first, then [docs/plans/STATUS.md](docs/plans/STATUS.md) for the active
phase. [AGENTS.md](AGENTS.md) describes the agent-assisted workflow, and
[CONTRIBUTING.md](CONTRIBUTING.md) the general guidelines.

## 📚 Documentation

- [Design](docs/design/2026-09-15-invoice-expense-system.md) and
  [design review](docs/design/2026-09-15-design-review.md)
- [Implementation status and phase plans](docs/plans)
- [Layout JSON reference](LAYOUT.md)
- [Tutorial](TUTORIAL.md) — inherited from upstream and still describes the desktop app
- [Privacy Policy](PRIVACY-POLICY.md)
- [Terms of Use](TERMS-OF-USE.md)

## 📄 License and credit

MIT, like the upstream project. See [LICENSE](LICENSE).

This is a fork of **[Invoice Builder](https://github.com/piratuks/invoice-builder)** by
[piratuks](https://github.com/piratuks); the invoicing, PDF and e-invoicing engines are their work.
If you want the original offline desktop app, use upstream — and consider supporting it via
[Buy Me a Coffee](https://www.buymeacoffee.com/evaldizi).
