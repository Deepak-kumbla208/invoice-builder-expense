# Phase 2: Invoices (office scoping, GST, numbering, issue/cancel, credit notes)

**Goal:** Every invoice belongs to an office. Invoices are GST-correct, numbered at issue per office per FY, and locked after issue, with credit notes and cancellation. Customers, items, banks and presets are scoped to a company. The existing form, preview and PDF engine are reused.

**Design refs:** D4, D6, D7, D8, D13, D16–D21. Design §7.2, §8 Invoices, §9 invoice form. Review S5–S11, S15, S16, C3, U7, U8.
**Prereqs:** Phase 1 done. **User sign-off A2–A6** (design §3a).
**Branch:** `phase-2-invoices`

**Rule:** before editing `invoices.ts`, read only the functions named in the task. Write or adjust the test first, then change the code.

---

## Tasks

### 2.1 Characterisation tests
- Extend `services/__tests__/invoices.spec.ts` to pin the current behaviour you intend to keep: item and discount maths, surcharge, shipping, partial payments, status transitions (unpaid/partially/paid/closed), duplicate content (minus number), quote → invoice content, and snapshot contents.
- Mark tests that will intentionally change (numbering, snapshots from browser) as `it.todo` with a note referencing D17.

### 2.2 Shared tax module
- `src/backend/shared/tax/` holds pure TypeScript with no Node or DOM imports. Add a path alias `@tax` in `tsconfig.app.json`, `tsconfig.webserver.json` and `vite.config.ts`.
  - `computeInvoice({ lines, pricesIncludeTax, supplyType, discount, surcharge, shipping, exchangeRate })` returns per-line `{ taxable, cgst, sgst, igst }`, `hsnSummary` and totals in **integer paisa** plus INR totals. Rounding is half-up per line and per head.
  - `deriveSupplyType({ officeState, pos, clientIsSez, exportWithLut })`.
  - `financialYear(dateISO)` → `'26-27'` (IST calendar date, 1 April boundary).
  - `formatDocNumber(code, docType, fy, seq)`, with a ≤16-character assertion.
- Unit tests:
  - intra, inter, B2C, export LUT, export IGST, SEZ LUT and SEZ IGST
  - inclusive and exclusive pricing, with a mixed-rate HSN summary
  - discount fixed and percentage, with paisa rounding edge cases
  - FY boundary at 31 Mar and 1 Apr, and number format lengths
- Port the discount/surcharge/shipping maths from `src/renderer/shared/utils/invoiceFunctions.ts` (lines ~33–43, 153–210). The characterisation tests from 2.1 must still pass with the same results in paisa.

### 2.3 Migration `0004-invoice-scoping.sql`
- `clients` gains `business_id NOT NULL`, `gstin`, `state_code`, `country_code DEFAULT 'IN'`, `is_sez`, `uuid`, and `UNIQUE(id, business_id)`.
- `items` gains `business_id`, `hsn_sac` and `gst_rate NUMERIC(5,2)`; legacy `taxRate`/`taxType` are dropped.
- `banks` gains `business_id`. New table `office_bank_accounts`. `presets` gains `business_id`.
- New table `gst_rates` (seeded with 0, 0.25, 1.5, 3, 5, 18, 40; admin-editable; **verify with the accountant**).
- `invoices`:
  - New columns: `office_id`, `created_by`, `uuid`, `document_status`, `original_invoice_id`, `supply_type`, `place_of_supply_state_code`, `prices_include_tax`, `exchange_rate_to_inr`, `exchange_rate_source`, `exchange_rate_date`, `subtotal_cents`, `tax_cents`, `total_cents`, `total_inr_cents`, and `issued_by`/`issued_at`/`cancelled_by`/`cancelled_at`/`cancel_reason`.
  - `invoiceType` gains `credit_note`. `invoiceNumber` becomes NULLable. `issuedAt` becomes `DATE`.
  - Legacy invoice tax columns are dropped.
  - Composite FKs: `(office_id, businessId)`, `(clientId, businessId)`, `(original_invoice_id, office_id)`.
  - Unique keys from legacy migrations 22, 24 and 25 are dropped, replaced by `UNIQUE (office_id, invoiceType, invoiceNumber) WHERE invoiceNumber IS NOT NULL`.
- `invoice_items` gains `hsn_sac`, `gst_rate`, `cgst_cents`, `sgst_cents` and `igst_cents`; legacy item tax columns are dropped.
- `invoice_payments` gains `amount_inr_cents` and `reference`.
- New table `invoice_office_snapshots`. The client snapshot gains `gstin`, `state_code`, `country_code` and `is_sez`.
- `invoice_sequences` is re-keyed to `(office_id, invoice_type, financial_year)` with `next_sequence`.
- Remove the global prefix and suffix settings columns.
- RLS (ENABLE + FORCE, separate policies):
  - `invoices` by `office_id`; child tables via `EXISTS` on the parent invoice.
  - `clients`, `items`, `banks`, `presets` and `office_bank_accounts` by `business_id` / `office_id`.
  - `invoice_sequences` by `office_id`.
  - Indexes on all scope columns.
- Update `legacy-columns.json` `INTENTIONAL_DROPS`, then delete that fixture and test at the end of this phase.

### 2.4 Invoice service changes (`services/invoices.ts` and new `services/invoiceLifecycle.ts`)
- `addInvoice` / `updateInvoice`:
  - Draft only. Require `office_id`; the company follows from the office.
  - Validate the client, items, bank and preset belong to the same company (service check).
  - Recompute totals through `@tax` and store them; ignore browser totals and number fields.
  - Snapshots may refresh while in draft.
  - Updating an issued invoice only allows notes and payments (409 otherwise).
- Remove manual numbering: `getDuplicateInvoiceNumber`, `processSequence`, `processSequenceOnUpdate`, `getNextSequence` / `GET /api/invoices/sequence`, and the number handling in `duplicateInvoice` (it now creates a draft without a number).
- Quote → invoice conversion creates a draft invoice.
- `issueInvoice(id)`, with checks in this order:
  1. Status is draft.
  2. The office has a GSTIN (not needed for quotes).
  3. `issuedAt` ≤ today (IST) and ≥ the last issued date in the series.
  4. `dueDate >= issuedAt`.
  5. A non-INR invoice has an exchange rate and source.
  6. Export or SEZ LUT requires a valid office LUT.

  Then:
  - Lock the sequence row `FOR UPDATE` (upsert with `ON CONFLICT`) and assign the number.
  - **Rebuild all snapshots from the DB** (business, office, client, bank, currency, items, style profile, layout).
  - Recompute totals, set `issued_by`/`issued_at`, and write the audit event.
- `cancelInvoice(id, reason)`: issued with **no payments** (A4); audited.
- `createCreditNote(originalId, lines)`:
  - The original must be issued, not cancelled.
  - Positive amounts, capped at the uncredited value.
  - Created as a draft; issuing it uses the `CN` series.
- `balance = total − payments − issued credit notes`. The payment status is derived from the balance.
- `recordPayment` stores `amount_inr_cents` and `reference`.
- `getInvoices` becomes a paged summary query with no binaries, plus `getInvoiceDetail(id)`. `invoice.view` limits results to `created_by = ctx.userId`; `invoice.view_all` shows all rows in scope.
- `deleteInvoice`: drafts only.

### 2.5 Controllers
- New routes from design §8 (issue, cancel, credit-notes, payments, paged list, detail), with zod schemas and `requirePermission`. Every mutation writes an audit event with before/after (no binaries).

### 2.6 Company-scoped setup entities
- Clients, items, banks and presets services, controllers and pages: filter by the selected company and set `business_id` on create.
- Client form gains GSTIN (format check), state, country and SEZ flag. Item form gains HSN/SAC and GST rate (select from `gst_rates`).
- Office page gains bank account selection.
- XLSX import for customers and items goes into the selected company (audited).
- Admin page: GST rates.

### 2.7 Invoice UI (reuse `pages/invoices/Form*`, `Preview/*`)
- **Form:**
  - Office picker (required when "All my offices" is selected; pre-filled for single-office users).
  - Place of supply (defaults from the client; editable, with a hint). Supply type is shown read-only in plain words, and the LUT-vs-IGST choice appears only for export/SEZ.
  - Currency and exchange rate with a source field when not INR.
  - HSN/SAC and GST columns on item rows.
  - Remove the legacy tax name, rate and type controls and the manual invoice number.
- **Actions:** Save draft · Issue (confirm dialog: "This locks the invoice and assigns number …") · Cancel (reason; disabled with a tooltip if payments exist, plus the GSTR-1 warning) · Create credit note · Record payment (with INR received).
- **Issued view:** one help line explaining when to cancel versus raise a credit note.
- **Preview/PDF:**
  - Totals come from `@tax`. Draft PDFs carry a "DRAFT – not a tax invoice" watermark and no number.
  - GST fields appear in the business and client info blocks.
  - New layout block `gstSummary` (HSN, taxable value, CGST, SGST, IGST), added to the validator (V1 and V2) and to the seeded default layout. Update `LAYOUT.md`.
- **List:** server paging; filters for number, customer, company, office, date range, status and document status. The duplicate action creates a draft.
- Remove the `aggregateInvoicesByCurrency` use in the list and totals (reports are handled in Phase 5).

### 2.8 Tests (phase gate)
- `@tax` unit suite (2.2). **Preview equals stored totals:** render the form's computed totals and compare with the service-stored totals for 10 fixture invoices.
- **Lifecycle:**
  - draft has no number; issue assigns one; issue on 31 Mar vs 1 Apr gives different FYs
  - backdating before the last issued date → 409
  - issue with no office GSTIN → 409
  - LUT expired → 409
  - cancel with a payment → 409
  - credit note cap; balance maths; editing an issued invoice → 409
- **Concurrency:** 20 parallel issues in one office → numbers 0001–0020 with no gaps or duplicates.
- **IDOR / RLS:**
  - an invoice referencing another company's client, item, bank or preset is rejected
  - a credit note on another office's invoice is rejected
  - GET, PUT, issue, cancel and delete on another office's invoice → 404
  - an RLS table-suite entry exists for every new scoped table
- **`invoice.view` vs `view_all` scoping.**
- **E2E:** draft → issue → PDF download (numbered, no watermark) → partial payment → credit note → balance; export invoice in USD with LUT shows the LUT reference and zero tax.

## Exit criteria
- [ ] Phase gate green
- [ ] Characterisation tests from 2.1 pass, except the intentional `todo`s, which are now replaced by new-behaviour tests
- [ ] No remaining reference to legacy tax fields, manual numbering, or `invoice_sequences.businessId/clientId`
- [ ] `LAYOUT.md` documents `gstSummary`
- [ ] `docs/plans/STATUS.md` updated
