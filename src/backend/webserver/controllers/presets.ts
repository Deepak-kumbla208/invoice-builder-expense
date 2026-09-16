import { type Express, type Request, type Response as ResponseExpress } from 'express';
import { withTx } from '../../shared/db/tx';
import * as presetsService from '../../shared/services/presets';
import { decodePreset, encodeResultPreset } from '../../shared/utils/dataUrlFunctions';
import { parseFilter } from '../utils/functions';

export const initPresetsController = (app: Express) => {
  app.get('/api/presets', async (req: Request, res: ResponseExpress) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await withTx(db => presetsService.getAllPresets(db, filter));
    res.json(encodeResultPreset(result));
  });
  app.post('/api/presets', async (req: Request, res: ResponseExpress) => {
    const result = await withTx(db => presetsService.addPreset(db, decodePreset(req.body)));
    res.json(encodeResultPreset(result));
  });
  app.put('/api/presets', async (req: Request, res: ResponseExpress) => {
    const result = await withTx(db => presetsService.updatePreset(db, decodePreset(req.body)));
    res.json(encodeResultPreset(result));
  });
  app.delete('/api/presets/:id', async (req: Request, res: ResponseExpress) => {
    const result = await withTx(db => presetsService.deletePreset(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/presets/batch', async (req: Request, res: ResponseExpress) => {
    const result = await withTx(db => presetsService.batchAddPreset(db, req.body));
    res.json(result);
  });
};
