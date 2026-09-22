const AUTH_PATHS = ['/login', '/change-password'];

export const safeReturnTo = (value: string | null | undefined): string => {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  const path = value.split(/[?#]/)[0];
  return AUTH_PATHS.includes(path) ? '/' : value;
};

export const withReturnTo = (path: string, returnTo: string) =>
  returnTo === '/' ? path : `${path}?returnTo=${encodeURIComponent(returnTo)}`;
