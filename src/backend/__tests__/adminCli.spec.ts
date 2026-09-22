// @vitest-environment node
import { spawn } from 'child_process';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CliError, createSuperAdmin } from '../admin-cli/createSuperAdmin';
import { verifyPassword } from '../shared/auth/passwords';
import { createWithTx, type WithTx } from '../shared/db/tx';
import { createPgTestDb, type PgTestDb } from './helpers/pgTestDb';
import { startTestServer } from './helpers/testServer';

const ROOT = path.resolve(__dirname, '../../..');
const TSX_CLI = path.join(ROOT, 'node_modules/tsx/dist/cli.mjs');
const CLI = path.join(ROOT, 'src/backend/admin-cli/index.ts');

const runCli = (args: string[], stdin: string, env: Record<string, string>) =>
  new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, CLI, ...args], {
      cwd: ROOT,
      env: { ...process.env, MIGRATION_DATABASE_URL: '', ...env }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });

describe('admin CLI', () => {
  let testDb: PgTestDb;
  let ownerTx: WithTx;

  beforeAll(async () => {
    testDb = await createPgTestDb();
    ownerTx = createWithTx(testDb.rolePool('app_owner'));
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it('creates an active all-offices Super Admin with an argon2 hash and an audit row', async () => {
    const { id } = await createSuperAdmin(ownerTx, {
      email: ' Owner@Example.com ',
      fullName: ' Owner ',
      password: 'correct-horse-battery'
    });

    const user = await testDb.withTx(db =>
      db.get<Record<string, unknown>>(
        `SELECT u.email, u.full_name, u.all_offices, u.is_active, u.must_change_password, r.is_system, u.password_hash
         FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
        [id]
      )
    );
    expect(user).toMatchObject({
      email: 'Owner@Example.com',
      full_name: 'Owner',
      all_offices: true,
      is_active: true,
      must_change_password: false,
      is_system: true
    });
    expect(await verifyPassword(user!.password_hash as string, 'correct-horse-battery')).toBe(true);

    const audit = await testDb.withTx(db =>
      db.get<{ actor_user_id: number | null; after: Record<string, unknown> }>(
        `SELECT actor_user_id, after FROM audit_logs WHERE action = 'user.create' AND entity_id = ?`,
        [String(id)]
      )
    );
    expect(audit).toEqual({
      actor_user_id: null,
      after: { email: 'Owner@Example.com', fullName: 'Owner', roleId: expect.any(Number), allOffices: true }
    });
  });

  it('produces a user who can sign in with every permission', async () => {
    const server = await startTestServer(testDb);
    try {
      const { response } = await server.login('owner@example.com', 'correct-horse-battery');
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        user: { roleName: 'Super Admin', allOffices: true },
        permissions: expect.arrayContaining(['admin.users', 'admin.roles', 'invoice.create', 'audit.view'])
      });
      expect((response.body.data as { permissions: string[] }).permissions).toHaveLength(32);
    } finally {
      await server.close();
    }
  });

  it('rejects bad input and duplicate emails', async () => {
    const valid = { email: 'second@example.com', fullName: 'Second', password: 'correct-horse-battery' };
    const cases: [Partial<typeof valid>, string][] = [
      [{ email: 'not-an-email' }, 'Enter a valid email address.'],
      [{ fullName: '   ' }, 'Enter a name.'],
      [{ password: 'short' }, 'The password must be at least 12 characters.'],
      [{ email: 'OWNER@example.com' }, 'A user with the email OWNER@example.com already exists.']
    ];
    for (const [override, message] of cases) {
      await expect(createSuperAdmin(ownerTx, { ...valid, ...override })).rejects.toThrow(new CliError(message));
    }
  });

  describe('entry point', () => {
    it('prompts for the details on stdin and creates the user', { timeout: 30_000 }, async () => {
      const result = await runCli(
        ['create-super-admin'],
        'piped@example.com\nPiped Admin\npiped-password-1\npiped-password-1\n',
        { MIGRATION_DATABASE_URL: testDb.connectionStringFor('app_owner') }
      );
      expect(result.stderr).toBe('');
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Created Super Admin piped@example.com');
      expect(result.stdout).not.toContain('piped-password-1');
    });

    it('fails when the passwords differ', { timeout: 30_000 }, async () => {
      const result = await runCli(
        ['create-super-admin'],
        'mismatch@example.com\nM\nfirst-password-1\nother-password-1\n',
        {
          MIGRATION_DATABASE_URL: testDb.connectionStringFor('app_owner')
        }
      );
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('The passwords do not match.');
      const row = await testDb.withTx(db => db.get('SELECT id FROM users WHERE email = ?', ['mismatch@example.com']));
      expect(row).toBeNull();
    });

    it('prints usage for an unknown command and requires MIGRATION_DATABASE_URL', { timeout: 30_000 }, async () => {
      const unknown = await runCli(['make-coffee'], '', {});
      expect(unknown.code).toBe(1);
      expect(unknown.stderr).toContain('Usage: npm run admin -- create-super-admin');

      const noUrl = await runCli(['create-super-admin'], '', {});
      expect(noUrl.code).toBe(1);
      expect(noUrl.stderr).toContain('MIGRATION_DATABASE_URL must be set.');
    });
  });
});
