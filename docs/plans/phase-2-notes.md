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

## Task 2.2 decisions (shared tax module)

`src/backend/shared/tax/`: `money.ts`, `types.ts`, `supplyType.ts`, `financialYear.ts`,
`computeInvoice.ts` and an `index.ts` barrel. Nothing in it imports Node or DOM; the only import
outside the folder is `OTHER_COUNTRY_STATE_CODE` from the import-free `constants/gstStates.ts`,
rather than hard-coding `96` a second time.

- **The `@tax` alias is renderer-only, not in `tsconfig.webserver.json`.** The plan asks for all
  three, but `tsc` does not rewrite path aliases when it emits, and the backend ships compiled
  CommonJS from `dist-be` with no runtime resolver. A `paths` entry there would typecheck and then
  fail at runtime with "Cannot find module '@tax'". This matches what the repo already does:
  `@shared` is in `tsconfig.app.json` and `vite.config.ts` only, and every backend file imports
  relatively. Backend code should import `../tax`.
- **Integer paisa throughout**, with `roundHalfUp` rounding half _away from zero_ — `Math.round`
  rounds half towards +∞, which would give -2 for -2.5.
- **Rates are basis points**, so 2.5% is 250 and the multiplication stays exact until the single
  division. Precision holds while `amount × basisPoints` is inside 2^53, about ₹2.2 × 10^11 at the
  top slab.
- **CGST and SGST each take half the _rate_, not half the tax.** Halving a rounded total can leave
  the two heads a paisa apart; halving the rate cannot. At 2.5% on 1010 paisa both come to 13.
- **The discount is split across lines with a largest-remainder allocation**, so the shares add up
  to the discount exactly. The legacy renderer rounded each share independently and lost the
  residual (three equal lines sharing 100 allocated 99); it never showed up because the legacy
  invoice total was computed from the subtotal rather than from the lines. Now the lines and the
  totals reconcile, which the GST summary and the PDF both need.
- **The discount is capped at the subtotal.** The legacy maths let a discount larger than the
  subtotal drive the total negative; a negative taxable value is meaningless to GST.
- **Rounding the discount, not the total.** 12.5% of 37500 is 4687.5. The module rounds the
  discount to 4688 and the taxable value is exactly `subtotal - discount`. Rounding the total
  instead would have given 32813 and left the printed discount and total failing to reconcile by a
  paisa. This is the one place the ported maths can differ from the legacy result by 1 paisa.
- **Order of operations** (the invoice total depends on it): gross per line → discount split across
  lines → GST per line on what is left, extracted from the price when `pricesIncludeTax` →
  surcharge on the discounted subtotal, untaxed → shipping last, untaxed. The surcharge base
  matches the legacy behaviour 2.1 pinned.
- **`financialYear`** takes a date-only string as a calendar date and shifts a timestamp into IST
  first, so `2026-03-31T20:00:00Z` is already 1 April in India and belongs to `26-27`. It throws on
  an unparseable date.
- **`formatDocNumber`** throws rather than returning something over the 16 characters D20 budgets;
  `ABCCN/25-26/9999` is exactly 16.
- **Tests.** `tax/__tests__/tax.spec.ts`, 35 cases: all six supply types plus B2C, inclusive and
  exclusive pricing, a mixed-rate HSN summary that adds back to the invoice totals, fixed and
  percentage discounts with the rounding edge cases, the surcharge base, untaxed shipping, foreign
  currency, the FY boundary at 31 March and 1 April, and the number format lengths.
  - `renderer/__tests__/taxParity.test.ts` runs the legacy `getInvoiceTotal` and `computeInvoice`
    over the same inputs and compares them, which is how the plan's "must still pass with the same
    results in paisa" is actually discharged rather than asserted. It also proves the `@tax` alias
    resolves. Where the legacy total was already whole paisa the two agree exactly; where it was
    not, they are within a paisa, for the reason above.
- **Check:** prettier, lint and typecheck clean; `npm test` 25 files, 242 passed and 3 todo;
  `npm run build` green.

## Task 2.3 decisions (invoice scoping migration)

**Named `0006-invoice-scoping.sql`, not `0004`.** The plan predates Phase 1, which already shipped
`0004-rls-access.sql` and `0005-access-admin.sql`.

**It is the expand half of an expand/contract pair.** The plan has 2.3 drop the legacy tax columns,
re-key `invoice_sequences`, make the scope columns `NOT NULL` and turn on RLS for `invoices` and
friends - but nothing populates a scope column until the service rewrite in 2.4. Doing all of that
here would leave the service, the suite and the app broken at this commit, so 2.3 is additive only
and the destructive half goes with 2.4, which is the first point at which the old paths fall out of
use. The migration header lists the contract steps so they cannot be forgotten:

- `NOT NULL` on `invoices.office_id`, `clients/items/banks/presets.business_id` and the new
  `invoice_sequences` key
- the `invoices (clientId, businessId) -> clients (id, business_id)` composite FK (C3)
- drop `invoices.taxName/taxRate/taxType`, `invoice_items.taxRate/taxType`, `items.taxRate/taxType`
- drop the old `invoice_sequences` `businessId`/`clientId` columns and their unique key
- drop `settings.invoicePrefix`/`invoiceSuffix`
- RLS on `invoices`, its child tables, `clients`, `items`, `banks`, `presets`, `invoice_sequences`

Two findings that forced the split, both caught by the tests rather than assumed:

- **The customer composite FK cannot go on yet.** `invoices."clientId"` and `"businessId"` are both
  already `NOT NULL`, so `(clientId, businessId) -> clients (id, business_id)` is enforced the
  moment it exists - and every existing customer has a NULL `business_id`. It broke all 18 invoice
  service tests. `(office_id, "businessId")` and `(original_invoice_id, office_id)` are fine, since
  `office_id` is still NULL and a composite FK with a NULL column is not enforced under MATCH
  SIMPLE. The unique indexes the deferred FK needs are created here, so the contract step is one
  `ALTER TABLE`.
- **RLS on existing tables has to wait too.** An office- or company-scoped policy with a NULL scope
  column denies everything, so turning it on now would stop the API creating invoices and
  customers at all. Only the tables this migration creates get policies: `office_bank_accounts`
  and `invoice_office_snapshots`, the latter through a new `app_invoice_visible()` definer function
  that reaches the parent invoice's office - the pattern every invoice child table will use.

Other decisions:

- **`country_code` is not added twice.** `clients` already carries `"countryCode"` for Peppol and
  the client snapshot carries `"clientCountryCode"`; that is the same fact GST needs for a foreign
  place of supply. Both are reused, with `'IN'` defaulted on `clients`, rather than adding a second
  column that means the same thing. Only `gstin`, `state_code` and `is_sez` are new.
- **`gst_rates` carries no RLS**, like `currencies` and `units`: it is a global reference table and
  the `admin.settings` permission on the route is what gates writing to it. Seeded 0, 0.25, 1.5, 3,
  5, 18 and 40 per the plan (binding condition 8: `NUMERIC`, admin-editable).
- **`"issuedAt"` becomes `date`** - a business date on the IST calendar - while the new `issued_at`
  is the `timestamptz` recording when the issue happened. Both exist, per design 7.2.
- **CHECK constraints carry the lifecycle rules** so they hold whatever the service does: an issued
  invoice has a number, only a cancelled one has cancellation details, `invoiceType` of
  `credit_note` holds exactly when `original_invoice_id` is set, the supply type is one of the six
  the tax module knows, the place of supply is two digits and any exchange rate is positive.
- **Numbering** is a partial unique on `(office_id, "invoiceType", "invoiceNumber")` where the
  number is not null, so unnumbered drafts never collide. The legacy
  `(businessId, invoiceFullNumber, clientId, invoiceType)` key is dropped here, since no code names
  it and it would block per-office series.
- **Tests:** new `invoiceScoping.schema.spec.ts`, 19 cases plus 1 todo for the deferred FK, over
  the seed, the composite FKs, the lifecycle checks, nullable draft numbers, the date type, the
  series uniqueness and the RLS on the new tables, including a cross-office denial as `app_user`.
  `baseline.schema.spec.ts` gains the new columns under `LATER_ADDITIONS` (`INTENTIONAL_DROPS`
  stays empty: nothing is dropped yet). `access.rls.spec.ts` enumerates every RLS-enabled table
  and every `app_*`/`auth_*` function, so both of its structure assertions were updated - the
  function count guard correctly caught `app_invoice_visible` arriving.
- **Check:** prettier, lint and typecheck clean. 18 test files pass, 196 passed and 4 todo. The
  remaining 5 files could not run: Windows Application Control is blocking
  `node_modules/argon2/prebuilds/win32-x64/argon2.glibc.node` after an OS update during this
  session, so every file that transitively imports argon2 fails to load. It is unrelated to this
  migration - `routes.permissions.spec.ts` opens no database - and needs the policy to allow that
  file, or argon2 reinstalled, on the host.
