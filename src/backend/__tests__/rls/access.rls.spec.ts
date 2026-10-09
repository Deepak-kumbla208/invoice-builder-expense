// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../shared/db/tx';
import { asAppUser, type RlsCtx } from '../helpers/asAppUser';
import { createPgTestDb, type PgTestDb } from '../helpers/pgTestDb';

const RLS_TABLES = [
  'businesses',
  'offices',
  'users',
  'user_offices',
  'user_permissions',
  'audit_logs',
  'notifications'
];

type Seed = Record<
  | 'companyA'
  | 'companyB'
  | 'officeA1'
  | 'officeA2'
  | 'officeB1'
  | 'alice'
  | 'erin'
  | 'carol'
  | 'bob'
  | 'dave'
  | 'root'
  | 'roleId',
  number
>;

// 0006-invoice-scoping.sql secures the tables it creates; the rest of the invoice tables get
// their policies in the contract step, once the services populate their scope columns.
const SCOPED_TABLES_0006 = ['office_bank_accounts', 'invoice_office_snapshots'];

const RLS_DENIED = { code: '42501' };

describe('RLS on access tables (0004)', () => {
  let testDb: PgTestDb;
  let s: Seed;
  let ctxA: RlsCtx;
  let ctxRoot: RlsCtx;

  const as = <T>(ctx: RlsCtx, fn: (db: Db) => Promise<T>) => asAppUser(testDb, ctx, fn);
  const ids = (rows: { id: number }[]) => rows.map(row => row.id);

  beforeAll(async () => {
    testDb = await createPgTestDb();
    s = await testDb.withTx(async db => {
      const insert = (sql: string, params: unknown[] = []) => db.run(sql, params, true);
      const company = (name: string, short: string) =>
        insert(`INSERT INTO businesses ("name", "shortName") VALUES (?, ?)`, [name, short]);
      const office = (businessId: number, code: string) =>
        insert(`INSERT INTO offices (business_id, name, code, state_code) VALUES (?, ?, ?, '29')`, [
          businessId,
          code,
          code
        ]);

      const companyA = await company('Company A', 'CA');
      const companyB = await company('Company B', 'CB');
      const officeA1 = await office(companyA, 'A1');
      const officeA2 = await office(companyA, 'A2');
      const officeB1 = await office(companyB, 'B1');
      const roleId = (await db.get<{ id: number }>(`SELECT id FROM roles WHERE name = 'User'`))!.id;

      const user = async (name: string, officeIds: number[], allOffices = false) => {
        const id = await insert(
          `INSERT INTO users (email, full_name, password_hash, role_id, all_offices) VALUES (?, ?, 'x', ?, ?)`,
          [`${name}@example.com`, name, roleId, allOffices]
        );
        for (const officeId of officeIds) {
          await db.run('INSERT INTO user_offices (user_id, office_id) VALUES (?, ?)', [id, officeId]);
        }
        return id;
      };

      const alice = await user('alice', [officeA1]);
      const erin = await user('erin', [officeA1]);
      const carol = await user('carol', [officeA1, officeB1]);
      const bob = await user('bob', [officeB1]);
      const dave = await user('dave', []);
      const root = await user('root', [], true);

      for (const userId of [alice, erin, bob]) {
        await db.run(`INSERT INTO user_permissions (user_id, permission_key) VALUES (?, 'report.view')`, [userId]);
      }
      await db.run(
        `INSERT INTO audit_logs (action, actor_user_id, business_id, office_id) VALUES
           ('a1', ?, ?, ?), ('company-a', ?, ?, NULL), ('b1', ?, ?, ?), ('global', ?, NULL, NULL)`,
        [alice, companyA, officeA1, alice, companyA, bob, companyB, officeB1, root]
      );
      await db.run(
        `INSERT INTO notifications (user_id, type, title) VALUES (?, 't', 'for alice'), (?, 't', 'for bob')`,
        [alice, bob]
      );

      return { companyA, companyB, officeA1, officeA2, officeB1, alice, erin, carol, bob, dave, root, roleId };
    });

    ctxA = { userId: s.alice, officeIds: [s.officeA1], businessIds: [s.companyA] };
    ctxRoot = {
      userId: s.root,
      allOffices: true,
      officeIds: [s.officeA1, s.officeA2, s.officeB1],
      businessIds: [s.companyA, s.companyB]
    };
  });

  afterAll(async () => {
    await testDb.drop();
  });

  describe('structure', () => {
    it('enables and forces RLS on every access table', async () => {
      const rows = await testDb.withTx(db =>
        db.all<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
          `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
           WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity
           ORDER BY relname`
        )
      );
      expect(rows.map(row => row.relname)).toEqual([...RLS_TABLES, ...SCOPED_TABLES_0006].sort());
      expect(rows.every(row => row.relforcerowsecurity)).toBe(true);
    });

    it('has exactly one app_user policy per granted command and no FOR ALL policies', async () => {
      const rows = await testDb.withTx(db =>
        db.all<{ tablename: string; granted: string[]; policies: string[]; roles: string[] }>(
          `SELECT t.tablename,
                  ARRAY(SELECT privilege_type::text FROM information_schema.role_table_grants g
                        WHERE g.table_name = t.tablename AND g.grantee = 'app_user' ORDER BY 1) AS granted,
                  ARRAY(SELECT cmd FROM pg_policies p WHERE p.tablename = t.tablename ORDER BY 1) AS policies,
                  ARRAY(SELECT DISTINCT r::text FROM pg_policies p, unnest(p.roles) r WHERE p.tablename = t.tablename) AS roles
           FROM pg_tables t
           WHERE t.schemaname = 'public' AND t.tablename = ANY(?)`,
          [RLS_TABLES]
        )
      );
      for (const row of rows) {
        expect(row.policies, row.tablename).toEqual(row.granted);
        expect(row.roles, row.tablename).toEqual(['app_user']);
      }
    });

    it('makes every app_* and auth_* function a pinned-search_path definer owned by app_owner', async () => {
      const rows = await testDb.withTx(db =>
        db.all<{
          proname: string;
          owner: string;
          prosecdef: boolean;
          proconfig: string[];
          public_exec: boolean;
          app_user_exec: boolean;
        }>(
          `SELECT proname, pg_get_userbyid(proowner) AS owner, prosecdef, proconfig,
                  has_function_privilege('public', oid, 'EXECUTE') AS public_exec,
                  has_function_privilege('app_user', oid, 'EXECUTE') AS app_user_exec
           FROM pg_proc
           WHERE pronamespace = 'public'::regnamespace AND (proname LIKE 'app\\_%' OR proname LIKE 'auth\\_%')`
        )
      );
      // 16 from 0004, plus app_invoice_visible from 0006.
      expect(rows.length).toBe(17);
      for (const row of rows) {
        expect(row, row.proname).toMatchObject({
          owner: 'app_owner',
          prosecdef: true,
          proconfig: ['search_path=pg_catalog, public'],
          public_exec: false,
          app_user_exec: true
        });
      }
    });
  });

  describe('context helpers', () => {
    it('treat empty settings as no context', async () => {
      const row = await as({}, db =>
        db.get(
          `SELECT app_user_id() AS user_id, app_office_ids() AS office_ids,
                  app_business_ids() AS business_ids, app_all_offices() AS all_offices`
        )
      );
      expect(row).toEqual({ user_id: null, office_ids: [], business_ids: [], all_offices: false });
    });

    it('parse the request context', async () => {
      const row = await as({ userId: 7, officeIds: [3, 5], businessIds: [2], allOffices: true }, db =>
        db.get(
          `SELECT app_user_id() AS user_id, app_office_ids() AS office_ids,
                  app_business_ids() AS business_ids, app_all_offices() AS all_offices`
        )
      );
      expect(row).toEqual({ user_id: 7, office_ids: [3, 5], business_ids: [2], all_offices: true });
    });

    it('ignore all_offices without a user', async () => {
      const row = await as({ allOffices: true }, db => db.get<{ all: boolean }>('SELECT app_all_offices() AS all'));
      expect(row).toEqual({ all: false });
    });
  });

  describe('reads', () => {
    it('show nothing without a context', async () => {
      for (const table of RLS_TABLES) {
        const row = await as({}, db => db.get<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`));
        expect(row, table).toEqual({ n: 0 });
      }
    });

    it('show everything except other people’s notifications to an all-offices user', async () => {
      for (const table of RLS_TABLES.filter(table => table !== 'notifications')) {
        const expected = await testDb.withTx(db => db.get(`SELECT count(*)::int AS n FROM ${table}`));
        const row = await as(ctxRoot, db => db.get(`SELECT count(*)::int AS n FROM ${table}`));
        expect(row, table).toEqual(expected);
      }
      const notifications = await as(ctxRoot, db => db.get('SELECT count(*)::int AS n FROM notifications'));
      expect(notifications).toEqual({ n: 0 });
    });

    it('limit an office-scoped user to their offices and companies', async () => {
      const visible = await as(ctxA, async db => ({
        businesses: ids(await db.all('SELECT id FROM businesses ORDER BY id')),
        offices: ids(await db.all('SELECT id FROM offices ORDER BY id')),
        users: ids(await db.all('SELECT id FROM users ORDER BY id')),
        userOffices: await db.all('SELECT user_id, office_id FROM user_offices ORDER BY user_id'),
        userPermissions: (await db.all<{ user_id: number }>('SELECT user_id FROM user_permissions ORDER BY 1')).map(
          row => row.user_id
        ),
        audit: (await db.all<{ action: string }>('SELECT action FROM audit_logs ORDER BY id')).map(row => row.action),
        notifications: (await db.all<{ title: string }>('SELECT title FROM notifications')).map(row => row.title)
      }));

      expect(visible).toEqual({
        businesses: [s.companyA],
        offices: [s.officeA1],
        users: [s.alice, s.erin, s.carol],
        userOffices: [
          { user_id: s.alice, office_id: s.officeA1 },
          { user_id: s.erin, office_id: s.officeA1 },
          { user_id: s.carol, office_id: s.officeA1 }
        ],
        userPermissions: [s.alice, s.erin],
        audit: ['a1', 'company-a'],
        notifications: ['for alice']
      });
    });
  });

  describe('writes by an office-scoped user', () => {
    it('cannot touch another company or create companies', async () => {
      await as(ctxA, async db => {
        expect(await db.run(`UPDATE businesses SET name = 'x' WHERE id = ?`, [s.companyB])).toBe(0);
        expect(await db.run('DELETE FROM businesses WHERE id = ?', [s.companyB])).toBe(0);
        expect(await db.run(`UPDATE businesses SET description = 'ok' WHERE id = ?`, [s.companyA])).toBe(1);
      });
      await expect(
        as(ctxA, db => db.run(`INSERT INTO businesses ("name", "shortName") VALUES ('New', 'NW')`))
      ).rejects.toMatchObject(RLS_DENIED);
    });

    it('cannot touch unassigned offices, move an office to another company, or create offices', async () => {
      await as(ctxA, async db => {
        expect(await db.run(`UPDATE offices SET name = 'x' WHERE id = ?`, [s.officeB1])).toBe(0);
        expect(await db.run(`UPDATE offices SET name = 'x' WHERE id = ?`, [s.officeA2])).toBe(0);
        expect(await db.run(`UPDATE offices SET phone = '1' WHERE id = ?`, [s.officeA1])).toBe(1);
      });
      await expect(
        as(ctxA, db => db.run('UPDATE offices SET business_id = ? WHERE id = ?', [s.companyB, s.officeA1]))
      ).rejects.toMatchObject(RLS_DENIED);
      await expect(
        as(ctxA, db =>
          db.run(`INSERT INTO offices (business_id, name, code, state_code) VALUES (?, 'N', 'A9', '29')`, [s.companyA])
        )
      ).rejects.toMatchObject(RLS_DENIED);
    });

    it('can edit themself and users wholly inside their offices, but never grant all_offices', async () => {
      await as(ctxA, async db => {
        expect(await db.run(`UPDATE users SET full_name = 'Alice' WHERE id = ?`, [s.alice])).toBe(1);
        expect(await db.run(`UPDATE users SET full_name = 'Erin' WHERE id = ?`, [s.erin])).toBe(1);
        for (const other of [s.carol, s.bob, s.dave, s.root]) {
          expect(await db.run(`UPDATE users SET full_name = 'x' WHERE id = ?`, [other])).toBe(0);
        }
      });
      for (const target of [s.alice, s.erin]) {
        await expect(
          as(ctxA, db => db.run('UPDATE users SET all_offices = true WHERE id = ?', [target]))
        ).rejects.toMatchObject(RLS_DENIED);
      }
      await expect(
        as(ctxA, db =>
          db.run(
            `INSERT INTO users (email, full_name, password_hash, role_id, all_offices)
             VALUES ('boss@example.com', 'Boss', 'x', ?, true)`,
            [s.roleId]
          )
        )
      ).rejects.toMatchObject(RLS_DENIED);
    });

    it('can create a user in their office without RETURNING, then assign and grant', async () => {
      const created = await as(ctxA, async db => {
        await db.run(
          `INSERT INTO users (email, full_name, password_hash, role_id) VALUES ('new@example.com', 'New', 'x', ?)`,
          [s.roleId]
        );
        const { id } = (await db.get<{ id: number }>('SELECT id FROM auth_find_user_by_email(?)', [
          'new@example.com'
        ]))!;
        await db.run('INSERT INTO user_offices (user_id, office_id) VALUES (?, ?)', [id, s.officeA1]);
        await db.run(`INSERT INTO user_permissions (user_id, permission_key) VALUES (?, 'report.view')`, [id]);
        return db.get<{ email: string }>('SELECT email FROM users WHERE id = ?', [id]);
      });
      expect(created).toEqual({ email: 'new@example.com' });

      await expect(
        as(ctxA, db =>
          db.run(
            `INSERT INTO users (email, full_name, password_hash, role_id) VALUES ('ret@example.com', 'R', 'x', ?)`,
            [s.roleId],
            true
          )
        )
      ).rejects.toMatchObject(RLS_DENIED);
    });

    it('cannot assign offices outside their own or pull in users from other offices', async () => {
      await expect(
        as(ctxA, db => db.run('INSERT INTO user_offices (user_id, office_id) VALUES (?, ?)', [s.erin, s.officeB1]))
      ).rejects.toMatchObject(RLS_DENIED);
      await expect(
        as(ctxA, db => db.run('INSERT INTO user_offices (user_id, office_id) VALUES (?, ?)', [s.bob, s.officeA1]))
      ).rejects.toMatchObject(RLS_DENIED);
      await as(ctxA, async db => {
        expect(await db.run('DELETE FROM user_offices WHERE user_id = ?', [s.carol])).toBe(0);
        expect(await db.run('DELETE FROM user_offices WHERE user_id = ?', [s.bob])).toBe(0);
      });
    });

    it('can grant extra permissions only to users they manage, not to themself', async () => {
      for (const target of [s.alice, s.carol, s.bob]) {
        await expect(
          as(ctxA, db =>
            db.run(`INSERT INTO user_permissions (user_id, permission_key) VALUES (?, 'audit.view')`, [target])
          )
        ).rejects.toMatchObject(RLS_DENIED);
      }
      await as(ctxA, async db => {
        expect(
          await db.run(`INSERT INTO user_permissions (user_id, permission_key) VALUES (?, 'audit.view')`, [s.erin])
        ).toBe(1);
        expect(await db.run('DELETE FROM user_permissions WHERE user_id = ?', [s.bob])).toBe(0);
      });
    });

    it('can only write audit rows as themself, within scope', async () => {
      const audit = (actor: number, businessId: number | null, officeId: number | null) =>
        as(ctxA, db =>
          db.run('INSERT INTO audit_logs (action, actor_user_id, business_id, office_id) VALUES (?, ?, ?, ?)', [
            'test',
            actor,
            businessId,
            officeId
          ])
        );

      await expect(audit(s.bob, s.companyA, s.officeA1)).rejects.toMatchObject(RLS_DENIED);
      await expect(audit(s.alice, s.companyB, s.officeB1)).rejects.toMatchObject(RLS_DENIED);
      await expect(audit(s.alice, s.companyB, null)).rejects.toMatchObject(RLS_DENIED);
      await expect(audit(s.alice, s.companyA, s.officeA1)).resolves.toBe(1);
      await expect(audit(s.alice, null, null)).resolves.toBe(1);
      await expect(as({}, db => db.run(`INSERT INTO audit_logs (action) VALUES ('anon')`))).rejects.toMatchObject(
        RLS_DENIED
      );
    });

    it('can notify anyone but only read and update their own notifications', async () => {
      await as(ctxA, async db => {
        expect(
          await db.run(`INSERT INTO notifications (user_id, type, title) VALUES (?, 't', 'hi bob')`, [s.bob])
        ).toBe(1);
        expect(await db.run('UPDATE notifications SET read_at = now() WHERE user_id = ?', [s.bob])).toBe(0);
        expect(await db.run('UPDATE notifications SET read_at = now() WHERE user_id = ?', [s.alice])).toBe(1);
      });
      await expect(
        as(ctxA, db => db.run('UPDATE notifications SET user_id = ? WHERE user_id = ?', [s.bob, s.alice]))
      ).rejects.toMatchObject(RLS_DENIED);
      await expect(
        as({}, db => db.run(`INSERT INTO notifications (user_id, type, title) VALUES (?, 't', 'x')`, [s.bob]))
      ).rejects.toMatchObject(RLS_DENIED);

      const bobs = await as({ userId: s.bob, officeIds: [s.officeB1], businessIds: [s.companyB] }, db =>
        db.all<{ title: string }>('SELECT title FROM notifications ORDER BY id')
      );
      expect(bobs.map(row => row.title)).toEqual(['for bob', 'hi bob']);
    });
  });

  describe('writes by an all-offices user', () => {
    it('can create companies and offices and read them back', async () => {
      await as(ctxRoot, async db => {
        const companyId = await db.run(`INSERT INTO businesses ("name", "shortName") VALUES ('C', 'CC')`, [], true);
        const officeId = await db.run(
          `INSERT INTO offices (business_id, name, code, state_code) VALUES (?, 'C1', 'C1', '27')`,
          [companyId],
          true
        );
        expect(companyId).toBeGreaterThan(0);
        expect(officeId).toBeGreaterThan(0);
      });
    });
  });
});
