import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import {
  exportRequest,
  orderStatus,
  productInput,
  shopProfileInput,
  slug,
  updateAddressKeyRequest,
  updateOrderFeeRequest,
  updateShippingRequest,
  updateWalletsRequest,
} from '@tma-shop/shared';
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
import {
  getShopAdminView,
  updateAddressKey,
  updateOrderFee,
  updateShippingZones,
  updateShopProfile,
  updateShopWallets,
} from '../services/shop.js';
import { ApiError } from '../lib/errors.js';
import { users } from '../db/schema.js';
import { buildReport } from '../export/report.js';
import { TelegramApi } from '../telegram/api.js';

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

  // Shop settings (admin view includes wallets and admin ids).
  app.get('/shop', (c) => c.json(getShopAdminView(c.get('shop'))));
  app.put('/shop/profile', zValidator('json', shopProfileInput), async (c) =>
    c.json(await updateShopProfile(c.get('db'), c.get('shopId'), c.req.valid('json'))),
  );
  app.put('/shop/wallets', zValidator('json', updateWalletsRequest), async (c) =>
    c.json(await updateShopWallets(c.get('db'), c.get('shopId'), c.req.valid('json').wallets)),
  );
  // Shipping zones (flat cost per order) and the address encryption public key.
  app.put('/shop/shipping', zValidator('json', updateShippingRequest), async (c) =>
    c.json(await updateShippingZones(c.get('db'), c.get('shopId'), c.req.valid('json').zones)),
  );
  app.put('/shop/address-key', zValidator('json', updateAddressKeyRequest), async (c) =>
    c.json(await updateAddressKey(c.get('db'), c.get('shopId'), c.req.valid('json').publicKey)),
  );
  // Fixed fee added once to every new order (0 hides it).
  app.put('/shop/fee', zValidator('json', updateOrderFeeRequest), async (c) =>
    c.json(await updateOrderFee(c.get('db'), c.get('shopId'), c.req.valid('json'))),
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

  // Reports: the bot sends the file (Excel or CSV) to the admin's own chat.
  app.post('/export', zValidator('json', exportRequest), async (c) => {
    const db = c.get('db');
    const shop = c.get('shop');
    const { sub } = c.get('claims');
    const request = c.req.valid('json');

    const orders = await listAllOrders(db, shop.id);
    const ids = [...new Set(orders.map((o) => o.userId))];
    const people =
      ids.length > 0 ? await db.select().from(users).where(inArray(users.telegramId, ids)) : [];
    const customers = new Map(
      people.map((u) => [
        u.telegramId,
        { name: [u.firstName, u.lastName].filter(Boolean).join(' '), username: u.username },
      ]),
    );

    const file = buildReport({
      shopName: shop.name,
      shopSlug: shop.slug,
      feeLabel: shop.orderFeeLabel,
      orders,
      customers,
      request,
    });
    if (file.orderCount === 0) {
      throw ApiError.badRequest('nothing_to_export', 'No orders match these filters');
    }
    try {
      await new TelegramApi(c.get('env').BOT_TOKEN).sendDocument(
        sub,
        file.fileName,
        file.data,
        file.contentType,
        `📊 ${shop.name} — ${file.orderCount} order${file.orderCount === 1 ? '' : 's'}`,
      );
    } catch (error) {
      console.error('Export could not be sent:', error);
      throw ApiError.conflict(
        'send_failed',
        'The bot could not send you the file. Open your chat with the bot, press Start, and try again.',
      );
    }
    return c.json({ fileName: file.fileName, orders: file.orderCount });
  });

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
