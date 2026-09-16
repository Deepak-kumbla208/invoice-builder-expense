# Phase 4: UX (dashboard, office switcher, search, ageing, responsive)

**Goal:** The app feels like one coherent business SaaS product on phone, tablet and desktop. Each role sees a useful dashboard, and nothing appears that the user is not allowed to see.

**Design refs:** D26, D27. Design §9. Review U1, U3, U4, U6, U12, U14.
**Prereqs:** Phase 3 done.
**Branch:** `phase-4-ux`

---

## Tasks

### 4.1 Office switcher

- Top bar selector: "All my offices" or a single office, stored in `authSlice` and `localStorage`. It is **hidden** for single-office users.
- An active filter chip appears on list pages. Lists and the dashboard pass `officeId` when one is selected. The **Approvals queue and notifications ignore it**.
- New-record forms: office is required when "All" is selected, and defaults to the selected office otherwise.

### 4.2 Dashboard (`GET /api/dashboard`)

- The server decides which widgets to return, based on the caller's permissions and scope. Each widget uses one aggregate SQL query under RLS.
  - **Invoices** (`invoice.view_all` or own):
    - Totals are INR at the issue rate, for the current FY.
    - Issued count and amount by company.
    - Outstanding balance.
    - Recent invoices (5).
  - **Receivables ageing** (`invoice.view_all`): outstanding balance in buckets 0–30, 31–60, 61–90 and 90+ days past due.
  - **Expenses** (`expense.view_all`):
    - This month's total by company and by category.
    - Pending approvals count.
    - Recent expenses (5).
  - **Reimbursements** (`reimbursement.view_all`): pending count and amount, and paid this month.
  - **Mine:** my expenses by combined status, my pending reimbursements, and my recent invoices (if permitted).
  - **Setup checklist** (Super Admin, while incomplete).
- Frontend: responsive grid of MUI cards with recharts (bar for company and category, stacked bar for ageing). Each widget is clickable through to the filtered list.

### 4.3 Search and filters

- Shared `FilterBar` component: text search, date range, company, office, status multi-select, and amount range. The state lives in URL query params so views can be shared.
  - **Invoices:** number, customer, company, office, date, status, document status, amount.
  - **Expenses:** employee, company, office, category, date, amount, status, reimbursement status.
- Server: typed filter schemas (zod) → parameterised `WHERE` clauses. Indexes on filter columns (`issuedAt`, `expense_date`, `status`, `office_id`, `submitted_by`).

### 4.4 Receivables ageing page

- **Reports → Receivables ageing:** a per-customer table with the buckets (0–30, 31–60, 61–90, 90+), totals, and a link to each invoice. Filterable by company, office and as-of date.

### 4.5 Responsive pass

- Below `md`, the sidebar becomes a temporary `Drawer`. Below `sm`, the shared `ResponsiveTable` renders cards (one column mapping per list page).
- Invoice form on `sm`: a single-column layout, with the preview opened as a separate route or dialog.
- Touch targets of at least 44 px; sticky primary action bar on mobile forms.

### 4.6 Consistency pass

- Rename all remaining UI strings from "Business" to "Company" (`i18n/en.json`). Remove unused i18n keys for deleted features.
- Empty states for every list page, with the reason and who can fix it.
- Map every API error key to readable text; the `NoAccess` page handles all 404s from detail routes.

### 4.7 Tests (phase gate)

- **Dashboard API:** for each seeded role, the returned widget keys match the expected set, and the values match seeded data. An Office A user's totals exclude Office B.
- **Filter API:** each filter narrows results correctly, and invalid filters → 400.
- **Playwright:** visual smoke at 390, 768 and 1280 px widths for the dashboard, invoice list and form, expense list and form, and the approvals queue (no horizontal scroll, and the primary action is visible).
- **Nav leak test:** for each role, the rendered menu equals `navConfig` filtered by permissions.

## Exit criteria

- [ ] Phase gate green; invoice and expense e2e still green
- [ ] No hidden-but-reachable data: dashboard widgets are gated on the server
- [ ] `docs/plans/STATUS.md` updated
