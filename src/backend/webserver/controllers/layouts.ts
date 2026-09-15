import { type Express, type Request, type Response } from 'express';
import { withTx } from '../../shared/db/tx';
import * as service from '../../shared/services/layouts';
import { parseFilter } from '../utils/functions';

export const initLayoutsController = (app: Express) => {
  app.get('/api/layouts', async (req: Request, res: Response) =>
    res.json(await withTx(db => service.getAllLayouts(db, parseFilter(req.query.filter as string))))
  );
  app.post('/api/layouts', async (req: Request, res: Response) =>
    res.json(await withTx(db => service.addLayout(db, req.body)))
  );
  app.put('/api/layouts', async (req: Request, res: Response) =>
    res.json(await withTx(db => service.updateLayout(db, req.body)))
  );
  app.delete('/api/layouts/:id', async (req: Request, res: Response) =>
    res.json(await withTx(db => service.deleteLayout(db, Number(req.params.id))))
  );
  app.get('/api/layouts/export/:id', async (req: Request, res: Response) => {
    const result = await withTx(db => service.exportLayout(db, Number(req.params.id)));
    res.json(result);
  });
};
