import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { platformShopInput, retentionSettings } from '@tma-shop/shared';
import type { AppBindings } from '../context.js';
import { requireAuth, requireSuperAdmin } from '../auth/middleware.js';
import {
  createShop,
  deleteShop,
  listAllShops,
  updatePlatformShop,
} from '../services/shop.js';
import { getRetention, runRetention, updateRetention } from '../services/retention.js';

const idParam = z.object({ id: z.uuid() });

/** Platform super-admin: every shop, including hidden ones; create, edit, delete. */
export function platformRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();
  app.use('*', requireAuth, requireSuperAdmin);

  app.get('/shops', async (c) => c.json(await listAllShops(c.get('db'))));

  app.post('/shops', zValidator('json', platformShopInput), async (c) =>
    c.json(await createShop(c.get('db'), c.req.valid('json')), 201),
  );

  app.put(
    '/shops/:id',
    zValidator('param', idParam),
    zValidator('json', platformShopInput),
    async (c) =>
      c.json(await updatePlatformShop(c.get('db'), c.req.valid('param').id, c.req.valid('json'))),
  );

  app.delete('/shops/:id', zValidator('param', idParam), async (c) => {
    await deleteShop(c.get('db'), c.req.valid('param').id);
    return c.body(null, 204);
  });

  // Data retention: how long personal data is kept, and a manual cleanup.
  app.get('/retention', async (c) => c.json(await getRetention(c.get('db'))));
  app.put('/retention', zValidator('json', retentionSettings), async (c) =>
    c.json(await updateRetention(c.get('db'), c.req.valid('json'))),
  );
  app.post('/retention/run', async (c) => c.json(await runRetention(c.get('db'))));

  return app;
}
