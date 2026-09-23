import { z } from 'zod';
import { isPermissionKey } from '../auth/permissions';
import { PAN_PATTERN, gstinMatchesState, isGstStateCode } from '../constants/gstStates';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform(value => value || null);

const optionalUpperText = (max: number) => optionalText(max).transform(value => value?.toUpperCase() ?? null);

const positiveId = z.number().int().positive();

export const idParamSchema = z.coerce.number().int().positive();

const permissionKeys = z
  .array(z.string())
  .max(200)
  .refine(keys => keys.every(isPermissionKey), 'permission.unknown');

const companyShape = {
  name: z.string().trim().min(1).max(200),
  shortName: z.string().trim().min(1).max(2),
  legal_name: optionalText(300),
  pan: optionalUpperText(10).refine(value => value === null || PAN_PATTERN.test(value), 'company.panInvalid'),
  address: optionalText(1000),
  role: optionalText(200),
  email: optionalText(254),
  phone: optionalText(50),
  website: optionalText(300),
  additional: optionalText(2000),
  description: optionalText(2000),
  vatCode: optionalText(50),
  peppolEndpointId: optionalText(100),
  countryCode: optionalText(10),
  code: optionalText(50),
  peppolEndpointSchemeId: optionalText(50),
  logo: z.string().nullish(),
  fileSize: z.number().int().nonnegative().nullish(),
  fileType: optionalText(100),
  fileName: optionalText(255),
  default_layout_id: positiveId.nullish(),
  default_style_profile_id: positiveId.nullish(),
  isArchived: z.boolean().default(false)
};

export const companyCreateSchema = z.object(companyShape);
export const companyUpdateSchema = z.object({ ...companyShape, id: positiveId });

export type CompanyInput = z.infer<typeof companyCreateSchema>;
export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>;

const officeShape = {
  name: z.string().trim().min(1).max(200),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,3}$/, 'office.codeInvalid'),
  stateCode: z.string().refine(isGstStateCode, 'office.stateCodeInvalid'),
  address: optionalText(1000),
  phone: optionalText(50),
  email: optionalText(254),
  gstin: optionalUpperText(15),
  lutReference: optionalText(100),
  lutValidUntil: z.iso
    .date()
    .nullish()
    .transform(value => value ?? null),
  isArchived: z.boolean().default(false)
};

type OfficeFields = {
  stateCode: string;
  gstin: string | null;
  lutReference: string | null;
  lutValidUntil: string | null;
};

const checkOffice = (office: OfficeFields, ctx: z.RefinementCtx) => {
  if (office.gstin && !gstinMatchesState(office.gstin, office.stateCode)) {
    ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'office.gstinInvalid' });
  }
  if (Boolean(office.lutReference) !== Boolean(office.lutValidUntil)) {
    ctx.addIssue({
      code: 'custom',
      path: [office.lutReference ? 'lutValidUntil' : 'lutReference'],
      message: 'office.lutIncomplete'
    });
  }
  if (office.lutReference && !office.gstin) {
    ctx.addIssue({ code: 'custom', path: ['lutReference'], message: 'office.lutRequiresGstin' });
  }
};

export const officeCreateSchema = z.object({ ...officeShape, businessId: positiveId }).superRefine(checkOffice);
export const officeUpdateSchema = z.object(officeShape).superRefine(checkOffice);

export type OfficeInput = z.infer<typeof officeCreateSchema>;
export type OfficeUpdateInput = z.infer<typeof officeUpdateSchema>;

export const roleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: optionalText(500),
  permissions: permissionKeys
});

export type RoleInput = z.infer<typeof roleSchema>;

const userShape = {
  email: z.string().trim().max(254).pipe(z.email('user.emailInvalid')),
  fullName: z.string().trim().min(1).max(200),
  roleId: positiveId,
  allOffices: z.boolean().default(false),
  officeIds: z.array(positiveId).max(100).default([]),
  extraPermissions: permissionKeys.default([])
};

const checkUserOffices = (user: { allOffices: boolean; officeIds: number[] }, ctx: z.RefinementCtx) => {
  if (!user.allOffices && user.officeIds.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['officeIds'], message: 'user.officesRequired' });
  }
};

export const userCreateSchema = z.object(userShape).superRefine(checkUserOffices);
export const userUpdateSchema = z.object({ ...userShape, isActive: z.boolean() }).superRefine(checkUserOffices);

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().max(100).optional(),
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(50).optional(),
  actorUserId: z.coerce.number().int().positive().optional()
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;
