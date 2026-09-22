import { type Express, type Request, type Response } from 'express';
import type { ServerDeps } from '../deps';
import { requireAuthenticated, requirePermission } from '../middleware/permissions';
import * as settingsService from '../../shared/services/settings';

export const initSettingsController = (app: Express, { requestTx }: ServerDeps) => {
  app.get('/api/settings', requireAuthenticated(), async (req: Request, res: Response) => {
    const result = await requestTx(req, db => settingsService.getAllSettings(db));
    res.json(result);
  });
  app.put('/api/settings', requirePermission('admin.settings'), async (req: Request, res: Response) => {
    const result = await requestTx(req, db => settingsService.updateSettings(db, req.body));
    res.json(result);
  });
};
