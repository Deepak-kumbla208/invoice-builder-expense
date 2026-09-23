import { type Express, type Request, type Response as ResponseExpress } from 'express';
import type { ServerDeps } from '../deps';
import { canManageInvoiceSetup, canReadInvoiceSetup } from './access';
import * as styleProfilesService from '../../shared/services/styleProfiles';
import { decodeStyleProfile, encodeResultStyleProfile } from '../../shared/utils/dataUrlFunctions';
import { parseFilter } from '../utils/functions';

export const initStyleProfilesController = (app: Express, { requestTx }: ServerDeps) => {
  app.get('/api/styleProfiles', canReadInvoiceSetup, async (req: Request, res: ResponseExpress) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await requestTx(req, db => styleProfilesService.getAllStyleProfiles(db, filter));
    res.json(encodeResultStyleProfile(result));
  });
  app.post('/api/styleProfiles', canManageInvoiceSetup, async (req: Request, res: ResponseExpress) => {
    const result = await requestTx(req, db => styleProfilesService.addStyleProfile(db, decodeStyleProfile(req.body)));
    res.json(encodeResultStyleProfile(result));
  });
  app.put('/api/styleProfiles', canManageInvoiceSetup, async (req: Request, res: ResponseExpress) => {
    const result = await requestTx(req, db =>
      styleProfilesService.updateStyleProfile(db, decodeStyleProfile(req.body))
    );
    res.json(encodeResultStyleProfile(result));
  });
  app.delete('/api/styleProfiles/:id', canManageInvoiceSetup, async (req: Request, res: ResponseExpress) => {
    const result = await requestTx(req, db => styleProfilesService.deleteStyleProfile(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/styleProfiles/batch', canManageInvoiceSetup, async (req: Request, res: ResponseExpress) => {
    const result = await requestTx(req, db => styleProfilesService.batchAddStyleProfile(db, req.body));
    res.json(result);
  });
};
