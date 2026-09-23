export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  roleId: number;
  roleName: string;
  allOffices: boolean;
  mustChangePassword: boolean;
}

export interface AuthOffice {
  id: number;
  businessId: number;
  name: string;
  code: string;
  stateCode: string;
  isArchived: boolean;
}

export interface AuthCompany {
  id: number;
  name: string;
  shortName: string;
  isArchived: boolean;
}

export interface AuthProfile {
  user: AuthUser;
  permissions: string[];
  offices: AuthOffice[];
  companies: AuthCompany[];
  csrfToken: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}
