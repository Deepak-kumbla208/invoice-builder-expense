import { randomUUID } from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { APP_CONFIG } from './config';
import { initControllers } from './controllers';
import { initAuthController } from './controllers/auth';
import type { ServerDeps } from './deps';
import { csrfProtection } from './middleware/csrf';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { createSessionMiddleware, passwordChangeGate, requireAuth } from './middleware/session';

const LARGE_BODY_ROUTES = ['/api/invoices', '/api/businesses', '/api/presets', '/api/styleProfiles'];
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export type AppOptions = { appOrigin?: string };

export const createApp = (deps: ServerDeps, { appOrigin = process.env.APP_ORIGIN || undefined }: AppOptions = {}) => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.requestId = randomUUID();
    next();
  });

  const largeJson = express.json({ limit: '15mb' });
  LARGE_BODY_ROUTES.forEach(route => {
    app.use(route, (req: Request, res: Response, next: NextFunction) => {
      if (!WRITE_METHODS.has(req.method)) {
        next();
        return;
      }
      largeJson(req, res, next);
    });
  });
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });
  app.get('/api/version', (_req: Request, res: Response) => {
    res.json({ version: APP_CONFIG.VERSION });
  });

  app.use('/api', createSessionMiddleware(deps.withTx));
  initAuthController(app, deps, appOrigin);

  app.use('/api', requireAuth, passwordChangeGate, csrfProtection);
  initControllers(app, deps);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
};
