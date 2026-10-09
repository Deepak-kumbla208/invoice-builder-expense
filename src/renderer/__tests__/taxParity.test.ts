// Plan 2.2: "the characterisation tests from 2.1 must still pass with the same results in paisa".
// This runs the legacy renderer maths and the new shared module over the same inputs and compares
// them, so the port is checked rather than asserted. Tax is left at zero throughout: the legacy
// taxRate/taxType model is the thing Phase 2 replaces, so only the discount, surcharge and
// shipping behaviour is comparable.
import { computeInvoice } from '@tax';
import { DiscountType } from '../shared/enums/discountType';
import type { InvoiceItem } from '../shared/types/invoice';
import { getInvoiceTotal } from '../shared/utils/invoiceFunctions';

type Case = {
  name: string;
  lines: { unitPriceCents: number; quantity: number }[];
  discountType?: DiscountType;
  discountAmount?: number;
  discountPercent?: number;
  surchargeType?: DiscountType;
  surchargeAmount?: number;
  surchargePercent?: number;
  shippingFee?: number;
};

const CASES: Case[] = [
  {
    name: 'plain lines',
    lines: [
      { unitPriceCents: 10000, quantity: 1 },
      { unitPriceCents: 20000, quantity: 2 }
    ]
  },
  {
    name: 'fixed discount',
    lines: [
      { unitPriceCents: 10000, quantity: 1 },
      { unitPriceCents: 30000, quantity: 1 }
    ],
    discountType: DiscountType.fixed,
    discountAmount: 4000
  },
  {
    name: 'percentage discount',
    lines: [{ unitPriceCents: 12500, quantity: 3 }],
    discountType: DiscountType.percentage,
    discountPercent: 12.5
  },
  {
    name: 'fixed surcharge',
    lines: [{ unitPriceCents: 10000, quantity: 1 }],
    surchargeType: DiscountType.fixed,
    surchargeAmount: 750
  },
  {
    name: 'percentage surcharge on the discounted subtotal',
    lines: [
      { unitPriceCents: 10000, quantity: 1 },
      { unitPriceCents: 30000, quantity: 1 }
    ],
    discountType: DiscountType.percentage,
    discountPercent: 10,
    surchargeType: DiscountType.percentage,
    surchargePercent: 10
  },
  { name: 'shipping only', lines: [{ unitPriceCents: 10000, quantity: 1 }], shippingFee: 1500 },
  {
    name: 'discount, surcharge and shipping together',
    lines: [
      { unitPriceCents: 19999, quantity: 2 },
      { unitPriceCents: 555, quantity: 7 },
      { unitPriceCents: 100000, quantity: 1 }
    ],
    discountType: DiscountType.percentage,
    discountPercent: 7.5,
    surchargeType: DiscountType.fixed,
    surchargeAmount: 1234,
    shippingFee: 999
  },
  { name: 'no lines at all', lines: [] }
];

const legacyItem = (unitPriceCents: number, quantity: number) =>
  ({ quantity, taxRate: 0, invoiceItemSnapshot: { unitPriceCents } }) as unknown as InvoiceItem;

describe('the 2.2 tax module reproduces the legacy discount, surcharge and shipping maths', () => {
  it.each(CASES)('$name', testCase => {
    const legacy = getInvoiceTotal({
      taxRate: 0,
      invoiceItems: testCase.lines.map(line => legacyItem(line.unitPriceCents, line.quantity)),
      discountType: testCase.discountType,
      discountAmount: testCase.discountAmount,
      discountPercent: testCase.discountPercent,
      surchargeType: testCase.surchargeType,
      surchargeAmount: testCase.surchargeAmount,
      surchargePercent: testCase.surchargePercent,
      shippingFee: testCase.shippingFee
    });

    const ported = computeInvoice({
      lines: testCase.lines.map(line => ({ ...line, gstRate: 0 })),
      supplyType: 'inter_state',
      pricesIncludeTax: false,
      discount:
        testCase.discountType === DiscountType.fixed
          ? { type: 'fixed', amountCents: testCase.discountAmount ?? 0 }
          : testCase.discountType === DiscountType.percentage
            ? { type: 'percentage', percent: testCase.discountPercent ?? 0 }
            : undefined,
      surcharge:
        testCase.surchargeType === DiscountType.fixed
          ? { type: 'fixed', amountCents: testCase.surchargeAmount ?? 0 }
          : testCase.surchargeType === DiscountType.percentage
            ? { type: 'percentage', percent: testCase.surchargePercent ?? 0 }
            : undefined,
      shippingCents: testCase.shippingFee
    });

    // The module works in whole paisa throughout, so where the legacy total was already whole
    // paisa the two agree exactly. Where it was not, the module rounds the discount itself — the
    // amount printed on the invoice — rather than the final total, which can land a paisa away
    // from rounding the legacy result. See the dedicated case below.
    expect(Number.isInteger(ported.totalCents)).toBe(true);
    if (Number.isInteger(legacy)) {
      expect(ported.totalCents).toBe(legacy);
    } else {
      expect(Math.abs(ported.totalCents - legacy)).toBeLessThanOrEqual(1);
    }
  });

  it('rounds the discount rather than the total, so the printed figures reconcile', () => {
    // 12.5% of 37500 is 4687.5. The legacy maths left the total at 32812.5, a fraction of a paisa
    // that no invoice can show. Rounding the discount to 4688 keeps subtotal - discount = taxable
    // exact, which is what the GST summary and the PDF both have to add up to.
    const lines = [{ unitPriceCents: 12500, quantity: 3, gstRate: 0 }];
    const ported = computeInvoice({
      lines,
      supplyType: 'inter_state',
      pricesIncludeTax: false,
      discount: { type: 'percentage', percent: 12.5 }
    });

    expect(ported.subtotalCents).toBe(37500);
    expect(ported.discountCents).toBe(4688);
    expect(ported.taxableCents).toBe(32812);
    expect(ported.subtotalCents - ported.discountCents).toBe(ported.taxableCents);
    expect(
      getInvoiceTotal({
        taxRate: 0,
        invoiceItems: [legacyItem(12500, 3)],
        discountType: DiscountType.percentage,
        discountPercent: 12.5
      })
    ).toBe(32812.5);
  });

  it('differs from the legacy maths only where 2.1 flagged it, and deliberately', () => {
    const thirds = [
      { unitPriceCents: 1000, quantity: 1 },
      { unitPriceCents: 1000, quantity: 1 },
      { unitPriceCents: 1000, quantity: 1 }
    ];
    const ported = computeInvoice({
      lines: thirds.map(line => ({ ...line, gstRate: 0 })),
      supplyType: 'inter_state',
      pricesIncludeTax: false,
      discount: { type: 'fixed', amountCents: 100 }
    });
    // The legacy per-line split rounded each share to 33 and lost a paisa; the invoice total was
    // computed from the subtotal instead, so it never saw the gap. The module allocates the
    // residual, so the line shares and the total now agree.
    expect(ported.lines.map(line => line.discountCents)).toEqual([34, 33, 33]);
    expect(ported.lines.reduce((sum, line) => sum + line.taxable, 0)).toBe(ported.taxableCents);

    // A discount larger than the subtotal is capped, where the legacy maths went negative.
    const overDiscounted = computeInvoice({
      lines: [{ unitPriceCents: 1000, quantity: 1, gstRate: 0 }],
      supplyType: 'inter_state',
      pricesIncludeTax: false,
      discount: { type: 'fixed', amountCents: 5000 }
    });
    expect(overDiscounted.totalCents).toBe(0);
    expect(
      getInvoiceTotal({
        taxRate: 0,
        invoiceItems: [legacyItem(1000, 1)],
        discountType: DiscountType.fixed,
        discountAmount: 5000
      })
    ).toBe(-4000);
  });
});
