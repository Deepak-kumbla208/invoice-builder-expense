import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const csrfProtection = (req: Request, _res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const token = req.get('x-csrf-token');
  const secret = req.ctx?.csrfSecret;
  next(token && secret && safeEqual(token, secret) ? undefined : new AppError('forbidden', 'auth.csrfInvalid'));
};

export const requireSameOrigin =
  (appOrigin: string | undefined) => (req: Request, _res: Response, next: NextFunction) => {
    const expected = appOrigin ?? `${req.protocol}://${req.get('host')}`;
    next(req.get('origin') === expected ? undefined : new AppError('forbidden', 'auth.originInvalid'));
  };
