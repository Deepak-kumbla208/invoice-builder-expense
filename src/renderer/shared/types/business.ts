export interface BusinessMeta {
  id: number;
  name: string;
  shortName: string;
  legal_name?: string | null;
  pan?: string | null;
  address?: string;
  role?: string;
  email?: string;
  phone?: string;
  website?: string;
  additional?: string;
  vatCode?: string;
  peppolEndpointId?: string;
  countryCode?: string;
  code?: string;
  peppolEndpointSchemeId?: string;
  // Legacy payment info. New payment info is via Bank
  paymentInformation?: string;
  invoiceCount: number;
  quotesCount: number;
  createdAt: string;
  updatedAt: string;
  fileSize?: number;
  fileType?: string;
  fileName?: string;
  description?: string;
  isArchived: boolean;
}

export interface Business extends BusinessMeta {
  logo?: Uint8Array | null;
}

export interface BusinessWeb extends BusinessMeta {
  logo?: string | null;
}

export interface BusinessAddMeta {
  name: string;
  shortName: string;
  legal_name?: string | null;
  pan?: string | null;
  address?: string;
  role?: string;
  email?: string;
  phone?: string;
  website?: string;
  additional?: string;
  vatCode?: string;
  peppolEndpointId?: string;
  countryCode?: string;
  code?: string;
  peppolEndpointSchemeId?: string;
  // Legacy payment info. New payment info is via Bank
  paymentInformation?: string;
  fileSize?: number;
  fileType?: string;
  fileName?: string;
  description?: string;
  isArchived: boolean;
}

export interface BusinessAdd extends BusinessAddMeta {
  logo?: Uint8Array | null;
}

export interface BusinessUpdate extends BusinessAdd {
  id: number;
}

export interface BusinessAddWeb extends BusinessAddMeta {
  logo?: string | null;
}

export interface BusinessUpdateWeb extends BusinessAddWeb {
  id: number;
}

export interface BusinessFromData {
  id?: number;
  logo?: Uint8Array;
  email?: string;
  phone?: string;
  name: string;
  shortName: string;
  legal_name?: string | null;
  pan?: string | null;
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
  fileSize?: number;
  fileType?: string;
  fileName?: string;
  description?: string;
  isArchived: boolean;
}
