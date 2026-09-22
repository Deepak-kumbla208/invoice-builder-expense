export type PermissionDefinition = {
  key: string;
  group: string;
  label: string;
  sortOrder: number;
  requires: readonly string[];
};

export const PERMISSIONS = [
  {
    key: 'invoice.create',
    group: 'Invoices',
    label: 'Create invoices',
    sortOrder: 10,
    requires: ['invoice.view', 'customer.view']
  },
  { key: 'invoice.view', group: 'Invoices', label: 'View own invoices', sortOrder: 20, requires: [] },
  { key: 'invoice.view_all', group: 'Invoices', label: 'View all invoices', sortOrder: 30, requires: [] },
  {
    key: 'invoice.edit',
    group: 'Invoices',
    label: 'Edit invoices',
    sortOrder: 40,
    requires: ['invoice.view', 'customer.view']
  },
  { key: 'invoice.issue', group: 'Invoices', label: 'Issue invoices', sortOrder: 50, requires: ['invoice.view'] },
  { key: 'invoice.cancel', group: 'Invoices', label: 'Cancel invoices', sortOrder: 60, requires: ['invoice.view'] },
  {
    key: 'invoice.delete',
    group: 'Invoices',
    label: 'Delete draft invoices',
    sortOrder: 70,
    requires: ['invoice.view']
  },
  { key: 'invoice.print', group: 'Invoices', label: 'Print invoices', sortOrder: 80, requires: ['invoice.view'] },
  { key: 'invoice.download', group: 'Invoices', label: 'Download invoices', sortOrder: 90, requires: ['invoice.view'] },
  {
    key: 'credit_note.create',
    group: 'Invoices',
    label: 'Create credit notes',
    sortOrder: 100,
    requires: ['invoice.view']
  },

  { key: 'customer.view', group: 'Customers', label: 'View customers', sortOrder: 110, requires: [] },
  {
    key: 'customer.manage',
    group: 'Customers',
    label: 'Manage customers',
    sortOrder: 120,
    requires: ['customer.view']
  },

  {
    key: 'expense.create',
    group: 'Expenses',
    label: 'Create expenses and reimbursement requests',
    sortOrder: 130,
    requires: ['expense.view_own']
  },
  { key: 'expense.view_own', group: 'Expenses', label: 'View own expenses', sortOrder: 140, requires: [] },
  { key: 'expense.view_all', group: 'Expenses', label: 'View all expenses', sortOrder: 150, requires: [] },
  { key: 'expense.edit', group: 'Expenses', label: 'Edit expenses', sortOrder: 160, requires: ['expense.view_own'] },
  {
    key: 'expense.delete',
    group: 'Expenses',
    label: 'Delete draft expenses',
    sortOrder: 170,
    requires: ['expense.view_own']
  },
  {
    key: 'expense.approve',
    group: 'Expenses',
    label: 'Approve expenses',
    sortOrder: 180,
    requires: ['expense.view_all']
  },
  {
    key: 'expense.reject',
    group: 'Expenses',
    label: 'Reject expenses',
    sortOrder: 190,
    requires: ['expense.view_all']
  },

  {
    key: 'reimbursement.view_own',
    group: 'Reimbursements',
    label: 'View own reimbursements',
    sortOrder: 200,
    requires: []
  },
  {
    key: 'reimbursement.view_all',
    group: 'Reimbursements',
    label: 'View all reimbursements',
    sortOrder: 210,
    requires: []
  },
  {
    key: 'reimbursement.pay',
    group: 'Reimbursements',
    label: 'Pay reimbursements',
    sortOrder: 220,
    requires: ['reimbursement.view_all']
  },
  {
    key: 'reimbursement.cancel',
    group: 'Reimbursements',
    label: 'Cancel reimbursements',
    sortOrder: 230,
    requires: ['reimbursement.view_all']
  },

  { key: 'report.view', group: 'Reports', label: 'View reports', sortOrder: 240, requires: [] },

  { key: 'admin.users', group: 'Administration', label: 'Manage users', sortOrder: 250, requires: [] },
  { key: 'admin.roles', group: 'Administration', label: 'Manage roles and permissions', sortOrder: 260, requires: [] },
  { key: 'admin.companies', group: 'Administration', label: 'Manage companies', sortOrder: 270, requires: [] },
  { key: 'admin.offices', group: 'Administration', label: 'Manage offices', sortOrder: 280, requires: [] },
  { key: 'admin.settings', group: 'Administration', label: 'Manage settings', sortOrder: 290, requires: [] },
  { key: 'admin.invoice_setup', group: 'Administration', label: 'Manage invoice setup', sortOrder: 300, requires: [] },
  {
    key: 'admin.expense_categories',
    group: 'Administration',
    label: 'Manage expense categories',
    sortOrder: 310,
    requires: []
  },
  { key: 'audit.view', group: 'Administration', label: 'View audit log', sortOrder: 320, requires: [] }
] as const satisfies readonly PermissionDefinition[];

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

const BY_KEY = new Map<string, PermissionDefinition>(PERMISSIONS.map(permission => [permission.key, permission]));

export const isPermissionKey = (key: string): key is PermissionKey => BY_KEY.has(key);

export const resolveDependencies = (keys: Iterable<string>): PermissionKey[] => {
  const resolved = new Set<string>();
  const visit = (key: string) => {
    if (resolved.has(key)) return;
    const permission = BY_KEY.get(key);
    if (!permission) throw new Error(`Unknown permission: ${key}`);
    resolved.add(key);
    permission.requires.forEach(visit);
  };
  for (const key of keys) visit(key);
  return PERMISSIONS.filter(permission => resolved.has(permission.key)).map(permission => permission.key);
};
