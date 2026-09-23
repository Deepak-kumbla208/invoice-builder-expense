export type AppErrorKind = 'validation' | 'unauthenticated' | 'forbidden' | 'notFound' | 'conflict' | 'internal';

export const DEFAULT_ERROR_KEY: Record<AppErrorKind, string> = {
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

  constructor(kind: AppErrorKind, key = DEFAULT_ERROR_KEY[kind], fields?: Record<string, string[]>) {
    super(key);
    this.kind = kind;
    this.key = key;
    this.fields = fields;
  }
}
