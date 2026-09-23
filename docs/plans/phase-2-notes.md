# Phase 2 notes

## Task 2.1 decisions (characterisation tests)

The plan says to extend `services/__tests__/invoices.spec.ts` to pin "item and discount maths,
surcharge, shipping" alongside payments, statuses, duplicates and snapshots.

- **The maths is not in the service.** `addInvoice` / `updateInvoice` persist
  `discountAmountCents`, `discountPercent`, `surchargeAmountCents`, `shippingFeeCents` and the
  per-item `taxRate` exactly as the browser sends them; nothing on the server computes a total,
  and `setPaidAtAndClosedAt` only stamps `paidAt`/`closedAt` from the status it is given. Pinning
  the maths through the service would therefore have pinned nothing.
  - So the maths is pinned where it lives: **`src/renderer/__tests__/invoiceFunctions.test.ts`**
    (new, 24 cases) over `shared/utils/invoiceFunctions.ts`, which is the module 2.2 names as the
    source to port into `shared/tax/`. That file had no tests at all before this.
  - Covered: `calcUnitPrice`, `calcTax` (exclusive, inclusive, deducted, none), `calcDiscount` and
    `calcSurcharge` (fixed, percentage, no type), `getInvoiceItemLevelTaxDiscount`,
    `getInvoiceItemTotal`, `getInvoiceTotal` (discount then surcharge on the discounted subtotal,
    shipping untaxed and after tax, inclusive invoice tax, mixed item tax types, and tax suppressed
    altogether), `getPaidAmount` and `getBalanceDue`.
- **Service-level block** `invoice persistence (characterisation)` in `invoices.spec.ts`, 7 cases:
  discount/surcharge/shipping stored verbatim, line items with their snapshot, partial payments as
  separate rows with the status left to the caller, `paidAt`/`closedAt` per status on both add and
  update, the three browser-built snapshots, and duplicate content.
- **Rounding quirks are pinned, not hidden**, because 2.2 has to decide what to keep:
  - `getInvoiceItemLevelTaxDiscount` and `getInvoiceItemTotal` `Math.round` each line's share of an
    invoice discount, so the shares need not add up: three equal lines sharing 100 take 33 each and
    1 is lost. 2.2's "paisa rounding edge cases" must either reproduce this or change it knowingly.
  - No invoice total is rounded at all today, so a percentage discount can leave a sub-paisa
    fraction in the total. Pinned with `toBeCloseTo`.
  - `calcTax` returns a raw fraction; rounding is entirely the caller's business.
- **Duplicates** copy notes, items, shipping and snapshots, and deliberately carry no payments, so
  a duplicate starts unpaid. Confirmed against the database, not assumed.
- **`it.todo` × 3 referencing D17**, for the behaviour Phase 2 intentionally changes: numbering at
  issue per office and financial year with drafts unnumbered, server-rebuilt snapshots, and IST
  issue-date validation (chronological, not in the future).
  - The **existing** `invoice sequence handling` block is left passing rather than converted to
    `it.todo`. It is the current-behaviour baseline that 2.2 and 2.3 must not break by accident;
    2.4 and 2.5 are where numbering actually moves, and that is when those tests get rewritten.
- **Check:** prettier, lint and typecheck clean; `npm test` 23 files, 197 passed and 3 todo.
