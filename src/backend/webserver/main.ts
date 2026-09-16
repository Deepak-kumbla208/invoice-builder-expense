import { randomUUID } from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { APP_CONFIG } from './config';
import { initControllers } from './controllers';

const port = Number(process.env.PORT) || Number(APP_CONFIG.PORT);
const server = process.env.DEV_SERVER_URL || APP_CONFIG.DEV_SERVER_URL;
const host = process.env.NODE_ENV === 'docker' ? 'localhost' : server;
const version = APP_CONFIG.VERSION;

const LARGE_BODY_ROUTES = ['/api/invoices', '/api/businesses', '/api/presets', '/api/styleProfiles'];
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

type HttpError = Error & { status?: number; statusCode?: number; type?: string };

const errorKey = (error: HttpError) => {
  if (error.type === 'entity.too.large') return 'error.fileTooLarge';
  if (error.type === 'entity.parse.failed') return 'error.invalidFile';
  return 'error.unknownError';
};

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

const main = async () => {
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });
  app.get('/api/version', (_req: Request, res: Response) => {
    res.json({ version: version });
  });

  initControllers(app);

  app.use((error: HttpError, req: Request, res: Response, _next: NextFunction) => {
    const status = error.status ?? error.statusCode ?? 500;
    const key = errorKey(error);
    console.error(`[${res.locals.requestId}] ${req.method} ${req.path} ${status} ${key}: ${error.message}`);
    res.status(status).json({
      success: false,
      key,
      message: status >= 500 ? 'Internal server error' : error.message
    });
  });

  app.listen(port, server, () => {
    console.log(`Server listening at http://${host}:${port}`);
  });
};

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
