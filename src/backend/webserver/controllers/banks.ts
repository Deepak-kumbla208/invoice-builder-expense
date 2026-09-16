import { type Express, type Request, type Response } from 'express';
import * as banksService from '../../shared/services/banks';
import { withTx } from '../../shared/db/tx';
import { decodeBank, encodeResultBank } from '../../shared/utils/dataUrlFunctions';
import { parseFilter } from '../utils/functions';

export const initBanksController = (app: Express) => {
  app.get('/api/banks', async (req: Request, res: Response) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await withTx(db => banksService.getAllBanks(db, filter));
    res.json(encodeResultBank(result));
  });
  app.post('/api/banks', async (req: Request, res: Response) => {
    const result = await withTx(db => banksService.addBank(db, decodeBank(req.body)));
    res.json(encodeResultBank(result));
  });
  app.put('/api/banks', async (req: Request, res: Response) => {
    const result = await withTx(db => banksService.updateBank(db, decodeBank(req.body)));
    res.json(encodeResultBank(result));
  });
  app.delete('/api/banks/:id', async (req: Request, res: Response) => {
    const result = await withTx(db => banksService.deleteBank(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/banks/batch', async (req: Request, res: Response) => {
    const result = await withTx(db => banksService.batchAddBank(db, req.body));
    res.json(result);
  });
};
