import { type Express, type Request, type Response } from 'express';
import { withTx } from '../../shared/db/tx';
import * as currenciesService from '../../shared/services/currencies';
import { parseFilter } from '../utils/functions';

export const initCurrenciesController = (app: Express) => {
  app.get('/api/currencies', async (req: Request, res: Response) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await withTx(db => currenciesService.getAllCurrencies(db, filter));
    res.json(result);
  });
  app.post('/api/currencies', async (req: Request, res: Response) => {
    const result = await withTx(db => currenciesService.addCurrency(db, req.body));
    res.json(result);
  });
  app.put('/api/currencies', async (req: Request, res: Response) => {
    const result = await withTx(db => currenciesService.updateCurrency(db, req.body));
    res.json(result);
  });
  app.delete('/api/currencies/:id', async (req: Request, res: Response) => {
    const result = await withTx(db => currenciesService.deleteCurrency(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/currencies/batch', async (req: Request, res: Response) => {
    const result = await withTx(db => currenciesService.batchAddCurrency(db, req.body));
    res.json(result);
  });
};
