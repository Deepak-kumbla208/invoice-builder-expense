import { type Express, type Request, type Response } from 'express';
import type { ServerDeps } from '../deps';
import { requirePermission } from '../middleware/permissions';
import * as clientsService from '../../shared/services/clients';
import { parseFilter } from '../utils/functions';

export const initClientsController = (app: Express, { requestTx }: ServerDeps) => {
  app.get('/api/clients', requirePermission('customer.view'), async (req: Request, res: Response) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await requestTx(req, db => clientsService.getAllClients(db, filter));
    res.json(result);
  });
  app.post('/api/clients', requirePermission('customer.manage'), async (req: Request, res: Response) => {
    const result = await requestTx(req, db => clientsService.addClient(db, req.body));
    res.json(result);
  });
  app.put('/api/clients', requirePermission('customer.manage'), async (req: Request, res: Response) => {
    const result = await requestTx(req, db => clientsService.updateClient(db, req.body));
    res.json(result);
  });
  app.delete('/api/clients/:id', requirePermission('customer.manage'), async (req: Request, res: Response) => {
    const result = await requestTx(req, db => clientsService.deleteClient(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/clients/batch', requirePermission('customer.manage'), async (req: Request, res: Response) => {
    const result = await requestTx(req, db => clientsService.batchAddClient(db, req.body));
    res.json(result);
  });
};
