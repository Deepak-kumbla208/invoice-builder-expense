import { PERMISSIONS, resolveDependencies, type PermissionKey } from '@shared/auth/permissions';

export interface PermissionRule {
  all?: readonly PermissionKey[];
  any?: readonly PermissionKey[];
}

export const hasPermission = (granted: ReadonlySet<string>, rule?: PermissionRule | PermissionKey) => {
  if (!rule) return true;
  const { all = [], any = [] } = typeof rule === 'string' ? { all: [rule] } : rule;
  return all.every(key => granted.has(key)) && (any.length === 0 || any.some(key => granted.has(key)));
};

const dependentsOf = (key: string): string[] =>
  PERMISSIONS.filter(permission => (permission.requires as readonly string[]).includes(key)).map(
    permission => permission.key
  );

export const tickPermission = (selected: ReadonlySet<string>, key: string): Set<string> =>
  new Set<string>(resolveDependencies([...selected, key]));

export const untickPermission = (
  selected: ReadonlySet<string>,
  key: string,
  locked: ReadonlySet<string> = new Set()
): Set<string> => {
  const next = new Set(selected);
  const pending = [key];
  while (pending.length) {
    const current = pending.pop()!;
    if (locked.has(current) || !next.delete(current)) continue;
    pending.push(...dependentsOf(current));
  }
  return next;
};

export const missingToGrant = (key: string, available: ReadonlySet<string>): string[] =>
  resolveDependencies([key]).filter(required => !available.has(required));
