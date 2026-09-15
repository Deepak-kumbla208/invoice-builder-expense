import { type Express, type Request, type Response } from 'express';
import { withTx } from '../../shared/db/tx';
import * as unitsService from '../../shared/services/units';
import { parseFilter } from '../utils/functions';

export const initUnitsController = (app: Express) => {
  app.get('/api/units', async (req: Request, res: Response) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await withTx(db => unitsService.getAllUnits(db, filter));
    res.json(result);
  });
  app.post('/api/units', async (req: Request, res: Response) => {
    const result = await withTx(db => unitsService.addUnit(db, req.body));
    res.json(result);
  });
  app.put('/api/units', async (req: Request, res: Response) => {
    const result = await withTx(db => unitsService.updateUnit(db, req.body));
    res.json(result);
  });
  app.delete('/api/units/:id', async (req: Request, res: Response) => {
    const result = await withTx(db => unitsService.deleteUnit(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/units/batch', async (req: Request, res: Response) => {
    const result = await withTx(db => unitsService.batchAddUnit(db, req.body));
    res.json(result);
  });
};
