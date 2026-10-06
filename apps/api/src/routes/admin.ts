import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { orderStatus, productInput, slug } from '@tma-shop/shared';
import type { AppBindings } from '../context.js';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import { createCategory, createProduct, deleteProduct, updateProduct } from '../services/admin.js';
import { getOrder, listAllOrders, markOrderPaid, setOrderStatus } from '../services/orders.js';
import { ApiError } from '../lib/errors.js';

const idParam = z.object({ id: z.uuid() });
const categoryInput = z.object({
  slug,
  title: z.string().min(1).max(128),
  sortOrder: z.number().int().default(0),
});
const statusInput = z.object({ status: orderStatus });

export function adminRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();
  app.use('*', requireAuth, requireAdmin);

  // Products
  app.post('/products', zValidator('json', productInput), async (c) =>
    c.json(await createProduct(c.get('db'), c.get('shopId'), c.req.valid('json')), 201),
  );
  app.put(
    '/products/:id',
    zValidator('param', idParam),
    zValidator('json', productInput),
    async (c) =>
      c.json(
        await updateProduct(
          c.get('db'),
          c.get('shopId'),
          c.req.valid('param').id,
          c.req.valid('json'),
        ),
      ),
  );
  app.delete('/products/:id', zValidator('param', idParam), async (c) => {
    await deleteProduct(c.get('db'), c.get('shopId'), c.req.valid('param').id);
    return c.body(null, 204);
  });

  // Categories
  app.post('/categories', zValidator('json', categoryInput), async (c) =>
    c.json(await createCategory(c.get('db'), c.get('shopId'), c.req.valid('json')), 201),
  );

  // Orders
  app.get('/orders', async (c) => c.json(await listAllOrders(c.get('db'), c.get('shopId'))));
  app.patch(
    '/orders/:id',
    zValidator('param', idParam),
    zValidator('json', statusInput),
    async (c) => {
      const db = c.get('db');
      const shopId = c.get('shopId');
      const orderId = c.req.valid('param').id;
      const { status } = c.req.valid('json');

      if (status === 'paid') {
        // Manual confirmation of a crypto payment: same path as a Stars payment,
        // so tracked stock is decremented exactly once.
        const order = await getOrder(db, shopId, orderId);
        if (!order) throw ApiError.notFound('Order not found');
        return c.json(await markOrderPaid(db, orderId, order.paymentTxHash ?? 'manual'));
      }

      return c.json(await setOrderStatus(db, shopId, orderId, status));
    },
  );

  return app;
}
