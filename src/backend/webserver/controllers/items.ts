import { type Express, type Request, type Response } from 'express';
import type { ServerDeps } from '../deps';
import { canManageInvoiceSetup, canReadInvoiceSetup } from './access';
import * as itemsService from '../../shared/services/items';
import { parseFilter } from '../utils/functions';

export const initItemsController = (app: Express, { requestTx }: ServerDeps) => {
  app.get('/api/items', canReadInvoiceSetup, async (req: Request, res: Response) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await requestTx(req, db => itemsService.getAllItems(db, filter));
    res.json(result);
  });
  app.post('/api/items', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => itemsService.addItem(db, req.body));
    res.json(result);
  });
  app.put('/api/items', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => itemsService.updateItem(db, req.body));
    res.json(result);
  });
  app.delete('/api/items/:id', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => itemsService.deleteItem(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/items/batch', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => itemsService.batchAddItem(db, req.body));
    res.json(result);
  });
};
