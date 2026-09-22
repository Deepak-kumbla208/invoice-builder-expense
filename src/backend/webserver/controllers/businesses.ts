import { type Express, type Request, type Response } from 'express';
import * as businessesService from '../../shared/services/businesses';
import { createCompany, updateCompany } from '../../shared/services/companies';
import { decodeLogo, encodeResultBusiness } from '../../shared/utils/dataUrlFunctions';
import { companyCreateSchema, companyUpdateSchema } from '../../shared/validation/admin';
import type { ServerDeps } from '../deps';
import { parseBody } from '../middleware/errors';
import { requireAnyPermission, requirePermission } from '../middleware/permissions';
import { ctxOf } from '../middleware/session';
import { parseFilter } from '../utils/functions';

export const initBusinessesController = (app: Express, { requestTx }: ServerDeps) => {
  app.get(
    '/api/businesses',
    requireAnyPermission('invoice.view', 'invoice.view_all', 'admin.companies'),
    async (req: Request, res: Response) => {
      const filter = parseFilter(req.query.filter as string);
      const result = await requestTx(req, db => businessesService.getAllBusinesses(db, filter));
      res.json(encodeResultBusiness(result));
    }
  );
  app.post('/api/businesses', requirePermission('admin.companies'), async (req: Request, res: Response) => {
    const data = decodeLogo(parseBody(companyCreateSchema, req.body));
    const result = await requestTx(req, db => createCompany(db, ctxOf(req), data));
    res.json(encodeResultBusiness(result));
  });
  app.put('/api/businesses', requirePermission('admin.companies'), async (req: Request, res: Response) => {
    const data = decodeLogo(parseBody(companyUpdateSchema, req.body));
    const result = await requestTx(req, db => updateCompany(db, ctxOf(req), data));
    res.json(encodeResultBusiness(result));
  });
};
