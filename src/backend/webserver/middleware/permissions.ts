import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { PermissionKey } from '../../shared/auth/permissions';
import { AppError } from './errors';

export type PermissionRule = { mode: 'all' | 'any' | 'authenticated'; keys: PermissionKey[] };

const PERMISSION_RULE = Symbol('permissionRule');

type Keys = [PermissionKey, ...PermissionKey[]];

const guard = (rule: PermissionRule): RequestHandler => {
  const allowed = (permissions: ReadonlySet<string>) =>
    rule.mode === 'authenticated' ||
    (rule.mode === 'all' ? rule.keys.every(key => permissions.has(key)) : rule.keys.some(key => permissions.has(key)));

  const middleware = (req: Request, _res: Response, next: NextFunction) => {
    if (!req.ctx) return next(new AppError('unauthenticated'));
    next(allowed(req.ctx.permissions) ? undefined : new AppError('forbidden'));
  };
  return Object.assign(middleware, { [PERMISSION_RULE]: rule });
};

export const requirePermission = (...keys: Keys) => guard({ mode: 'all', keys });

export const requireAnyPermission = (...keys: Keys) => guard({ mode: 'any', keys });

export const requireAuthenticated = () => guard({ mode: 'authenticated', keys: [] });

export const permissionRuleOf = (handler: unknown): PermissionRule | undefined =>
  (handler as { [PERMISSION_RULE]?: PermissionRule } | undefined)?.[PERMISSION_RULE];
