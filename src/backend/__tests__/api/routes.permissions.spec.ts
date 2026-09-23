// @vitest-environment node
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../webserver/app';
import { createServerDeps } from '../../webserver/deps';
import { permissionRuleOf, type PermissionRule } from '../../webserver/middleware/permissions';

const UNGUARDED = [
  'GET /api/health',
  'GET /api/version',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'GET /api/auth/me',
  'POST /api/auth/change-password'
];

// Every guarded route and the exact rule it declares. The table is checked in rather than
// derived, so loosening a guard fails here instead of quietly widening access.
const EXPECTED_RULES: Record<string, string> = {
  'GET /api/layouts': 'any:invoice.view,invoice.view_all,admin.invoice_setup',
  'POST /api/layouts': 'all:admin.invoice_setup',
  'PUT /api/layouts': 'all:admin.invoice_setup',
  'DELETE /api/layouts/:id': 'all:admin.invoice_setup',
  'GET /api/layouts/export/:id': 'all:admin.invoice_setup',
  'GET /api/businesses': 'any:invoice.view,invoice.view_all,admin.companies',
  'POST /api/businesses': 'all:admin.companies',
  'PUT /api/businesses': 'all:admin.companies',
  'GET /api/categories': 'any:invoice.view,invoice.view_all,admin.invoice_setup',
  'POST /api/categories': 'all:admin.invoice_setup',
  'PUT /api/categories': 'all:admin.invoice_setup',
  'DELETE /api/categories/:id': 'all:admin.invoice_setup',
  'POST /api/categories/batch': 'all:admin.invoice_setup',
  'GET /api/clients': 'all:customer.view',
  'POST /api/clients': 'all:customer.manage',
  'PUT /api/clients': 'all:customer.manage',
  'DELETE /api/clients/:id': 'all:customer.manage',
  'POST /api/clients/batch': 'all:customer.manage',
  'GET /api/invoices/xml': 'all:invoice.download',
  'GET /api/invoices/sequence': 'any:invoice.create,invoice.edit',
  'GET /api/invoices/headers': 'any:invoice.view,invoice.view_all',
  'GET /api/invoices': 'any:invoice.view,invoice.view_all',
  'POST /api/invoices': 'all:invoice.create',
  'PUT /api/invoices': 'all:invoice.edit',
  'DELETE /api/invoices/:id': 'all:invoice.delete',
  'POST /api/invoices/duplicate': 'all:invoice.create',
  'GET /api/items': 'any:invoice.view,invoice.view_all,admin.invoice_setup',
  'POST /api/items': 'all:admin.invoice_setup',
  'PUT /api/items': 'all:admin.invoice_setup',
  'DELETE /api/items/:id': 'all:admin.invoice_setup',
  'POST /api/items/batch': 'all:admin.invoice_setup',
  'GET /api/settings': 'authenticated:',
  'PUT /api/settings': 'all:admin.settings',
  'GET /api/styleProfiles': 'any:invoice.view,invoice.view_all,admin.invoice_setup',
  'POST /api/styleProfiles': 'all:admin.invoice_setup',
  'PUT /api/styleProfiles': 'all:admin.invoice_setup',
  'DELETE /api/styleProfiles/:id': 'all:admin.invoice_setup',
  'POST /api/styleProfiles/batch': 'all:admin.invoice_setup',
  'GET /api/units': 'any:invoice.view,invoice.view_all,admin.invoice_setup',
  'POST /api/units': 'all:admin.invoice_setup',
  'PUT /api/units': 'all:admin.invoice_setup',
  'DELETE /api/units/:id': 'all:admin.invoice_setup',
  'POST /api/units/batch': 'all:admin.invoice_setup',
  'GET /api/currencies': 'any:invoice.view,invoice.view_all,admin.invoice_setup',
  'POST /api/currencies': 'all:admin.invoice_setup',
  'PUT /api/currencies': 'all:admin.invoice_setup',
  'DELETE /api/currencies/:id': 'all:admin.invoice_setup',
  'POST /api/currencies/batch': 'all:admin.invoice_setup',
  'GET /api/banks': 'any:invoice.view,invoice.view_all,admin.invoice_setup',
  'POST /api/banks': 'all:admin.invoice_setup',
  'PUT /api/banks': 'all:admin.invoice_setup',
  'DELETE /api/banks/:id': 'all:admin.invoice_setup',
  'POST /api/banks/batch': 'all:admin.invoice_setup',
  'GET /api/presets': 'any:invoice.view,invoice.view_all,admin.invoice_setup',
  'POST /api/presets': 'all:admin.invoice_setup',
  'PUT /api/presets': 'all:admin.invoice_setup',
  'DELETE /api/presets/:id': 'all:admin.invoice_setup',
  'POST /api/presets/batch': 'all:admin.invoice_setup',
  'GET /api/offices': 'any:admin.offices,admin.users',
  'GET /api/offices/:id': 'any:admin.offices,admin.users',
  'POST /api/offices': 'all:admin.offices',
  'PUT /api/offices/:id': 'all:admin.offices',
  'GET /api/permissions': 'any:admin.roles,admin.users',
  'GET /api/roles': 'any:admin.roles,admin.users',
  'GET /api/roles/:id': 'any:admin.roles,admin.users',
  'POST /api/roles': 'all:admin.roles',
  'PUT /api/roles/:id': 'all:admin.roles',
  'DELETE /api/roles/:id': 'all:admin.roles',
  'GET /api/users': 'all:admin.users',
  'GET /api/users/:id': 'all:admin.users',
  'POST /api/users': 'all:admin.users',
  'PUT /api/users/:id': 'all:admin.users',
  'POST /api/users/:id/reset-password': 'all:admin.users',
  'GET /api/audit-logs': 'all:audit.view'
};

const ruleKey = (rule: PermissionRule) => `${rule.mode}:${rule.keys.join(',')}`;

type RouteLayer = {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] };
};

const listRoutes = () => {
  const app = createApp(createServerDeps(new Pool()));
  const stack = (app as unknown as { router: { stack: RouteLayer[] } }).router.stack;
  return stack.flatMap(layer =>
    layer.route
      ? Object.keys(layer.route.methods).map(method => ({
          route: `${method.toUpperCase()} ${layer.route!.path}`,
          rules: layer.route!.stack.map(entry => permissionRuleOf(entry.handle)).filter(Boolean) as PermissionRule[]
        }))
      : []
  );
};

describe('route permissions', () => {
  const routes = listRoutes();

  it('finds the API routes', () => {
    expect(routes.length).toBeGreaterThan(60);
    expect(new Set(routes.map(entry => entry.route)).size).toBe(routes.length);
  });

  it('declares exactly one permission rule on every route except auth and health', () => {
    const missing = routes.filter(entry => !UNGUARDED.includes(entry.route) && entry.rules.length !== 1);
    expect(missing.map(entry => entry.route)).toEqual([]);

    const unexpected = routes.filter(entry => UNGUARDED.includes(entry.route) && entry.rules.length > 0);
    expect(unexpected.map(entry => entry.route)).toEqual([]);
    expect(
      routes
        .filter(entry => UNGUARDED.includes(entry.route))
        .map(entry => entry.route)
        .sort()
    ).toEqual([...UNGUARDED].sort());
  });

  it('no longer registers the unscoped JSON backup routes (A1)', () => {
    expect(routes.map(entry => entry.route).filter(route => /^\w+ \/api\/(export|import)$/.test(route))).toEqual([]);
  });

  it('declares exactly the checked-in permission rule on every guarded route', () => {
    const actual = Object.fromEntries(
      routes.filter(entry => entry.rules.length === 1).map(entry => [entry.route, ruleKey(entry.rules[0])])
    );
    expect(actual).toEqual(EXPECTED_RULES);
  });
});
