// @vitest-environment node
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../../shared/auth/passwords';
import { createApp } from '../../webserver/app';
import { createServerDeps } from '../../webserver/deps';
import { permissionRuleOf, type PermissionRule } from '../../webserver/middleware/permissions';
import { createPgTestDb, type PgTestDb } from '../helpers/pgTestDb';
import { startTestServer, type Session, type TestServer } from '../helpers/testServer';

const PASSWORD = 'matrix-password-1';

// No row carries this id, so an allowed request answers 404 instead of mutating the seed.
const MISSING_ID = 999999;

const UNGUARDED = new Set([
  'GET /api/health',
  'GET /api/version',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'GET /api/auth/me',
  'POST /api/auth/change-password'
]);

type Route = { method: string; path: string; label: string; rule: PermissionRule };

type RouteLayer = {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] };
};

const guardedRoutes = (): Route[] => {
  const app = createApp(createServerDeps(new Pool()));
  const stack = (app as unknown as { router: { stack: RouteLayer[] } }).router.stack;
  return stack.flatMap(layer => {
    if (!layer.route) return [];
    const rule = layer.route.stack.map(entry => permissionRuleOf(entry.handle)).find(Boolean);
    return Object.keys(layer.route.methods).flatMap(method => {
      const label = `${method.toUpperCase()} ${layer.route!.path}`;
      return !rule || UNGUARDED.has(label)
        ? []
        : [{ method: method.toUpperCase(), path: layer.route!.path, label, rule }];
    });
  });
};

const allows = (rule: PermissionRule, permissions: Set<string>) =>
  rule.mode === 'authenticated'
    ? true
    : rule.mode === 'all'
      ? rule.keys.every(key => permissions.has(key))
      : rule.keys.some(key => permissions.has(key));

describe('permission matrix', () => {
  let testDb: PgTestDb;
  let server: TestServer;
  const routes = guardedRoutes();
  const sessions: Record<string, Session> = {};
  const permissions: Record<string, Set<string>> = {};

  // One user per role: the three seeded roles plus a role holding nothing at all.
  const ROLES = ['Super Admin', 'Office Admin', 'User', 'No Access'];

  beforeAll(async () => {
    testDb = await createPgTestDb();
    const hash = await hashPassword(PASSWORD);

    await testDb.withTx(async db => {
      const insert = (sql: string, params: unknown[] = []) => db.run(sql, params, true);
      const company = await insert(`INSERT INTO businesses ("name", "shortName") VALUES ('Matrix Co', 'MX')`);
      const office = await insert('INSERT INTO offices (business_id, name, code, state_code) VALUES (?, ?, ?, ?)', [
        company,
        'MX1',
        'MX1',
        '29'
      ]);
      await insert('INSERT INTO roles (name) VALUES (?)', ['No Access']);

      for (const roleName of ROLES) {
        const roleId = (await db.get<{ id: number }>('SELECT id FROM roles WHERE name = ?', [roleName]))!.id;
        const userId = await insert(
          'INSERT INTO users (email, full_name, password_hash, role_id, all_offices) VALUES (?, ?, ?, ?, ?)',
          [
            `${roleName.replace(/\s+/g, '').toLowerCase()}@example.com`,
            roleName,
            hash,
            roleId,
            roleName === 'Super Admin'
          ]
        );
        await db.run('INSERT INTO user_offices (user_id, office_id) VALUES (?, ?)', [userId, office]);
      }
    });

    server = await startTestServer(testDb, { loginRateLimit: { ipLimit: 1000, emailLimit: 1000 } });

    for (const roleName of ROLES) {
      const email = `${roleName.replace(/\s+/g, '').toLowerCase()}@example.com`;
      const { response, ...session } = await server.login(email, PASSWORD);
      expect(response.status, roleName).toBe(200);
      sessions[roleName] = session;
      permissions[roleName] = new Set((response.body.data as { permissions: string[] }).permissions);
    }
  });

  afterAll(async () => {
    await server?.close();
    await testDb.drop();
  });

  it('guards every API route outside auth and health', () => {
    expect(routes.length).toBeGreaterThan(60);
    expect(new Set(routes.map(route => route.label)).size).toBe(routes.length);
  });

  it('gives the seeded roles the permission sets 0003 grants them', () => {
    expect(permissions['No Access'].size).toBe(0);
    expect(permissions['Super Admin'].has('admin.companies')).toBe(true);
    expect(permissions['Super Admin'].has('admin.users')).toBe(true);

    // Office Admin runs invoicing and users for its offices, but not companies, roles or settings.
    expect(permissions['Office Admin'].has('invoice.create')).toBe(true);
    expect(permissions['Office Admin'].has('admin.users')).toBe(true);
    expect(permissions['Office Admin'].has('audit.view')).toBe(true);
    expect(permissions['Office Admin'].has('admin.companies')).toBe(false);
    expect(permissions['Office Admin'].has('admin.roles')).toBe(false);
    expect(permissions['Office Admin'].has('admin.offices')).toBe(false);

    // User only records its own expenses and reimbursements: nothing invoice- or admin-side.
    expect([...permissions['User']].sort()).toEqual(['expense.create', 'expense.view_own', 'reimbursement.view_own']);
  });

  for (const roleName of ROLES) {
    it(`answers 403 to ${roleName} on exactly the routes its permissions do not cover`, async () => {
      const unexpected: string[] = [];

      for (const route of routes) {
        const expected = allows(route.rule, permissions[roleName]);
        const res = await server.request(route.method, route.path.replace(/:\w+/g, String(MISSING_ID)), {
          session: sessions[roleName],
          body: route.method === 'GET' || route.method === 'DELETE' ? undefined : {}
        });

        if (expected && (res.status === 403 || res.status === 401)) {
          unexpected.push(`${route.label} → ${res.status} ${String(res.body.key)} (expected to be allowed)`);
        }
        if (!expected && !(res.status === 403 && res.body.key === 'auth.forbidden')) {
          unexpected.push(`${route.label} → ${res.status} ${String(res.body.key)} (expected 403 auth.forbidden)`);
        }
      }

      expect(unexpected).toEqual([]);
    });
  }
});
