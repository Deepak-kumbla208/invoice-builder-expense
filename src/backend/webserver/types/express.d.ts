import type { RequestCtx } from '../../shared/auth/context';

declare global {
  namespace Express {
    interface Request {
      ctx?: RequestCtx;
    }
  }
}

export {};
