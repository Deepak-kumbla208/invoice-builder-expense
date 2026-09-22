// @vitest-environment node
import { createHash, randomBytes } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../shared/db/tx';
import { asAppUser } from './helpers/asAppUser';
import { createPgTestDb, type PgTestDb } from './helpers/pgTestDb';

const newTokenHash = () => createHash('sha256').update(randomBytes(32)).digest('hex');

describe('auth definer functions (0004)', () => {
  let testDb: PgTestDb;
  let alice: number;
  let root: number;
  let inactive: number;
  let companies: number[];
  let offices: { a1: number; a2: number; b1: number };
  let officeAdminKeys: string[];

  const anon = <T>(fn: (db: Db) => Promise<T>) => asAppUser(testDb, {}, fn);

  const createSession = (userId: number, tokenHash = newTokenHash()) =>
    anon(async db => {
      await db.query('SELECT auth_create_session(?, ?, ?, ?, ?)', [
        userId,
        tokenHash,
        'csrf-secret',
        '10.0.0.1',
        'vitest'
      ]);
      return tokenHash;
    });

  const session = (tokenHash: string) => anon(db => db.get('SELECT * FROM auth_session(?)', [tokenHash]));

  const sessionRow = (tokenHash: string) =>
    testDb.withTx(db =>
      db.get<{ idle_hours: number; idle_capped: boolean; seen_recently: boolean }>(
        `SELECT (extract(epoch FROM expires_at - now()) / 3600)::float8 AS idle_hours,
                expires_at = absolute_expires_at AS idle_capped,
                last_seen_at > now() - interval '1 minute' AS seen_recently
         FROM sessions WHERE token_hash = ?`,
        [tokenHash]
      )
    );

  beforeAll(async () => {
    testDb = await createPgTestDb();
    await testDb.withTx(async db => {
      const insert = (sql: string, params: unknown[] = []) => db.run(sql, params, true);
      const companyA = await insert(`INSERT INTO businesses ("name", "shortName") VALUES ('A', 'CA')`);
      const companyB = await insert(`INSERT INTO businesses ("name", "shortName") VALUES ('B', 'CB')`);
      const companyC = await insert(`INSERT INTO businesses ("name", "shortName") VALUES ('C', 'CC')`);
      companies = [companyA, companyB, companyC];
      const office = (businessId: number, code: string) =>
        insert(`INSERT INTO offices (business_id, name, code, state_code) VALUES (?, ?, ?, '29')`, [
          businessId,
          code,
          code
        ]);
      offices = {
        a1: await office(companyA, 'A1'),
        a2: await office(companyA, 'A2'),
        b1: await office(companyB, 'B1')
      };

      const roleId = async (name: string) =>
        (await db.get<{ id: number }>('SELECT id FROM roles WHERE name = ?', [name]))!.id;
      const user = (email: string, role: number, extra: Partial<{ all_offices: boolean; is_active: boolean }> = {}) =>
        insert(
          `INSERT INTO users (email, full_name, password_hash, role_id, all_offices, is_active)
           VALUES (?, ?, 'argon2-hash', ?, ?, ?)`,
          [email, email, role, extra.all_offices ?? false, extra.is_active ?? true]
        );

      const officeAdmin = await roleId('Office Admin');
      alice = await user('Alice@Example.com', officeAdmin);
      root = await user('root@example.com', await roleId('Super Admin'), { all_offices: true });
      inactive = await user('gone@example.com', officeAdmin, { is_active: false });

      for (const officeId of [offices.b1, offices.a1]) {
        await db.run('INSERT INTO user_offices (user_id, office_id) VALUES (?, ?)', [alice, officeId]);
      }
      await db.run(`INSERT INTO user_permissions (user_id, permission_key) VALUES (?, 'admin.roles')`, [alice]);
      officeAdminKeys = (
        await db.all<{ permission_key: string }>('SELECT permission_key FROM role_permissions WHERE role_id = ?', [
          officeAdmin
        ])
      ).map(row => row.permission_key);
    });
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it('finds a user by email, case-insensitively, returning only login fields', async () => {
    const rows = await anon(db => db.all('SELECT * FROM auth_find_user_by_email(?)', ['alice@EXAMPLE.com']));
    expect(rows).toEqual([{ id: alice, password_hash: 'argon2-hash', is_active: true, must_change_password: false }]);
    await expect(anon(db => db.all('SELECT * FROM auth_find_user_by_email(?)', ['nobody@x.com']))).resolves.toEqual([]);
  });

  it('creates a session and returns the full request context', async () => {
    const tokenHash = await createSession(alice);
    const ctx = await session(tokenHash);

    expect(ctx).toEqual({
      user_id: alice,
      email: 'Alice@Example.com',
      full_name: 'Alice@Example.com',
      role_id: expect.any(Number),
      role_name: 'Office Admin',
      all_offices: false,
      must_change_password: false,
      permissions: [...officeAdminKeys, 'admin.roles'].sort(),
      office_ids: [offices.a1, offices.b1],
      business_ids: [companies[0], companies[1]],
      csrf_secret: 'csrf-secret'
    });

    const user = await testDb.withTx(db =>
      db.get<{ recent: boolean }>(
        `SELECT last_login_at > now() - interval '1 minute' AS recent FROM users WHERE id = ?`,
        [alice]
      )
    );
    expect(user).toEqual({ recent: true });
  });

  it('gives an all-offices user every office and every company, even ones without offices', async () => {
    const ctx = await session(await createSession(root));
    expect(ctx).toMatchObject({
      all_offices: true,
      office_ids: [offices.a1, offices.a2, offices.b1],
      business_ids: companies
    });
  });

  it('refuses to create a session for an inactive or unknown user', async () => {
    await expect(createSession(inactive)).rejects.toMatchObject({ code: '28000' });
    await expect(createSession(999999)).rejects.toMatchObject({ code: '28000' });
  });

  it('returns nothing for an unknown, idle-expired or absolutely-expired session', async () => {
    await expect(session(newTokenHash())).resolves.toBeNull();

    const idle = await createSession(alice);
    await testDb.withTx(db =>
      db.run(`UPDATE sessions SET expires_at = now() - interval '1 second' WHERE token_hash = ?`, [idle])
    );
    await expect(session(idle)).resolves.toBeNull();

    const absolute = await createSession(alice);
    await testDb.withTx(db =>
      db.run(`UPDATE sessions SET absolute_expires_at = now() - interval '1 second' WHERE token_hash = ?`, [absolute])
    );
    await expect(session(absolute)).resolves.toBeNull();
  });

  it('slides the idle expiry to 12 hours on use, capped at the absolute expiry', async () => {
    const tokenHash = await createSession(alice);
    await testDb.withTx(db =>
      db.run(
        `UPDATE sessions SET expires_at = now() + interval '1 hour', last_seen_at = now() - interval '2 hours'
         WHERE token_hash = ?`,
        [tokenHash]
      )
    );
    await session(tokenHash);
    const touched = await sessionRow(tokenHash);
    expect(touched?.seen_recently).toBe(true);
    expect(touched?.idle_hours).toBeGreaterThan(11.9);

    await testDb.withTx(db =>
      db.run(`UPDATE sessions SET absolute_expires_at = now() + interval '1 hour' WHERE token_hash = ?`, [tokenHash])
    );
    await session(tokenHash);
    expect(await sessionRow(tokenHash)).toMatchObject({ idle_capped: true });
  });

  it('stops honouring a session once its user is deactivated', async () => {
    const tokenHash = await createSession(root);
    await testDb.withTx(db => db.run('UPDATE users SET is_active = false WHERE id = ?', [root]));
    try {
      await expect(session(tokenHash)).resolves.toBeNull();
    } finally {
      await testDb.withTx(db => db.run('UPDATE users SET is_active = true WHERE id = ?', [root]));
    }
  });

  it('revokes one session, or all of a user’s sessions except the current one', async () => {
    const current = await createSession(alice);
    const other = await createSession(alice);
    const rootSession = await createSession(root);

    const revoked = await anon(db => db.get<{ n: number }>('SELECT auth_revoke_sessions(?, ?) AS n', [alice, current]));
    expect(revoked!.n).toBeGreaterThanOrEqual(1);
    await expect(session(other)).resolves.toBeNull();
    await expect(session(current)).resolves.not.toBeNull();
    await expect(session(rootSession)).resolves.not.toBeNull();

    await anon(db => db.query('SELECT auth_revoke_session(?)', [current]));
    await expect(session(current)).resolves.toBeNull();

    await anon(db => db.query('SELECT auth_revoke_sessions(?)', [root]));
    await expect(session(rootSession)).resolves.toBeNull();
  });

  it('cleans up only expired sessions', async () => {
    const live = await createSession(alice);
    const expired = await createSession(alice);
    await testDb.withTx(db =>
      db.run(`UPDATE sessions SET expires_at = now() - interval '1 second' WHERE token_hash = ?`, [expired])
    );

    const cleaned = await anon(db => db.get<{ n: number }>('SELECT auth_cleanup_sessions() AS n'));
    expect(cleaned!.n).toBeGreaterThanOrEqual(1);
    const left = await testDb.withTx(db =>
      db.all<{ token_hash: string }>('SELECT token_hash FROM sessions WHERE token_hash IN (?, ?)', [live, expired])
    );
    expect(left).toEqual([{ token_hash: live }]);
  });

  it('logs auth events, including anonymous ones, and nothing else', async () => {
    await anon(db =>
      db.query('SELECT auth_log_event(?, ?, ?, ?)', [null, 'auth.login_failed', '10.0.0.9', { email: 'x@y.z' }])
    );
    const row = await testDb.withTx(db =>
      db.get(`SELECT actor_user_id, action, host(ip) AS ip, after FROM audit_logs WHERE action = 'auth.login_failed'`)
    );
    expect(row).toEqual({
      actor_user_id: null,
      action: 'auth.login_failed',
      ip: '10.0.0.9',
      after: { email: 'x@y.z' }
    });

    await expect(
      anon(db => db.query('SELECT auth_log_event(?, ?, ?, ?)', [alice, 'invoice.deleted', null, null]))
    ).rejects.toMatchObject({ code: '22023' });
  });
});
