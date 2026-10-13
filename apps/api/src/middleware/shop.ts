import { createMiddleware } from 'hono/factory';
import type { AppBindings } from '../context.js';
import { verifySession } from '../auth/jwt.js';
import { ApiError } from '../lib/errors.js';
import { canManageShop, resolveShop } from '../services/shop.js';

/** Telegram id of the caller when a valid session token is present, else undefined. */
async function peekUserId(header: string | undefined, secret: string): Promise<number | undefined> {
  if (!header?.startsWith('Bearer ')) return undefined;
  try {
    const claims = await verifySession(header.slice('Bearer '.length).trim(), secret);
    return claims.sub;
  } catch {
    return undefined;
  }
}

/**
 * Resolves the shop named by the `X-Shop` header (id or slug) and whether the
 * caller can manage it. Hidden shops behave as missing for everyone else.
 */
export const withShop = createMiddleware<AppBindings>(async (c, next) => {
  const env = c.get('env');
  const shop = await resolveShop(c.get('db'), env, c.req.header('X-Shop'));
  const userId = await peekUserId(c.req.header('Authorization'), env.JWT_SECRET);
  const canManage = canManageShop(env, shop, userId);
  if (!shop.isVisible && !canManage) throw ApiError.notFound('Shop not found');

  c.set('shop', shop);
  c.set('shopId', shop.id);
  c.set('canManage', canManage);
  await next();
});
