// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../../shared/auth/passwords';
import { createPgTestDb, type PgTestDb } from '../helpers/pgTestDb';
import { TEST_ORIGIN, sessionCookieOf, startTestServer, type Session, type TestServer } from '../helpers/testServer';

const PASSWORDS = {
  root: 'root-password-123',
  alice: 'alice-password-1',
  uma: 'uma-password-123',
  newbie: 'temporary-pass-1',
  ghost: 'ghost-password-1'
};

type Seed = { companyA: number; companyB: number; officeA1: number; officeB1: number; newbie: number };

describe('auth API', () => {
  let testDb: PgTestDb;
  let server: TestServer;
  let seed: Seed;
  let root: Session;
  let alice: Session;
  let uma: Session;

  const auditActions = (action: string) =>
    testDb.withTx(db =>
      db.all<{ actor_user_id: number | null; after: Record<string, unknown> }>(
        'SELECT actor_user_id, after FROM audit_logs WHERE action = ? ORDER BY id',
        [action]
      )
    );

  beforeAll(async () => {
    testDb = await createPgTestDb();
    const hashes = Object.fromEntries(
      await Promise.all(Object.entries(PASSWORDS).map(async ([name, pw]) => [name, await hashPassword(pw)]))
    ) as Record<keyof typeof PASSWORDS, string>;

    seed = await testDb.withTx(async db => {
      const insert = (sql: string, params: unknown[] = []) => db.run(sql, params, true);
      const role = async (name: string) =>
        (await db.get<{ id: number }>('SELECT id FROM roles WHERE name = ?', [name]))!.id;
      const companyA = await insert(`INSERT INTO businesses ("name", "shortName") VALUES ('Company A', 'CA')`);
      const companyB = await insert(`INSERT INTO businesses ("name", "shortName") VALUES ('Company B', 'CB')`);
      const officeA1 = await insert(
        `INSERT INTO offices (business_id, name, code, state_code) VALUES (?, 'Bengaluru', 'A1', '29')`,
        [companyA]
      );
      const officeB1 = await insert(
        `INSERT INTO offices (business_id, name, code, state_code) VALUES (?, 'Mumbai', 'B1', '27')`,
        [companyB]
      );

      const user = async (
        name: keyof typeof PASSWORDS,
        roleName: string,
        officeIds: number[],
        flags: { all_offices?: boolean; is_active?: boolean; must_change_password?: boolean } = {}
      ) => {
        const id = await insert(
          `INSERT INTO users (email, full_name, password_hash, role_id, all_offices, is_active, must_change_password)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            `${name}@example.com`,
            name,
            hashes[name],
            await role(roleName),
            flags.all_offices ?? false,
            flags.is_active ?? true,
            flags.must_change_password ?? false
          ]
        );
        for (const officeId of officeIds) {
          await db.run('INSERT INTO user_offices (user_id, office_id) VALUES (?, ?)', [id, officeId]);
        }
        return id;
      };

      await user('root', 'Super Admin', [], { all_offices: true });
      await user('alice', 'Office Admin', [officeA1]);
      await user('uma', 'User', [officeA1]);
      const newbie = await user('newbie', 'User', [officeA1], { must_change_password: true });
      await user('ghost', 'Office Admin', [officeA1], { is_active: false });
      return { companyA, companyB, officeA1, officeB1, newbie };
    });

    server = await startTestServer(testDb);
    root = await server.login('root@example.com', PASSWORDS.root);
    alice = await server.login('ALICE@example.com', PASSWORDS.alice);
    uma = await server.login('uma@example.com', PASSWORDS.uma);
  });

  afterAll(async () => {
    await server?.close();
    await testDb.drop();
  });

  describe('public routes and unauthenticated access', () => {
    it('serves health and version without a session', async () => {
      expect((await server.request('GET', '/api/health')).status).toBe(200);
      expect((await server.request('GET', '/api/version')).status).toBe(200);
    });

    it('answers 401 for any other route without a session', async () => {
      for (const path of ['/api/banks', '/api/invoices', '/api/auth/me', '/api/nope']) {
        const res = await server.request('GET', path);
        expect(res.status, path).toBe(401);
        expect(res.body).toMatchObject({ success: false, key: 'auth.unauthenticated' });
      }
    });
  });

  describe('login', () => {
    it('requires the app origin', async () => {
      const body = { email: 'alice@example.com', password: PASSWORDS.alice };
      for (const origin of [null, 'https://evil.test']) {
        const res = await server.request('POST', '/api/auth/login', { body, origin });
        expect(res.status).toBe(403);
        expect(res.body.key).toBe('auth.originInvalid');
      }
    });

    it('validates the body', async () => {
      const res = await server.request('POST', '/api/auth/login', { body: { email: '' }, origin: TEST_ORIGIN });
      expect(res.status).toBe(400);
      expect(Object.keys(res.body.errors ?? {})).toEqual(expect.arrayContaining(['email', 'password']));
    });

    it('rejects a wrong password, an unknown email and an inactive user alike, and logs each', async () => {
      const attempts = [
        ['alice@example.com', 'wrong-password-1', 'wrong_password'],
        ['nobody@example.com', PASSWORDS.alice, 'unknown_email'],
        ['ghost@example.com', PASSWORDS.ghost, 'inactive']
      ];
      for (const [email, password] of attempts) {
        const { response } = await server.login(email, password);
        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({ success: false, key: 'auth.invalidCredentials' });
        expect(response.setCookie).toEqual([]);
      }
      const failures = await auditActions('auth.login_failed');
      expect(failures.map(row => row.after.reason)).toEqual(
        expect.arrayContaining(['wrong_password', 'unknown_email', 'inactive'])
      );
    });

    it('sets a __Host- session cookie and returns the profile with a CSRF token', async () => {
      const { response } = await server.login('alice@example.com', PASSWORDS.alice);
      expect(response.status).toBe(200);

      const cookie = response.setCookie.find(value => value.startsWith('__Host-sid='))!;
      expect(cookie).toMatch(/; Path=\//);
      expect(cookie).toMatch(/; HttpOnly/);
      expect(cookie).toMatch(/; Secure/);
      expect(cookie).toMatch(/; SameSite=Lax/);
      expect(cookie).not.toMatch(/Domain=/);

      expect(response.body.data).toMatchObject({
        user: { email: 'alice@example.com', roleName: 'Office Admin', allOffices: false, mustChangePassword: false },
        permissions: expect.arrayContaining(['invoice.create', 'admin.users']),
        offices: [expect.objectContaining({ id: seed.officeA1, code: 'A1', businessId: seed.companyA })],
        companies: [expect.objectContaining({ id: seed.companyA, name: 'Company A' })],
        csrfToken: expect.any(String)
      });
      expect((await auditActions('auth.login')).length).toBeGreaterThan(0);
    });

    it('rotates the session: logging in again revokes the previous token', async () => {
      const first = await server.login('uma@example.com', PASSWORDS.uma);
      const second = await server.login('uma@example.com', PASSWORDS.uma, first);
      expect(second.cookie).not.toBe(first.cookie);
      expect((await server.request('GET', '/api/auth/me', { session: first })).status).toBe(401);
      expect((await server.request('GET', '/api/auth/me', { session: second })).status).toBe(200);
    });
  });

  describe('sessions and CSRF', () => {
    it('returns every office and company to an all-offices user', async () => {
      const res = await server.request('GET', '/api/auth/me', { session: root });
      expect(res.status).toBe(200);
      const data = res.body.data as { offices: { id: number }[]; companies: { id: number }[]; csrfToken: string };
      expect(data.offices.map(office => office.id).sort()).toEqual([seed.officeA1, seed.officeB1].sort());
      expect(data.companies.map(company => company.id).sort()).toEqual([seed.companyA, seed.companyB].sort());
      expect(data.csrfToken).toBe(root.csrfToken);
    });

    it('rejects a state-changing request with a missing or wrong CSRF token', async () => {
      const body = { name: 'CSRF test' };
      for (const csrf of [null, 'wrong-token']) {
        const res = await server.request('POST', '/api/categories', { session: root, csrf, body });
        expect(res.status).toBe(403);
        expect(res.body.key).toBe('auth.csrfInvalid');
      }
      const ok = await server.request('POST', '/api/categories', { session: root, body });
      expect(ok.status).toBe(200);
    });

    it('logs out: the session is revoked and the cookie cleared', async () => {
      const session = await server.login('alice@example.com', PASSWORDS.alice);
      expect((await server.request('POST', '/api/auth/logout', { session, csrf: null })).status).toBe(403);

      const res = await server.request('POST', '/api/auth/logout', { session });
      expect(res.status).toBe(200);
      expect(sessionCookieOf(res.setCookie)).toBe('__Host-sid=');

      const after = await server.request('GET', '/api/auth/me', { session });
      expect(after.status).toBe(401);
      expect(sessionCookieOf(after.setCookie)).toBe('__Host-sid=');
      expect((await auditActions('auth.logout')).length).toBeGreaterThan(0);
    });
  });

  describe('permissions and row-level security through the API', () => {
    it('enforces route permissions', async () => {
      expect((await server.request('GET', '/api/invoices', { session: uma })).status).toBe(403);
      expect((await server.request('GET', '/api/settings', { session: uma })).status).toBe(200);
      expect((await server.request('GET', '/api/invoices', { session: alice })).status).toBe(200);
      expect((await server.request('GET', '/api/banks', { session: alice })).status).toBe(200);

      const denied = await server.request('POST', '/api/banks', { session: alice, body: { name: 'Bank' } });
      expect(denied.status).toBe(403);
      expect(denied.body.key).toBe('auth.forbidden');
    });

    it('scopes companies to the caller and lets only all-offices users create them', async () => {
      const names = async (session: Session) => {
        const res = await server.request('GET', '/api/businesses', { session });
        return (res.body.data as { name: string }[]).map(company => company.name).sort();
      };
      expect(await names(alice)).toEqual(['Company A']);
      expect(await names(root)).toEqual(['Company A', 'Company B']);

      const body = { name: 'Company C', shortName: 'CC', isArchived: false };
      expect((await server.request('POST', '/api/businesses', { session: alice, body })).status).toBe(403);
      const created = await server.request('POST', '/api/businesses', { session: root, body });
      expect(created.status).toBe(200);
      expect(created.body).toMatchObject({ success: true });
    });

    it('answers unknown API routes with the standard 404 body', async () => {
      const res = await server.request('GET', '/api/nope', { session: root });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, key: 'error.notFound', message: 'Not found' });
    });
  });

  describe('forced password change', () => {
    it('blocks everything but me, change-password and logout until the password is changed', async () => {
      const first = await server.login('newbie@example.com', PASSWORDS.newbie);
      expect((first.response.body.data as { user: { mustChangePassword: boolean } }).user.mustChangePassword).toBe(
        true
      );
      const other = await server.login('newbie@example.com', PASSWORDS.newbie);

      const blocked = await server.request('GET', '/api/settings', { session: first });
      expect(blocked.status).toBe(403);
      expect(blocked.body.key).toBe('auth.mustChangePassword');
      expect((await server.request('GET', '/api/auth/me', { session: first })).status).toBe(200);

      const change = (currentPassword: string, newPassword: string) =>
        server.request('POST', '/api/auth/change-password', { session: first, body: { currentPassword, newPassword } });

      expect((await change(PASSWORDS.newbie, PASSWORDS.newbie)).body.key).toBe('auth.passwordUnchanged');
      expect((await change('wrong-password-1', 'brand-new-password')).body.key).toBe('auth.invalidCurrentPassword');
      const short = await change(PASSWORDS.newbie, 'short');
      expect(short.status).toBe(400);
      expect(Object.keys(short.body.errors ?? {})).toEqual(['newPassword']);

      const changed = await change(PASSWORDS.newbie, 'brand-new-password');
      expect(changed.status).toBe(200);

      expect((await server.request('GET', '/api/auth/me', { session: other })).status).toBe(401);
      const me = await server.request('GET', '/api/auth/me', { session: first });
      expect((me.body.data as { user: { mustChangePassword: boolean } }).user.mustChangePassword).toBe(false);
      expect((await server.request('GET', '/api/settings', { session: first })).status).toBe(200);

      expect((await server.login('newbie@example.com', PASSWORDS.newbie)).response.status).toBe(401);
      expect((await server.login('newbie@example.com', 'brand-new-password')).response.status).toBe(200);
      const changes = await auditActions('auth.password_changed');
      expect(changes.map(row => row.actor_user_id)).toEqual([seed.newbie]);
    });
  });

  describe('login rate limits', () => {
    it('locks an IP and email pair out after 5 failures, without affecting other emails', async () => {
      const fresh = await startTestServer(testDb);
      try {
        for (let attempt = 0; attempt < 5; attempt++) {
          expect((await fresh.login('uma@example.com', 'wrong-password-1')).response.status).toBe(401);
        }
        const locked = await fresh.login('uma@example.com', PASSWORDS.uma);
        expect(locked.response.status).toBe(429);
        expect(locked.response.body.key).toBe('auth.tooManyAttempts');

        expect((await fresh.login('alice@example.com', PASSWORDS.alice)).response.status).toBe(200);
      } finally {
        await fresh.close();
      }
    });
  });
});
