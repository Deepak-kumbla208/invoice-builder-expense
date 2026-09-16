// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPgTestDb, type PgTestDb } from '../../../__tests__/helpers/pgTestDb';
import { DbUsedOutsideTransaction } from '../tx';

describe('withTx', () => {
  it('commits successful transactions', async () => {
    const testDb: PgTestDb = await createPgTestDb();
    try {
      const row = await testDb.withTx(db => db.get<{ x: number }>('SELECT 1 AS x'));
      expect(row).toEqual({ x: 1 });
    } finally {
      await testDb.drop();
    }
  });

  it('rolls back when the callback throws', async () => {
    const testDb: PgTestDb = await createPgTestDb();
    try {
      await expect(
        testDb.withTx(async db => {
          await db.run(
            `INSERT INTO currencies ("code", "symbol", "text", "format", "subunit") VALUES (?, ?, ?, ?, ?)`,
            ['ZZZ', 'Z', 'Test', '{amount}', 100]
          );
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');

      const row = await testDb.withTx(db => db.get('SELECT "id" FROM currencies WHERE "code" = ?', ['ZZZ']));
      expect(row).toBeNull();
    } finally {
      await testDb.drop();
    }
  });

  it('throws DbUsedOutsideTransaction once the transaction has ended', async () => {
    const testDb: PgTestDb = await createPgTestDb();
    try {
      let db: Parameters<Parameters<typeof testDb.withTx>[0]>[0] | undefined;
      await testDb.withTx(async inner => {
        db = inner;
        return inner.get('SELECT 1');
      });

      await expect(db!.get('SELECT 1')).rejects.toBeInstanceOf(DbUsedOutsideTransaction);
    } finally {
      await testDb.drop();
    }
  });
});
