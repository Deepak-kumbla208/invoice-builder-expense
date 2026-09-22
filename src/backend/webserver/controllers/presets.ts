import { type Express, type Request, type Response as ResponseExpress } from 'express';
import type { ServerDeps } from '../deps';
import { canManageInvoiceSetup, canReadInvoiceSetup } from './access';
import * as presetsService from '../../shared/services/presets';
import { decodePreset, encodeResultPreset } from '../../shared/utils/dataUrlFunctions';
import { parseFilter } from '../utils/functions';

export const initPresetsController = (app: Express, { requestTx }: ServerDeps) => {
  app.get('/api/presets', canReadInvoiceSetup, async (req: Request, res: ResponseExpress) => {
    const filter = parseFilter(req.query.filter as string);
    const result = await requestTx(req, db => presetsService.getAllPresets(db, filter));
    res.json(encodeResultPreset(result));
  });
  app.post('/api/presets', canManageInvoiceSetup, async (req: Request, res: ResponseExpress) => {
    const result = await requestTx(req, db => presetsService.addPreset(db, decodePreset(req.body)));
    res.json(encodeResultPreset(result));
  });
  app.put('/api/presets', canManageInvoiceSetup, async (req: Request, res: ResponseExpress) => {
    const result = await requestTx(req, db => presetsService.updatePreset(db, decodePreset(req.body)));
    res.json(encodeResultPreset(result));
  });
  app.delete('/api/presets/:id', canManageInvoiceSetup, async (req: Request, res: ResponseExpress) => {
    const result = await requestTx(req, db => presetsService.deletePreset(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/presets/batch', canManageInvoiceSetup, async (req: Request, res: ResponseExpress) => {
    const result = await requestTx(req, db => presetsService.batchAddPreset(db, req.body));
    res.json(result);
  });
};
