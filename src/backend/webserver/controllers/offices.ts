import { type Express, type Request, type Response } from 'express';
import { AppError } from '../../shared/errors';
import { createOffice, getOffice, listOffices, updateOffice } from '../../shared/services/offices';
import { idParamSchema, officeCreateSchema, officeUpdateSchema } from '../../shared/validation/admin';
import type { ServerDeps } from '../deps';
import { parseBody, parseId } from '../middleware/errors';
import { requireAnyPermission, requirePermission } from '../middleware/permissions';
import { ctxOf } from '../middleware/session';

const canReadOffices = requireAnyPermission('admin.offices', 'admin.users');

export const initOfficesController = (app: Express, { requestTx }: ServerDeps) => {
  app.get('/api/offices', canReadOffices, async (req: Request, res: Response) => {
    const businessId = req.query.businessId === undefined ? undefined : idParamSchema.safeParse(req.query.businessId);
    if (businessId && !businessId.success) throw new AppError('validation');
    const data = await requestTx(req, db => listOffices(db, { businessId: businessId?.data }));
    res.json({ success: true, data });
  });
  app.get('/api/offices/:id', canReadOffices, async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const data = await requestTx(req, db => getOffice(db, id));
    if (!data) throw new AppError('notFound');
    res.json({ success: true, data });
  });
  app.post('/api/offices', requirePermission('admin.offices'), async (req: Request, res: Response) => {
    const input = parseBody(officeCreateSchema, req.body);
    const data = await requestTx(req, db => createOffice(db, ctxOf(req), input));
    res.json({ success: true, data });
  });
  app.put('/api/offices/:id', requirePermission('admin.offices'), async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const input = parseBody(officeUpdateSchema, req.body);
    const data = await requestTx(req, db => updateOffice(db, ctxOf(req), id, input));
    res.json({ success: true, data });
  });
};
