import { type Express, type Request, type Response } from 'express';
import { withTx } from '../../shared/db/tx';
import type { EInvoice } from '../../shared/enums/einvoice';
import { InvoiceType } from '../../shared/enums/invoiceType';
import * as invoicesService from '../../shared/services/invoices';
import { decodeInvoice, encodeResultInvoices } from '../../shared/utils/dataUrlFunctions';
import { parseFilter } from '../utils/functions';

export const initInvoicesController = (app: Express) => {
  app.get('/api/invoices/xml', async (req: Request, res: Response) => {
    const data = req.query as unknown as { invoiceId: number; einvoice: EInvoice };
    const result = await withTx(db => invoicesService.getInvoiceXML(db, data));
    if (!result.success) {
      res.status(500).json(result);
      return;
    }

    const xmlBuffer = Buffer.from(result.data.xml, 'utf-8');
    res.setHeader('Content-Type', result.data.profile.fileExtension);
    res.setHeader('Content-Disposition', `attachment; filename="einvoice-${data.invoiceId}.xml"`);
    res.send(xmlBuffer);
  });
  app.get('/api/invoices/sequence', async (req: Request, res: Response) => {
    const query = req.query as unknown as { businessId: number; clientId: number; invoiceType?: InvoiceType };
    const data = {
      businessId: query.businessId,
      clientId: query.clientId,
      invoiceType: query.invoiceType ?? InvoiceType.invoice
    };
    const result = await withTx(db => invoicesService.getNextSequence(db, data));
    res.json(result);
  });
  app.get('/api/invoices/headers', async (req: Request, res: Response) => {
    const type = req.query.type as 'invoice' | 'quotation';
    const result = await withTx(db => invoicesService.getCustomHeaders(db, type));
    res.json(result);
  });
  app.get('/api/invoices', async (req: Request, res: Response) => {
    const type = req.query.type as 'invoice' | 'quotation' | undefined;
    const filter = parseFilter(req.query.filter as string);
    const result = await withTx(db => invoicesService.getAllInvoices(db, type, filter));

    const resultModified = encodeResultInvoices(result);

    res.json(resultModified);
  });
  app.post('/api/invoices', async (req: Request, res: Response) => {
    const dataModified = decodeInvoice(req.body);

    const result = await withTx(db => invoicesService.addInvoice(db, dataModified));

    const resultModified = encodeResultInvoices(result);
    res.json(resultModified);
  });
  app.put('/api/invoices', async (req: Request, res: Response) => {
    const dataModified = decodeInvoice(req.body);

    const result = await withTx(db => invoicesService.updateInvoice(db, dataModified));

    const resultModified = encodeResultInvoices(result);
    res.json(resultModified);
  });
  app.delete('/api/invoices/:id', async (req: Request, res: Response) => {
    const result = await withTx(db => invoicesService.deleteInvoice(db, Number(req.params.id)));
    res.json(result);
  });
  app.post('/api/invoices/duplicate', async (req: Request, res: Response) => {
    const { invoiceId, invoiceType } = req.body;
    const result = await withTx(db => invoicesService.duplicateInvoice(db, invoiceId, invoiceType));

    const resultModified = encodeResultInvoices(result);
    res.json(resultModified);
  });
};
