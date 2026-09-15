import type { Db } from '../db/tx';
import type { FilterData } from '../types/invoiceFilter';
import type { Unit } from '../types/unit';
import { getAllEntities, handleEntity } from '../utils/entitiesFunctions';
import { mapDatabaseError } from '../utils/errorFunctions';

const unitFields: (keyof Unit)[] = ['name', 'isArchived'];

export const getAllUnits = async (db: Db, filter?: FilterData[]) => {
  const getAll = getAllEntities<Unit>(db, 'units', 'u', 'inv', {
    joins: `
      LEFT JOIN items it ON it."unitId" = u."id"
      LEFT JOIN invoice_items ii ON ii."itemId" = it."id"
      LEFT JOIN invoices inv ON ii."parentInvoiceId" = inv."id"
    `,
    invoiceCountExpr: `
      COUNT(DISTINCT CASE WHEN inv."invoiceType" = 'invoice'
        THEN ii."parentInvoiceId" END)
    `,
    quotesCountExpr: `
      COUNT(DISTINCT CASE WHEN inv."invoiceType" = 'quotation'
        THEN ii."parentInvoiceId" END)
    `
  });
  return getAll(filter ?? []);
};

export const addUnit = async (db: Db, data: Unit) => {
  const handle = handleEntity<Unit>(db, 'units', 'u', unitFields, {
    joins: `
        LEFT JOIN items it ON it."unitId" = u."id"
        LEFT JOIN invoice_items ii ON ii."itemId" = it."id"
        LEFT JOIN invoices inv ON ii."parentInvoiceId" = inv."id"
      `,
    invoiceCountExpr: `
        COUNT(DISTINCT CASE WHEN inv."invoiceType" = 'invoice'
          THEN ii."parentInvoiceId" END)
      `,
    quotesCountExpr: `
        COUNT(DISTINCT CASE WHEN inv."invoiceType" = 'quotation'
          THEN ii."parentInvoiceId" END)
      `
  });
  return handle(data);
};

export const updateUnit = async (db: Db, data: Unit) => {
  const handle = handleEntity<Unit>(db, 'units', 'u', unitFields, {
    joins: `
        LEFT JOIN items it ON it."unitId" = u."id"
        LEFT JOIN invoice_items ii ON ii."itemId" = it."id"
        LEFT JOIN invoices inv ON ii."parentInvoiceId" = inv."id"
      `,
    invoiceCountExpr: `
        COUNT(DISTINCT CASE WHEN inv."invoiceType" = 'invoice'
          THEN ii."parentInvoiceId" END)
      `,
    quotesCountExpr: `
        COUNT(DISTINCT CASE WHEN inv."invoiceType" = 'quotation'
          THEN ii."parentInvoiceId" END)
      `
  });
  return handle(data, true);
};

export const deleteUnit = async (db: Db, id: number) => {
  try {
    await db.run('DELETE FROM units WHERE "id" = ?;', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, ...mapDatabaseError(error) };
  }
};

export const batchAddUnit = async (db: Db, data: Unit[]) => {
  const handle = handleEntity<Unit>(db, 'units', 'u', unitFields, {
    joins: `
        LEFT JOIN items it ON it."unitId" = u."id"
        LEFT JOIN invoice_items ii ON ii."itemId" = it."id"
        LEFT JOIN invoices inv ON ii."parentInvoiceId" = inv."id"
      `,
    invoiceCountExpr: `
        COUNT(DISTINCT CASE WHEN inv."invoiceType" = 'invoice'
          THEN ii."parentInvoiceId" END)
      `,
    quotesCountExpr: `
        COUNT(DISTINCT CASE WHEN inv."invoiceType" = 'quotation'
          THEN ii."parentInvoiceId" END)
      `
  });
  try {
    for (const row of data) {
      const result = await handle(row);
      if (!result.success) {
        return result;
      }
    }
    return { success: true };
  } catch (error) {
    return { success: false, ...mapDatabaseError(error) };
  }
};
