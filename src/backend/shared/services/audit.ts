import type { RequestCtx } from '../auth/context';
import type { Db } from '../db/tx';
import type { AuditQuery } from '../validation/admin';

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId: number | string;
  businessId?: number | null;
  officeId?: number | null;
  before?: unknown;
  after?: unknown;
};

const toJson = (value: unknown) => (value === undefined || value === null ? null : JSON.stringify(value));

export const writeAudit = (db: Db, ctx: RequestCtx, entry: AuditEntry) =>
  db.run(
    `INSERT INTO audit_logs
       (actor_user_id, action, entity_type, entity_id, business_id, office_id, before, after, ip, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ctx.userId,
      entry.action,
      entry.entityType,
      String(entry.entityId),
      entry.businessId ?? null,
      entry.officeId ?? null,
      toJson(entry.before),
      toJson(entry.after),
      ctx.ip ?? null,
      ctx.requestId
    ]
  );

export const listAuditLogs = async (db: Db, query: AuditQuery) => {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const filters: [string, unknown][] = [
    ['a.action = ?', query.action],
    ['a.entity_type = ?', query.entityType],
    ['a.entity_id = ?', query.entityId],
    ['a.actor_user_id = ?', query.actorUserId]
  ];
  for (const [condition, value] of filters) {
    if (value === undefined) continue;
    conditions.push(condition);
    params.push(value);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = await db.get<{ total: number }>(`SELECT count(*)::integer AS total FROM audit_logs a ${where}`, params);
  const items = await db.all<{ id: string }>(
    `SELECT a.id, a.occurred_at AS "occurredAt", a.actor_user_id AS "actorUserId", u.full_name AS "actorName",
            u.email::text AS "actorEmail", a.action, a.entity_type AS "entityType", a.entity_id AS "entityId",
            a.business_id AS "businessId", a.office_id AS "officeId", a.before, a.after, host(a.ip) AS ip,
            a.request_id AS "requestId"
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     ${where}
     ORDER BY a.id DESC
     LIMIT ? OFFSET ?`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize]
  );
  return {
    items: items.map(item => ({ ...item, id: Number(item.id) })),
    total: total?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize
  };
};
