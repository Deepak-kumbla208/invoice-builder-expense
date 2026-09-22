import { gzip } from 'pako';
import type { EInvoice } from '../enums/einvoice';
import type { InvoiceType } from '../enums/invoiceType';
import type {
  AuditPage,
  AuditQuery,
  Office,
  OfficeAdd,
  OfficeUpdate,
  PermissionGroup,
  Role,
  RoleAdd,
  RoleUpdate,
  TemporaryPassword,
  User,
  UserAdd,
  UserCreated,
  UserUpdate
} from '../types/admin';
import type { AuthProfile, ChangePasswordInput, LoginInput } from '../types/auth';
import type { BankAdd, BankUpdate, BankUpdateWeb, BankWeb } from '../types/bank';
import type { BusinessAdd, BusinessUpdate, BusinessWeb } from '../types/business';
import type { Category, CategoryAdd, CategoryUpdate } from '../types/category';
import type { Client, ClientAdd, ClientUpdate } from '../types/client';
import type { Currency, CurrencyAdd, CurrencyUpdate } from '../types/currency';
import type { ExportMeta } from '../types/exportMeta';
import type { FilterData } from '../types/filter';
import type {
  CustomFieldMeta,
  InvoiceAdd,
  InvoiceAttachment,
  InvoiceAttachmentWeb,
  InvoiceUpdate,
  InvoiceWeb,
  NextSequenceData
} from '../types/invoice';
import type { Item, ItemAdd, ItemUpdate } from '../types/item';
import type { Layout, LayoutAdd, LayoutUpdate } from '../types/layouts';
import type { PresetAdd, PresetUpdate, PresetWeb } from '../types/preset';
import type { Response } from '../types/response';
import type { Settings, SettingsUpdate } from '../types/settings';
import type {
  StyleProfileAdd,
  StyleProfileUpdate,
  StyleProfileUpdateWeb,
  StyleProfileWeb
} from '../types/styleProfiles';
import type { Unit, UnitAdd, UnitUpdate } from '../types/unit';
import { base64ToBytes, toDataUrl } from '../utils/dataUrlFunctions';

const fileToBase64 = async (file?: Uint8Array | null) => {
  if (!file) return null;
  const dataUrl = await toDataUrl(file);
  return dataUrl.split(',')[1] ?? null;
};

const base64ToBytesOrUndef = (b64?: string | null) => (b64 ? base64ToBytes(b64) : undefined);

const mapBankFromWeb = <T extends BankWeb | BankUpdateWeb>(b: T) => ({
  ...b,
  qrCode: base64ToBytesOrUndef(b.qrCode)
});

const mapBankToWeb = async <T extends BankUpdate | BankAdd>(data: T) => ({
  ...data,
  qrCode: await fileToBase64(data.qrCode)
});

const mapPresetFromWeb = <T extends PresetWeb>(b: T) => ({
  ...b,
  signatureData: base64ToBytesOrUndef(b.signatureData),
  businessLogo: base64ToBytesOrUndef(b.businessLogo),
  qrCode: base64ToBytesOrUndef(b.qrCode),
  styleProfileWatermarkFileData: base64ToBytesOrUndef(b.styleProfileWatermarkFileData),
  styleProfilePaidWatermarkFileData: base64ToBytesOrUndef(b.styleProfilePaidWatermarkFileData)
});

const mapPresetToWeb = async <T extends PresetUpdate | PresetAdd>(data: T) => ({
  ...data,
  signatureData: await fileToBase64(data.signatureData)
});

const mapStyleProfileFromWeb = <T extends StyleProfileWeb | StyleProfileUpdateWeb>(sp: T) => ({
  ...sp,
  paidWatermarkFileData: base64ToBytesOrUndef(sp.paidWatermarkFileData),
  watermarkFileData: base64ToBytesOrUndef(sp.watermarkFileData)
});

const mapStyleProfileToWeb = async <T extends StyleProfileUpdate | StyleProfileAdd>(data: T) => ({
  ...data,
  paidWatermarkFileData: await fileToBase64(data.paidWatermarkFileData),
  watermarkFileData: await fileToBase64(data.watermarkFileData)
});

const mapAttachmentFromWeb = (ia: InvoiceAttachmentWeb) => ({
  ...ia,
  data: base64ToBytes(ia.data)
});

const mapAttachmentToWeb = async (ia: InvoiceAttachment) => ({
  ...ia,
  data: await fileToBase64(ia.data)
});

const mapInvoiceFromWeb = (i: InvoiceWeb) => ({
  ...i,
  signatureData: base64ToBytesOrUndef(i.signatureData),
  invoiceBusinessSnapshot: i.invoiceBusinessSnapshot
    ? {
        ...i.invoiceBusinessSnapshot,
        businessLogo: base64ToBytesOrUndef(i.invoiceBusinessSnapshot?.businessLogo)
      }
    : i.invoiceBusinessSnapshot,
  invoiceBankSnapshot: i.invoiceBankSnapshot
    ? {
        ...i.invoiceBankSnapshot,
        qrCode: base64ToBytesOrUndef(i.invoiceBankSnapshot?.qrCode)
      }
    : i.invoiceBankSnapshot,
  invoiceCustomization: i.invoiceCustomization
    ? {
        ...i.invoiceCustomization,
        paidWatermarkFileData: base64ToBytesOrUndef(i.invoiceCustomization?.paidWatermarkFileData),
        watermarkFileData: base64ToBytesOrUndef(i.invoiceCustomization?.watermarkFileData)
      }
    : i.invoiceCustomization,
  invoiceAttachments: (i.invoiceAttachments ?? []).map(mapAttachmentFromWeb)
});

const mapInvoiceToWeb = async (data: InvoiceUpdate | InvoiceAdd) => ({
  ...data,
  signatureData: await fileToBase64(data.signatureData),
  invoiceBusinessSnapshot: data.invoiceBusinessSnapshot
    ? {
        ...data.invoiceBusinessSnapshot,
        businessLogo: await fileToBase64(data.invoiceBusinessSnapshot?.businessLogo)
      }
    : data.invoiceBusinessSnapshot,
  invoiceBankSnapshot: data.invoiceBankSnapshot
    ? {
        ...data.invoiceBankSnapshot,
        qrCode: await fileToBase64(data.invoiceBankSnapshot?.qrCode)
      }
    : data.invoiceBankSnapshot,
  invoiceCustomization: data.invoiceCustomization
    ? {
        ...data.invoiceCustomization,
        paidWatermarkFileData: await fileToBase64(data.invoiceCustomization?.paidWatermarkFileData),
        watermarkFileData: await fileToBase64(data.invoiceCustomization?.watermarkFileData)
      }
    : data.invoiceCustomization,

  invoiceAttachments: await Promise.all((data.invoiceAttachments ?? []).map(mapAttachmentToWeb))
});

const baseUrl = (): string => {
  if (typeof window === 'undefined') return '';
  // Fall back to window.location.origin so relative /api/* URLs work when
  // VITE_API_URL is not set (e.g. Docker + nginx reverse-proxy setup).
  return (import.meta.env.VITE_API_URL as string) || window.location.origin;
};

interface AuthHandlers {
  onUnauthorized?: () => void;
  onMustChangePassword?: () => void;
}

let csrfToken: string | undefined;
let authHandlers: AuthHandlers = {};

export const setCsrfToken = (token: string | undefined) => {
  csrfToken = token;
};

export const setAuthHandlers = (handlers: AuthHandlers) => {
  authHandlers = handlers;
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: Record<string, string>;
  handleAuth?: boolean;
}

const send = async (path: string, { method = 'GET', body, params, handleAuth = true }: RequestOptions = {}) => {
  const url = new URL(path, baseUrl());
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const headers: Record<string, string> = {};
  const options: RequestInit = { method, credentials: 'include', headers };
  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  const res = await fetch(url.toString(), options);
  if (handleAuth && res.status === 401) {
    csrfToken = undefined;
    authHandlers.onUnauthorized?.();
  } else if (handleAuth && res.status === 403) {
    const payload = (await res
      .clone()
      .json()
      .catch(() => undefined)) as { key?: string } | undefined;
    if (payload?.key === 'auth.mustChangePassword') authHandlers.onMustChangePassword?.();
  }
  return res;
};

const MESSAGE_KEY = /^[a-z][A-Za-z]*\.[A-Za-z.]+$/;

const apiRequest = async <T>(path: string, options?: RequestOptions): Promise<T> => {
  const res = await send(path, options);
  const body = await res.json();
  if (!res.ok && body && typeof body.key === 'string') {
    const fieldErrors = Object.values((body.errors ?? {}) as Record<string, string[]>).flat();
    const fieldKey = body.key === 'error.validation' ? fieldErrors.find(error => MESSAGE_KEY.test(error)) : undefined;
    body.message = fieldKey ?? body.key;
  }
  return body as T;
};

const apiGet = <T>(path: string, params?: Record<string, string>) => apiRequest<T>(path, { params });

const apiGetBlob = async (path: string, params?: Record<string, string>): Promise<Response<Uint8Array | undefined>> => {
  const res = await send(path, { params });
  if (res.ok) {
    const buffer = await res.arrayBuffer();
    return { success: true, data: new Uint8Array(buffer) } as Response<Uint8Array | undefined>;
  } else {
    return { success: false };
  }
};

const apiPost = <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body });

const apiPut = <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body });

const apiDelete = <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' });

const withCsrfToken = (response: Response<AuthProfile>) => {
  if (response.success && response.data) setCsrfToken(response.data.csrfToken);
  return response;
};

export const webApi = () => {
  return {
    getAppVersion: () => apiGet<{ version: string }>('/api/version').then(r => r.version),

    openUrl: (url: string) => {
      window.open(url, '_blank');
      return Promise.resolve();
    },

    getProfile: async () =>
      withCsrfToken(await apiRequest<Response<AuthProfile>>('/api/auth/me', { handleAuth: false })),
    login: async (data: LoginInput) =>
      withCsrfToken(
        await apiRequest<Response<AuthProfile>>('/api/auth/login', { method: 'POST', body: data, handleAuth: false })
      ),
    logout: async () => {
      const response = await apiRequest<Response<unknown>>('/api/auth/logout', { method: 'POST', handleAuth: false });
      setCsrfToken(undefined);
      return response;
    },
    changePassword: (data: ChangePasswordInput) => apiPost<Response<unknown>>('/api/auth/change-password', data),

    getUsers: () => apiGet<Response<User[]>>('/api/users'),
    addUser: (data: UserAdd) => apiPost<Response<UserCreated>>('/api/users', data),
    updateUser: ({ id, ...data }: UserUpdate) => apiPut<Response<User>>(`/api/users/${id}`, data),
    resetUserPassword: (id: number) => apiPost<Response<TemporaryPassword>>(`/api/users/${id}/reset-password`),

    getPermissions: () => apiGet<Response<PermissionGroup[]>>('/api/permissions'),
    getRoles: () => apiGet<Response<Role[]>>('/api/roles'),
    addRole: (data: RoleAdd) => apiPost<Response<Role>>('/api/roles', data),
    updateRole: ({ id, ...data }: RoleUpdate) => apiPut<Response<Role>>(`/api/roles/${id}`, data),
    deleteRole: (id: number) => apiDelete<Response<unknown>>(`/api/roles/${id}`),

    getOffices: () => apiGet<Response<Office[]>>('/api/offices'),
    addOffice: (data: OfficeAdd) => apiPost<Response<Office>>('/api/offices', data),
    updateOffice: ({ id, businessId: _businessId, ...data }: OfficeUpdate) =>
      apiPut<Response<Office>>(`/api/offices/${id}`, data),

    getAuditLogs: (query: AuditQuery) =>
      apiGet<Response<AuditPage>>(
        '/api/audit-logs',
        Object.fromEntries(
          Object.entries(query)
            .filter(([, value]) => value !== undefined && value !== '')
            .map(([key, value]) => [key, String(value)])
        )
      ),

    getAllSettings: () => apiGet<Response<Settings>>('/api/settings'),
    updateSettings: (data: SettingsUpdate) => apiPut<Response<SettingsUpdate>>('/api/settings', data),

    getAllBusinesses: async (filter?: FilterData[]) => {
      const response = await apiGet<Response<BusinessWeb[]>>(
        '/api/businesses',
        filter?.length ? { filter: JSON.stringify(filter) } : undefined
      );
      return {
        ...response,
        data: response.data
          ? response.data.map(b => ({
              ...b,
              logo: base64ToBytesOrUndef(b.logo)
            }))
          : response.data
      };
    },
    updateBusiness: async (data: BusinessUpdate) => {
      const response = await apiPut<Response<BusinessWeb>>('/api/businesses', {
        ...data,
        logo: await fileToBase64(data.logo)
      });

      return {
        ...response,
        data: response.data
          ? {
              ...response.data,
              logo: base64ToBytesOrUndef(response.data.logo)
            }
          : response.data
      };
    },
    addBusiness: async (data: BusinessAdd) => {
      const response = await apiPost<Response<BusinessWeb>>('/api/businesses', {
        ...data,
        logo: await fileToBase64(data.logo)
      });

      return {
        ...response,
        data: response.data
          ? {
              ...response.data,
              logo: base64ToBytesOrUndef(response.data.logo)
            }
          : response.data
      };
    },

    getAllStyleProfiles: async (filter?: FilterData[]) => {
      const response = await apiGet<Response<StyleProfileWeb[]>>(
        '/api/styleProfiles',
        filter?.length ? { filter: JSON.stringify(filter) } : undefined
      );

      return {
        ...response,
        data: response.data?.map(mapStyleProfileFromWeb) ?? []
      };
    },
    updateStyleProfile: async (data: StyleProfileUpdate) => {
      const response = await apiPut<Response<StyleProfileWeb>>('/api/styleProfiles', await mapStyleProfileToWeb(data));

      return {
        ...response,
        data: response.data && mapStyleProfileFromWeb(response.data)
      };
    },
    addStyleProfile: async (data: StyleProfileAdd) => {
      const response = await apiPost<Response<StyleProfileWeb>>('/api/styleProfiles', await mapStyleProfileToWeb(data));

      return {
        ...response,
        data: response.data && mapStyleProfileFromWeb(response.data)
      };
    },
    deleteStyleProfile: (id: number) => apiDelete<Response<unknown>>(`/api/styleProfiles/${id}`),
    addBatchStyleProfile: (data: StyleProfileAdd[]) =>
      apiPost<Response<StyleProfileAdd[]>>('/api/styleProfiles/batch', data),

    getAllLayouts: (filter?: FilterData[]) =>
      apiGet<Response<Layout[]>>('/api/layouts', filter?.length ? { filter: JSON.stringify(filter) } : undefined),
    addLayout: (data: LayoutAdd) => apiPost<Response<Layout>>('/api/layouts', data),
    updateLayout: (data: LayoutUpdate) => apiPut<Response<Layout>>('/api/layouts', data),
    deleteLayout: (id: number) => apiDelete<Response<unknown>>(`/api/layouts/${id}`),
    exportLayout: async (id: number): Promise<Response<ExportMeta>> => {
      const result = await apiGet<{ success: boolean; data?: Layout }>(`/api/layouts/export/${id}`);
      if (!result.success || !result.data) return result as Response<ExportMeta>;
      const blob = new Blob([JSON.stringify(result.data.schema, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${result.data.schema.meta.name.replace(/[^a-z0-9_-]/gi, '_') || 'layout'}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      return { success: true, data: { filePath: a.download } };
    },

    getAllClients: (filter?: FilterData[]) =>
      apiGet<Response<Client[]>>('/api/clients', filter?.length ? { filter: JSON.stringify(filter) } : undefined),
    addClient: (data: ClientAdd) => apiPost<Response<Client>>('/api/clients', data),
    updateClient: (data: ClientUpdate) => apiPut<Response<Client>>('/api/clients', data),
    deleteClient: (id: number) => apiDelete<Response<unknown>>(`/api/clients/${id}`),
    addBatchClient: (data: ClientAdd[]) => apiPost<Response<Client[]>>('/api/clients/batch', data),

    getAllItems: (filter?: FilterData[]) =>
      apiGet<Response<Item[]>>('/api/items', filter?.length ? { filter: JSON.stringify(filter) } : undefined),
    addItem: (data: ItemAdd) => apiPost<Response<Item>>('/api/items', data),
    updateItem: (data: ItemUpdate) => apiPut<Response<Item>>('/api/items', data),
    deleteItem: (id: number) => apiDelete<Response<unknown>>(`/api/items/${id}`),
    addBatchItem: (data: ItemAdd[]) => apiPost<Response<Item[]>>('/api/items/batch', data),

    getAllUnits: (filter?: FilterData[]) =>
      apiGet<Response<Unit[]>>('/api/units', filter?.length ? { filter: JSON.stringify(filter) } : undefined),
    addUnit: (data: UnitAdd) => apiPost<Response<Unit>>('/api/units', data),
    updateUnit: (data: UnitUpdate) => apiPut<Response<Unit>>('/api/units', data),
    deleteUnit: (id: number) => apiDelete<Response<unknown>>(`/api/units/${id}`),
    addBatchUnit: (data: UnitAdd[]) => apiPost<Response<Unit[]>>('/api/units/batch', data),

    getAllCategories: (filter?: FilterData[]) =>
      apiGet<Response<Category[]>>('/api/categories', filter?.length ? { filter: JSON.stringify(filter) } : undefined),
    addCategory: (data: CategoryAdd) => apiPost<Response<Category>>('/api/categories', data),
    updateCategory: (data: CategoryUpdate) => apiPut<Response<Category>>('/api/categories', data),
    deleteCategory: (id: number) => apiDelete<Response<unknown>>(`/api/categories/${id}`),
    addBatchCategory: (data: CategoryAdd[]) => apiPost<Response<Category[]>>('/api/categories/batch', data),

    getAllCurrencies: (filter?: FilterData[]) =>
      apiGet<Response<Currency[]>>('/api/currencies', filter?.length ? { filter: JSON.stringify(filter) } : undefined),
    addCurrency: (data: CurrencyAdd) => apiPost<Response<Currency>>('/api/currencies', data),
    updateCurrency: (data: CurrencyUpdate) => apiPut<Response<Currency>>('/api/currencies', data),
    deleteCurrency: (id: number) => apiDelete<Response<unknown>>(`/api/currencies/${id}`),
    addBatchCurrency: (data: CurrencyAdd[]) => apiPost<Response<Currency[]>>('/api/currencies/batch', data),

    getAllBanks: async (filter?: FilterData[]) => {
      const response = await apiGet<Response<BankWeb[]>>(
        '/api/banks',
        filter?.length ? { filter: JSON.stringify(filter) } : undefined
      );

      return {
        ...response,
        data: response.data?.map(mapBankFromWeb) ?? []
      };
    },
    updateBank: async (data: BankUpdate) => {
      const response = await apiPut<Response<BankWeb>>('/api/banks', await mapBankToWeb(data));

      return {
        ...response,
        data: response.data && mapBankFromWeb(response.data)
      };
    },
    addBank: async (data: BankAdd) => {
      const response = await apiPost<Response<BankWeb>>('/api/banks', await mapBankToWeb(data));

      return {
        ...response,
        data: response.data && mapBankFromWeb(response.data)
      };
    },
    deleteBank: (id: number) => apiDelete<Response<unknown>>(`/api/banks/${id}`),
    addBatchBank: (data: BankAdd[]) => apiPost<Response<BankAdd[]>>('/api/banks/batch', data),

    getAllPresets: async (filter?: FilterData[]) => {
      const response = await apiGet<Response<PresetWeb[]>>(
        '/api/presets',
        filter?.length ? { filter: JSON.stringify(filter) } : undefined
      );

      return {
        ...response,
        data: response.data?.map(mapPresetFromWeb) ?? []
      };
    },
    updatePreset: async (data: PresetUpdate) => {
      const response = await apiPut<Response<PresetWeb>>('/api/presets', await mapPresetToWeb(data));

      return {
        ...response,
        data: response.data && mapPresetFromWeb(response.data)
      };
    },
    addPreset: async (data: PresetAdd) => {
      const response = await apiPost<Response<PresetWeb>>('/api/presets', await mapPresetToWeb(data));

      return {
        ...response,
        data: response.data && mapPresetFromWeb(response.data)
      };
    },
    deletePreset: (id: number) => apiDelete<Response<unknown>>(`/api/presets/${id}`),
    addBatchPreset: (data: PresetAdd[]) => apiPost<Response<PresetAdd[]>>('/api/presets/batch', data),

    getNextSequence: async (data: { businessId: number; clientId: number; invoiceType: InvoiceType }) =>
      apiGet<Response<NextSequenceData | undefined>>('/api/invoices/sequence', {
        businessId: data.businessId.toString(),
        clientId: data.clientId.toString(),
        invoiceType: data.invoiceType
      }),
    getEInvoiceXML: async (data: { invoiceId: number; einvoice: EInvoice }) =>
      apiGetBlob('/api/invoices/xml', {
        invoiceId: data.invoiceId.toString(),
        einvoice: data.einvoice
      }),
    getCustomHeaders: async (type: InvoiceType) =>
      apiGet<Response<CustomFieldMeta[]>>('/api/invoices/headers', { type: type }),
    getAllInvoices: async (type?: InvoiceType, filter?: FilterData[]) => {
      const params: Record<string, string> = {};
      if (type) params.type = type;
      if (filter?.length) params.filter = JSON.stringify(filter);

      const response = await apiGet<Response<InvoiceWeb[]>>(
        '/api/invoices',
        Object.keys(params).length ? params : undefined
      );

      return {
        ...response,
        data: response.data?.map(mapInvoiceFromWeb)
      };
    },
    updateInvoice: async (data: InvoiceUpdate) => {
      const response = await apiPut<Response<InvoiceWeb>>('/api/invoices', await mapInvoiceToWeb(data));

      return {
        ...response,
        data: response.data && mapInvoiceFromWeb(response.data)
      };
    },
    addInvoice: async (data: InvoiceAdd) => {
      const response = await apiPost<Response<InvoiceWeb>>('/api/invoices', await mapInvoiceToWeb(data));

      return {
        ...response,
        data: response.data && mapInvoiceFromWeb(response.data)
      };
    },
    duplicateInvoice: async (id: number, invoiceType: InvoiceType) => {
      const response = await apiPost<Response<InvoiceWeb>>('/api/invoices/duplicate', {
        invoiceId: id,
        invoiceType
      });

      return {
        ...response,
        data: response.data && mapInvoiceFromWeb(response.data)
      };
    },
    deleteInvoice: (id: number) => apiDelete<Response<unknown>>(`/api/invoices/${id}`),

    exportAllData: async (): Promise<Response<ExportMeta>> => {
      const result = await apiGet<{ success: boolean; data?: unknown }>('/api/export');
      if (!result.success || !result.data) return result as Response<ExportMeta>;
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `invoice-builder-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      return { success: true, data: { filePath: a.download } };
    },

    importAllData: (): Promise<Response<unknown>> => {
      return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) {
            resolve({ success: false });
            return;
          }
          const text = await file.text();
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            resolve({ success: false, key: 'error.invalidFile' });
            return;
          }

          const jsonString = JSON.stringify(parsed);
          const compressed = gzip(jsonString);

          const blob = new Blob([compressed], { type: 'application/gzip' });
          const formData = new FormData();
          formData.append('file', blob, file.name + '.gz');

          const result = await apiPost<Response<unknown>>('/api/import', formData);
          resolve(result);
        };
        input.click();
      });
    }
  };
};

export type Api = ReturnType<typeof webApi>;
