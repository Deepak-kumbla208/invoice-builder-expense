export interface Business {
  id?: number;
  logo?: Uint8Array;
  email?: string;
  phone?: string;
  name: string;
  shortName: string;
  role?: string;
  address?: string;
  website?: string;
  additional?: string;
  vatCode?: string;
  peppolEndpointId?: string;
  countryCode?: string;
  code?: string;
  peppolEndpointSchemeId?: string;
  // Legacy payment info. New payment info is via Bank
  paymentInformation?: string;
  isArchived: boolean;
  fileSize?: number;
  fileType?: string;
  fileName?: string;
  description?: string;
  legal_name?: string | null;
  pan?: string | null;
  default_layout_id?: number | null;
  default_style_profile_id?: number | null;
  createdAt: string;
  updatedAt: string;
  invoiceCount: number;
  quotesCount: number;
}
