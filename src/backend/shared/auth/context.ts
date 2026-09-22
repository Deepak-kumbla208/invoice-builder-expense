export type RequestCtx = {
  userId: number;
  email: string;
  fullName: string;
  roleId: number;
  roleName: string;
  permissions: ReadonlySet<string>;
  officeIds: number[];
  businessIds: number[];
  allOffices: boolean;
  mustChangePassword: boolean;
  csrfSecret: string;
  sessionTokenHash: string;
  ip: string | undefined;
  requestId: string;
};
