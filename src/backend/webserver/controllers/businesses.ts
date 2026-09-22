import { type Express, type Request, type Response as ResponseExpress } from 'express';
import type { ServerDeps } from '../deps';
import { requireAnyPermission, requirePermission } from '../middleware/permissions';
import * as businessesService from '../../shared/services/businesses';
import { decodeLogo, encodeResultBusiness } from '../../shared/utils/dataUrlFunctions';
import { parseFilter } from '../utils/functions';

export const initBusinessesController = (app: Express, { requestTx }: ServerDeps) => {
  app.get(
    '/api/businesses',
    requireAnyPermission('invoice.view', 'invoice.view_all', 'admin.companies'),
    async (req: Request, res: ResponseExpress) => {
      const filter = parseFilter(req.query.filter as string);
      const result = await requestTx(req, db => businessesService.getAllBusinesses(db, filter));
      res.json(encodeResultBusiness(result));
    }
  );
  app.post('/api/businesses', requirePermission('admin.companies'), async (req: Request, res: ResponseExpress) => {
    const result = await requestTx(req, db => businessesService.addBusiness(db, decodeLogo(req.body)));
    res.json(encodeResultBusiness(result));
  });
  app.put('/api/businesses', requirePermission('admin.companies'), async (req: Request, res: ResponseExpress) => {
    const result = await requestTx(req, db => businessesService.updateBusiness(db, decodeLogo(req.body)));
    res.json(encodeResultBusiness(result));
  });
  app.delete(
    '/api/businesses/:id',
    requirePermission('admin.companies'),
    async (req: Request, res: ResponseExpress) => {
      const result = await requestTx(req, db => businessesService.deleteBusiness(db, Number(req.params.id)));
      res.json(result);
    }
  );
  app.post(
    '/api/businesses/batch',
    requirePermission('admin.companies'),
    async (req: Request, res: ResponseExpress) => {
      const result = await requestTx(req, db => businessesService.batchAddBusiness(db, req.body));
      res.json(result);
    }
  );
};
