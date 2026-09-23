import { type Express, type Request, type Response } from 'express';
import type { EInvoice } from '../../shared/enums/einvoice';
import { InvoiceType } from '../../shared/enums/invoiceType';
import * as invoicesService from '../../shared/services/invoices';
import { decodeInvoice, encodeResultInvoices } from '../../shared/utils/dataUrlFunctions';
import type { ServerDeps } from '../deps';
import { requireAnyPermission, requirePermission } from '../middleware/permissions';
import { parseFilter } from '../utils/functions';

const canViewInvoices = requireAnyPermission('invoice.view', 'invoice.view_all');

export const initInvoicesController = (app: Express, { requestTx }: ServerDeps) => {
  app.get('/api/invoices/xml', requirePermission('invoice.download'), async (req: Request, res: Response) => {
    const data = req.query as unknown as { invoiceId: number; einvoice: EInvoice };
    const result = await requestTx(req, db => invoicesService.getInvoiceXML(db, data));
    if (!result.success) {
      res.status(500).json(result);
      return;
    }

    const xmlBuffer = Buffer.from(result.data.xml, 'utf-8');
    res.setHeader('Content-Type', result.data.profile.fileExtension);
    res.setHeader('Content-Disposition', `attachment; filename="einvoice-${data.invoiceId}.xml"`);
    res.send(xmlBuffer);
  });
  app.get(
    '/api/invoices/sequence',
    requireAnyPermission('invoice.create', 'invoice.edit'),
    async (req: Request, res: Response) => {
      const query = req.query as unknown as { businessId: number; clientId: number; invoiceType?: InvoiceType };
      const data = {
        businessId: query.businessId,
        clientId: query.clientId,
        invoiceType: query.invoiceType ?? InvoiceType.invoice
      };
      const result = await requestTx(req, db => invoicesService.getNextSequence(db, data));
      res.json(result);
    }
  );
  app.get('/api/invoices/headers', canViewInvoices, async (req: Request, res: Response) => {
    const type = req.query.type as 'invoice' | 'quotation';
    const result = await requestTx(req, db => invoicesService.getCustomHeaders(db, type));
    res.json(result);
  });
  app.get('/api/invoices', canViewInvoices, async (req: Request, res: Response) => {
    const type = req.query.type as 'invoice' | 'quotation' | undefined;
    const filter = parseFilter(req.query.filter as string);
    const result = await requestTx(req, db => invoicesService.getAllInvoices(db, type, filter));

    const resultModified = encodeResultInvoices(result);

    res.json(resultModified);
  });
  app.post('/api/invoices', requirePermission('invoice.create'), async (req: Request, res: Response) => {
    const dataModified = decodeInvoice(req.body);

    const result = await requestTx(req, db => invoicesService.addInvoice(db, dataModified));

    const resultModified = encodeResultInvoices(result);
    res.json(resultModified);
  });
  app.put('/api/invoices', requirePermission('invoice.edit'), async (req: Request, res: Response) => {
    const dataModified = decodeInvoice(req.body);

    const result = await requestTx(req, db => invoicesService.updateInvoice(db, dataModified));

    const resultModified = encodeResultInvoices(result);
    res.json(resultModified);
  });
  app.delete('/api/invoices/:id', requirePermission('invoice.delete'), async (req: Request, res: Response) => {
    const result = await requestTx(req, db => invoicesService.deleteInvoice(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/invoices/duplicate', requirePermission('invoice.create'), async (req: Request, res: Response) => {
    const { invoiceId, invoiceType } = req.body;
    const result = await requestTx(req, db => invoicesService.duplicateInvoice(db, invoiceId, invoiceType));

    const resultModified = encodeResultInvoices(result);
    res.json(resultModified);
  });
};
