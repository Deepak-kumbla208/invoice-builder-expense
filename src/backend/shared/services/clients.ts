import type { Db } from '../db/tx';
import type { Client } from '../types/client';
import type { EntityWithCounts } from '../types/entityWithCounts';
import type { FilterData } from '../types/invoiceFilter';
import type { Response } from '../types/response';
import { getAllEntities, handleEntity } from '../utils/entitiesFunctions';
import { mapDatabaseError } from '../utils/errorFunctions';

const clientFields: (keyof Client)[] = [
  'name',
  'shortName',
  'address',
  'email',
  'phone',
  'code',
  'additional',
  'description',
  'vatCode',
  'peppolEndpointId',
  'countryCode',
  'peppolEndpointSchemeId',
  'buyerReference',
  'isArchived'
];

export const getAllClients = async (
  db: Db,
  filter?: FilterData[]
): Promise<Response<(Client & EntityWithCounts)[]>> => {
  const getAll = getAllEntities<Client>(db, 'clients', 't', 'i', {
    joins: `
        LEFT JOIN invoices i ON i."clientId" = t."id"
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

export const addClient = async (db: Db, data: Client): Promise<Response<Client & EntityWithCounts>> => {
  const handle = handleEntity<Client>(db, 'clients', 'c', clientFields, {
    joins: `LEFT JOIN invoices i ON i."clientId" = c."id"`,
    invoiceCountExpr: `
         COUNT(DISTINCT CASE WHEN i."invoiceType" = 'invoice'
           THEN i.id END)
       `,
    quotesCountExpr: `
         COUNT(DISTINCT CASE WHEN i."invoiceType" = 'quotation'
           THEN i."id" END)
       `
  });
  return handle(data);
};

export const updateClient = async (db: Db, data: Client): Promise<Response<Client & EntityWithCounts>> => {
  const handle = handleEntity<Client>(db, 'clients', 'c', clientFields, {
    joins: `LEFT JOIN invoices i ON i."clientId" = c.id`,
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

export const deleteClient = async (db: Db, id: number) => {
  try {
    await db.run('DELETE FROM clients WHERE "id" = ?;', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, ...mapDatabaseError(error) };
  }
};

export const batchAddClient = async (db: Db, data: Client[]) => {
  const handle = handleEntity<Client>(db, 'clients', 'c', clientFields, {
    joins: `LEFT JOIN invoices i ON i."clientId" = c."id"`,
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
