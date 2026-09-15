import type { Db } from '../db/tx';
import type { Category } from '../types/category';
import type { FilterData } from '../types/invoiceFilter';
import { getAllEntities, handleEntity } from '../utils/entitiesFunctions';
import { mapDatabaseError } from '../utils/errorFunctions';

const categoryFields: (keyof Category)[] = ['name', 'isArchived'];

export const getAllCategories = async (db: Db, filter?: FilterData[]) => {
  const getAll = getAllEntities<Category>(db, 'categories', 'c', 'inv', {
    joins: `
        LEFT JOIN items it ON it."categoryId" = c."id"
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

export const addCategory = async (db: Db, data: Category) => {
  const handle = handleEntity<Category>(db, 'categories', 'c', categoryFields, {
    joins: `
          LEFT JOIN items it ON it."categoryId" = c."id"
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

export const updateCategory = async (db: Db, data: Category) => {
  const handle = handleEntity<Category>(db, 'categories', 'c', categoryFields, {
    joins: `
          LEFT JOIN items it ON it."categoryId" = c."id"
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

export const deleteCategory = async (db: Db, id: number) => {
  try {
    await db.run('DELETE FROM categories WHERE "id" = ?;', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, ...mapDatabaseError(error) };
  }
};

export const batchAddCategory = async (db: Db, data: Category[]) => {
  const handle = handleEntity<Category>(db, 'categories', 'c', categoryFields, {
    joins: `
          LEFT JOIN items it ON it."categoryId" = c."id"
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
