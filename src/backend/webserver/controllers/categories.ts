import { type Express, type Request, type Response } from 'express';
import type { ServerDeps } from '../deps';
import { canManageInvoiceSetup, canReadInvoiceSetup } from './access';
import * as categoriesService from '../../shared/services/categories';
import { parseFilter } from '../utils/functions';

export const initCategoriesController = (app: Express, { requestTx }: ServerDeps) => {
  app.get('/api/categories', canReadInvoiceSetup, async (req: Request, res: Response) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await requestTx(req, db => categoriesService.getAllCategories(db, filter));
    res.json(result);
  });
  app.post('/api/categories', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => categoriesService.addCategory(db, req.body));
    res.json(result);
  });
  app.put('/api/categories', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => categoriesService.updateCategory(db, req.body));
    res.json(result);
  });
  app.delete('/api/categories/:id', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => categoriesService.deleteCategory(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/categories/batch', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => categoriesService.batchAddCategory(db, req.body));
    res.json(result);
  });
};
