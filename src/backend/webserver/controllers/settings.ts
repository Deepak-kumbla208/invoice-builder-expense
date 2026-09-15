import { type Express, type Request, type Response } from 'express';
import { withTx } from '../../shared/db/tx';
import * as settingsService from '../../shared/services/settings';

export const initSettingsController = (app: Express) => {
  app.get('/api/settings', async (_req: Request, res: Response) => {
    const result = await withTx(db => settingsService.getAllSettings(db));
    res.json(result);
  });
  app.put('/api/settings', async (req: Request, res: Response) => {
    const result = await withTx(db => settingsService.updateSettings(db, req.body));
    res.json(result);
  });
};
