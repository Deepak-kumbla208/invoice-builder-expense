export const SUPPLY_TYPES = ['intra_state', 'inter_state', 'export_lut', 'export_igst', 'sez_lut', 'sez_igst'] as const;

export type SupplyType = (typeof SUPPLY_TYPES)[number];

export const DOCUMENT_TYPES = ['invoice', 'credit_note', 'quotation'] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** A fixed amount in paisa, or a percentage of the subtotal. */
export type Adjustment = { type: 'fixed'; amountCents: number } | { type: 'percentage'; percent: number };

export type TaxLine = {
  /** Paisa per unit, exactly as stored on the item snapshot. */
  unitPriceCents: number;
  quantity: number;
  /** `invoice_items.gst_rate`, a percentage: 18, 2.5, 0. */
  gstRate: number;
  hsnSac?: string;
  unitName?: string;
};

export type ComputeInvoiceInput = {
  lines: TaxLine[];
  supplyType: SupplyType;
  /** When true, `unitPriceCents` already contains the GST, which is extracted rather than added. */
  pricesIncludeTax: boolean;
  discount?: Adjustment;
  surcharge?: Adjustment;
  shippingCents?: number;
  /** Units of INR per unit of the invoice currency. 1 for INR itself. */
  exchangeRate?: number;
};

export type ComputedLine = {
  hsnSac?: string;
  unitName?: string;
  gstRate: number;
  quantity: number;
  /** `unitPriceCents * quantity`, before any discount. */
  grossCents: number;
  /** This line's share of the invoice discount. The shares add up to the discount exactly. */
  discountCents: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** `taxable + cgst + sgst + igst`. */
  totalCents: number;
};

export type HsnSummaryRow = {
  hsnSac: string;
  gstRate: number;
  quantity: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalCents: number;
};

export type ComputedInvoice = {
  lines: ComputedLine[];
  /** One row per (HSN/SAC, rate) pair, ordered by HSN then rate. */
  hsnSummary: HsnSummaryRow[];
  subtotalCents: number;
  discountCents: number;
  taxableCents: number;
  cgstCents: number;
  sgstCents: number;
  igstCents: number;
  taxCents: number;
  surchargeCents: number;
  shippingCents: number;
  totalCents: number;
  exchangeRate: number;
  taxableInrCents: number;
  taxInrCents: number;
  totalInrCents: number;
};
