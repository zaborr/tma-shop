import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { orderStatus, productInput, slug, updateOrderFeeRequest } from '@tma-shop/shared';
import type { AppBindings } from '../context.js';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  listAllProducts,
  updateCategory,
  updateProduct,
} from '../services/admin.js';
import {
  approveOrderChange,
  clearOrderChange,
  deleteOrder,
  getOrder,
  listAllOrders,
  markOrderPaid,
  recordRefund,
  setOrderStatus,
} from '../services/orders.js';
import { buildChangeDecisionMessage, notifyChats } from '../services/notifications.js';
import { updateOrderFee } from '../services/shop.js';
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

  // Shop settings: fixed fee added once to every new order (0 hides it).
  app.put('/shop/fee', zValidator('json', updateOrderFeeRequest), async (c) =>
    c.json(
      await updateOrderFee(
        c.get('db'),
        c.get('shopId'),
        c.req.valid('json'),
        c.get('env').PAYMENT_METHODS,
      ),
    ),
  );

  // Products
  app.get('/products', async (c) => c.json(await listAllProducts(c.get('db'), c.get('shopId'))));
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
  app.put(
    '/categories/:id',
    zValidator('param', idParam),
    zValidator('json', categoryInput),
    async (c) =>
      c.json(
        await updateCategory(
          c.get('db'),
          c.get('shopId'),
          c.req.valid('param').id,
          c.req.valid('json'),
        ),
      ),
  );
  app.delete('/categories/:id', zValidator('param', idParam), async (c) => {
    await deleteCategory(c.get('db'), c.get('shopId'), c.req.valid('param').id);
    return c.body(null, 204);
  });

  // Orders
  app.get('/orders', async (c) => c.json(await listAllOrders(c.get('db'), c.get('shopId'))));
  app.get('/orders/:id', zValidator('param', idParam), async (c) => {
    const order = await getOrder(c.get('db'), c.get('shopId'), c.req.valid('param').id);
    if (!order) throw ApiError.notFound('Order not found');
    return c.json(order);
  });
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

  // Customer change requests: approve (apply + tell them what to pay) or reject.
  app.post('/orders/:id/change/approve', zValidator('param', idParam), async (c) => {
    const order = await approveOrderChange(c.get('db'), c.get('shopId'), c.req.valid('param').id);
    await notifyChats(c.get('env').BOT_TOKEN, [order.userId], buildChangeDecisionMessage(order, true));
    return c.json(order);
  });
  app.post('/orders/:id/change/reject', zValidator('param', idParam), async (c) => {
    const order = await clearOrderChange(c.get('db'), c.get('shopId'), c.req.valid('param').id);
    await notifyChats(c.get('env').BOT_TOKEN, [order.userId], buildChangeDecisionMessage(order, false));
    return c.json(order);
  });

  // The admin sent the overpaid difference back to the customer.
  app.post('/orders/:id/refund', zValidator('param', idParam), async (c) =>
    c.json(await recordRefund(c.get('db'), c.get('shopId'), c.req.valid('param').id)),
  );

  app.delete('/orders/:id', zValidator('param', idParam), async (c) => {
    await deleteOrder(c.get('db'), c.get('shopId'), c.req.valid('param').id);
    return c.body(null, 204);
  });

  return app;
}
