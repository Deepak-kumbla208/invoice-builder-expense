import type { Db } from '../db/tx';
import type { FilterData } from '../types/invoiceFilter';
import type { Layout } from '../types/layouts';
import { getAllEntities, handleEntity } from '../utils/entitiesFunctions';
import { mapDatabaseError } from '../utils/errorFunctions';

const fields: Array<keyof Layout> = ['isArchived', 'schema'];
const parse = <T extends Layout>(template: T): T =>
  ({ ...template, schema: typeof template.schema === 'string' ? JSON.parse(template.schema) : template.schema }) as T;

export const getAllLayouts = async (db: Db, filter?: FilterData[]) => {
  const result = await getAllEntities<Layout>(db, 'layouts', 'l', 'i', {
    joins: 'LEFT JOIN invoices i ON i."layoutId" = l."id"',
    invoiceCountExpr: 'COUNT(DISTINCT CASE WHEN i."invoiceType" = \'invoice\' THEN i."id" END)',
    quotesCountExpr: 'COUNT(DISTINCT CASE WHEN i."invoiceType" = \'quotation\' THEN i."id" END)'
  })(filter ?? []);
  result.data = result.data?.map(parse);
  return result;
};

const handleTemplate = (db: Db) =>
  handleEntity<Layout>(db, 'layouts', 'l', fields, {
    joins: 'LEFT JOIN invoices i ON i."layoutId" = l."id"',
    invoiceCountExpr: 'COUNT(DISTINCT CASE WHEN i."invoiceType" = \'invoice\' THEN i."id" END)',
    quotesCountExpr: 'COUNT(DISTINCT CASE WHEN i."invoiceType" = \'quotation\' THEN i."id" END)'
  });

export const exportLayout = async (db: Db, id: number) => {
  try {
    const result = await db.get<Layout>('SELECT * FROM layouts WHERE "id" = ?', [id]);
    return {
      success: true,
      data: result
        ? { ...result, schema: typeof result.schema === 'string' ? JSON.parse(result.schema) : result.schema }
        : null
    };
  } catch (error) {
    return { success: false, ...mapDatabaseError(error) };
  }
};
export const addLayout = async (db: Db, data: Layout) => {
  const result = await handleTemplate(db)({ ...data, schema: JSON.stringify(data.schema) });
  result.data = result.data ? parse(result.data) : result.data;
  return result;
};
export const updateLayout = async (db: Db, data: Layout) => {
  const result = await handleTemplate(db)({ ...data, schema: JSON.stringify(data.schema) }, true);
  result.data = result.data ? parse(result.data) : result.data;
  return result;
};
export const deleteLayout = async (db: Db, id: number) => {
  try {
    await db.run('DELETE FROM layouts WHERE "id" = ?', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, ...mapDatabaseError(error) };
  }
};
