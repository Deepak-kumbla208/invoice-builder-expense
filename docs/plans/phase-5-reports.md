# Phase 5: Reports and exports

**Goal:** Server-side reports for invoices, expenses and reimbursements, with filters and CSV/PDF export. Totals reconcile exactly with the underlying records.

**Design refs:** D6, D18 (INR at issue rate, forex difference). Design §8 Reports, §9 Reports. Review S7, S11, C16.
**Prereqs:** Phase 4 done.
**Branch:** `phase-5-reports`

---

## Tasks

### 5.1 Report service (`services/reports.ts`)

- Each report is one parameterised SQL query run under RLS in `withRequestTx`, requires `report.view`, and uses filters validated by zod (date range, company, office, employee, category, status).
- **Invoices:**
  - By company.
  - By month, based on `issuedAt`.
  - By customer.
  - Paid, partially paid or unpaid.
  - Credit notes.
  - **Forex difference** (INR at issue rate vs INR received).

  All INR figures use the rate at issue; the original currency totals are shown alongside.

- **Expenses:** by company, category, office, employee and month; also pending and approved.
- **Reimbursements:** pending, paid (with payout reference), totals by employee and by company.
- **Receivables ageing:** reuse the Phase 4 query.
- Cancelled invoices and cancelled reimbursements are excluded by default, with a toggle to include them.

### 5.2 Export

- **CSV:** `GET /api/reports/:name?format=csv` streams rows (Node stream with a `pg` cursor), has a UTF-8 BOM (Excel-friendly for ₹), and uses an ISO date in the filename.
- **PDF:** client-side `@react-pdf` table layout reused from the invoice styles. Enabled only when the result has **≤ 2,000 rows**; otherwise the UI offers CSV only, with a message explaining why.
- Existing list XLSX exports stay, scoped by the list filters.

### 5.3 Replace legacy reports page

- `src/renderer/pages/reports/*`: switch to the server endpoints. Delete the client-side aggregation (`aggregateInvoicesByCurrency` and related helpers) and any remaining uses.
- Reports landing page lists the report cards the user can access. Each report page has a `FilterBar`, summary cards, a chart where it helps, a paged table, and export buttons.

### 5.4 Tests (phase gate)

- **Reconciliation fixture:** 2 companies, 3 offices, 40 invoices (mixed currencies, payments, credit notes, a cancelled one) and 60 expenses (all statuses). Each report total equals the sum over the fixture computed independently in the test.
- **Scope:** an Office A user's report excludes Office B, and the same holds for CSV output.
- **CSV:** header row, escaping (commas, quotes, newlines), BOM present, large result streams without loading into memory (10k rows).
- **PDF cap:** above 2,000 rows the PDF option is disabled.

## Exit criteria

- [ ] Phase gate green
- [ ] No client-side aggregation of financial totals remains (`grep` for removed helpers returns nothing)
- [ ] `docs/plans/STATUS.md` updated
