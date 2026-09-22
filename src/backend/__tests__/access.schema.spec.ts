// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../shared/db/tx';
import { createPgTestDb, type PgTestDb } from './helpers/pgTestDb';

const CRUD = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];

const APP_USER_GRANTS: Record<string, string[]> = {
  migrations: [],
  offices: ['INSERT', 'SELECT', 'UPDATE'],
  roles: CRUD,
  permissions: ['SELECT'],
  role_permissions: ['DELETE', 'INSERT', 'SELECT'],
  users: ['INSERT', 'SELECT', 'UPDATE'],
  user_permissions: ['DELETE', 'INSERT', 'SELECT'],
  user_offices: ['DELETE', 'INSERT', 'SELECT'],
  sessions: [],
  audit_logs: ['INSERT', 'SELECT'],
  notifications: ['INSERT', 'SELECT', 'UPDATE']
};

describe('access schema (0002)', () => {
  let testDb: PgTestDb;
  let companyA: number;
  let companyB: number;
  let officeA: number;

  const asAppUser = <T>(fn: (db: Db) => Promise<T>) =>
    testDb.withTx(async db => {
      await db.run('SET LOCAL ROLE app_user');
      return fn(db);
    });

  beforeAll(async () => {
    testDb = await createPgTestDb();
    await testDb.withTx(async db => {
      companyA = await db.run(`INSERT INTO businesses ("name", "shortName") VALUES ('Company A', 'CA')`, [], true);
      companyB = await db.run(`INSERT INTO businesses ("name", "shortName") VALUES ('Company B', 'CB')`, [], true);
      officeA = await db.run(
        `INSERT INTO offices (business_id, name, code, state_code) VALUES (?, 'Bengaluru', 'BLR', '29')`,
        [companyA],
        true
      );
    });
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it('creates app_owner with BYPASSRLS and app_user without it, with timeouts', async () => {
    const roles = await testDb.withTx(db =>
      db.all(
        `SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolconfig
         FROM pg_roles WHERE rolname IN ('app_owner', 'app_user') ORDER BY rolname`
      )
    );
    expect(roles).toEqual([
      expect.objectContaining({ rolname: 'app_owner', rolcanlogin: true, rolsuper: false, rolbypassrls: true }),
      {
        rolname: 'app_user',
        rolcanlogin: true,
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolconfig: expect.arrayContaining(['statement_timeout=15s', 'idle_in_transaction_session_timeout=30s'])
      }
    ]);
  });

  it('is a no-op when migrations run again', async () => {
    await expect(testDb.migrate()).resolves.toEqual([]);
  });

  it('makes app_owner the owner of every table', async () => {
    const owners = await testDb.withTx(db =>
      db.all<{ tableowner: string }>(`SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname = 'public'`)
    );
    expect(owners).toEqual([{ tableowner: 'app_owner' }]);
  });

  it('grants app_user exactly the expected table privileges', async () => {
    const rows = await testDb.withTx(db =>
      db.all<{ table_name: string; privileges: string[] | null }>(
        `SELECT t.tablename AS table_name,
                array_agg(g.privilege_type::text ORDER BY g.privilege_type) FILTER (WHERE g.privilege_type IS NOT NULL) AS privileges
         FROM pg_tables t
         LEFT JOIN information_schema.role_table_grants g
           ON g.table_schema = t.schemaname AND g.table_name = t.tablename AND g.grantee = 'app_user'
         WHERE t.schemaname = 'public'
         GROUP BY t.tablename`
      )
    );
    const actual = Object.fromEntries(rows.map(row => [row.table_name, row.privileges ?? []]));
    const expected = Object.fromEntries(rows.map(row => [row.table_name, APP_USER_GRANTS[row.table_name] ?? CRUD]));

    expect(Object.keys(APP_USER_GRANTS).filter(table => !(table in actual))).toEqual([]);
    expect(actual).toEqual(expected);
  });

  it('lets app_user insert into identity tables but not touch sessions or rewrite audit_logs', async () => {
    const roleId = await asAppUser(db => db.run(`INSERT INTO roles (name) VALUES ('Scratch role')`, [], true));
    expect(roleId).toBeGreaterThan(0);

    await expect(asAppUser(db => db.all('SELECT * FROM sessions'))).rejects.toMatchObject({ code: '42501' });
    await asAppUser(db => db.run(`INSERT INTO audit_logs (action) VALUES ('test.event')`));
    await expect(asAppUser(db => db.run(`UPDATE audit_logs SET action = 'x'`))).rejects.toMatchObject({
      code: '42501'
    });
    await expect(asAppUser(db => db.run('DELETE FROM audit_logs'))).rejects.toMatchObject({ code: '42501' });
  });

  it('validates office codes and keeps them globally unique', async () => {
    const insertOffice = (code: string) =>
      testDb.withTx(db =>
        db.run(`INSERT INTO offices (business_id, name, code, state_code) VALUES (?, 'Office', ?, '27')`, [
          companyB,
          code
        ])
      );

    for (const code of ['blr', 'B', 'ABCD', 'B-1']) {
      await expect(insertOffice(code)).rejects.toMatchObject({ code: '23514' });
    }
    await expect(insertOffice('BLR')).rejects.toMatchObject({ code: '23505' });
    await expect(insertOffice('MU1')).resolves.toBe(1);
  });

  it('treats user emails case-insensitively', async () => {
    const insertUser = (email: string) =>
      testDb.withTx(async db => {
        const role = await db.get<{ id: number }>(
          `INSERT INTO roles (name) VALUES ('Email role') ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`
        );
        return db.run(`INSERT INTO users (email, full_name, password_hash, role_id) VALUES (?, 'Asha', 'x', ?)`, [
          email,
          role!.id
        ]);
      });

    await insertUser('Asha@Example.com');
    const found = await testDb.withTx(db =>
      db.get<{ email: string }>('SELECT email FROM users WHERE email = ?', ['asha@example.COM'])
    );
    expect(found).toEqual({ email: 'Asha@Example.com' });
    await expect(insertUser('asha@example.com')).rejects.toMatchObject({ code: '23505' });
  });

  it('rejects an audit row whose office belongs to another company', async () => {
    await expect(
      testDb.withTx(db =>
        db.run(`INSERT INTO audit_logs (action, business_id, office_id) VALUES ('x', ?, ?)`, [companyB, officeA])
      )
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      testDb.withTx(db => db.run(`INSERT INTO audit_logs (action, office_id) VALUES ('x', ?)`, [officeA]))
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      testDb.withTx(db =>
        db.run(`INSERT INTO audit_logs (action, business_id, office_id) VALUES ('x', ?, ?)`, [companyA, officeA])
      )
    ).resolves.toBe(1);
  });
});
