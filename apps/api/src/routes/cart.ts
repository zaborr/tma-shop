import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { addToCartRequest, updateCartItemRequest } from '@tma-shop/shared';
import type { AppBindings } from '../context.js';
import { requireAuth } from '../auth/middleware.js';
import { addItem, getCart, setItemQuantity } from '../services/cart.js';

/** A cart line id (older clients send a product id, also accepted). */
const lineParam = z.object({ lineId: z.uuid() });

export function cartRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();
  app.use('*', requireAuth);

  app.get('/', async (c) => {
    const { sub } = c.get('claims');
    return c.json(await getCart(c.get('db'), c.get('shopId'), sub));
  });

  app.post('/items', zValidator('json', addToCartRequest), async (c) => {
    const { sub } = c.get('claims');
    const { productId, variantId, quantity } = c.req.valid('json');
    return c.json(
      await addItem(c.get('db'), c.get('shopId'), sub, productId, variantId, quantity),
    );
  });

  app.patch(
    '/items/:lineId',
    zValidator('param', lineParam),
    zValidator('json', updateCartItemRequest),
    async (c) => {
      const { sub } = c.get('claims');
      const { lineId } = c.req.valid('param');
      const { quantity } = c.req.valid('json');
      return c.json(await setItemQuantity(c.get('db'), c.get('shopId'), sub, lineId, quantity));
    },
  );

  app.delete('/items/:lineId', zValidator('param', lineParam), async (c) => {
    const { sub } = c.get('claims');
    const { lineId } = c.req.valid('param');
    return c.json(await setItemQuantity(c.get('db'), c.get('shopId'), sub, lineId, 0));
  });

  return app;
}
