import { type Express, type Request, type Response } from 'express';
import type { ServerDeps } from '../deps';
import { canManageInvoiceSetup, canReadInvoiceSetup } from './access';
import * as banksService from '../../shared/services/banks';
import { decodeBank, encodeResultBank } from '../../shared/utils/dataUrlFunctions';
import { parseFilter } from '../utils/functions';

export const initBanksController = (app: Express, { requestTx }: ServerDeps) => {
  app.get('/api/banks', canReadInvoiceSetup, async (req: Request, res: Response) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await requestTx(req, db => banksService.getAllBanks(db, filter));
    res.json(encodeResultBank(result));
  });
  app.post('/api/banks', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => banksService.addBank(db, decodeBank(req.body)));
    res.json(encodeResultBank(result));
  });
  app.put('/api/banks', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => banksService.updateBank(db, decodeBank(req.body)));
    res.json(encodeResultBank(result));
  });
  app.delete('/api/banks/:id', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => banksService.deleteBank(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/banks/batch', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => banksService.batchAddBank(db, req.body));
    res.json(result);
  });
};
