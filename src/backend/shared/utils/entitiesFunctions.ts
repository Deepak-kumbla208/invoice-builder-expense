import type { EntityWithId } from '../../shared/types/entityWithId';
import type { FilterData } from '../../shared/types/invoiceFilter';
import type { Response } from '../../shared/types/response';
import type { Db } from '../db/tx';
import type { EntityWithCounts } from '../types/entityWithCounts';
import type { InvoiceAggregation } from '../types/InvoiceAggregation';
import { mapDatabaseError } from './errorFunctions';
import { getHavingClauseFromFilters } from './filterFunctions';

export const getAllEntities =
  <T extends object>(
    db: Db,
    table: string,
    alias: string,
    invoiceAlias: string,
    aggregation: InvoiceAggregation
  ): ((filter: FilterData[]) => Promise<Response<(T & EntityWithCounts)[]>>) =>
  async (filter: FilterData[]) => {
    const having = getHavingClauseFromFilters({
      filters: filter,
      invoiceUpdatedAtColumn: `${invoiceAlias}."updatedAt"`,
      invoiceIdColumn: `${invoiceAlias}."id"`,
      archivedColumn: `${alias}."isArchived"`
    });

    const sql = `
      SELECT
        ${alias}.*,
        ${aggregation.invoiceCountExpr} AS "invoiceCount",
        ${aggregation.quotesCountExpr} AS "quotesCount"
      FROM ${table} ${alias}
      ${aggregation.joins}
      GROUP BY ${alias}."id"
      ${having.sql}
      ORDER BY ${alias}."createdAt" DESC
    `;

    const data = await db.all<T & EntityWithCounts>(sql, having.params);

    return { success: true, data };
  };

export const handleEntity =
  <T extends EntityWithId>(
    db: Db,
    table: string,
    alias: string,
    fields: readonly (keyof T)[],
    aggregation: InvoiceAggregation
  ) =>
  async (data: T, isUpdate = false): Promise<Response<T & EntityWithCounts>> => {
    const params = fields.map(key => (data[key] ?? null) as string | number | boolean | null);

    try {
      let lastID: number = -1;

      if (isUpdate) {
        const setClause = fields.map(f => `"${String(f)}" = ?`).join(', ') + `, "updatedAt" = NOW()`;
        await db.run(`UPDATE ${table} SET ${setClause} WHERE "id" = ?`, [...params, data.id ?? -1], true);
        lastID = data.id ?? -1;
      } else {
        lastID = await db.run(
          `INSERT INTO ${table} (${fields.map(f => `"${String(f)}"`).join(',')})
           VALUES (${fields.map(() => '?').join(',')})`,
          params,
          true
        );
      }

      const sql = `
        SELECT
          ${alias}.*,
          ${aggregation.invoiceCountExpr} AS "invoiceCount",
          ${aggregation.quotesCountExpr} AS "quotesCount"
        FROM ${table} ${alias}
        ${aggregation.joins}
        WHERE ${alias}."id" = ?
        GROUP BY ${alias}."id"
      `;

      const row = await db.get<T & EntityWithCounts>(sql, [lastID]);

      return { success: true, data: row ?? undefined };
    } catch (error) {
      return { success: false, ...mapDatabaseError(error) };
    }
  };
