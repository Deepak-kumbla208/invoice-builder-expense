import type { Db } from '../db/tx';
import type { Business } from '../types/business';
import type { EntityWithCounts } from '../types/entityWithCounts';
import type { FilterData } from '../types/invoiceFilter';
import type { Response } from '../types/response';
import { getAllEntities, handleEntity } from '../utils/entitiesFunctions';
import { mapDatabaseError } from '../utils/errorFunctions';

const businessFields: (keyof Business)[] = [
  'name',
  'shortName',
  'address',
  'role',
  'email',
  'phone',
  'website',
  'additional',
  // Legacy payment info. New payment info is via Bank
  // 'paymentInformation',
  'logo',
  'fileSize',
  'fileType',
  'fileName',
  'description',
  'vatCode',
  'peppolEndpointId',
  'countryCode',
  'code',
  'peppolEndpointSchemeId',
  'isArchived'
];

export const getAllBusinesses = (db: Db, filter?: FilterData[]): Promise<Response<(Business & EntityWithCounts)[]>> => {
  const getAll = getAllEntities<Business>(db, 'businesses', 't', 'i', {
    joins: `
      LEFT JOIN invoices i ON i."businessId" = t."id"
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

export const addBusiness = (db: Db, data: Business): Promise<Response<Business & EntityWithCounts>> => {
  const handle = handleEntity<Business>(db, 'businesses', 'b', businessFields, {
    joins: `LEFT JOIN invoices i ON i."businessId" = b.id`,
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

export const updateBusiness = (db: Db, data: Business): Promise<Response<Business & EntityWithCounts>> => {
  const handle = handleEntity<Business>(db, 'businesses', 'b', businessFields, {
    joins: `LEFT JOIN invoices i ON i."businessId" = b."id"`,
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

export const deleteBusiness = async (db: Db, id: number) => {
  try {
    await db.run('DELETE FROM businesses WHERE "id" = ?;', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, ...mapDatabaseError(error) };
  }
};

export const batchAddBusiness = async (db: Db, data: Business[]) => {
  const handle = handleEntity<Business>(db, 'businesses', 'b', businessFields, {
    joins: `LEFT JOIN invoices i ON i."businessId" = b."id"`,
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
