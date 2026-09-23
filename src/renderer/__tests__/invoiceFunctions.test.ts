// Characterisation tests (plan 2.1) for the invoice maths that Phase 2.2 ports into
// `src/backend/shared/tax/`. They pin today's results, including the rounding quirks, so the port
// can be checked against them. Where a result is arguably wrong, the test says so rather than
// hiding it — 2.2 decides what to keep.
import { DiscountType } from '../shared/enums/discountType';
import { InvoiceItemTaxType, InvoiceTaxType } from '../shared/enums/taxType';
import type { InvoiceItem, InvoicePayment } from '../shared/types/invoice';
import {
  calcDiscount,
  calcSurcharge,
  calcTax,
  calcUnitPrice,
  getBalanceDue,
  getInvoiceItemLevelTaxDiscount,
  getInvoiceItemTotal,
  getInvoiceTotal,
  getPaidAmount
} from '../shared/utils/invoiceFunctions';

// Only the fields the maths reads: the unit price lives on the snapshot, not the item.
const item = (unitPriceCents: number, quantity: number, taxRate = 0, taxType?: InvoiceItemTaxType) =>
  ({ quantity, taxRate, taxType, invoiceItemSnapshot: { unitPriceCents } }) as unknown as InvoiceItem;

const payment = (amountCents: number) => ({ amountCents }) as unknown as InvoicePayment;

describe('invoice maths (characterisation for the 2.2 tax module)', () => {
  describe('calcUnitPrice', () => {
    it('divides by the subunit only when the currency supports one', () => {
      expect(calcUnitPrice({ amountCents: 12345, supportsSubunit: true, subunit: 100 })).toBe(123.45);
      expect(calcUnitPrice({ amountCents: 12345, supportsSubunit: false })).toBe(12345);
      expect(calcUnitPrice({ amountCents: 12345, supportsSubunit: true, subunit: 0 })).toBe(0);
    });
  });

  describe('calcTax', () => {
    it('adds exclusive tax on top and extracts inclusive tax from within', () => {
      expect(calcTax(10000, 18, InvoiceItemTaxType.exclusive)).toBe(1800);
      // 18% of an inclusive 11800 is 1800, i.e. amount * rate / (100 + rate)
      expect(calcTax(11800, 18, InvoiceItemTaxType.inclusive)).toBe(1800);
    });

    it('returns a negative amount for deducted tax and zero with no tax type', () => {
      expect(calcTax(10000, 10, InvoiceTaxType.deducted)).toBe(-1000);
      expect(calcTax(10000, 18, undefined)).toBe(0);
    });

    it('does not round: it returns the raw fraction', () => {
      expect(calcTax(100, 18, InvoiceTaxType.exclusive)).toBe(18);
      expect(calcTax(101, 18, InvoiceTaxType.exclusive)).toBeCloseTo(18.18, 10);
    });
  });

  describe('calcDiscount and calcSurcharge', () => {
    it('take the fixed amount as given and a percentage of the subtotal otherwise', () => {
      expect(calcDiscount({ subTotal: 10000, discountType: DiscountType.fixed, discountAmount: 250 })).toBe(250);
      expect(calcDiscount({ subTotal: 10000, discountType: DiscountType.percentage, discountPercent: 12.5 })).toBe(
        1250
      );
      expect(calcSurcharge({ subTotal: 10000, surchargeType: DiscountType.fixed, surchargeAmount: 99 })).toBe(99);
      expect(calcSurcharge({ subTotal: 10000, surchargeType: DiscountType.percentage, surchargePercent: 2 })).toBe(200);
    });

    it('return zero when no type is set, whatever the amount or percent says', () => {
      expect(calcDiscount({ subTotal: 10000, discountAmount: 250, discountPercent: 10 })).toBe(0);
      expect(calcSurcharge({ subTotal: 10000, surchargeAmount: 250, surchargePercent: 10 })).toBe(0);
    });
  });

  describe('getInvoiceItemLevelTaxDiscount', () => {
    const items = [item(10000, 1), item(30000, 1)];

    it('splits an invoice discount across items in proportion to their line total', () => {
      const first = getInvoiceItemLevelTaxDiscount({
        unitPrice: 10000,
        quantity: 1,
        taxRate: 0,
        invoiceItems: items,
        discountType: DiscountType.fixed,
        discountAmount: 4000
      });
      // 10000 of a 40000 subtotal is a quarter of the 4000 discount
      expect(first.discount).toBe(1000);
    });

    it('taxes the line after its share of the discount', () => {
      const { tax, discount } = getInvoiceItemLevelTaxDiscount({
        unitPrice: 10000,
        quantity: 1,
        taxRate: 18,
        taxType: InvoiceItemTaxType.exclusive,
        invoiceItems: items,
        discountType: DiscountType.percentage,
        discountPercent: 10
      });
      expect(discount).toBe(1000);
      expect(tax).toBe(1620);
    });

    it('ignores a discount that is zero or negative, and a zero subtotal', () => {
      expect(
        getInvoiceItemLevelTaxDiscount({ unitPrice: 10000, quantity: 1, taxRate: 0, invoiceItems: items }).discount
      ).toBe(0);
      expect(
        getInvoiceItemLevelTaxDiscount({ unitPrice: 0, quantity: 1, taxRate: 0, invoiceItems: [item(0, 1)] }).discount
      ).toBe(0);
    });

    it('rounds each line share, so the shares need not add up to the discount', () => {
      // Three equal lines sharing 100: 33.33 each, rounded to 33, so 99 is allocated and 1 is lost.
      const thirds = [item(1000, 1), item(1000, 1), item(1000, 1)];
      const share = (unitPrice: number) =>
        getInvoiceItemLevelTaxDiscount({
          unitPrice,
          quantity: 1,
          taxRate: 0,
          invoiceItems: thirds,
          discountType: DiscountType.fixed,
          discountAmount: 100
        }).discount;
      expect([share(1000), share(1000), share(1000)]).toEqual([33, 33, 33]);
    });
  });

  describe('getInvoiceItemTotal', () => {
    const items = [item(10000, 2)];
    const base = { unitPrice: 10000, quantity: 2, invoiceItems: items };

    it('adds exclusive tax to the line but leaves an inclusive line at its price', () => {
      expect(getInvoiceItemTotal({ ...base, taxRate: 18, taxType: InvoiceItemTaxType.exclusive })).toBe(23600);
      expect(getInvoiceItemTotal({ ...base, taxRate: 18, taxType: InvoiceItemTaxType.inclusive })).toBe(20000);
    });

    it('drops the tax entirely when includeTax is false', () => {
      expect(
        getInvoiceItemTotal({ ...base, taxRate: 18, taxType: InvoiceItemTaxType.exclusive, includeTax: false })
      ).toBe(20000);
    });

    it('subtracts the line share of the invoice discount before tax', () => {
      expect(
        getInvoiceItemTotal({
          ...base,
          taxRate: 18,
          taxType: InvoiceItemTaxType.exclusive,
          discountType: DiscountType.percentage,
          discountPercent: 10
        })
      ).toBe(21240);
    });
  });

  describe('getInvoiceTotal', () => {
    const items = [item(10000, 1), item(20000, 2)];

    it('sums unit price times quantity across the lines', () => {
      expect(getInvoiceTotal({ taxRate: 0, invoiceItems: items })).toBe(50000);
      expect(getInvoiceTotal({ taxRate: 0, invoiceItems: [] })).toBe(0);
    });

    it('applies the discount, then the surcharge on the discounted subtotal', () => {
      // 50000 less 10% is 45000; the 10% surcharge is on 45000, not on 50000
      expect(
        getInvoiceTotal({
          taxRate: 0,
          invoiceItems: items,
          discountType: DiscountType.percentage,
          discountPercent: 10,
          surchargeType: DiscountType.percentage,
          surchargePercent: 10
        })
      ).toBe(49500);
    });

    it('adds the shipping fee after tax and surcharge, untaxed', () => {
      expect(
        getInvoiceTotal({ taxRate: 18, taxType: InvoiceTaxType.exclusive, invoiceItems: items, shippingFee: 1500 })
      ).toBe(60500);
    });

    it('leaves the total at the discounted subtotal when the invoice tax is inclusive', () => {
      expect(
        getInvoiceTotal({
          taxRate: 18,
          taxType: InvoiceTaxType.inclusive,
          invoiceItems: items,
          shippingFee: 1000,
          surchargeType: DiscountType.fixed,
          surchargeAmount: 500
        })
      ).toBe(51500);
    });

    it('adds item tax only for lines that are not inclusive, on top of the invoice tax', () => {
      const mixed = [
        item(10000, 1, 18, InvoiceItemTaxType.exclusive),
        item(10000, 1, 18, InvoiceItemTaxType.inclusive),
        item(10000, 1, 0, undefined)
      ];
      // 30000 subtotal, plus 1800 for the exclusive line only
      expect(getInvoiceTotal({ taxRate: 0, invoiceItems: mixed })).toBe(31800);
    });

    it('charges invoice tax and item tax together, both on the discounted amounts', () => {
      const lines = [item(10000, 1, 10, InvoiceItemTaxType.exclusive)];
      // 10000 less a 1000 discount is 9000: 5% invoice tax = 450, 10% item tax = 900
      expect(
        getInvoiceTotal({
          taxRate: 5,
          taxType: InvoiceTaxType.exclusive,
          invoiceItems: lines,
          discountType: DiscountType.fixed,
          discountAmount: 1000
        })
      ).toBe(10350);
    });

    it('drops all tax when includeTax is false, keeping shipping and surcharge', () => {
      expect(
        getInvoiceTotal({
          taxRate: 18,
          taxType: InvoiceTaxType.exclusive,
          invoiceItems: items,
          includeTax: false,
          shippingFee: 1000
        })
      ).toBe(51000);
    });

    it('returns a fractional total when a percentage does not divide evenly', () => {
      // Pinned as-is: nothing rounds the invoice total today, so it can carry sub-paisa fractions.
      expect(
        getInvoiceTotal({
          taxRate: 0,
          invoiceItems: [item(1000, 1)],
          discountType: DiscountType.percentage,
          discountPercent: 33.33
        })
      ).toBeCloseTo(666.7, 10);
    });
  });

  describe('getPaidAmount and getBalanceDue', () => {
    const items = [item(10000, 1)];

    it('sums the payments, coercing string amounts', () => {
      expect(getPaidAmount([payment(2500), payment(1000)])).toBe(3500);
      expect(getPaidAmount([{ amountCents: '2500' } as unknown as InvoicePayment])).toBe(2500);
      expect(getPaidAmount([])).toBe(0);
    });

    it('is the total less what has been paid, and goes negative on an overpayment', () => {
      expect(getBalanceDue({ taxRate: 0, invoiceItems: items, invoicePayments: [payment(4000)] })).toBe(6000);
      expect(getBalanceDue({ taxRate: 0, invoiceItems: items, invoicePayments: [] })).toBe(10000);
      expect(getBalanceDue({ taxRate: 0, invoiceItems: items, invoicePayments: [payment(12000)] })).toBe(-2000);
    });

    it('counts shipping, surcharge and tax in the balance', () => {
      expect(
        getBalanceDue({
          taxRate: 18,
          taxType: InvoiceTaxType.exclusive,
          invoiceItems: items,
          shippingFee: 500,
          surchargeType: DiscountType.fixed,
          surchargeAmount: 300,
          invoicePayments: [payment(1000)]
        })
      ).toBe(11600);
    });
  });
});
