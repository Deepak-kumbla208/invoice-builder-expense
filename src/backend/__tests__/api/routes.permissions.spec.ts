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

  it('guards writes with the invoice, customer, company and setup permissions', () => {
    const rule = (route: string) => routes.find(entry => entry.route === route)?.rules[0];
    expect(rule('POST /api/invoices')).toEqual({ mode: 'all', keys: ['invoice.create'] });
    expect(rule('PUT /api/invoices')).toEqual({ mode: 'all', keys: ['invoice.edit'] });
    expect(rule('DELETE /api/invoices/:id')).toEqual({ mode: 'all', keys: ['invoice.delete'] });
    expect(rule('GET /api/invoices')).toEqual({ mode: 'any', keys: ['invoice.view', 'invoice.view_all'] });
    expect(rule('POST /api/clients')).toEqual({ mode: 'all', keys: ['customer.manage'] });
    expect(rule('GET /api/clients')).toEqual({ mode: 'all', keys: ['customer.view'] });
    expect(rule('PUT /api/businesses')).toEqual({ mode: 'all', keys: ['admin.companies'] });
    expect(rule('GET /api/settings')).toEqual({ mode: 'authenticated', keys: [] });
    for (const setup of [
      'banks',
      'items',
      'units',
      'currencies',
      'layouts',
      'styleProfiles',
      'presets',
      'categories'
    ]) {
      expect(rule(`POST /api/${setup}`), setup).toEqual({ mode: 'all', keys: ['admin.invoice_setup'] });
      expect(rule(`GET /api/${setup}`), setup).toEqual({
        mode: 'any',
        keys: ['invoice.view', 'invoice.view_all', 'admin.invoice_setup']
      });
    }
  });
});
