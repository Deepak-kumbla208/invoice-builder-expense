import { type Express, type Request, type Response } from 'express';
import type { ServerDeps } from '../deps';
import { canManageInvoiceSetup, canReadInvoiceSetup } from './access';
import * as currenciesService from '../../shared/services/currencies';
import { parseFilter } from '../utils/functions';

export const initCurrenciesController = (app: Express, { requestTx }: ServerDeps) => {
  app.get('/api/currencies', canReadInvoiceSetup, async (req: Request, res: Response) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await requestTx(req, db => currenciesService.getAllCurrencies(db, filter));
    res.json(result);
  });
  app.post('/api/currencies', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => currenciesService.addCurrency(db, req.body));
    res.json(result);
  });
  app.put('/api/currencies', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => currenciesService.updateCurrency(db, req.body));
    res.json(result);
  });
  app.delete('/api/currencies/:id', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => currenciesService.deleteCurrency(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/currencies/batch', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => currenciesService.batchAddCurrency(db, req.body));
    res.json(result);
  });
};
