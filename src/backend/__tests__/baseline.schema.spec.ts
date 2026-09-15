// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from '../shared/types/DatabaseAdapter';
import legacyColumns from './fixtures/legacy-columns.json';
import { createPgTestDb, type PgTestDb } from './helpers/pgTestDb';

const INTENTIONAL_DROPS: Record<string, string[]> = {};

describe('baseline schema', () => {
  let testDb: PgTestDb;
  let db: DatabaseAdapter;

  beforeAll(async () => {
    testDb = await createPgTestDb();
    db = testDb.db;
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it('has the legacy tables and columns minus intentional drops', async () => {
    const rows = await db.all<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name <> 'migrations'
       ORDER BY table_name, column_name`
    );
    const actual: Record<string, string[]> = {};
    for (const row of rows) {
      (actual[row.table_name] ??= []).push(row.column_name);
    }

    const expected = Object.fromEntries(
      Object.entries(legacyColumns as Record<string, string[]>)
        .map(([table, columns]): [string, string[]] => [
          table,
          columns.filter(column => !(INTENTIONAL_DROPS[table] ?? []).includes(column))
        ])
        .filter(([, columns]) => columns.length > 0)
    );

    expect(actual).toEqual(expected);
  });
});
