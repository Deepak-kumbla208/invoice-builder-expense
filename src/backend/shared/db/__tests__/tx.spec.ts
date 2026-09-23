// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPgTestDb, type PgTestDb } from '../../../__tests__/helpers/pgTestDb';
import { createWithSystemTx } from '../systemTx';
import { DbUsedOutsideTransaction, createWithRequestTx, createWithTx } from '../tx';

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

describe('withRequestTx', () => {
  it('sets the RLS context for the transaction only', async () => {
    const testDb: PgTestDb = await createPgTestDb();
    try {
      const pool = testDb.rolePool('app_user', 1);
      const ctx = { userId: 42, officeIds: [3, 5], businessIds: [7], allOffices: false };
      const inside = await createWithRequestTx(pool)(ctx, db =>
        db.get(
          `SELECT app_user_id() AS user_id, app_office_ids() AS office_ids,
                  app_business_ids() AS business_ids, app_all_offices() AS all_offices`
        )
      );
      expect(inside).toEqual({ user_id: 42, office_ids: [3, 5], business_ids: [7], all_offices: false });

      const after = await createWithTx(pool)(db =>
        db.get('SELECT app_user_id() AS user_id, app_office_ids() AS office_ids')
      );
      expect(after).toEqual({ user_id: null, office_ids: [] });
    } finally {
      await testDb.drop();
    }
  });
});

describe('withSystemTx', () => {
  it('names the job and only calls auth_cleanup_sessions or sys_* functions', async () => {
    const testDb: PgTestDb = await createPgTestDb();
    try {
      const withSystemTx = createWithSystemTx(testDb.rolePool('app_user'));
      await expect(withSystemTx('test-job', call => call<number>('auth_cleanup_sessions'))).resolves.toBe(0);

      for (const name of ['auth_session', 'app_user_id', 'pg_sleep', 'auth_cleanup_sessions(); DROP TABLE users; --']) {
        await expect(withSystemTx('test-job', call => call(name))).rejects.toThrow(`System jobs cannot call ${name}`);
      }
    } finally {
      await testDb.drop();
    }
  });
});
