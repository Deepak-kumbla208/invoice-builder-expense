import { type Express, type Request, type Response } from 'express';
import { withTx } from '../../shared/db/tx';
import * as clientsService from '../../shared/services/clients';
import { parseFilter } from '../utils/functions';

export const initClientsController = (app: Express) => {
  app.get('/api/clients', async (req: Request, res: Response) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await withTx(db => clientsService.getAllClients(db, filter));
    res.json(result);
  });
  app.post('/api/clients', async (req: Request, res: Response) => {
    const result = await withTx(db => clientsService.addClient(db, req.body));
    res.json(result);
  });
  app.put('/api/clients', async (req: Request, res: Response) => {
    const result = await withTx(db => clientsService.updateClient(db, req.body));
    res.json(result);
  });
  app.delete('/api/clients/:id', async (req: Request, res: Response) => {
    const result = await withTx(db => clientsService.deleteClient(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/clients/batch', async (req: Request, res: Response) => {
    const result = await withTx(db => clientsService.batchAddClient(db, req.body));
    res.json(result);
  });
};
