// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS, resolveDependencies } from '../shared/auth/permissions';
import { createPgTestDb, type PgTestDb } from './helpers/pgTestDb';

type SeededRole = { name: string; is_system: boolean; keys: string[] };

const OFFICE_ADMIN = [
  'invoice.create',
  'invoice.view',
  'invoice.view_all',
  'invoice.edit',
  'invoice.issue',
  'invoice.cancel',
  'invoice.delete',
  'invoice.print',
  'invoice.download',
  'credit_note.create',
  'customer.view',
  'customer.manage',
  'expense.create',
  'expense.view_own',
  'expense.view_all',
  'expense.edit',
  'expense.delete',
  'expense.approve',
  'expense.reject',
  'reimbursement.view_all',
  'reimbursement.pay',
  'report.view',
  'admin.users',
  'audit.view'
];

const USER = ['expense.create', 'expense.view_own', 'reimbursement.view_own'];

describe('permissions sync (map ↔ database)', () => {
  let testDb: PgTestDb;
  let roles: SeededRole[];

  beforeAll(async () => {
    testDb = await createPgTestDb();
    roles = await testDb.withTx(db =>
      db.all<SeededRole>(
        `SELECT r.name, r.is_system,
                COALESCE(array_agg(rp.permission_key ORDER BY p.sort_order) FILTER (WHERE rp.permission_key IS NOT NULL), '{}') AS keys
         FROM roles r
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.key = rp.permission_key
         GROUP BY r.id
         ORDER BY r.id`
      )
    );
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it('stores exactly the keys, groups, labels and order of the map', async () => {
    const rows = await testDb.withTx(db =>
      db.all('SELECT key, group_name, label, sort_order FROM permissions ORDER BY sort_order')
    );
    expect(rows).toEqual(
      PERMISSIONS.map(permission => ({
        key: permission.key,
        group_name: permission.group,
        label: permission.label,
        sort_order: permission.sortOrder
      }))
    );
  });

  it('seeds Super Admin (system, every key), Office Admin and User', () => {
    expect(roles).toEqual([
      { name: 'Super Admin', is_system: true, keys: PERMISSIONS.map(permission => permission.key) },
      { name: 'Office Admin', is_system: false, keys: OFFICE_ADMIN },
      { name: 'User', is_system: false, keys: USER }
    ]);
  });

  it('seeds role permission sets that are closed under requires', () => {
    for (const role of roles) {
      expect(resolveDependencies(role.keys), role.name).toEqual(role.keys);
    }
  });
});
