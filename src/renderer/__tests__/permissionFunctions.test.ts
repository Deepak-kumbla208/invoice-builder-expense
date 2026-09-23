import { PERMISSIONS } from '@shared/auth/permissions';
import { safeReturnTo, withReturnTo } from '../shared/utils/authFunctions';
import { hasPermission, missingToGrant, tickPermission, untickPermission } from '../shared/utils/permissionFunctions';

describe('hasPermission', () => {
  const granted = new Set(['invoice.view', 'customer.view']);

  it('accepts a single key, all-of and any-of rules', () => {
    expect(hasPermission(granted)).toBe(true);
    expect(hasPermission(granted, 'invoice.view')).toBe(true);
    expect(hasPermission(granted, 'invoice.edit')).toBe(false);
    expect(hasPermission(granted, { all: ['invoice.view', 'customer.view'] })).toBe(true);
    expect(hasPermission(granted, { all: ['invoice.view', 'report.view'] })).toBe(false);
    expect(hasPermission(granted, { any: ['report.view', 'customer.view'] })).toBe(true);
    expect(hasPermission(granted, { any: ['report.view', 'admin.users'] })).toBe(false);
    expect(hasPermission(granted, { all: ['invoice.view'], any: ['admin.users'] })).toBe(false);
  });
});

describe('permission ticking', () => {
  it('ticks the permissions a key needs', () => {
    expect([...tickPermission(new Set(), 'expense.approve')].sort()).toEqual(['expense.approve', 'expense.view_all']);
    expect([...tickPermission(new Set(['report.view']), 'invoice.edit')].sort()).toEqual([
      'customer.view',
      'invoice.edit',
      'invoice.view',
      'report.view'
    ]);
  });

  it('unticks everything that needs the removed key, transitively', () => {
    const selected = tickPermission(tickPermission(new Set(), 'invoice.create'), 'invoice.edit');
    expect([...untickPermission(selected, 'customer.view')].sort()).toEqual(['invoice.view']);
    expect([...untickPermission(selected, 'invoice.edit')].sort()).toEqual([
      'customer.view',
      'invoice.create',
      'invoice.view'
    ]);
  });

  it('never unticks locked keys', () => {
    const locked = new Set(['invoice.view', 'invoice.create', 'customer.view']);
    const selected = new Set([...locked, 'invoice.edit']);
    expect([...untickPermission(selected, 'invoice.view', locked)].sort()).toEqual([
      'customer.view',
      'invoice.create',
      'invoice.edit',
      'invoice.view'
    ]);
  });

  it('keeps every selection closed under requires', () => {
    for (const permission of PERMISSIONS) {
      const selected = tickPermission(new Set(), permission.key);
      for (const key of selected) {
        const definition = PERMISSIONS.find(entry => entry.key === key)!;
        definition.requires.forEach(required => expect(selected.has(required)).toBe(true));
      }
    }
  });

  it('lists what an editor would need to grant a key', () => {
    expect(missingToGrant('expense.approve', new Set(['expense.approve']))).toEqual(['expense.view_all']);
    expect(missingToGrant('expense.approve', new Set(['expense.approve', 'expense.view_all']))).toEqual([]);
  });
});

describe('returnTo', () => {
  it('only allows same-app paths and never loops back to the auth pages', () => {
    expect(safeReturnTo('/invoices?x=1')).toBe('/invoices?x=1');
    expect(safeReturnTo(null)).toBe('/');
    expect(safeReturnTo('https://evil.example')).toBe('/');
    expect(safeReturnTo('//evil.example')).toBe('/');
    expect(safeReturnTo('/\\evil.example')).toBe('/');
    expect(safeReturnTo('/login?returnTo=/users')).toBe('/');
    expect(safeReturnTo('/change-password')).toBe('/');
  });

  it('adds returnTo only when it is not the home page', () => {
    expect(withReturnTo('/login', '/')).toBe('/login');
    expect(withReturnTo('/login', '/users?a=b')).toBe('/login?returnTo=%2Fusers%3Fa%3Db');
  });
});
