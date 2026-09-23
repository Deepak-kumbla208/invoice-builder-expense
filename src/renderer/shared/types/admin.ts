export interface User {
  id: number;
  email: string;
  fullName: string;
  roleId: number;
  roleName: string;
  roleIsSystem: boolean;
  allOffices: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  officeIds: number[];
  extraPermissions: string[];
}

export interface UserAdd {
  email: string;
  fullName: string;
  roleId: number;
  allOffices: boolean;
  officeIds: number[];
  extraPermissions: string[];
}

export interface UserUpdate extends UserAdd {
  id: number;
  isActive: boolean;
}

export interface UserCreated {
  user: User;
  temporaryPassword: string;
}

export interface TemporaryPassword {
  temporaryPassword: string;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  affectedUsers: number;
}

export interface RoleAdd {
  name: string;
  description: string | null;
  permissions: string[];
}

export interface RoleUpdate extends RoleAdd {
  id: number;
}

export interface PermissionInfo {
  key: string;
  label: string;
  requires: readonly string[];
}

export interface PermissionGroup {
  group: string;
  permissions: PermissionInfo[];
}

export interface Office {
  id: number;
  businessId: number;
  name: string;
  code: string;
  stateCode: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  lutReference: string | null;
  lutValidUntil: string | null;
  isArchived: boolean;
}

export interface OfficeAdd {
  businessId: number;
  name: string;
  code: string;
  stateCode: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  lutReference: string | null;
  lutValidUntil: string | null;
  isArchived: boolean;
}

export interface OfficeUpdate extends OfficeAdd {
  id: number;
}

export interface AuditEntry {
  id: number;
  occurredAt: string;
  actorUserId: number | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  businessId: number | null;
  officeId: number | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  requestId: string | null;
}

export interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditQuery {
  page: number;
  pageSize: number;
  action?: string;
  entityType?: string;
}
