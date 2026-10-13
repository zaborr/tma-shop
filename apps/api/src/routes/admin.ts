import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import {
  exportRequest,
  langFrom,
  productInput,
  shopProfileInput,
  slug,
  updateAddressKeyRequest,
  updateAutoCancelRequest,
  updateOrderFeeRequest,
  updateOrderStatusRequest,
  updateShippingRequest,
  updatePaymentSetupRequest,
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
  changeOrderStatus,
  clearOrderChange,
  deleteOrder,
  getOrder,
  listAllOrders,
  recordRefund,
} from '../services/orders.js';
import {
  buildChangeDecisionMessage,
  buildStatusMessage,
  notifyUsers,
} from '../services/notifications.js';
import {
  getShopAdminView,
  updateAddressKey,
  updateAutoCancel,
  updateOrderFee,
  updateShippingZones,
  updateShopProfile,
  updatePaymentSetup,
  shopNotificationChatIds,
} from '../services/shop.js';
import { ApiError } from '../lib/errors.js';
import { users } from '../db/schema.js';
import { buildReport } from '../export/report.js';
import { TelegramApi } from '../telegram/api.js';
import { tr } from '../i18n/messages.js';
import { describeCustomer } from '../services/customers.js';

const idParam = z.object({ id: z.uuid() });

/** The customer's chat, or none once the order is anonymized. */
function customerChat(order: { userId: number | null }): number[] {
  return order.userId === null ? [] : [order.userId];
}
const categoryInput = z.object({
  slug,
  title: z.string().min(1).max(128),
  sortOrder: z.number().int().default(0),
});

export function adminRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();
  app.use('*', requireAuth, requireAdmin);

  // Shop settings (admin view includes the payment setup and admin ids).
  app.get('/shop', (c) => c.json(getShopAdminView(c.get('shop'))));
  app.put('/shop/profile', zValidator('json', shopProfileInput), async (c) =>
    c.json(await updateShopProfile(c.get('db'), c.get('shopId'), c.req.valid('json'))),
  );
  // Receiving addresses and accepted networks. Any address change is reported
  // to every admin of the shop and to the platform admins.
  app.put('/shop/payments', zValidator('json', updatePaymentSetupRequest), async (c) => {
    const db = c.get('db');
    const env = c.get('env');
    const shop = c.get('shop');
    const { before, view } = await updatePaymentSetup(db, shop.id, c.req.valid('json'));
    const after = view.paymentSetup;
    if (before.evmAddress !== after.evmAddress || before.solanaAddress !== after.solanaAddress) {
      const who = await describeCustomer(db, c.get('claims').sub);
      const recipients = [...new Set([...shopNotificationChatIds(env, shop), ...env.ADMIN_TELEGRAM_IDS])];
      await notifyUsers(db, env.BOT_TOKEN, recipients, (lang) =>
        [
          tr(lang, 'wallets.changed', { shop: shop.name, who }),
          '',
          tr(lang, 'wallets.evm', {
            before: before.evmAddress ?? '—',
            after: after.evmAddress ?? '—',
          }),
          tr(lang, 'wallets.solana', {
            before: before.solanaAddress ?? '—',
            after: after.solanaAddress ?? '—',
          }),
          '',
          tr(lang, 'wallets.checkIt'),
        ].join('\n'),
      );
    }
    return c.json(view);
  });
  // Shipping zones (flat cost per order) and the address encryption public key.
  app.put('/shop/shipping', zValidator('json', updateShippingRequest), async (c) =>
    c.json(await updateShippingZones(c.get('db'), c.get('shopId'), c.req.valid('json').zones)),
  );
  app.put('/shop/address-key', zValidator('json', updateAddressKeyRequest), async (c) =>
    c.json(await updateAddressKey(c.get('db'), c.get('shopId'), c.req.valid('json').publicKey)),
  );
  // Unpaid orders are cancelled after this many hours (0 = never).
  app.put('/shop/auto-cancel', zValidator('json', updateAutoCancelRequest), async (c) =>
    c.json(await updateAutoCancel(c.get('db'), c.get('shopId'), c.req.valid('json').hours)),
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
    zValidator('json', updateOrderStatusRequest),
    async (c) => {
      const shop = c.get('shop');
      const { order, previous } = await changeOrderStatus(
        c.get('db'),
        shop.id,
        c.req.valid('param').id,
        c.req.valid('json'),
      );
      // The customer hears about it from the bot (best effort).
      if (order.status !== previous) {
        await notifyUsers(c.get('db'), c.get('env').BOT_TOKEN, customerChat(order), (lang) =>
          buildStatusMessage(lang, shop.name, order, previous),
        );
      }
      return c.json(order);
    },
  );

  // Reports: the bot sends the file (Excel or CSV) to the admin's own chat.
  app.post('/export', zValidator('json', exportRequest), async (c) => {
    const db = c.get('db');
    const shop = c.get('shop');
    const { sub } = c.get('claims');
    const request = c.req.valid('json');

    const orders = await listAllOrders(db, shop.id);
    const ids = [...new Set(orders.flatMap((o) => (o.userId === null ? [] : [o.userId])))];
    const people =
      ids.length > 0 ? await db.select().from(users).where(inArray(users.telegramId, ids)) : [];
    const customers = new Map(
      people.map((u) => [
        u.telegramId,
        { name: u.firstName, username: u.username },
      ]),
    );

    // Same language as the app the admin is using.
    const lang = langFrom(c.req.header('X-Lang'));
    const file = buildReport({
      shopName: shop.name,
      shopSlug: shop.slug,
      feeLabel: shop.orderFeeLabel,
      orders,
      customers,
      request,
      lang,
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
        tr(lang, file.orderCount === 1 ? 'export.captionOne' : 'export.captionOther', {
          shop: shop.name,
          count: file.orderCount,
        }),
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
    await notifyUsers(c.get('db'), c.get('env').BOT_TOKEN, customerChat(order), (lang) =>
      buildChangeDecisionMessage(lang, order, true),
    );
    return c.json(order);
  });
  app.post('/orders/:id/change/reject', zValidator('param', idParam), async (c) => {
    const order = await clearOrderChange(c.get('db'), c.get('shopId'), c.req.valid('param').id);
    await notifyUsers(c.get('db'), c.get('env').BOT_TOKEN, customerChat(order), (lang) =>
      buildChangeDecisionMessage(lang, order, false),
    );
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
