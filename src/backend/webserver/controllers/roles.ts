import { type Express, type Request, type Response } from 'express';
import { AppError } from '../../shared/errors';
import { createRole, deleteRole, getRole, listPermissions, listRoles, updateRole } from '../../shared/services/roles';
import { roleSchema } from '../../shared/validation/admin';
import type { ServerDeps } from '../deps';
import { parseBody, parseId } from '../middleware/errors';
import { requireAnyPermission, requirePermission } from '../middleware/permissions';
import { ctxOf } from '../middleware/session';

const canReadRoles = requireAnyPermission('admin.roles', 'admin.users');

export const initRolesController = (app: Express, { requestTx }: ServerDeps) => {
  app.get('/api/permissions', canReadRoles, async (req: Request, res: Response) => {
    res.json({ success: true, data: await requestTx(req, db => listPermissions(db)) });
  });
  app.get('/api/roles', canReadRoles, async (req: Request, res: Response) => {
    res.json({ success: true, data: await requestTx(req, db => listRoles(db)) });
  });
  app.get('/api/roles/:id', canReadRoles, async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const data = await requestTx(req, db => getRole(db, id));
    if (!data) throw new AppError('notFound');
    res.json({ success: true, data });
  });
  app.post('/api/roles', requirePermission('admin.roles'), async (req: Request, res: Response) => {
    const input = parseBody(roleSchema, req.body);
    res.json({ success: true, data: await requestTx(req, db => createRole(db, ctxOf(req), input)) });
  });
  app.put('/api/roles/:id', requirePermission('admin.roles'), async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const input = parseBody(roleSchema, req.body);
    res.json({ success: true, data: await requestTx(req, db => updateRole(db, ctxOf(req), id, input)) });
  });
  app.delete('/api/roles/:id', requirePermission('admin.roles'), async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    await requestTx(req, db => deleteRole(db, ctxOf(req), id));
    res.json({ success: true });
  });
};
