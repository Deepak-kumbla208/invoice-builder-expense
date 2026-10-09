import { OTHER_COUNTRY_STATE_CODE } from '../constants/gstStates';
import type { SupplyType } from './types';

export type SupplyTypeInput = {
  /** The issuing office's GST state code. */
  officeState: string;
  /** Place of supply: the client's state, or '96' for a foreign client. Editable on the form. */
  pos: string;
  clientIsSez?: boolean;
  /** The user's choice between "Without tax (LUT)" and "Pay IGST" for exports and SEZ supplies. */
  exportWithLut?: boolean;
};

/**
 * Design §7.2: a place of supply of 96 makes it an export, an SEZ client makes it an SEZ supply,
 * and both then split on the LUT choice. Everything else is intra-state when the office and the
 * place of supply share a state and inter-state otherwise. B2C follows the same rule, since the
 * client's GSTIN plays no part in it.
 */
export const deriveSupplyType = ({ officeState, pos, clientIsSez, exportWithLut }: SupplyTypeInput): SupplyType => {
  if (pos === OTHER_COUNTRY_STATE_CODE) return exportWithLut ? 'export_lut' : 'export_igst';
  if (clientIsSez) return exportWithLut ? 'sez_lut' : 'sez_igst';
  return officeState === pos ? 'intra_state' : 'inter_state';
};

/** LUT supplies are zero-rated: the rate still describes the goods, but no tax is charged. */
export const isZeroRated = (supplyType: SupplyType) => supplyType === 'export_lut' || supplyType === 'sez_lut';

/** Only a supply within one state splits into CGST and SGST; everything else charges IGST. */
export const isIntraState = (supplyType: SupplyType) => supplyType === 'intra_state';
