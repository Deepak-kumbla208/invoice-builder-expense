// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../../shared/auth/passwords';
import { createPgTestDb, type PgTestDb } from '../helpers/pgTestDb';
import { startTestServer, type ApiResponse, type Session, type TestServer } from '../helpers/testServer';

const PASSWORD = 'seeded-password-1';

type Seed = Record<
  | 'companyA'
  | 'companyB'
  | 'officeA1'
  | 'officeA2'
  | 'officeB1'
  | 'superAdminRole'
  | 'officeAdminRole'
  | 'userRole'
  | 'roleAdminRole'
  | 'root'
  | 'root2'
  | 'alice'
  | 'rita'
  | 'gloria'
  | 'erin'
  | 'carol'
  | 'bob',
  number
>;

type UserData = { id: number; officeIds: number[]; extraPermissions: string[]; mustChangePassword: boolean };

describe('admin API', () => {
  let testDb: PgTestDb;
  let server: TestServer;
  let s: Seed;
  const sessions: Record<string, Session> = {};

  const call = (who: string, method: string, path: string, body?: unknown): Promise<ApiResponse> =>
    server.request(method, path, { session: sessions[who], body });
  const login = async (email: string, password = PASSWORD) => server.login(email, password);
  const audit = (action: string) =>
    testDb.withTx(db =>
      db.all<{ business_id: number | null; office_id: number | null; before: unknown; after: unknown }>(
        'SELECT business_id, office_id, before, after FROM audit_logs WHERE action = ? ORDER BY id',
        [action]
      )
    );
  const userBody = (user: Partial<UserData> & Record<string, unknown>) => ({
    email: user.email,
    fullName: user.fullName,
    roleId: user.roleId,
    allOffices: user.allOffices ?? false,
    officeIds: user.officeIds ?? [],
    extraPermissions: user.extraPermissions ?? [],
    isActive: user.isActive ?? true
  });
  beforeAll(async () => {
    testDb = await createPgTestDb();
    const hash = await hashPassword(PASSWORD);

    s = await testDb.withTx(async db => {
      const insert = (sql: string, params: unknown[] = []) => db.run(sql, params, true);
      const roleId = async (name: string) =>
        (await db.get<{ id: number }>('SELECT id FROM roles WHERE name = ?', [name]))!.id;
      const customRole = async (name: string, keys: string[]) => {
        const id = await insert('INSERT INTO roles (name) VALUES (?)', [name]);
        for (const key of keys) {
          await db.run('INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [id, key]);
        }
        return id;
      };
      const companyA = await insert(`INSERT INTO businesses ("name", "shortName") VALUES ('Company A', 'CA')`);
      const companyB = await insert(`INSERT INTO businesses ("name", "shortName") VALUES ('Company B', 'CB')`);
      const office = (businessId: number, code: string, state: string) =>
        insert('INSERT INTO offices (business_id, name, code, state_code) VALUES (?, ?, ?, ?)', [
          businessId,
          code,
          code,
          state
        ]);
      const officeA1 = await office(companyA, 'A1', '29');
      const officeA2 = await office(companyA, 'A2', '29');
      const officeB1 = await office(companyB, 'B1', '27');

      const superAdminRole = await roleId('Super Admin');
      const officeAdminRole = await roleId('Office Admin');
      const userRole = await roleId('User');
      const roleAdminRole = await customRole('Role Admin', [
        'admin.roles',
        'admin.users',
        'admin.offices',
        'audit.view'
      ]);
      const globalAdminRole = await customRole('Global Admin', [
        'admin.users',
        'expense.create',
        'expense.view_own',
        'reimbursement.view_own'
      ]);

      const user = async (name: string, role: number, offices: number[], allOffices = false) => {
        const id = await insert(
          'INSERT INTO users (email, full_name, password_hash, role_id, all_offices) VALUES (?, ?, ?, ?, ?)',
          [`${name}@example.com`, name, hash, role, allOffices]
        );
        for (const officeId of offices) {
          await db.run('INSERT INTO user_offices (user_id, office_id) VALUES (?, ?)', [id, officeId]);
        }
        return id;
      };

      return {
        companyA,
        companyB,
        officeA1,
        officeA2,
        officeB1,
        superAdminRole,
        officeAdminRole,
        userRole,
        roleAdminRole,
        root: await user('root', superAdminRole, [], true),
        root2: await user('root2', superAdminRole, [], true),
        alice: await user('alice', officeAdminRole, [officeA1]),
        rita: await user('rita', roleAdminRole, [officeA1]),
        gloria: await user('gloria', globalAdminRole, [], true),
        erin: await user('erin', userRole, [officeA1]),
        carol: await user('carol', userRole, [officeA1, officeB1]),
        bob: await user('bob', userRole, [officeB1])
      };
    });

    server = await startTestServer(testDb);
    for (const name of ['root', 'alice', 'rita', 'gloria', 'erin']) {
      sessions[name] = await login(`${name}@example.com`);
    }
  });

  afterAll(async () => {
    await server?.close();
    await testDb.drop();
  });

  describe('permissions and roles', () => {
    it('lists permissions grouped, labelled and with their dependencies', async () => {
      const res = await call('alice', 'GET', '/api/permissions');
      expect(res.status).toBe(200);
      const groups = res.body.data as {
        group: string;
        permissions: { key: string; label: string; requires: string[] }[];
      }[];
      expect(groups.map(group => group.group)).toEqual([
        'Invoices',
        'Customers',
        'Expenses',
        'Reimbursements',
        'Reports',
        'Administration'
      ]);
      expect(groups[0].permissions[0]).toEqual({
        key: 'invoice.create',
        label: 'Create invoices',
        requires: ['invoice.view', 'customer.view']
      });
    });

    it('closes a new role under requires, counts affected users and audits it', async () => {
      const res = await call('root', 'POST', '/api/roles', { name: 'Approver', permissions: ['expense.approve'] });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        name: 'Approver',
        isSystem: false,
        permissions: ['expense.view_all', 'expense.approve'],
        affectedUsers: 0
      });
      expect(await audit('role.create')).toEqual([
        expect.objectContaining({
          after: expect.objectContaining({ permissions: ['expense.view_all', 'expense.approve'] })
        })
      ]);
      expect((await call('root', 'POST', '/api/roles', { name: 'Approver', permissions: [] })).status).toBe(409);
      expect((await call('root', 'POST', '/api/roles', { name: 'X', permissions: ['nope.nope'] })).status).toBe(400);
    });

    it('protects the system role and roles still in use', async () => {
      const locked = await call('root', 'PUT', `/api/roles/${s.superAdminRole}`, {
        name: 'Super Admin',
        permissions: ['invoice.view']
      });
      expect(locked.status).toBe(409);
      expect(locked.body.key).toBe('role.systemLocked');
      expect((await call('root', 'DELETE', `/api/roles/${s.superAdminRole}`)).body.key).toBe('role.system');
      expect((await call('root', 'DELETE', `/api/roles/${s.userRole}`)).body.key).toBe('role.inUse');

      const temp = await call('root', 'POST', '/api/roles', { name: 'Temporary', permissions: [] });
      const id = (temp.body.data as { id: number }).id;
      expect((await call('root', 'DELETE', `/api/roles/${id}`)).status).toBe(200);
      expect((await call('root', 'GET', `/api/roles/${id}`)).status).toBe(404);
    });

    it('does not let a role editor grant permissions they lack', async () => {
      const denied = await call('rita', 'POST', '/api/roles', { name: 'Sneaky', permissions: ['admin.companies'] });
      expect(denied.status).toBe(403);
      expect(denied.body).toMatchObject({ key: 'role.cannotGrant', errors: { permissions: ['admin.companies'] } });

      const allowed = await call('rita', 'POST', '/api/roles', { name: 'Clerk', permissions: ['audit.view'] });
      expect(allowed.status).toBe(200);
      const id = (allowed.body.data as { id: number }).id;
      const escalate = await call('rita', 'PUT', `/api/roles/${id}`, {
        name: 'Clerk',
        permissions: ['admin.settings']
      });
      expect(escalate.body.key).toBe('role.cannotGrant');
    });

    it('reports affected users on edit without revoking their sessions', async () => {
      const role = (await call('root', 'POST', '/api/roles', { name: 'Reporter', permissions: ['report.view'] })).body
        .data as { id: number };
      const created = await call('root', 'POST', '/api/users', {
        ...userBody({ email: 'reporter@example.com', fullName: 'Reporter', roleId: role.id, officeIds: [s.officeA1] })
      });
      const temporary = (created.body.data as { temporaryPassword: string }).temporaryPassword;
      const reporter = await login('reporter@example.com', temporary);

      const edited = await call('root', 'PUT', `/api/roles/${role.id}`, {
        name: 'Reporter',
        permissions: ['report.view', 'audit.view']
      });
      expect(edited.body.data).toMatchObject({ affectedUsers: 1, permissions: ['report.view', 'audit.view'] });
      expect((await server.request('GET', '/api/auth/me', { session: reporter })).status).toBe(200);
    });
  });

  describe('offices', () => {
    const office = (overrides: Record<string, unknown> = {}) => ({
      businessId: s.companyA,
      name: 'Bengaluru HQ',
      code: 'blr',
      stateCode: '29',
      gstin: '29aagcb7383j1z4',
      lutReference: 'AD290924000123X',
      lutValidUntil: '2027-03-31',
      ...overrides
    });

    it('creates an office with normalised code and GSTIN, and audits it', async () => {
      const res = await call('root', 'POST', '/api/offices', office());
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        code: 'BLR',
        gstin: '29AAGCB7383J1Z4',
        lutValidUntil: '2027-03-31',
        businessId: s.companyA,
        isArchived: false
      });
      const [row] = await audit('office.create');
      expect(row).toMatchObject({ business_id: s.companyA, office_id: (res.body.data as { id: number }).id });
    });

    it('validates code, state, GSTIN and LUT fields', async () => {
      const cases: [Record<string, unknown>, string, string][] = [
        [{ code: 'B-1' }, 'code', 'office.codeInvalid'],
        [{ code: 'ABCD' }, 'code', 'office.codeInvalid'],
        [{ stateCode: '99' }, 'stateCode', 'office.stateCodeInvalid'],
        [{ gstin: '27AAGCB7383J1Z4' }, 'gstin', 'office.gstinInvalid'],
        [{ gstin: '29AAGCB7383J1Y4' }, 'gstin', 'office.gstinInvalid'],
        [{ lutValidUntil: null }, 'lutValidUntil', 'office.lutIncomplete'],
        [{ gstin: null }, 'lutReference', 'office.lutRequiresGstin']
      ];
      for (const [overrides, field, message] of cases) {
        const res = await call('root', 'POST', '/api/offices', office({ code: 'VX1', ...overrides }));
        expect(res.status, JSON.stringify(overrides)).toBe(400);
        expect(res.body.errors?.[field], JSON.stringify(overrides)).toContain(message);
      }
      const taken = await call('root', 'POST', '/api/offices', office());
      expect(taken.status).toBe(409);
      expect(taken.body.key).toBe('office.codeTaken');
    });

    it('lets only all-offices users create offices, and scopes reads and edits', async () => {
      expect((await call('alice', 'POST', '/api/offices', office({ code: 'AL1' }))).status).toBe(403);
      const rita = await call('rita', 'POST', '/api/offices', office({ code: 'RT1' }));
      expect(rita.body.key).toBe('office.createRequiresAllOffices');

      const visible = await call('alice', 'GET', '/api/offices');
      expect((visible.body.data as { id: number }[]).map(entry => entry.id)).toEqual([s.officeA1]);
      expect((await call('alice', 'GET', `/api/offices/${s.officeB1}`)).status).toBe(404);

      const edit = { name: 'A1 renamed', code: 'A1', stateCode: '29', isArchived: false };
      expect((await call('rita', 'PUT', `/api/offices/${s.officeA1}`, edit)).status).toBe(200);
      expect((await call('rita', 'PUT', `/api/offices/${s.officeB1}`, { ...edit, code: 'B1' })).status).toBe(404);

      const archived = await call('root', 'PUT', `/api/offices/${s.officeA2}`, {
        ...edit,
        code: 'A2',
        isArchived: true
      });
      expect(archived.body.data).toMatchObject({ isArchived: true, code: 'A2' });
    });
  });

  describe('companies', () => {
    it('creates and updates companies with PAN validation, archive-only, and audits both', async () => {
      const body = { name: 'Company C', shortName: 'CC', pan: 'aaacb1234c', legal_name: 'Company C Pvt Ltd' };
      expect((await call('root', 'POST', '/api/businesses', { ...body, pan: 'BAD' })).body.errors).toHaveProperty(
        'pan'
      );

      const created = await call('root', 'POST', '/api/businesses', body);
      expect(created.status).toBe(200);
      const company = created.body.data as { id: number; pan: string; legal_name: string };
      expect(company).toMatchObject({ pan: 'AAACB1234C', legal_name: 'Company C Pvt Ltd' });

      const updated = await call('root', 'PUT', '/api/businesses', { ...body, id: company.id, isArchived: true });
      expect(updated.body.data).toMatchObject({ isArchived: true });
      const [row] = await audit('company.update');
      expect(row).toMatchObject({
        business_id: company.id,
        before: expect.objectContaining({ isArchived: false }),
        after: expect.objectContaining({ isArchived: true })
      });
      expect(await audit('company.create')).toHaveLength(1);

      expect((await call('root', 'DELETE', `/api/businesses/${company.id}`)).status).toBe(404);
      expect((await call('root', 'POST', '/api/businesses/batch', [body])).status).toBe(404);
      expect((await call('alice', 'PUT', '/api/businesses', { ...body, id: s.companyA })).status).toBe(403);
    });
  });

  describe('users', () => {
    it('creates a user with a one-time temporary password that must be changed', async () => {
      const res = await call(
        'alice',
        'POST',
        '/api/users',
        userBody({
          email: 'new.hire@example.com',
          fullName: 'New Hire',
          roleId: s.userRole,
          officeIds: [s.officeA1],
          extraPermissions: ['invoice.edit']
        })
      );
      expect(res.status).toBe(200);
      const { user, temporaryPassword } = res.body.data as { user: UserData; temporaryPassword: string };
      expect(temporaryPassword).toMatch(/^[A-Za-z0-9]{16}$/);
      expect(user).toMatchObject({
        officeIds: [s.officeA1],
        mustChangePassword: true,
        extraPermissions: ['customer.view', 'invoice.edit', 'invoice.view']
      });

      const first = await login('new.hire@example.com', temporaryPassword);
      expect(first.response.status).toBe(200);
      expect((first.response.body.data as { user: { mustChangePassword: boolean } }).user.mustChangePassword).toBe(
        true
      );
      expect(await audit('user.create')).toEqual(
        expect.arrayContaining([expect.objectContaining({ office_id: s.officeA1, business_id: s.companyA })])
      );
    });

    it('stops office admins escalating: offices, all-offices, roles and grants', async () => {
      const base = userBody({ email: 'x1@example.com', fullName: 'X', roleId: s.userRole, officeIds: [s.officeA1] });
      const cases: [Record<string, unknown>, number, string][] = [
        [{ officeIds: [s.officeB1] }, 403, 'user.officeOutsideScope'],
        [{ allOffices: true, officeIds: [] }, 403, 'user.cannotSetAllOffices'],
        [{ roleId: s.superAdminRole }, 403, 'user.cannotGrant'],
        [{ extraPermissions: ['admin.companies'] }, 403, 'user.cannotGrant'],
        [{ email: 'bob@example.com' }, 409, 'user.emailTaken'],
        [{ officeIds: [] }, 400, 'error.validation'],
        [{ roleId: 999999 }, 400, 'user.roleNotFound']
      ];
      for (const [overrides, status, key] of cases) {
        const res = await call('alice', 'POST', '/api/users', { ...base, ...overrides });
        expect(res.status, key).toBe(status);
        expect(res.body.key, key).toBe(key);
      }
    });

    it('scopes the user list and edits to users wholly inside the caller’s offices', async () => {
      const list = await call('alice', 'GET', '/api/users');
      const ids = (list.body.data as { id: number }[]).map(user => user.id);
      expect(ids).toEqual(expect.arrayContaining([s.alice, s.rita, s.erin, s.carol]));
      expect(ids).not.toContain(s.bob);
      expect(ids).not.toContain(s.root);

      const carol = await call('alice', 'GET', `/api/users/${s.carol}`);
      expect((carol.body.data as UserData).officeIds).toEqual([s.officeA1]);
      const editCarol = await call('alice', 'PUT', `/api/users/${s.carol}`, {
        ...userBody({ email: 'carol@example.com', fullName: 'Carol', roleId: s.userRole, officeIds: [s.officeA1] })
      });
      expect(editCarol.body.key).toBe('user.outsideScope');
      expect((await call('alice', 'PUT', `/api/users/${s.bob}`, userBody({ email: 'bob@example.com' }))).status).toBe(
        400
      );
      const editBob = await call(
        'alice',
        'PUT',
        `/api/users/${s.bob}`,
        userBody({ email: 'bob@example.com', fullName: 'Bob', roleId: s.userRole, officeIds: [s.officeA1] })
      );
      expect(editBob.status).toBe(404);
    });

    it('revokes a user’s sessions on role, office and active changes, but not on name or grant changes', async () => {
      const erinBody = (overrides: Record<string, unknown> = {}) =>
        userBody({
          email: 'erin@example.com',
          fullName: 'Erin',
          roleId: s.userRole,
          officeIds: [s.officeA1],
          ...overrides
        });
      const erinAlive = async () => (await call('erin', 'GET', '/api/auth/me')).status === 200;
      const relogin = async () => (sessions.erin = await login('erin@example.com'));

      expect((await call('alice', 'PUT', `/api/users/${s.erin}`, erinBody({ fullName: 'Erin E' }))).status).toBe(200);
      expect(await erinAlive()).toBe(true);
      await call('alice', 'PUT', `/api/users/${s.erin}`, erinBody({ extraPermissions: ['report.view'] }));
      expect(await erinAlive()).toBe(true);

      await call('alice', 'PUT', `/api/users/${s.erin}`, erinBody({ roleId: s.officeAdminRole }));
      expect(await erinAlive()).toBe(false);
      await relogin();

      await call('root', 'PUT', `/api/users/${s.erin}`, erinBody({ officeIds: [s.officeA1, s.officeA2] }));
      expect(await erinAlive()).toBe(false);
      await relogin();

      const deactivated = await call('root', 'PUT', `/api/users/${s.erin}`, erinBody({ isActive: false }));
      expect(deactivated.body.data).toMatchObject({ isActive: false });
      expect(await erinAlive()).toBe(false);
      expect((await login('erin@example.com')).response.status).toBe(401);

      await call('root', 'PUT', `/api/users/${s.erin}`, erinBody());
      await relogin();
      expect(await erinAlive()).toBe(true);
    });

    it('does not let users change their own access', async () => {
      const self = userBody({ email: 'alice@example.com', fullName: 'Alice', roleId: s.officeAdminRole });
      const own = { ...self, officeIds: [s.officeA1] };
      expect((await call('alice', 'PUT', `/api/users/${s.alice}`, { ...own, fullName: 'Alice A' })).status).toBe(200);
      const escalate = await call('alice', 'PUT', `/api/users/${s.alice}`, { ...own, roleId: s.userRole });
      expect(escalate.body.key).toBe('user.cannotChangeOwnAccess');
    });

    it('never deactivates or demotes the last active Super Admin', async () => {
      const rootBody = (overrides: Record<string, unknown> = {}) =>
        userBody({
          email: 'root@example.com',
          fullName: 'Root',
          roleId: s.superAdminRole,
          allOffices: true,
          ...overrides
        });
      const root2Body = (overrides: Record<string, unknown> = {}) =>
        userBody({
          email: 'root2@example.com',
          fullName: 'Root 2',
          roleId: s.superAdminRole,
          allOffices: true,
          ...overrides
        });

      expect((await call('root', 'PUT', `/api/users/${s.root2}`, root2Body({ isActive: false }))).status).toBe(200);

      for (const overrides of [
        { isActive: false },
        { roleId: s.userRole, allOffices: false, officeIds: [s.officeA1] }
      ]) {
        const res = await call('gloria', 'PUT', `/api/users/${s.root}`, rootBody(overrides));
        expect(res.status).toBe(409);
        expect(res.body.key).toBe('user.lastSuperAdmin');
      }

      expect((await call('root', 'PUT', `/api/users/${s.root2}`, root2Body())).status).toBe(200);
      expect((await call('gloria', 'PUT', `/api/users/${s.root}`, rootBody({ isActive: false }))).status).toBe(200);
      await testDb.withTx(db => db.run('UPDATE users SET is_active = true WHERE id = ?', [s.root]));
      sessions.root = await login('root@example.com');
    });

    it('resets passwords within scope, revoking sessions, with a 24-hour temporary password', async () => {
      expect((await call('alice', 'POST', `/api/users/${s.carol}/reset-password`)).body.key).toBe('user.outsideScope');
      expect((await call('alice', 'POST', `/api/users/${s.bob}/reset-password`)).status).toBe(404);
      expect((await call('alice', 'POST', `/api/users/${s.alice}/reset-password`)).body.key).toBe(
        'user.useChangePassword'
      );

      const res = await call('alice', 'POST', `/api/users/${s.erin}/reset-password`);
      expect(res.status).toBe(200);
      const temporary = (res.body.data as { temporaryPassword: string }).temporaryPassword;
      expect((await call('erin', 'GET', '/api/auth/me')).status).toBe(401);
      expect((await login('erin@example.com')).response.status).toBe(401);

      const expiry = await testDb.withTx(db =>
        db.get<{ hours: number }>(
          `SELECT round(extract(epoch FROM password_expires_at - now()) / 3600)::int AS hours FROM users WHERE id = ?`,
          [s.erin]
        )
      );
      expect(expiry).toEqual({ hours: 24 });

      await testDb.withTx(db =>
        db.run(`UPDATE users SET password_expires_at = now() - interval '1 minute' WHERE id = ?`, [s.erin])
      );
      const expired = await login('erin@example.com', temporary);
      expect(expired.response.status).toBe(401);
      expect(expired.response.body.key).toBe('auth.temporaryPasswordExpired');

      const again = (await call('alice', 'POST', `/api/users/${s.erin}/reset-password`)).body.data as {
        temporaryPassword: string;
      };
      const session = await login('erin@example.com', again.temporaryPassword);
      expect(session.response.status).toBe(200);
      const changed = await server.request('POST', '/api/auth/change-password', {
        session,
        body: { currentPassword: again.temporaryPassword, newPassword: PASSWORD }
      });
      expect(changed.status).toBe(200);
      const row = await testDb.withTx(db =>
        db.get('SELECT must_change_password, password_expires_at FROM users WHERE id = ?', [s.erin])
      );
      expect(row).toEqual({ must_change_password: false, password_expires_at: null });
      sessions.erin = await login('erin@example.com');
    });
  });

  describe('audit log', () => {
    it('pages newest first and filters by action', async () => {
      const all = await call('root', 'GET', '/api/audit-logs?pageSize=2');
      const page = all.body.data as { items: { id: number }[]; total: number; page: number; pageSize: number };
      expect(page).toMatchObject({ page: 1, pageSize: 2 });
      expect(page.items).toHaveLength(2);
      expect(page.items[0].id).toBeGreaterThan(page.items[1].id);
      expect(page.total).toBeGreaterThan(10);

      const second = (await call('root', 'GET', '/api/audit-logs?pageSize=2&page=2')).body.data as {
        items: { id: number }[];
      };
      expect(second.items[0].id).toBeLessThan(page.items[1].id);

      const offices = (await call('root', 'GET', '/api/audit-logs?action=office.create')).body.data as {
        items: { action: string; actorEmail: string }[];
      };
      expect(offices.items.every(item => item.action === 'office.create')).toBe(true);
      expect(offices.items[0].actorEmail).toBe('root@example.com');
    });

    it('shows office admins only their scope and requires audit.view', async () => {
      await call('root', 'PUT', `/api/offices/${s.officeB1}`, { name: 'B1 edited', code: 'B1', stateCode: '27' });
      const items = (
        (await call('alice', 'GET', '/api/audit-logs?pageSize=200')).body.data as {
          items: { officeId: number | null; businessId: number | null }[];
        }
      ).items;
      expect(items.length).toBeGreaterThan(0);
      expect(
        items.every(item => item.officeId === s.officeA1 || (item.officeId === null && item.businessId === s.companyA))
      ).toBe(true);
      expect((await call('erin', 'GET', '/api/audit-logs')).status).toBe(403);
    });
  });
});
