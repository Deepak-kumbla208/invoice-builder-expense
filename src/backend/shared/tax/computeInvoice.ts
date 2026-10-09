import { allocate, applyBasisPoints, roundHalfUp, toBasisPoints } from './money';
import { isIntraState, isZeroRated } from './supplyType';
import type { Adjustment, ComputedInvoice, ComputedLine, ComputeInvoiceInput, HsnSummaryRow, TaxLine } from './types';

const UNCLASSIFIED_HSN = '';

const adjustmentOn = (base: number, adjustment?: Adjustment): number => {
  if (!adjustment) return 0;
  return adjustment.type === 'fixed' ? adjustment.amountCents : roundHalfUp((base * adjustment.percent) / 100);
};

/** Half the rate to each of CGST and SGST, computed from the rate rather than by halving the tax. */
const halfRateTax = (taxable: number, basisPoints: number) => applyBasisPoints(taxable, basisPoints / 2);

const grossOf = (line: TaxLine) => roundHalfUp(line.unitPriceCents * line.quantity);

const summarise = (lines: ComputedLine[]): HsnSummaryRow[] => {
  const rows = new Map<string, HsnSummaryRow>();
  for (const line of lines) {
    const hsnSac = line.hsnSac ?? UNCLASSIFIED_HSN;
    const key = `${hsnSac}|${line.gstRate}`;
    const row = rows.get(key) ?? {
      hsnSac,
      gstRate: line.gstRate,
      quantity: 0,
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      totalCents: 0
    };
    row.quantity += line.quantity;
    row.taxable += line.taxable;
    row.cgst += line.cgst;
    row.sgst += line.sgst;
    row.igst += line.igst;
    row.totalCents += line.totalCents;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.hsnSac.localeCompare(b.hsnSac) || a.gstRate - b.gstRate);
};

/**
 * The one GST calculation, shared by the form preview, the PDF and the server (design §7.2, D18).
 * Everything is integer paisa, rounded half up per line and per tax head.
 *
 * Order of operations, which the invoice total depends on:
 *   1. gross per line, summed into the subtotal
 *   2. the invoice discount, split across lines in proportion to their gross
 *   3. GST per line on what is left, extracted from the price when `pricesIncludeTax`
 *   4. the surcharge on the discounted subtotal, untaxed
 *   5. shipping, untaxed, added last
 */
export const computeInvoice = ({
  lines,
  supplyType,
  pricesIncludeTax,
  discount,
  surcharge,
  shippingCents = 0,
  exchangeRate = 1
}: ComputeInvoiceInput): ComputedInvoice => {
  const gross = lines.map(grossOf);
  const subtotalCents = gross.reduce((sum, amount) => sum + amount, 0);

  // A discount cannot exceed what is being discounted: a negative taxable value is meaningless to
  // GST, so it is capped here rather than propagated into the tax heads.
  const discountCents = Math.min(Math.max(adjustmentOn(subtotalCents, discount), 0), subtotalCents);
  const discountShares = allocate(discountCents, gross);

  const zeroRated = isZeroRated(supplyType);
  const intraState = isIntraState(supplyType);

  const computed: ComputedLine[] = lines.map((line, index) => {
    const basisPoints = zeroRated ? 0 : toBasisPoints(line.gstRate);
    const net = gross[index] - discountShares[index];
    // An inclusive price carries the tax inside it: taxable = net * 100 / (100 + rate).
    const taxable = pricesIncludeTax ? roundHalfUp((net * 10000) / (10000 + basisPoints)) : net;

    const cgst = intraState ? halfRateTax(taxable, basisPoints) : 0;
    const igst = intraState ? 0 : applyBasisPoints(taxable, basisPoints);

    return {
      hsnSac: line.hsnSac,
      unitName: line.unitName,
      gstRate: line.gstRate,
      quantity: line.quantity,
      grossCents: gross[index],
      discountCents: discountShares[index],
      taxable,
      cgst,
      sgst: cgst,
      igst,
      totalCents: taxable + cgst + cgst + igst
    };
  });

  const sum = (pick: (line: ComputedLine) => number) => computed.reduce((total, line) => total + pick(line), 0);
  const taxableCents = sum(line => line.taxable);
  const cgstCents = sum(line => line.cgst);
  const sgstCents = sum(line => line.sgst);
  const igstCents = sum(line => line.igst);
  const taxCents = cgstCents + sgstCents + igstCents;

  const surchargeCents = adjustmentOn(subtotalCents - discountCents, surcharge);
  const totalCents = taxableCents + taxCents + surchargeCents + shippingCents;
  const toInr = (amount: number) => roundHalfUp(amount * exchangeRate);

  return {
    lines: computed,
    hsnSummary: summarise(computed),
    subtotalCents,
    discountCents,
    taxableCents,
    cgstCents,
    sgstCents,
    igstCents,
    taxCents,
    surchargeCents,
    shippingCents,
    totalCents,
    exchangeRate,
    taxableInrCents: toInr(taxableCents),
    taxInrCents: toInr(taxCents),
    totalInrCents: toInr(totalCents)
  };
};
