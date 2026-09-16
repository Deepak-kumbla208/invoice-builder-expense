import type { Db } from '../db/tx';
import type { Bank } from '../types/bank';
import type { EntityWithCounts } from '../types/entityWithCounts';
import type { FilterData } from '../types/invoiceFilter';
import type { Response } from '../types/response';
import { getAllEntities, handleEntity } from '../utils/entitiesFunctions';
import { mapDatabaseError } from '../utils/errorFunctions';

const bankFields: (keyof Bank)[] = [
  'name',
  'bankName',
  'accountNumber',
  'swiftCode',
  'address',
  'branchCode',
  'type',
  'routingNumber',
  'accountHolder',
  'sortOrder',
  'upiCode',
  'qrCode',
  'qrCodeFileSize',
  'qrCodeFileType',
  'qrCodeFileName',
  'isArchived'
];

export const getAllBanks = async (db: Db, filter?: FilterData[]): Promise<Response<(Bank & EntityWithCounts)[]>> => {
  const getAll = getAllEntities<Bank>(db, 'banks', 'b', 'i', {
    joins: `
          LEFT JOIN invoices i ON i."bankId" = b."id"
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

export const addBank = async (db: Db, data: Bank): Promise<Response<Bank & EntityWithCounts>> => {
  const handle = handleEntity<Bank>(db, 'banks', 'b', bankFields, {
    joins: `LEFT JOIN invoices i ON i."bankId" = b."id"`,
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

export const updateBank = async (db: Db, data: Bank): Promise<Response<Bank & EntityWithCounts>> => {
  const handle = handleEntity<Bank>(db, 'banks', 'b', bankFields, {
    joins: `LEFT JOIN invoices i ON i."bankId" = b."id"`,
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

export const deleteBank = async (db: Db, id: number) => {
  try {
    await db.run('DELETE FROM banks WHERE "id" = ?;', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, ...mapDatabaseError(error) };
  }
};

export const batchAddBank = async (db: Db, data: Bank[]) => {
  const handle = handleEntity<Bank>(db, 'banks', 'b', bankFields, {
    joins: `LEFT JOIN invoices i ON i."bankId" = b."id"`,
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
