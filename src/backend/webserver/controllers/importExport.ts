import { type Express, type Request, type Response } from 'express';
import type { ServerDeps } from '../deps';
import { requirePermission } from '../middleware/permissions';
import multer from 'multer';
import { ungzip } from 'pako';
import * as importExportService from '../../shared/services/importExport';

const upload = multer();

export const initImportExportController = (app: Express, { requestTx }: ServerDeps) => {
  app.get('/api/export', requirePermission('admin.settings'), async (req: Request, res: Response) => {
    const result = await requestTx(req, db => importExportService.exportAllData(db));
    res.json(result);
  });
  app.post(
    '/api/import',
    requirePermission('admin.settings'),
    upload.single('file'),
    async (req: Request, res: Response) => {
      if (!req.file) return res.status(400).json({ success: false, key: 'error.invalidFile' });

      try {
        const decompressed = ungzip(req.file.buffer, { toText: true });

        const parsed = JSON.parse(decompressed);

        const result = await requestTx(req, db =>
          importExportService.importAllData(db, parsed as Record<string, unknown>)
        );
        res.json(result);
      } catch {
        res.status(400).json({ success: false, key: 'error.invalidFile' });
      }
    }
  );
};
