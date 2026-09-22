import { type Express, type Request, type Response } from 'express';
import { generateTemporaryPassword, hashPassword } from '../../shared/auth/passwords';
import { AppError } from '../../shared/errors';
import { createUser, getUser, listUsers, resetUserPassword, updateUser } from '../../shared/services/users';
import { userCreateSchema, userUpdateSchema } from '../../shared/validation/admin';
import type { ServerDeps } from '../deps';
import { parseBody, parseId } from '../middleware/errors';
import { requirePermission } from '../middleware/permissions';
import { ctxOf } from '../middleware/session';

const canManageUsers = requirePermission('admin.users');

const temporaryPassword = async () => {
  const password = generateTemporaryPassword();
  return { password, hash: await hashPassword(password) };
};

export const initUsersController = (app: Express, { requestTx }: ServerDeps) => {
  app.get('/api/users', canManageUsers, async (req: Request, res: Response) => {
    res.json({ success: true, data: await requestTx(req, db => listUsers(db)) });
  });
  app.get('/api/users/:id', canManageUsers, async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const data = await requestTx(req, db => getUser(db, id));
    if (!data) throw new AppError('notFound');
    res.json({ success: true, data });
  });
  app.post('/api/users', canManageUsers, async (req: Request, res: Response) => {
    const input = parseBody(userCreateSchema, req.body);
    const temporary = await temporaryPassword();
    const user = await requestTx(req, db => createUser(db, ctxOf(req), input, temporary.hash));
    res.json({ success: true, data: { user, temporaryPassword: temporary.password } });
  });
  app.put('/api/users/:id', canManageUsers, async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const input = parseBody(userUpdateSchema, req.body);
    res.json({ success: true, data: await requestTx(req, db => updateUser(db, ctxOf(req), id, input)) });
  });
  app.post('/api/users/:id/reset-password', canManageUsers, async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const temporary = await temporaryPassword();
    await requestTx(req, db => resetUserPassword(db, ctxOf(req), id, temporary.hash));
    res.json({ success: true, data: { temporaryPassword: temporary.password } });
  });
};
