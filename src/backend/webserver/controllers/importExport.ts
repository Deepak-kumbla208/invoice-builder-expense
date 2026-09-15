import { type Express, type Request, type Response } from 'express';
import multer from 'multer';
import { ungzip } from 'pako';
import { withTx } from '../../shared/db/tx';
import * as importExportService from '../../shared/services/importExport';

const upload = multer();

export const initImportExportController = (app: Express) => {
  app.get('/api/export', async (_req: Request, res: Response) => {
    const result = await withTx(db => importExportService.exportAllData(db));
    res.json(result);
  });
  app.post('/api/import', upload.single('file'), async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ success: false, key: 'error.invalidFile' });

    try {
      const decompressed = ungzip(req.file.buffer, { toText: true });

      const parsed = JSON.parse(decompressed);

      const result = await withTx(db => importExportService.importAllData(db, parsed as Record<string, unknown>));
      res.json(result);
    } catch {
      res.status(400).json({ success: false, key: 'error.invalidFile' });
    }
  });
};
