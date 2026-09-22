import type { Db } from '../../shared/db/tx';
import type { PgTestDb } from './pgTestDb';

export type RlsCtx = { userId?: number; officeIds?: number[]; businessIds?: number[]; allOffices?: boolean };

export const asAppUser = <T>(testDb: PgTestDb, ctx: RlsCtx, fn: (db: Db) => Promise<T>) =>
  testDb.withTx(async db => {
    await db.run('SET LOCAL ROLE app_user');
    await db.query(
      `SELECT set_config('app.user_id', ?, true), set_config('app.office_ids', ?, true),
              set_config('app.business_ids', ?, true), set_config('app.all_offices', ?, true)`,
      [
        ctx.userId?.toString() ?? '',
        (ctx.officeIds ?? []).join(','),
        (ctx.businessIds ?? []).join(','),
        String(ctx.allOffices ?? false)
      ]
    );
    return fn(db);
  });
