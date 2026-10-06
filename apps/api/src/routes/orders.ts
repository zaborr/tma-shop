import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createOrderRequest,
  requestOrderChangeRequest,
  submitPaymentRequest,
  type CreateOrderResponse,
  type InvoiceResponse,
} from '@tma-shop/shared';
import type { AppBindings } from '../context.js';
import { requireAuth } from '../auth/middleware.js';
import {
  createOrderFromCart,
  deleteOrder,
  getOrder,
  clearOrderChange,
  listOrders,
  requestOrderChange,
  submitCryptoPayment,
} from '../services/orders.js';
import { createStarsInvoice } from '../services/payments.js';
import {
  buildChangeRequestMessage,
  notifyAdminsOfPayment,
  notifyChats,
} from '../services/notifications.js';
import { describeCustomer } from '../services/customers.js';
import { paymentMethodLabel } from '../config/payment-methods.js';
import { ApiError } from '../lib/errors.js';

const idParam = z.object({ id: z.uuid() });

export function orderRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();
  app.use('*', requireAuth);

  app.post('/', zValidator('json', createOrderRequest), async (c) => {
    const { sub } = c.get('claims');
    const { contactUsername } = c.req.valid('json');
    const order = await createOrderFromCart(c.get('db'), c.get('shopId'), sub, contactUsername);
    const response: CreateOrderResponse = { orderId: order.id };
    return c.json(response, 201);
  });

  app.get('/', async (c) => {
    const { sub } = c.get('claims');
    return c.json(await listOrders(c.get('db'), c.get('shopId'), sub));
  });

  app.get('/:id', zValidator('param', idParam), async (c) => {
    const { sub } = c.get('claims');
    const order = await getOrder(c.get('db'), c.get('shopId'), c.req.valid('param').id, sub);
    if (!order) throw ApiError.notFound('Order not found');
    return c.json(order);
  });

  app.delete('/:id', zValidator('param', idParam), async (c) => {
    const { sub } = c.get('claims');
    await deleteOrder(c.get('db'), c.get('shopId'), c.req.valid('param').id, sub);
    return c.body(null, 204);
  });

  app.post('/:id/invoice', zValidator('param', idParam), async (c) => {
    const { sub } = c.get('claims');
    const env = c.get('env');
    const invoiceLink = await createStarsInvoice(
      c.get('db'),
      env.BOT_TOKEN,
      c.get('shopId'),
      c.req.valid('param').id,
      sub,
    );
    const response: InvoiceResponse = { invoiceLink };
    return c.json(response);
  });

  // Customer reports a crypto payment (wallet + tx hash) for manual review.
  app.post(
    '/:id/payment',
    zValidator('param', idParam),
    zValidator('json', submitPaymentRequest),
    async (c) => {
      const { sub } = c.get('claims');
      const env = c.get('env');
      const db = c.get('db');
      const { methodId, txHash } = c.req.valid('json');

      const method = env.PAYMENT_METHODS.find((m) => m.id === methodId);
      if (!method) throw ApiError.badRequest('unknown_method', 'Unknown payment method');

      const order = await submitCryptoPayment(
        db,
        c.get('shopId'),
        c.req.valid('param').id,
        sub,
        paymentMethodLabel(method),
        txHash,
      );

      const customer = await describeCustomer(db, sub);
      await notifyAdminsOfPayment(env.BOT_TOKEN, env.ADMIN_TELEGRAM_IDS, order, customer);

      return c.json(order);
    },
  );

  // Customer asks to modify a paid order; an admin must approve it.
  app.post(
    '/:id/change',
    zValidator('param', idParam),
    zValidator('json', requestOrderChangeRequest),
    async (c) => {
      const { sub } = c.get('claims');
      const env = c.get('env');
      const db = c.get('db');
      const order = await requestOrderChange(
        db,
        c.get('shopId'),
        c.req.valid('param').id,
        sub,
        c.req.valid('json').items,
      );
      const customer = await describeCustomer(db, sub);
      await notifyChats(
        env.BOT_TOKEN,
        env.ADMIN_TELEGRAM_IDS,
        buildChangeRequestMessage(order, customer),
      );
      return c.json(order);
    },
  );

  // Customer withdraws their pending change request.
  app.delete('/:id/change', zValidator('param', idParam), async (c) => {
    const { sub } = c.get('claims');
    return c.json(
      await clearOrderChange(c.get('db'), c.get('shopId'), c.req.valid('param').id, sub),
    );
  });

  return app;
}
