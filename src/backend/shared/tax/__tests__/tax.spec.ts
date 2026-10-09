// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computeInvoice } from '../computeInvoice';
import { MAX_DOC_NUMBER_LENGTH, financialYear, formatDocNumber } from '../financialYear';
import { allocate, applyBasisPoints, roundHalfUp, toBasisPoints } from '../money';
import { deriveSupplyType } from '../supplyType';
import type { SupplyType, TaxLine } from '../types';

const line = (unitPriceCents: number, quantity: number, gstRate: number, hsnSac?: string): TaxLine => ({
  unitPriceCents,
  quantity,
  gstRate,
  hsnSac
});

const compute = (supplyType: SupplyType, lines: TaxLine[], overrides = {}) =>
  computeInvoice({ lines, supplyType, pricesIncludeTax: false, ...overrides });

describe('money helpers', () => {
  it('rounds half away from zero in both directions', () => {
    expect([roundHalfUp(2.5), roundHalfUp(3.5), roundHalfUp(2.4)]).toEqual([3, 4, 2]);
    expect([roundHalfUp(-2.5), roundHalfUp(-3.5), roundHalfUp(-2.4)]).toEqual([-3, -4, -2]);
  });

  it('turns a percentage into basis points and applies it', () => {
    expect([toBasisPoints(18), toBasisPoints(2.5), toBasisPoints(0.25)]).toEqual([1800, 250, 25]);
    expect(applyBasisPoints(10000, 1800)).toBe(1800);
    expect(applyBasisPoints(333, 1800)).toBe(60); // 59.94 rounds up
  });

  it('allocates a total across weights so the shares add back up exactly', () => {
    // 100 across three equal lines is 33.33 each: the residual paisa has to land somewhere.
    const thirds = allocate(100, [1000, 1000, 1000]);
    expect(thirds.reduce((sum, share) => sum + share, 0)).toBe(100);
    expect(thirds).toEqual([34, 33, 33]);

    const weighted = allocate(4000, [10000, 30000]);
    expect(weighted).toEqual([1000, 3000]);
    expect(allocate(100, [0, 0])).toEqual([0, 0]);
    expect(allocate(0, [10, 20])).toEqual([0, 0]);
  });
});

describe('deriveSupplyType', () => {
  it('splits intra- and inter-state on the office state against the place of supply', () => {
    expect(deriveSupplyType({ officeState: '29', pos: '29' })).toBe('intra_state');
    expect(deriveSupplyType({ officeState: '29', pos: '27' })).toBe('inter_state');
  });

  it('treats a B2C supply exactly like a B2B one: only the place of supply matters', () => {
    expect(deriveSupplyType({ officeState: '29', pos: '29', clientIsSez: false })).toBe('intra_state');
    expect(deriveSupplyType({ officeState: '29', pos: '27', clientIsSez: false })).toBe('inter_state');
  });

  it('makes a place of supply of 96 an export, on the LUT choice', () => {
    expect(deriveSupplyType({ officeState: '29', pos: '96', exportWithLut: true })).toBe('export_lut');
    expect(deriveSupplyType({ officeState: '29', pos: '96', exportWithLut: false })).toBe('export_igst');
  });

  it('makes an SEZ client an SEZ supply, on the LUT choice, even within the office state', () => {
    expect(deriveSupplyType({ officeState: '29', pos: '29', clientIsSez: true, exportWithLut: true })).toBe('sez_lut');
    expect(deriveSupplyType({ officeState: '29', pos: '29', clientIsSez: true, exportWithLut: false })).toBe(
      'sez_igst'
    );
  });

  it('lets export win over SEZ, since a foreign place of supply is not an SEZ supply', () => {
    expect(deriveSupplyType({ officeState: '29', pos: '96', clientIsSez: true, exportWithLut: true })).toBe(
      'export_lut'
    );
  });
});

describe('computeInvoice across the supply types', () => {
  const lines = [line(100000, 1, 18)];

  it('splits an intra-state supply into equal CGST and SGST at half the rate', () => {
    const result = compute('intra_state', lines);
    expect({ cgst: result.cgstCents, sgst: result.sgstCents, igst: result.igstCents }).toEqual({
      cgst: 9000,
      sgst: 9000,
      igst: 0
    });
    expect(result.taxableCents).toBe(100000);
    expect(result.totalCents).toBe(118000);
  });

  it('charges IGST at the full rate on an inter-state supply', () => {
    const result = compute('inter_state', lines);
    expect({ cgst: result.cgstCents, sgst: result.sgstCents, igst: result.igstCents }).toEqual({
      cgst: 0,
      sgst: 0,
      igst: 18000
    });
    expect(result.totalCents).toBe(118000);
  });

  it('charges IGST on an export or SEZ supply that pays tax', () => {
    expect(compute('export_igst', lines).igstCents).toBe(18000);
    expect(compute('sez_igst', lines).igstCents).toBe(18000);
  });

  it('charges nothing at all on an export or SEZ supply under LUT, keeping the taxable value', () => {
    for (const supplyType of ['export_lut', 'sez_lut'] as const) {
      const result = compute(supplyType, lines);
      expect({ taxable: result.taxableCents, tax: result.taxCents, total: result.totalCents }).toEqual({
        taxable: 100000,
        tax: 0,
        total: 100000
      });
    }
  });
});

describe('computeInvoice pricing and the HSN summary', () => {
  it('adds exclusive tax on top of the price', () => {
    const result = compute('intra_state', [line(50000, 2, 18)]);
    expect(result.subtotalCents).toBe(100000);
    expect(result.taxableCents).toBe(100000);
    expect(result.totalCents).toBe(118000);
  });

  it('extracts inclusive tax from within the price, leaving the total at the price', () => {
    const result = compute('intra_state', [line(118000, 1, 18)], { pricesIncludeTax: true });
    expect(result.taxableCents).toBe(100000);
    expect({ cgst: result.cgstCents, sgst: result.sgstCents }).toEqual({ cgst: 9000, sgst: 9000 });
    expect(result.totalCents).toBe(118000);
  });

  it('ignores inclusive pricing under LUT, where there is no tax to take out', () => {
    const result = compute('export_lut', [line(118000, 1, 18)], { pricesIncludeTax: true });
    expect(result.taxableCents).toBe(118000);
    expect(result.taxCents).toBe(0);
  });

  it('groups the summary by HSN and rate, and adds up to the invoice totals', () => {
    const result = compute('inter_state', [
      line(10000, 1, 18, '9983'),
      line(20000, 1, 18, '9983'),
      line(30000, 2, 5, '9954'),
      line(40000, 1, 18, '9954')
    ]);

    expect(result.hsnSummary.map(row => [row.hsnSac, row.gstRate, row.quantity, row.taxable, row.igst])).toEqual([
      ['9954', 5, 2, 60000, 3000],
      ['9954', 18, 1, 40000, 7200],
      ['9983', 18, 2, 30000, 5400]
    ]);
    expect(result.hsnSummary.reduce((sum, row) => sum + row.taxable, 0)).toBe(result.taxableCents);
    expect(result.hsnSummary.reduce((sum, row) => sum + row.igst, 0)).toBe(result.igstCents);
  });

  it('keeps lines without an HSN in their own summary row', () => {
    const result = compute('inter_state', [line(10000, 1, 18), line(10000, 1, 18, '9983')]);
    expect(result.hsnSummary.map(row => row.hsnSac)).toEqual(['', '9983']);
  });
});

describe('computeInvoice discount, surcharge and shipping', () => {
  const lines = [line(10000, 1, 18), line(30000, 1, 18)];

  it('takes a fixed discount as given and splits it across lines by their gross', () => {
    const result = compute('inter_state', lines, { discount: { type: 'fixed', amountCents: 4000 } });
    expect(result.discountCents).toBe(4000);
    expect(result.lines.map(item => item.discountCents)).toEqual([1000, 3000]);
    expect(result.taxableCents).toBe(36000);
    expect(result.igstCents).toBe(6480);
  });

  it('takes a percentage discount off the subtotal', () => {
    const result = compute('inter_state', lines, { discount: { type: 'percentage', percent: 10 } });
    expect(result.discountCents).toBe(4000);
    expect(result.taxableCents).toBe(36000);
  });

  it('never lets the discount exceed the subtotal, so no tax head can go negative', () => {
    const result = compute('inter_state', lines, { discount: { type: 'fixed', amountCents: 999999 } });
    expect(result.discountCents).toBe(40000);
    expect({ taxable: result.taxableCents, tax: result.taxCents, total: result.totalCents }).toEqual({
      taxable: 0,
      tax: 0,
      total: 0
    });
  });

  it('gives every paisa of the discount to some line, unlike the legacy per-line rounding', () => {
    // Three equal lines sharing 100: the old renderer maths rounded each to 33 and lost a paisa.
    const thirds = [line(1000, 1, 0), line(1000, 1, 0), line(1000, 1, 0)];
    const result = compute('inter_state', thirds, { discount: { type: 'fixed', amountCents: 100 } });
    expect(result.lines.map(item => item.discountCents)).toEqual([34, 33, 33]);
    expect(result.lines.reduce((sum, item) => sum + item.discountCents, 0)).toBe(100);
    expect(result.taxableCents).toBe(2900);
  });

  it('charges the surcharge on the discounted subtotal and leaves it untaxed', () => {
    const result = compute('inter_state', lines, {
      discount: { type: 'percentage', percent: 10 },
      surcharge: { type: 'percentage', percent: 10 }
    });
    // 10% of the discounted 36000, not of the 40000 subtotal
    expect(result.surchargeCents).toBe(3600);
    expect(result.igstCents).toBe(6480);
    expect(result.totalCents).toBe(36000 + 6480 + 3600);
  });

  it('adds shipping last, untaxed', () => {
    const result = compute('inter_state', lines, { shippingCents: 1500 });
    expect(result.igstCents).toBe(7200);
    expect(result.totalCents).toBe(40000 + 7200 + 1500);
  });

  it('rounds each tax head half up, per line', () => {
    // 333 at 18% is 59.94 per line, which rounds to 60 on each of two lines, not 120 on 666.
    const result = compute('inter_state', [line(333, 1, 18), line(333, 1, 18)]);
    expect(result.lines.map(item => item.igst)).toEqual([60, 60]);
    expect(result.igstCents).toBe(120);
  });

  it('halves the rate rather than the tax for CGST and SGST, so the two heads stay equal', () => {
    // 2.5% of 1010 is 25.25: half the rate on each head gives 12.63 → 13, not a split of 25.
    const result = compute('intra_state', [line(1010, 1, 2.5)]);
    expect(result.cgstCents).toBe(13);
    expect(result.sgstCents).toBe(13);
    expect(result.cgstCents).toBe(result.sgstCents);
  });
});

describe('computeInvoice in a foreign currency', () => {
  it('converts the taxable value, the tax and the total at the given rate', () => {
    const result = compute('export_igst', [line(100000, 1, 18)], { exchangeRate: 83.5 });
    expect(result.totalCents).toBe(118000);
    expect(result.taxableInrCents).toBe(8350000);
    expect(result.taxInrCents).toBe(1503000);
    expect(result.totalInrCents).toBe(9853000);
  });

  it('leaves the INR totals equal to the paisa totals at a rate of 1', () => {
    const result = compute('intra_state', [line(12345, 3, 18)]);
    expect(result.exchangeRate).toBe(1);
    expect(result.totalInrCents).toBe(result.totalCents);
  });
});

describe('financialYear', () => {
  it('starts the year on 1 April, IST', () => {
    expect(financialYear('2026-03-31')).toBe('25-26');
    expect(financialYear('2026-04-01')).toBe('26-27');
    expect(financialYear('2026-12-31')).toBe('26-27');
    expect(financialYear('2027-01-01')).toBe('26-27');
  });

  it('reads a timestamp in IST, not UTC', () => {
    // 20:00 UTC on 31 March is 01:30 on 1 April in India, so it belongs to the new year.
    expect(financialYear('2026-03-31T20:00:00Z')).toBe('26-27');
    expect(financialYear('2026-03-31T10:00:00Z')).toBe('25-26');
  });

  it('pads the turn of the century', () => {
    expect(financialYear('2099-04-01')).toBe('99-00');
    expect(financialYear('2100-04-01')).toBe('00-01');
  });

  it('rejects a date it cannot read', () => {
    expect(() => financialYear('not-a-date')).toThrow(/Invalid date/);
  });
});

describe('formatDocNumber', () => {
  it('formats invoices, credit notes and quotations', () => {
    expect(formatDocNumber('BLR', 'invoice', '26-27', 1)).toBe('BLR/26-27/0001');
    expect(formatDocNumber('BLR', 'credit_note', '26-27', 42)).toBe('BLRCN/26-27/0042');
    expect(formatDocNumber('BLR', 'quotation', '26-27', 9999)).toBe('BLRQ/26-27/9999');
  });

  it('fits the longest number the format allows into the 16 characters D20 budgets', () => {
    const longest = formatDocNumber('ABC', 'credit_note', '25-26', 9999);
    expect(longest).toBe('ABCCN/25-26/9999');
    expect(longest).toHaveLength(MAX_DOC_NUMBER_LENGTH);
  });

  it('accepts a two-character office code', () => {
    expect(formatDocNumber('MU', 'invoice', '26-27', 7)).toBe('MU/26-27/0007');
  });

  it('throws rather than emitting a number that will not fit', () => {
    expect(() => formatDocNumber('TOOLONG', 'credit_note', '25-26', 9999)).toThrow(/over the 16 allowed/);
    expect(() => formatDocNumber('ABC', 'credit_note', '25-26', 99999)).toThrow(/over the 16 allowed/);
  });
});
