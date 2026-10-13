import { createMiddleware } from 'hono/factory';
import type { AppBindings } from '../context.js';
import { ApiError } from '../lib/errors.js';
import { verifySession } from './jwt.js';

/**
 * Requires a valid `Authorization: Bearer <jwt>` header and exposes the decoded
 * claims as `c.get('claims')`. Throws `ApiError(401)` otherwise.
 */
export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing bearer token');
  }
  const token = header.slice('Bearer '.length).trim();
  const env = c.get('env');
  try {
    const claims = await verifySession(token, env.JWT_SECRET);
    c.set('claims', claims);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }
  await next();
});

/** Requires the caller to manage the current shop (run after `withShop` and `requireAuth`). */
export const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  if (!c.get('canManage')) {
    throw ApiError.forbidden('Shop admin role required');
  }
  await next();
});

/** Requires a platform super-admin (ADMIN_TELEGRAM_IDS). Run after `requireAuth`. */
export const requireSuperAdmin = createMiddleware<AppBindings>(async (c, next) => {
  if (!c.get('env').ADMIN_TELEGRAM_IDS.includes(c.get('claims').sub)) {
    throw ApiError.forbidden('Platform admin role required');
  }
  await next();
});
