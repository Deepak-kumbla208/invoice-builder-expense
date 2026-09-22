import type { Pool } from 'pg';
import { pool } from './pool';
import { createWithTx } from './tx';

const SYSTEM_FUNCTION = /^(auth_cleanup_sessions|sys_[a-z0-9_]+)$/;

export type SystemCall = <T = unknown>(fn: string, ...args: unknown[]) => Promise<T>;

export const createWithSystemTx = (dbPool: Pool) => {
  const withDbTx = createWithTx(dbPool);
  return <T>(jobName: string, fn: (call: SystemCall) => Promise<T>): Promise<T> =>
    withDbTx(async db => {
      await db.query(`SELECT set_config('app.system', ?, true)`, [jobName]);
      const call: SystemCall = async <R>(name: string, ...args: unknown[]) => {
        if (!SYSTEM_FUNCTION.test(name)) throw new Error(`System jobs cannot call ${name}`);
        const placeholders = args.map(() => '?').join(', ');
        const row = await db.get<{ result: R }>(`SELECT ${name}(${placeholders}) AS result`, args);
        return row?.result as R;
      };
      return fn(call);
    });
};

export type WithSystemTx = ReturnType<typeof createWithSystemTx>;

export const withSystemTx = createWithSystemTx(pool);
