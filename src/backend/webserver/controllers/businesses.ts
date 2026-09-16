import { type Express, type Request, type Response as ResponseExpress } from 'express';
import { withTx } from '../../shared/db/tx';
import * as businessesService from '../../shared/services/businesses';
import { decodeLogo, encodeResultBusiness } from '../../shared/utils/dataUrlFunctions';
import { parseFilter } from '../utils/functions';

export const initBusinessesController = (app: Express) => {
  app.get('/api/businesses', async (req: Request, res: ResponseExpress) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await withTx(db => businessesService.getAllBusinesses(db, filter));
    res.json(encodeResultBusiness(result));
  });
  app.post('/api/businesses', async (req: Request, res: ResponseExpress) => {
    const result = await withTx(db => businessesService.addBusiness(db, decodeLogo(req.body)));
    res.json(encodeResultBusiness(result));
  });
  app.put('/api/businesses', async (req: Request, res: ResponseExpress) => {
    const result = await withTx(db => businessesService.updateBusiness(db, decodeLogo(req.body)));
    res.json(encodeResultBusiness(result));
  });
  app.delete('/api/businesses/:id', async (req: Request, res: ResponseExpress) => {
    const result = await withTx(db => businessesService.deleteBusiness(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/businesses/batch', async (req: Request, res: ResponseExpress) => {
    const result = await withTx(db => businessesService.batchAddBusiness(db, req.body));
    res.json(result);
  });
};
