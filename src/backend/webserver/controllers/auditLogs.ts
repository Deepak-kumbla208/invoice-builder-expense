import { type Express, type Request, type Response } from 'express';
import { listAuditLogs } from '../../shared/services/audit';
import { auditQuerySchema } from '../../shared/validation/admin';
import type { ServerDeps } from '../deps';
import { parseBody } from '../middleware/errors';
import { requirePermission } from '../middleware/permissions';

export const initAuditLogsController = (app: Express, { requestTx }: ServerDeps) => {
  app.get('/api/audit-logs', requirePermission('audit.view'), async (req: Request, res: Response) => {
    const query = parseBody(auditQuerySchema, req.query);
    res.json({ success: true, data: await requestTx(req, db => listAuditLogs(db, query)) });
  });
};
