import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

export type AppErrorKind = 'validation' | 'unauthenticated' | 'forbidden' | 'notFound' | 'conflict' | 'internal';

const STATUS: Record<AppErrorKind, number> = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  internal: 500
};

const DEFAULT_KEY: Record<AppErrorKind, string> = {
  validation: 'error.validation',
  unauthenticated: 'auth.unauthenticated',
  forbidden: 'auth.forbidden',
  notFound: 'error.notFound',
  conflict: 'error.conflict',
  internal: 'error.unknownError'
};

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly key: string;
  readonly fields?: Record<string, string[]>;

  constructor(kind: AppErrorKind, key = DEFAULT_KEY[kind], fields?: Record<string, string[]>) {
    super(key);
    this.kind = kind;
    this.key = key;
    this.fields = fields;
  }
}

export const parseBody = <S extends z.ZodType>(schema: S, body: unknown): z.infer<S> => {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const fields: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    (fields[issue.path.join('.') || '_'] ??= []).push(issue.message);
  }
  throw new AppError('validation', DEFAULT_KEY.validation, fields);
};

type HttpError = Error & { status?: number; statusCode?: number; type?: string; code?: string };

const toAppError = (error: HttpError): AppError | undefined => {
  if (error instanceof AppError) return error;
  if (error.type === 'entity.too.large') return new AppError('validation', 'error.fileTooLarge');
  if (error.type === 'entity.parse.failed') return new AppError('validation', 'error.invalidFile');
  if (error.code === '42501') return new AppError('notFound');
  return undefined;
};

export const notFoundHandler = (_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError('notFound'));
};

export const errorHandler = (error: HttpError, req: Request, res: Response, _next: NextFunction) => {
  const appError = toAppError(error);
  const status = appError ? STATUS[appError.kind] : (error.status ?? error.statusCode ?? 500);
  const key = appError?.key ?? DEFAULT_KEY.internal;
  const logDetail = appError && error.message === key ? '' : `: ${error.message}`;
  console.error(`[${res.locals.requestId}] ${req.method} ${req.path} ${status} ${key}${logDetail}`);

  const message = status >= 500 ? 'Internal server error' : appError?.kind === 'notFound' ? 'Not found' : key;
  res.status(status).json({
    success: false,
    key,
    message,
    ...(appError?.fields ? { errors: appError.fields } : {})
  });
};
