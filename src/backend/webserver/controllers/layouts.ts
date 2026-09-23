import { type Express, type Request, type Response } from 'express';
import type { ServerDeps } from '../deps';
import { canManageInvoiceSetup, canReadInvoiceSetup } from './access';
import * as service from '../../shared/services/layouts';
import { parseFilter } from '../utils/functions';

export const initLayoutsController = (app: Express, { requestTx }: ServerDeps) => {
  app.get('/api/layouts', canReadInvoiceSetup, async (req: Request, res: Response) =>
    res.json(await requestTx(req, db => service.getAllLayouts(db, parseFilter(req.query.filter as string))))
  );
  app.post('/api/layouts', canManageInvoiceSetup, async (req: Request, res: Response) =>
    res.json(await requestTx(req, db => service.addLayout(db, req.body)))
  );
  app.put('/api/layouts', canManageInvoiceSetup, async (req: Request, res: Response) =>
    res.json(await requestTx(req, db => service.updateLayout(db, req.body)))
  );
  app.delete('/api/layouts/:id', canManageInvoiceSetup, async (req: Request, res: Response) =>
    res.json(await requestTx(req, db => service.deleteLayout(db, Number(req.params.id))))
  );
  app.get('/api/layouts/export/:id', canManageInvoiceSetup, async (req: Request, res: Response) => {
    const result = await requestTx(req, db => service.exportLayout(db, Number(req.params.id)));
    res.json(result);
  });
};
