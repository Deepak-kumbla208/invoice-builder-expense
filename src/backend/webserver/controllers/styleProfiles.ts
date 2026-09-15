import { type Express, type Request, type Response as ResponseExpress } from 'express';
import { withTx } from '../../shared/db/tx';
import * as styleProfilesService from '../../shared/services/styleProfiles';
import { decodeStyleProfile, encodeResultStyleProfile } from '../../shared/utils/dataUrlFunctions';
import { parseFilter } from '../utils/functions';

export const initStyleProfilesController = (app: Express) => {
  app.get('/api/styleProfiles', async (req: Request, res: ResponseExpress) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await withTx(db => styleProfilesService.getAllStyleProfiles(db, filter));
    res.json(encodeResultStyleProfile(result));
  });
  app.post('/api/styleProfiles', async (req: Request, res: ResponseExpress) => {
    const result = await withTx(db => styleProfilesService.addStyleProfile(db, decodeStyleProfile(req.body)));
    res.json(encodeResultStyleProfile(result));
  });
  app.put('/api/styleProfiles', async (req: Request, res: ResponseExpress) => {
    const result = await withTx(db => styleProfilesService.updateStyleProfile(db, decodeStyleProfile(req.body)));
    res.json(encodeResultStyleProfile(result));
  });
  app.delete('/api/styleProfiles/:id', async (req: Request, res: ResponseExpress) => {
    const result = await withTx(db => styleProfilesService.deleteStyleProfile(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/styleProfiles/batch', async (req: Request, res: ResponseExpress) => {
    const result = await withTx(db => styleProfilesService.batchAddStyleProfile(db, req.body));
    res.json(result);
  });
};
