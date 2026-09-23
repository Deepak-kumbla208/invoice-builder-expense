import type { Request } from 'express';
import type { Pool } from 'pg';
import { createWithRequestTx, createWithTx, type Db, type WithTx } from '../shared/db/tx';
import { ctxOf } from './middleware/session';

export type RequestTx = <T>(req: Request, fn: (db: Db) => Promise<T>) => Promise<T>;

export type ServerDeps = {
  withTx: WithTx;
  requestTx: RequestTx;
};

export const createServerDeps = (pool: Pool): ServerDeps => {
  const withRequestTx = createWithRequestTx(pool);
  return {
    withTx: createWithTx(pool),
    requestTx: (req, fn) => withRequestTx(ctxOf(req), fn)
  };
};
