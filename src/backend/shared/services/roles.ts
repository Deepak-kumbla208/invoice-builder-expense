import type { RequestCtx } from '../auth/context';
import { PERMISSIONS, resolveDependencies } from '../auth/permissions';
import type { Db } from '../db/tx';
import { AppError } from '../errors';
import type { RoleInput } from '../validation/admin';
import { writeAudit } from './audit';

export type Role = {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  affectedUsers: number;
};

const ROLE_SELECT = `
  SELECT r.id, r.name, r.description, r.is_system AS "isSystem",
         ARRAY(SELECT rp.permission_key FROM role_permissions rp JOIN permissions p ON p.key = rp.permission_key
               WHERE rp.role_id = r.id ORDER BY p.sort_order) AS permissions,
         app_role_user_count(r.id) AS "affectedUsers"
  FROM roles r`;

const REQUIRES = new Map<string, readonly string[]>(
  PERMISSIONS.map(permission => [permission.key, permission.requires])
);

export const listPermissions = async (db: Db) => {
  const rows = await db.all<{ key: string; group_name: string; label: string; sort_order: number }>(
    'SELECT key, group_name, label, sort_order FROM permissions ORDER BY sort_order'
  );
  const groups: { group: string; permissions: { key: string; label: string; requires: readonly string[] }[] }[] = [];
  for (const row of rows) {
    let group = groups.find(entry => entry.group === row.group_name);
    if (!group) groups.push((group = { group: row.group_name, permissions: [] }));
    group.permissions.push({ key: row.key, label: row.label, requires: REQUIRES.get(row.key) ?? [] });
  }
  return groups;
};

export const assertCanGrant = (ctx: RequestCtx, keys: readonly string[], field: string, key: string) => {
  const missing = keys.filter(permission => !ctx.permissions.has(permission));
  if (missing.length) throw new AppError('forbidden', key, { [field]: missing });
};

export const listRoles = (db: Db) => db.all<Role>(`${ROLE_SELECT} ORDER BY r.is_system DESC, r.name`);

export const getRole = (db: Db, id: number) => db.get<Role>(`${ROLE_SELECT} WHERE r.id = ?`, [id]);

const nameTaken = (error: unknown) =>
  (error as { code?: string }).code === '23505'
    ? new AppError('conflict', 'role.nameTaken', { name: ['role.nameTaken'] })
    : error;

const auditView = (role: Role) => ({
  name: role.name,
  description: role.description,
  permissions: role.permissions
});

export const createRole = async (db: Db, ctx: RequestCtx, input: RoleInput) => {
  const permissions = resolveDependencies(input.permissions);
  assertCanGrant(ctx, permissions, 'permissions', 'role.cannotGrant');

  let id: number;
  try {
    id = await db.run('INSERT INTO roles (name, description) VALUES (?, ?)', [input.name, input.description], true);
  } catch (error) {
    throw nameTaken(error);
  }
  for (const key of permissions) {
    await db.run('INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [id, key]);
  }

  const role = (await getRole(db, id))!;
  await writeAudit(db, ctx, { action: 'role.create', entityType: 'role', entityId: id, after: auditView(role) });
  return role;
};

export const updateRole = async (db: Db, ctx: RequestCtx, id: number, input: RoleInput) => {
  const before = await getRole(db, id);
  if (!before) throw new AppError('notFound');

  const permissions = new Set<string>(resolveDependencies(input.permissions));
  const added = [...permissions].filter(key => !before.permissions.includes(key));
  const removed = before.permissions.filter(key => !permissions.has(key));
  if (before.isSystem && (added.length || removed.length)) {
    throw new AppError('conflict', 'role.systemLocked', { permissions: ['role.systemLocked'] });
  }
  assertCanGrant(ctx, added, 'permissions', 'role.cannotGrant');

  try {
    await db.run('UPDATE roles SET name = ?, description = ?, updated_at = now() WHERE id = ?', [
      input.name,
      input.description,
      id
    ]);
  } catch (error) {
    throw nameTaken(error);
  }
  if (removed.length) {
    await db.run('DELETE FROM role_permissions WHERE role_id = ? AND permission_key = ANY(?)', [id, removed]);
  }
  for (const key of added) {
    await db.run('INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [id, key]);
  }

  const role = (await getRole(db, id))!;
  await writeAudit(db, ctx, {
    action: 'role.update',
    entityType: 'role',
    entityId: id,
    before: auditView(before),
    after: auditView(role)
  });
  return role;
};

export const deleteRole = async (db: Db, ctx: RequestCtx, id: number) => {
  const before = await getRole(db, id);
  if (!before) throw new AppError('notFound');
  if (before.isSystem) throw new AppError('conflict', 'role.system');

  try {
    await db.run('DELETE FROM roles WHERE id = ?', [id]);
  } catch (error) {
    if ((error as { code?: string }).code === '23503') throw new AppError('conflict', 'role.inUse');
    throw error;
  }
  await writeAudit(db, ctx, { action: 'role.delete', entityType: 'role', entityId: id, before: auditView(before) });
};
