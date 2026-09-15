import type { Pool, PoolClient } from 'pg';
import { convertDateFields, convertDateFieldsArray } from '../utils/dbHelper';
import { pool } from './pool';

export type Db = {
  run: (sql: string, params?: unknown[], returningId?: boolean) => Promise<number>;
  get: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | null>;
  all: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

export class DbUsedOutsideTransaction extends Error {
  constructor() {
    super('error.dbUsedOutsideTransaction');
  }
}

const convertQuestionToDollar = (sql: string) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

const createDb = (client: PoolClient, isActive: () => boolean): Db => {
  const assertActive = () => {
    if (!isActive()) throw new DbUsedOutsideTransaction();
  };

  const runQuery = async (sql: string, params: unknown[] = []) => {
    assertActive();
    return client.query(convertQuestionToDollar(sql), params);
  };

  return {
    run: async (sql, params = [], returningId = false) => {
      const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
      if (returningId && isInsert && !sql.toUpperCase().includes('RETURNING')) {
        sql += ' RETURNING id';
      }

      const res = await runQuery(sql, params);
      if (isInsert && returningId) {
        return res.rows[0]?.id ?? -1;
      }
      return res.rowCount ?? 0;
    },
    get: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
      const res = await runQuery(sql, params);
      if (!res.rows[0]) return null;
      return convertDateFields(res.rows[0] as Record<string, unknown>) as T;
    },
    all: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
      const res = await runQuery(sql, params);
      return convertDateFieldsArray(res.rows as Record<string, unknown>[]) as T[];
    },
    query: async (sql: string, params: unknown[] = []) => {
      const res = await runQuery(sql, params);
      return { rows: convertDateFieldsArray(res.rows as Record<string, unknown>[]) };
    }
  };
};

export const createWithTx =
  (dbPool: Pool) =>
  async <T>(fn: (db: Db) => Promise<T>): Promise<T> => {
    const client = await dbPool.connect();
    let active = true;
    const db = createDb(client, () => active);

    try {
      await client.query('BEGIN');
      const result = await fn(db);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // The original error is more useful than a failed rollback.
      }
      throw error;
    } finally {
      active = false;
      client.release();
    }
  };

export const withTx = createWithTx(pool);
