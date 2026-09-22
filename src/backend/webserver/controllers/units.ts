import { type Express, type Request, type Response } from 'express';
import type { ServerDeps } from '../deps';
import { canManageInvoiceSetup, canReadInvoiceSetup } from './access';
import * as unitsService from '../../shared/services/units';
import { parseFilter } from '../utils/functions';

export const initUnitsController = (app: Express, { requestTx }: ServerDeps) => {
  app.get('/api/units', canReadInvoiceSetup, async (req: Request, res: Response) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await requestTx(req, db => unitsService.getAllUnits(db, filter));
    res.json(result);
  });
  app.post('/api/units', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => unitsService.addUnit(db, req.body));
    res.json(result);
  });
  app.put('/api/units', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => unitsService.updateUnit(db, req.body));
    res.json(result);
  });
  app.delete('/api/units/:id', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => unitsService.deleteUnit(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/units/batch', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => unitsService.batchAddUnit(db, req.body));
    res.json(result);
  });
};
