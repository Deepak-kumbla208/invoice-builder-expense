import { type Express, type Request, type Response } from 'express';
import { withTx } from '../../shared/db/tx';
import * as categoriesService from '../../shared/services/categories';
import { parseFilter } from '../utils/functions';

export const initCategoriesController = (app: Express) => {
  app.get('/api/categories', async (req: Request, res: Response) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await withTx(db => categoriesService.getAllCategories(db, filter));
    res.json(result);
  });
  app.post('/api/categories', async (req: Request, res: Response) => {
    const result = await withTx(db => categoriesService.addCategory(db, req.body));
    res.json(result);
  });
  app.put('/api/categories', async (req: Request, res: Response) => {
    const result = await withTx(db => categoriesService.updateCategory(db, req.body));
    res.json(result);
  });
  app.delete('/api/categories/:id', async (req: Request, res: Response) => {
    const result = await withTx(db => categoriesService.deleteCategory(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/categories/batch', async (req: Request, res: Response) => {
    const result = await withTx(db => categoriesService.batchAddCategory(db, req.body));
    res.json(result);
  });
};
