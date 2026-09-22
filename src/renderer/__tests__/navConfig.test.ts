import { PERMISSIONS, isPermissionKey } from '@shared/auth/permissions';
import { NAV_CONFIG, filterNav, isNavGroup, navLeaves, type NavEntry } from '../app/navConfig';
import { GUARDED_PAGES } from '../app/routes';

vi.mock('../pages/layouts', () => ({ LayoutsPage: () => null }));

const OFFICE_ADMIN = [
  'invoice.view',
  'invoice.view_all',
  'invoice.create',
  'customer.view',
  'customer.manage',
  'report.view',
  'admin.users',
  'admin.offices',
  'audit.view'
];

const labels = (entries: NavEntry[]): string[] =>
  entries.flatMap(entry => (isNavGroup(entry) ? [entry.id, ...labels(entry.children)] : [entry.id]));

const allFeatures = { quotesON: true, reportsON: true, presetsON: true, styleProfilesON: true };

describe('navigation config', () => {
  it('only references known permission keys', () => {
    const keys = navLeaves().flatMap(leaf => [...(leaf.permission?.all ?? []), ...(leaf.permission?.any ?? [])]);
    expect(keys.filter(key => !isPermissionKey(key))).toEqual([]);
  });

  it('has unique ids and paths', () => {
    const ids = labels(NAV_CONFIG);
    expect(new Set(ids).size).toBe(ids.length);
    const paths = navLeaves().map(leaf => leaf.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('has exactly one guarded route per page item, and a rule for each', () => {
    const pagePaths = navLeaves()
      .map(leaf => leaf.path)
      .filter(path => path !== '/');
    expect(Object.keys(GUARDED_PAGES).sort()).toEqual([...pagePaths].sort());
    expect(navLeaves().filter(leaf => leaf.path !== '/' && !leaf.permission)).toEqual([]);
  });

  it('shows a Super Admin every item', () => {
    const everything = new Set<string>(PERMISSIONS.map(permission => permission.key));
    expect(labels(filterNav(NAV_CONFIG, everything, allFeatures))).toEqual(labels(NAV_CONFIG));
  });

  it('shows a user without permissions only the dashboard', () => {
    expect(labels(filterNav(NAV_CONFIG, new Set(), allFeatures))).toEqual(['dashboard']);
  });

  it('hides items the permissions do not cover and drops empty groups', () => {
    const visible = labels(filterNav(NAV_CONFIG, new Set(OFFICE_ADMIN), allFeatures));
    expect(visible).toEqual([
      'dashboard',
      'invoices',
      'allInvoices',
      'quotes',
      'reports',
      'customers',
      'administration',
      'users',
      'offices',
      'auditLog'
    ]);
  });

  it('hides feature-flagged items that are switched off', () => {
    const everything = new Set<string>(PERMISSIONS.map(permission => permission.key));
    const visible = labels(filterNav(NAV_CONFIG, everything, undefined));
    expect(visible).not.toContain('quotes');
    expect(visible).not.toContain('reports');
    expect(visible).not.toContain('presets');
    expect(visible).not.toContain('styleProfiles');
    expect(visible).toContain('allInvoices');
  });
});
