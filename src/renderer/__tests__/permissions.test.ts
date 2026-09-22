import { PERMISSIONS, isPermissionKey, resolveDependencies } from '@shared/auth/permissions';

describe('permission map', () => {
  it('has unique, well-formed keys in ascending sort order', () => {
    const keys = PERMISSIONS.map(permission => permission.key);
    expect(new Set(keys).size).toBe(keys.length);
    keys.forEach(key => expect(key).toMatch(/^[a-z_]+\.[a-z_]+$/));

    const sortOrders = PERMISSIONS.map(permission => permission.sortOrder);
    expect(sortOrders).toEqual([...sortOrders].sort((a, b) => a - b));
    expect(new Set(sortOrders).size).toBe(sortOrders.length);
  });

  it('only requires permissions that exist', () => {
    const invalid = PERMISSIONS.flatMap(permission =>
      permission.requires
        .filter(required => !isPermissionKey(required) || required === permission.key)
        .map(required => `${permission.key} → ${required}`)
    );
    expect(invalid).toEqual([]);
  });

  it('adds required permissions and returns keys in map order', () => {
    expect(resolveDependencies(['expense.approve'])).toEqual(['expense.view_all', 'expense.approve']);
    expect(resolveDependencies(['invoice.edit'])).toEqual(['invoice.view', 'invoice.edit', 'customer.view']);
    expect(resolveDependencies(['reimbursement.pay', 'report.view'])).toEqual([
      'reimbursement.view_all',
      'reimbursement.pay',
      'report.view'
    ]);
    expect(resolveDependencies([])).toEqual([]);
  });

  it('is idempotent', () => {
    const all = PERMISSIONS.map(permission => permission.key);
    expect(resolveDependencies(all)).toEqual(all);
    const resolved = resolveDependencies(['invoice.create', 'expense.reject']);
    expect(resolveDependencies(resolved)).toEqual(resolved);
  });

  it('rejects unknown keys', () => {
    expect(() => resolveDependencies(['invoice.view', 'invoice.hack'])).toThrow('Unknown permission: invoice.hack');
  });
});
