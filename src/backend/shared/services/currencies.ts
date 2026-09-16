import type { Db } from '../db/tx';
import type { Currency } from '../types/currency';
import type { EntityWithCounts } from '../types/entityWithCounts';
import type { FilterData } from '../types/invoiceFilter';
import type { Response } from '../types/response';
import { getAllEntities, handleEntity } from '../utils/entitiesFunctions';
import { mapDatabaseError } from '../utils/errorFunctions';

const currencyFields: (keyof Currency)[] = ['code', 'symbol', 'text', 'format', 'isArchived', 'subunit'];

export const getAllCurrencies = async (
  db: Db,
  filter?: FilterData[]
): Promise<Response<(Currency & EntityWithCounts)[]>> => {
  const getAll = getAllEntities<Currency>(db, 'currencies', 't', 'i', {
    joins: `
        LEFT JOIN invoices i ON i."currencyId" = t."id"
      `,
    invoiceCountExpr: `
        COUNT(DISTINCT CASE WHEN i."invoiceType" = 'invoice'
          THEN i."id" END)
      `,
    quotesCountExpr: `
        COUNT(DISTINCT CASE WHEN i."invoiceType" = 'quotation'
          THEN i."id" END)
      `
  });
  return getAll(filter ?? []);
};

export const addCurrency = async (db: Db, data: Currency): Promise<Response<Currency & EntityWithCounts>> => {
  const handle = handleEntity<Currency>(db, 'currencies', 'c', currencyFields, {
    joins: `LEFT JOIN invoices i ON i."currencyId" = c."id"`,
    invoiceCountExpr: `
         COUNT(DISTINCT CASE WHEN i."invoiceType" = 'invoice'
           THEN i."id" END)
       `,
    quotesCountExpr: `
         COUNT(DISTINCT CASE WHEN i."invoiceType" = 'quotation'
           THEN i."id" END)
       `
  });
  return handle(data);
};

export const updateCurrency = async (db: Db, data: Currency): Promise<Response<Currency & EntityWithCounts>> => {
  const handle = handleEntity<Currency>(db, 'currencies', 'c', currencyFields, {
    joins: `LEFT JOIN invoices i ON i."currencyId" = c."id"`,
    invoiceCountExpr: `
         COUNT(DISTINCT CASE WHEN i."invoiceType" = 'invoice'
           THEN i."id" END)
       `,
    quotesCountExpr: `
         COUNT(DISTINCT CASE WHEN i."invoiceType" = 'quotation'
           THEN i."id" END)
       `
  });
  return handle(data, true);
};

export const deleteCurrency = async (db: Db, id: number) => {
  try {
    await db.run('DELETE FROM currencies WHERE id = ?;', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, ...mapDatabaseError(error) };
  }
};

export const batchAddCurrency = async (db: Db, data: Currency[]) => {
  const handle = handleEntity<Currency>(db, 'currencies', 'c', currencyFields, {
    joins: `LEFT JOIN invoices i ON i."currencyId" = c."id"`,
    invoiceCountExpr: `
         COUNT(DISTINCT CASE WHEN i."invoiceType" = 'invoice'
           THEN i."id" END)
       `,
    quotesCountExpr: `
         COUNT(DISTINCT CASE WHEN i."invoiceType" = 'quotation'
           THEN i."id" END)
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
