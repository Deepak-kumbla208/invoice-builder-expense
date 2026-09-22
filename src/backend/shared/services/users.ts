import type { RequestCtx } from '../auth/context';
import { resolveDependencies } from '../auth/permissions';
import type { Db } from '../db/tx';
import { AppError } from '../errors';
import type { UserCreateInput, UserUpdateInput } from '../validation/admin';
import { writeAudit } from './audit';
import { assertCanGrant, getRole } from './roles';

export type User = {
  id: number;
  email: string;
  fullName: string;
  roleId: number;
  roleName: string;
  roleIsSystem: boolean;
  allOffices: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  officeIds: number[];
  extraPermissions: string[];
};

const TEMPORARY_PASSWORD_HOURS = 24;

const USER_SELECT = `
  SELECT u.id, u.email::text AS email, u.full_name AS "fullName", u.role_id AS "roleId", r.name AS "roleName",
         r.is_system AS "roleIsSystem", u.all_offices AS "allOffices", u.is_active AS "isActive",
         u.must_change_password AS "mustChangePassword", u.last_login_at AS "lastLoginAt",
         ARRAY(SELECT uo.office_id FROM user_offices uo WHERE uo.user_id = u.id ORDER BY uo.office_id) AS "officeIds",
         ARRAY(SELECT up.permission_key FROM user_permissions up WHERE up.user_id = u.id
               ORDER BY up.permission_key) AS "extraPermissions"
  FROM users u
  JOIN roles r ON r.id = u.role_id`;

export const listUsers = (db: Db) => db.all<User>(`${USER_SELECT} ORDER BY u.full_name, u.id`);

export const getUser = (db: Db, id: number) => db.get<User>(`${USER_SELECT} WHERE u.id = ?`, [id]);

const auditView = (user: User) => ({
  email: user.email,
  fullName: user.fullName,
  roleId: user.roleId,
  allOffices: user.allOffices,
  isActive: user.isActive,
  officeIds: user.officeIds,
  extraPermissions: user.extraPermissions
});

const auditScope = async (db: Db, officeIds: number[]) => {
  if (!officeIds.length) return { businessId: null, officeId: null };
  const officeId = Math.min(...officeIds);
  const office = await db.get<{ businessId: number }>('SELECT business_id AS "businessId" FROM offices WHERE id = ?', [
    officeId
  ]);
  return { businessId: office?.businessId ?? null, officeId: office ? officeId : null };
};

const loadRole = async (db: Db, roleId: number) => {
  const role = await getRole(db, roleId);
  if (!role) throw new AppError('validation', 'user.roleNotFound', { roleId: ['user.roleNotFound'] });
  return role;
};

const assertOfficesAssignable = async (db: Db, ctx: RequestCtx, officeIds: number[]) => {
  if (!ctx.allOffices && officeIds.some(id => !ctx.officeIds.includes(id))) {
    throw new AppError('forbidden', 'user.officeOutsideScope', { officeIds: ['user.officeOutsideScope'] });
  }
  const found = await db.all<{ id: number }>('SELECT id FROM offices WHERE id = ANY(?)', [officeIds]);
  if (found.length !== new Set(officeIds).size) {
    throw new AppError('validation', 'user.officeNotFound', { officeIds: ['user.officeNotFound'] });
  }
};

const assertEmailFree = async (db: Db, email: string, exceptUserId?: number) => {
  const existing = await db.get<{ id: number }>('SELECT id FROM auth_find_user_by_email(?)', [email]);
  if (existing && existing.id !== exceptUserId) {
    throw new AppError('conflict', 'user.emailTaken', { email: ['user.emailTaken'] });
  }
};

const assertManageable = async (db: Db, userId: number) => {
  const row = await db.get<{ manageable: boolean }>('SELECT app_can_manage_user(?) AS manageable', [userId]);
  if (!row?.manageable) throw new AppError('forbidden', 'user.outsideScope');
};

const extraGrants = (rolePermissions: string[], requested: string[]) =>
  resolveDependencies([...rolePermissions, ...requested]).filter(key => !rolePermissions.includes(key));

const sameSet = (a: readonly (number | string)[], b: readonly (number | string)[]) =>
  a.length === b.length && a.every(value => b.includes(value));

export const createUser = async (db: Db, ctx: RequestCtx, input: UserCreateInput, passwordHash: string) => {
  if (input.allOffices && !ctx.allOffices) {
    throw new AppError('forbidden', 'user.cannotSetAllOffices', { allOffices: ['user.cannotSetAllOffices'] });
  }
  const role = await loadRole(db, input.roleId);
  assertCanGrant(ctx, role.permissions, 'roleId', 'user.cannotGrant');
  const extra = extraGrants(role.permissions, input.extraPermissions);
  assertCanGrant(ctx, extra, 'extraPermissions', 'user.cannotGrant');
  const officeIds = input.allOffices ? [] : [...new Set(input.officeIds)];
  await assertOfficesAssignable(db, ctx, officeIds);
  await assertEmailFree(db, input.email);

  await db.run(
    `INSERT INTO users (email, full_name, password_hash, role_id, all_offices, must_change_password, password_expires_at)
     VALUES (?, ?, ?, ?, ?, true, now() + make_interval(hours => ?))`,
    [input.email, input.fullName, passwordHash, input.roleId, input.allOffices, TEMPORARY_PASSWORD_HOURS]
  );
  const { id } = (await db.get<{ id: number }>('SELECT id FROM auth_find_user_by_email(?)', [input.email]))!;
  for (const officeId of officeIds) {
    await db.run('INSERT INTO user_offices (user_id, office_id) VALUES (?, ?)', [id, officeId]);
  }
  for (const key of extra) {
    await db.run('INSERT INTO user_permissions (user_id, permission_key) VALUES (?, ?)', [id, key]);
  }

  const user = (await getUser(db, id))!;
  await writeAudit(db, ctx, {
    action: 'user.create',
    entityType: 'user',
    entityId: id,
    ...(await auditScope(db, officeIds)),
    after: auditView(user)
  });
  return user;
};

const assertNotLastSuperAdmin = async (db: Db, userId: number) => {
  const others = await db.all(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.is_system AND u.is_active AND u.all_offices AND u.id <> ?
     FOR UPDATE OF u`,
    [userId]
  );
  if (!others.length) throw new AppError('conflict', 'user.lastSuperAdmin');
};

export const updateUser = async (db: Db, ctx: RequestCtx, id: number, input: UserUpdateInput) => {
  const before = await getUser(db, id);
  if (!before) throw new AppError('notFound');

  const officeIds = input.allOffices ? [] : [...new Set(input.officeIds)];
  const roleChanged = input.roleId !== before.roleId;
  const officesChanged = input.allOffices !== before.allOffices || !sameSet(officeIds, before.officeIds);
  const activeChanged = input.isActive !== before.isActive;

  const role = roleChanged ? await loadRole(db, input.roleId) : await loadRole(db, before.roleId);
  const extra = extraGrants(role.permissions, input.extraPermissions);
  const grantsChanged = !sameSet(extra, before.extraPermissions);

  if (id === ctx.userId) {
    if (roleChanged || officesChanged || activeChanged || grantsChanged) {
      throw new AppError('forbidden', 'user.cannotChangeOwnAccess');
    }
  } else {
    await assertManageable(db, id);
  }

  if (input.allOffices && !ctx.allOffices) {
    throw new AppError('forbidden', 'user.cannotSetAllOffices', { allOffices: ['user.cannotSetAllOffices'] });
  }
  if (roleChanged) assertCanGrant(ctx, role.permissions, 'roleId', 'user.cannotGrant');
  assertCanGrant(
    ctx,
    extra.filter(key => !before.extraPermissions.includes(key)),
    'extraPermissions',
    'user.cannotGrant'
  );
  const addedOffices = officeIds.filter(officeId => !before.officeIds.includes(officeId));
  await assertOfficesAssignable(db, ctx, addedOffices);
  if (input.email.toLowerCase() !== before.email.toLowerCase()) await assertEmailFree(db, input.email, id);

  const wasSuperAdmin = before.roleIsSystem && before.isActive && before.allOffices;
  const staysSuperAdmin = role.isSystem && input.isActive && input.allOffices;
  if (wasSuperAdmin && !staysSuperAdmin) await assertNotLastSuperAdmin(db, id);

  await db.run(
    `UPDATE users SET email = ?, full_name = ?, role_id = ?, all_offices = ?, is_active = ?, updated_at = now()
     WHERE id = ?`,
    [input.email, input.fullName, input.roleId, input.allOffices, input.isActive, id]
  );
  const removedOffices = before.officeIds.filter(officeId => !officeIds.includes(officeId));
  if (removedOffices.length) {
    await db.run('DELETE FROM user_offices WHERE user_id = ? AND office_id = ANY(?)', [id, removedOffices]);
  }
  for (const officeId of addedOffices) {
    await db.run('INSERT INTO user_offices (user_id, office_id) VALUES (?, ?)', [id, officeId]);
  }
  const extraSet = new Set<string>(extra);
  const removedGrants = before.extraPermissions.filter(key => !extraSet.has(key));
  if (removedGrants.length) {
    await db.run('DELETE FROM user_permissions WHERE user_id = ? AND permission_key = ANY(?)', [id, removedGrants]);
  }
  for (const key of extra.filter(key => !before.extraPermissions.includes(key))) {
    await db.run('INSERT INTO user_permissions (user_id, permission_key) VALUES (?, ?)', [id, key]);
  }
  if (roleChanged || officesChanged || activeChanged) {
    await db.query('SELECT auth_revoke_sessions(?)', [id]);
  }

  const user = (await getUser(db, id))!;
  await writeAudit(db, ctx, {
    action: 'user.update',
    entityType: 'user',
    entityId: id,
    ...(await auditScope(db, user.officeIds.length ? user.officeIds : before.officeIds)),
    before: auditView(before),
    after: auditView(user)
  });
  return user;
};

export const resetUserPassword = async (db: Db, ctx: RequestCtx, id: number, passwordHash: string) => {
  const user = await getUser(db, id);
  if (!user) throw new AppError('notFound');
  if (id === ctx.userId) throw new AppError('forbidden', 'user.useChangePassword');
  await assertManageable(db, id);

  await db.run(
    `UPDATE users
     SET password_hash = ?, must_change_password = true,
         password_expires_at = now() + make_interval(hours => ?), updated_at = now()
     WHERE id = ?`,
    [passwordHash, TEMPORARY_PASSWORD_HOURS, id]
  );
  await db.query('SELECT auth_revoke_sessions(?)', [id]);
  await writeAudit(db, ctx, {
    action: 'user.password_reset',
    entityType: 'user',
    entityId: id,
    ...(await auditScope(db, user.officeIds))
  });
};
