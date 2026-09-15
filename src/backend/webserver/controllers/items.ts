import { type Express, type Request, type Response } from 'express';
import { withTx } from '../../shared/db/tx';
import * as itemsService from '../../shared/services/items';
import { parseFilter } from '../utils/functions';

export const initItemsController = (app: Express) => {
  app.get('/api/items', async (req: Request, res: Response) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await withTx(db => itemsService.getAllItems(db, filter));
    res.json(result);
  });
  app.post('/api/items', async (req: Request, res: Response) => {
    const result = await withTx(db => itemsService.addItem(db, req.body));
    res.json(result);
  });
  app.put('/api/items', async (req: Request, res: Response) => {
    const result = await withTx(db => itemsService.updateItem(db, req.body));
    res.json(result);
  });
  app.delete('/api/items/:id', async (req: Request, res: Response) => {
    const result = await withTx(db => itemsService.deleteItem(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/items/batch', async (req: Request, res: Response) => {
    const result = await withTx(db => itemsService.batchAddItem(db, req.body));
    res.json(result);
  });
};
