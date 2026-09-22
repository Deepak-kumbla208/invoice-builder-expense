INSERT INTO permissions (key, group_name, label, sort_order) VALUES
    ('invoice.create', 'Invoices', 'Create invoices', 10),
    ('invoice.view', 'Invoices', 'View own invoices', 20),
    ('invoice.view_all', 'Invoices', 'View all invoices', 30),
    ('invoice.edit', 'Invoices', 'Edit invoices', 40),
    ('invoice.issue', 'Invoices', 'Issue invoices', 50),
    ('invoice.cancel', 'Invoices', 'Cancel invoices', 60),
    ('invoice.delete', 'Invoices', 'Delete draft invoices', 70),
    ('invoice.print', 'Invoices', 'Print invoices', 80),
    ('invoice.download', 'Invoices', 'Download invoices', 90),
    ('credit_note.create', 'Invoices', 'Create credit notes', 100),
    ('customer.view', 'Customers', 'View customers', 110),
    ('customer.manage', 'Customers', 'Manage customers', 120),
    ('expense.create', 'Expenses', 'Create expenses and reimbursement requests', 130),
    ('expense.view_own', 'Expenses', 'View own expenses', 140),
    ('expense.view_all', 'Expenses', 'View all expenses', 150),
    ('expense.edit', 'Expenses', 'Edit expenses', 160),
    ('expense.delete', 'Expenses', 'Delete draft expenses', 170),
    ('expense.approve', 'Expenses', 'Approve expenses', 180),
    ('expense.reject', 'Expenses', 'Reject expenses', 190),
    ('reimbursement.view_own', 'Reimbursements', 'View own reimbursements', 200),
    ('reimbursement.view_all', 'Reimbursements', 'View all reimbursements', 210),
    ('reimbursement.pay', 'Reimbursements', 'Pay reimbursements', 220),
    ('reimbursement.cancel', 'Reimbursements', 'Cancel reimbursements', 230),
    ('report.view', 'Reports', 'View reports', 240),
    ('admin.users', 'Administration', 'Manage users', 250),
    ('admin.roles', 'Administration', 'Manage roles and permissions', 260),
    ('admin.companies', 'Administration', 'Manage companies', 270),
    ('admin.offices', 'Administration', 'Manage offices', 280),
    ('admin.settings', 'Administration', 'Manage settings', 290),
    ('admin.invoice_setup', 'Administration', 'Manage invoice setup', 300),
    ('admin.expense_categories', 'Administration', 'Manage expense categories', 310),
    ('audit.view', 'Administration', 'View audit log', 320);

INSERT INTO roles (name, description, is_system) VALUES
    ('Super Admin', 'Every permission, in every company and office', true),
    ('Office Admin', 'Runs invoicing, customers, expenses, reimbursements and users for their offices', false),
    ('User', 'Records their own expenses and reimbursement requests', false);

INSERT INTO role_permissions (role_id, permission_key)
SELECT roles.id, permissions.key
FROM roles CROSS JOIN permissions
WHERE roles.name = 'Super Admin';

INSERT INTO role_permissions (role_id, permission_key)
SELECT roles.id, seeded.key
FROM roles CROSS JOIN (VALUES
    ('invoice.create'), ('invoice.view'), ('invoice.view_all'), ('invoice.edit'), ('invoice.issue'),
    ('invoice.cancel'), ('invoice.delete'), ('invoice.print'), ('invoice.download'), ('credit_note.create'),
    ('customer.view'), ('customer.manage'),
    ('expense.create'), ('expense.view_own'), ('expense.view_all'), ('expense.edit'), ('expense.delete'),
    ('expense.approve'), ('expense.reject'),
    ('reimbursement.view_all'), ('reimbursement.pay'),
    ('report.view'), ('audit.view'), ('admin.users')
) AS seeded (key)
WHERE roles.name = 'Office Admin';

INSERT INTO role_permissions (role_id, permission_key)
SELECT roles.id, seeded.key
FROM roles CROSS JOIN (VALUES
    ('expense.create'), ('expense.view_own'), ('reimbursement.view_own')
) AS seeded (key)
WHERE roles.name = 'User';
