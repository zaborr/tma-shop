import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createOrderRequest,
  paymentMethodsOf,
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
  notifyUsers,
} from '../services/notifications.js';
import { describeCustomer } from '../services/customers.js';
import { startPaymentCheck } from '../services/paymentCheck.js';
import { EVM_TX_RE } from '../chain/evm.js';
import { SOLANA_SIGNATURE_RE } from '../chain/solana.js';
import { paymentMethodLabel } from '../config/payment-methods.js';
import { shopNotificationChatIds } from '../services/shop.js';
import { ApiError } from '../lib/errors.js';

const idParam = z.object({ id: z.uuid() });

export function orderRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();
  app.use('*', requireAuth);

  app.post('/', zValidator('json', createOrderRequest), async (c) => {
    const { sub } = c.get('claims');
    const { contactUsername, shippingZoneId, encryptedAddress } = c.req.valid('json');
    const order = await createOrderFromCart(c.get('db'), c.get('shopId'), sub, contactUsername, {
      shippingZoneId,
      encryptedAddress,
    });
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

      const method = paymentMethodsOf(c.get('shop').paymentSetup).find((m) => m.id === methodId);
      if (!method) throw ApiError.badRequest('unknown_method', 'Unknown payment method');
      const validHash = method.chain === 'solana' ? SOLANA_SIGNATURE_RE : EVM_TX_RE;
      if (!validHash.test(txHash)) {
        throw ApiError.badRequest(
          'invalid_tx',
          method.chain === 'solana'
            ? 'That is not a Solana transaction signature'
            : 'That is not a transaction hash (0x followed by 64 characters)',
        );
      }

      const order = await submitCryptoPayment(
        db,
        c.get('shopId'),
        c.req.valid('param').id,
        sub,
        paymentMethodLabel(method),
        txHash,
        method.id,
      );

      // Checked on the blockchain in the background; admins hear about it
      // when it is confirmed, or when it needs them.
      startPaymentCheck(db, env, order.id);

      return c.json(order);
    },
  );

  // Customer modifies an order. Unpaid ones change at once; paid ones (or with
  // a payment under review) become a request the organiser must approve.
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
      if (order.changeRequest) {
        const customer = await describeCustomer(db, sub);
        await notifyUsers(db, env.BOT_TOKEN, shopNotificationChatIds(env, c.get('shop')), (lang) =>
          buildChangeRequestMessage(lang, order, customer),
        );
      }
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
