import { type Express, type Request, type Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { RequestCtx } from '../../shared/auth/context';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  burnPasswordCheck,
  hashPassword,
  verifyPassword
} from '../../shared/auth/passwords';
import { hashToken, newToken } from '../../shared/auth/tokens';
import type { ServerDeps } from '../deps';
import { csrfProtection, requireSameOrigin } from '../middleware/csrf';
import { AppError, parseBody } from '../middleware/errors';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  ctxOf,
  loadSession,
  readCookie,
  requireAuth,
  setSessionCookie
} from '../middleware/session';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const loginSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH)
});

type LoginUser = { id: number; password_hash: string; is_active: boolean };

const tooManyAttempts = (_req: Request, res: Response) => {
  res.status(429).json({ success: false, key: 'auth.tooManyAttempts', message: 'auth.tooManyAttempts' });
};

const loginLimiters = () => [
  rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    limit: 50,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooManyAttempts
  }),
  rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: req =>
      `${ipKeyGenerator(req.ip ?? '')}|${String(req.body?.email ?? '')
        .trim()
        .toLowerCase()}`,
    handler: tooManyAttempts
  })
];

export const initAuthController = (app: Express, { withTx, requestTx }: ServerDeps, appOrigin: string | undefined) => {
  const logEvent = (actorId: number | null, action: string, req: Request, meta: Record<string, unknown> = {}) =>
    withTx(db => db.query('SELECT auth_log_event(?, ?, ?, ?)', [actorId, action, req.ip ?? null, meta]));

  const profile = async (req: Request, ctx: RequestCtx) => {
    const { offices, companies } = await requestTx(req, async db => ({
      offices: await db.all(
        `SELECT id, business_id AS "businessId", name, code, state_code AS "stateCode", is_archived AS "isArchived"
         FROM offices ORDER BY name`
      ),
      companies: await db.all(`SELECT id, name, "shortName", "isArchived" FROM businesses ORDER BY name`)
    }));
    return {
      user: {
        id: ctx.userId,
        email: ctx.email,
        fullName: ctx.fullName,
        roleId: ctx.roleId,
        roleName: ctx.roleName,
        allOffices: ctx.allOffices,
        mustChangePassword: ctx.mustChangePassword
      },
      permissions: [...ctx.permissions],
      offices,
      companies,
      csrfToken: ctx.csrfSecret
    };
  };

  app.post('/api/auth/login', requireSameOrigin(appOrigin), ...loginLimiters(), async (req: Request, res: Response) => {
    const { email, password } = parseBody(loginSchema, req.body);
    const user = await withTx(db =>
      db.get<LoginUser>('SELECT id, password_hash, is_active FROM auth_find_user_by_email(?)', [email])
    );

    let passwordOk = false;
    if (user) passwordOk = await verifyPassword(user.password_hash, password);
    else await burnPasswordCheck(password);

    if (!user || !passwordOk || !user.is_active) {
      const reason = !user ? 'unknown_email' : !passwordOk ? 'wrong_password' : 'inactive';
      await logEvent(user?.id ?? null, 'auth.login_failed', req, { email, reason });
      throw new AppError('unauthenticated', 'auth.invalidCredentials');
    }

    const previousToken = readCookie(req, SESSION_COOKIE);
    const token = newToken();
    const tokenHash = hashToken(token);
    await withTx(async db => {
      if (previousToken) await db.query('SELECT auth_revoke_session(?)', [hashToken(previousToken)]);
      await db.query('SELECT auth_create_session(?, ?, ?, ?, ?)', [
        user.id,
        tokenHash,
        newToken(),
        req.ip ?? null,
        req.get('user-agent')?.slice(0, 512) ?? null
      ]);
    });
    await logEvent(user.id, 'auth.login', req);

    const ctx = await loadSession(withTx, tokenHash, req, res);
    if (!ctx) throw new AppError('internal');
    req.ctx = ctx;
    setSessionCookie(res, token);
    res.json({ success: true, data: await profile(req, ctx) });
  });

  app.post('/api/auth/logout', requireAuth, csrfProtection, async (req: Request, res: Response) => {
    const ctx = ctxOf(req);
    await withTx(db => db.query('SELECT auth_revoke_session(?)', [ctx.sessionTokenHash]));
    await logEvent(ctx.userId, 'auth.logout', req);
    clearSessionCookie(res);
    res.json({ success: true });
  });

  app.get('/api/auth/me', requireAuth, async (req: Request, res: Response) => {
    res.json({ success: true, data: await profile(req, ctxOf(req)) });
  });

  app.post('/api/auth/change-password', requireAuth, csrfProtection, async (req: Request, res: Response) => {
    const ctx = ctxOf(req);
    const { currentPassword, newPassword } = parseBody(changePasswordSchema, req.body);
    if (currentPassword === newPassword) {
      throw new AppError('validation', 'auth.passwordUnchanged', { newPassword: ['auth.passwordUnchanged'] });
    }

    const current = await requestTx(req, db =>
      db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [ctx.userId])
    );
    if (!current || !(await verifyPassword(current.password_hash, currentPassword))) {
      throw new AppError('validation', 'auth.invalidCurrentPassword', {
        currentPassword: ['auth.invalidCurrentPassword']
      });
    }

    const passwordHash = await hashPassword(newPassword);
    await requestTx(req, async db => {
      await db.run(
        'UPDATE users SET password_hash = ?, must_change_password = false, updated_at = now() WHERE id = ?',
        [passwordHash, ctx.userId]
      );
      await db.query('SELECT auth_revoke_sessions(?, ?)', [ctx.userId, ctx.sessionTokenHash]);
    });
    await logEvent(ctx.userId, 'auth.password_changed', req);
    res.json({ success: true });
  });
};
