// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import legacyColumns from './fixtures/legacy-columns.json';
import { createPgTestDb, type PgTestDb } from './helpers/pgTestDb';

const INTENTIONAL_DROPS: Record<string, string[]> = {};
const LATER_ADDITIONS: Record<string, string[]> = {
  businesses: ['legal_name', 'pan', 'default_layout_id', 'default_style_profile_id']
};

describe('baseline schema', () => {
  let testDb: PgTestDb;

  beforeAll(async () => {
    testDb = await createPgTestDb();
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it('has the legacy tables and columns minus intentional drops, ignoring later migrations', async () => {
    const rows = await testDb.withTx(db =>
      db.all<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY(?)
       ORDER BY table_name, column_name`,
        [Object.keys(legacyColumns)]
      )
    );
    const actual: Record<string, string[]> = {};
    for (const row of rows) {
      if ((LATER_ADDITIONS[row.table_name] ?? []).includes(row.column_name)) continue;
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
