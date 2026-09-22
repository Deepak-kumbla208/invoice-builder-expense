import { requireAnyPermission, requirePermission } from '../middleware/permissions';

export const canReadInvoiceSetup = requireAnyPermission('invoice.view', 'invoice.view_all', 'admin.invoice_setup');

export const canManageInvoiceSetup = requirePermission('admin.invoice_setup');
