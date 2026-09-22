import type { CookieOptions, NextFunction, Request, Response } from 'express';
import type { RequestCtx } from '../../shared/auth/context';
import { hashToken } from '../../shared/auth/tokens';
import type { WithTx } from '../../shared/db/tx';
import { AppError } from './errors';

export const SESSION_COOKIE = '__Host-sid';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const COOKIE_OPTIONS: CookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };

export type SessionRow = {
  user_id: number;
  email: string;
  full_name: string;
  role_id: number;
  role_name: string;
  all_offices: boolean;
  must_change_password: boolean;
  permissions: string[];
  office_ids: number[];
  business_ids: number[];
  csrf_secret: string;
};

export const readCookie = (req: Request, name: string): string | undefined => {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
};

export const setSessionCookie = (res: Response, token: string) => {
  res.cookie(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE_MS });
};

export const clearSessionCookie = (res: Response) => {
  res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
};

export const loadSession = async (
  withTx: WithTx,
  tokenHash: string,
  req: Request,
  res: Response
): Promise<RequestCtx | undefined> => {
  const row = await withTx(db => db.get<SessionRow>('SELECT * FROM auth_session(?)', [tokenHash]));
  if (!row) return undefined;
  return {
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    roleId: row.role_id,
    roleName: row.role_name,
    permissions: new Set(row.permissions),
    officeIds: row.office_ids,
    businessIds: row.business_ids,
    allOffices: row.all_offices,
    mustChangePassword: row.must_change_password,
    csrfSecret: row.csrf_secret,
    sessionTokenHash: tokenHash,
    ip: req.ip,
    requestId: res.locals.requestId
  };
};

export const createSessionMiddleware = (withTx: WithTx) => async (req: Request, res: Response, next: NextFunction) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    req.ctx = await loadSession(withTx, hashToken(token), req, res);
    if (!req.ctx) clearSessionCookie(res);
  }
  next();
};

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  next(req.ctx ? undefined : new AppError('unauthenticated'));
};

export const passwordChangeGate = (req: Request, _res: Response, next: NextFunction) => {
  next(req.ctx?.mustChangePassword ? new AppError('forbidden', 'auth.mustChangePassword') : undefined);
};

export const ctxOf = (req: Request): RequestCtx => {
  if (!req.ctx) throw new AppError('unauthenticated');
  return req.ctx;
};
