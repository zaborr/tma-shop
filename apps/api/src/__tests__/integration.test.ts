import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
import { createApp } from '../app.js';
import type { Env } from '../config/env.js';
import { createDb, createPool, type Database } from '../db/client.js';
import { eq } from 'drizzle-orm';
import { categories, orderItems, orders, products, shops, users } from '../db/schema.js';
import { runRetention } from '../services/retention.js';
import { cancelExpiredOrders } from '../services/autoCancel.js';

/**
 * Full-stack integration test against a real Postgres. Skipped automatically
 * when TEST_DATABASE_URL is not set (e.g. a plain `npm test` with no database);
 * CI provides a Postgres service and sets the variable.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

const BOT_TOKEN = '7654321:AAFakeBotTokenForIntegration_0123456789';
const ADMIN_ID = 706626062;
const CUSTOMER_ID = 555000111;

function signInitData(userId: number, firstName: string): string {
  const fields: Record<string, string> = {
    user: JSON.stringify({ id: userId, first_name: firstName }),
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAItest',
  };
  const dcs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

describeDb('API integration', () => {
  let pool: Pool;
  let db: Database;
  let app: ReturnType<typeof createApp>;
  let shopId: string;
  let productId: string;

  beforeAll(async () => {
    pool = createPool(DATABASE_URL as string);
    db = createDb(pool);
    await migrate(db, { migrationsFolder: './drizzle' });

    // Clean slate, then seed one shop / category / product deterministically.
    await db.delete(shops);
    const [shop] = await db
      .insert(shops)
      .values({
        name: 'Test Shop',
        slug: `test-shop-${Date.now()}`,
        description: '',
        currency: 'XTR',
        starsEnabled: true,
      })
      .returning();
    shopId = shop!.id;
    const [cat] = await db
      .insert(categories)
      .values({ shopId, slug: 'tea', title: 'Tea', sortOrder: 1 })
      .returning();
    const [product] = await db
      .insert(products)
      .values({
        shopId,
        categoryId: cat!.id,
        slug: 'sencha',
        title: 'Sencha',
        description: 'Green tea',
        price: 150,
        currency: 'XTR',
        stock: 10,
        isActive: true,
      })
      .returning();
    productId = product!.id;

    const env: Env = {
      PORT: 0,
      DATABASE_URL: DATABASE_URL as string,
      BOT_TOKEN,
      JWT_SECRET: 'integration-secret-32-characters-long',
      JWT_TTL_SECONDS: 3600,
      INITDATA_MAX_AGE_SECONDS: 86_400,
      ADMIN_TELEGRAM_IDS: [ADMIN_ID],
      TELEGRAM_WEBHOOK_SECRET: 'whsec-test',
      SHOP_ID: shopId,
      CORS_ORIGIN: '*',
      PAYMENT_METHODS: [],
    };
    app = createApp({ env, db });
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function authToken(userId: number, name: string): Promise<string> {
    const res = await app.request('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: signInitData(userId, name) }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    return body.token;
  }

  it('rejects auth with tampered initData', async () => {
    const bad = signInitData(CUSTOMER_ID, 'Eve').replace('Eve', 'Mallory');
    const res = await app.request('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: bad }),
    });
    expect(res.status).toBe(401);
  });

  it('lists catalog publicly', async () => {
    const res = await app.request('/api/products');
    expect(res.status).toBe(200);
    const page = (await res.json()) as { items: unknown[]; total: number };
    expect(page.total).toBeGreaterThanOrEqual(1);
  });

  it('runs the cart → order → payment flow', async () => {
    const token = await authToken(CUSTOMER_ID, 'Alice');
    const auth = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };

    // Add to cart
    const add = await app.request('/api/cart/items', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ productId, quantity: 2 }),
    });
    expect(add.status).toBe(200);
    const cart = (await add.json()) as { total: number; itemCount: number };
    expect(cart.total).toBe(300);
    expect(cart.itemCount).toBe(2);

    // Create order
    const create = await app.request('/api/orders', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ contactUsername: '@test_user' }),
    });
    expect(create.status).toBe(201);
    const { orderId } = (await create.json()) as { orderId: string };

    // Order is pending
    const before = await app.request(`/api/orders/${orderId}`, { headers: auth });
    expect(((await before.json()) as { status: string }).status).toBe('pending');

    // Telegram webhook confirms payment
    const hook = await app.request('/webhook/telegram', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'whsec-test',
      },
      body: JSON.stringify({
        update_id: 1,
        message: {
          successful_payment: {
            currency: 'XTR',
            total_amount: 300,
            invoice_payload: orderId,
            telegram_payment_charge_id: 'charge_abc',
          },
        },
      }),
    });
    expect(hook.status).toBe(200);

    // Order is now paid, stock decremented 10 → 8
    const after = await app.request(`/api/orders/${orderId}`, { headers: auth });
    expect(((await after.json()) as { status: string }).status).toBe('paid');
    const prod = await app.request(`/api/products/${productId}`);
    expect(((await prod.json()) as { stock: number }).stock).toBe(8);
  });

  it('rejects the webhook with a wrong secret', async () => {
    const res = await app.request('/webhook/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'wrong' },
      body: JSON.stringify({ update_id: 2 }),
    });
    expect(res.status).toBe(401);
  });

  it('moves orders through admin statuses and returns stock on cancel', async () => {
    const token = await authToken(CUSTOMER_ID, 'Alice');
    const auth = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const admin = await authToken(ADMIN_ID, 'Ivan');
    const adminAuth = { Authorization: `Bearer ${admin}`, 'content-type': 'application/json' };
    const stock = async (): Promise<number> => {
      const res = await app.request(`/api/products/${productId}`);
      return ((await res.json()) as { stock: number }).stock;
    };
    const setStatus = (orderId: string, body: Record<string, unknown>): Promise<Response> =>
      Promise.resolve(
        app.request(`/api/admin/orders/${orderId}`, {
          method: 'PATCH',
          headers: adminAuth,
          body: JSON.stringify(body),
        }),
      );

    await app.request('/api/cart/items', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ productId, quantity: 1 }),
    });
    const create = await app.request('/api/orders', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ contactUsername: '@test_user' }),
    });
    const { orderId } = (await create.json()) as { orderId: string };
    const before = await stock();

    // An unpaid order cannot be shipped.
    expect((await setStatus(orderId, { status: 'shipped' })).status).toBe(409);

    // Manual confirmation takes the stock.
    const paid = await setStatus(orderId, { status: 'paid' });
    expect(paid.status).toBe(200);
    expect(((await paid.json()) as { status: string }).status).toBe('paid');
    expect(await stock()).toBe(before - 1);

    // Cancelling a paid order gives the stock back and owes the money.
    const cancelled = await setStatus(orderId, { status: 'cancelled', note: 'Sold out' });
    expect(cancelled.status).toBe(200);
    const body = (await cancelled.json()) as {
      status: string;
      amountDue: number;
      statusNote: string | null;
    };
    expect(body.status).toBe('cancelled');
    expect(body.amountDue).toBe(-150);
    expect(body.statusNote).toBe('Sold out');
    expect(await stock()).toBe(before);
  });

  it('anonymizes closed orders and deletes inactive users (data retention)', async () => {
    const token = await authToken(CUSTOMER_ID, 'Alice');
    const auth = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const admin = await authToken(ADMIN_ID, 'Ivan');
    const adminAuth = { Authorization: `Bearer ${admin}`, 'content-type': 'application/json' };

    await app.request('/api/cart/items', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ productId, quantity: 1 }),
    });
    const create = await app.request('/api/orders', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ contactUsername: '@test_user' }),
    });
    const { orderId } = (await create.json()) as { orderId: string };
    for (const status of ['paid', 'fulfilled']) {
      const res = await app.request(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: adminAuth,
        body: JSON.stringify({ status }),
      });
      expect(res.status).toBe(200);
    }

    // Closed 31 days ago; and someone who has not opened the app since then.
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await db.update(orders).set({ closedAt: old }).where(eq(orders.id, orderId));
    await db.insert(users).values({ telegramId: 999000111, firstName: 'Ghost', lastSeenAt: old });

    const report = await runRetention(db);
    expect(report.ordersAnonymized).toBeGreaterThanOrEqual(1);
    expect(report.usersDeleted).toBeGreaterThanOrEqual(1);

    const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(row?.userId).toBeNull();
    expect(row?.anonymizedAt).not.toBeNull();
    expect(row?.contactUsername).not.toBeNull();
    const ghost = await db.select().from(users).where(eq(users.telegramId, 999000111));
    expect(ghost).toHaveLength(0);

    // The customer no longer sees it; the active customer is kept.
    const mine = (await (await app.request('/api/orders', { headers: auth })).json()) as Array<{
      id: string;
    }>;
    expect(mine.some((o) => o.id === orderId)).toBe(false);
    const alice = await db.select().from(users).where(eq(users.telegramId, CUSTOMER_ID));
    expect(alice).toHaveLength(1);
  });

  it('reserves stock when a payment is sent and releases it when rejected', async () => {
    const token = await authToken(CUSTOMER_ID, 'Alice');
    const auth = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const admin = await authToken(ADMIN_ID, 'Ivan');
    const adminAuth = { Authorization: `Bearer ${admin}`, 'content-type': 'application/json' };
    const stock = async (): Promise<number> =>
      ((await (await app.request(`/api/products/${productId}`)).json()) as { stock: number }).stock;

    await db
      .update(shops)
      .set({
        paymentSetup: {
          evmAddress: '0xabc0000000000000000000000000000000000000',
          solanaAddress: null,
          accepted: [{ chain: 'base', token: 'USDC' }],
        },
      })
      .where(eq(shops.id, shopId));
    const config = (await (await app.request('/api/shop')).json()) as {
      paymentMethods: Array<{ id: string }>;
    };
    const methodId = config.paymentMethods[0]!.id;

    await app.request('/api/cart/items', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ productId, quantity: 1 }),
    });
    const create = await app.request('/api/orders', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ contactUsername: '@test_user' }),
    });
    const { orderId } = (await create.json()) as { orderId: string };
    const before = await stock();

    const pay = (txHash: string): Promise<Response> =>
      Promise.resolve(
        app.request(`/api/orders/${orderId}/payment`, {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ methodId, txHash }),
        }),
      );
    const setStatus = (status: string): Promise<Response> =>
      Promise.resolve(
        app.request(`/api/admin/orders/${orderId}`, {
          method: 'PATCH',
          headers: adminAuth,
          body: JSON.stringify({ status }),
        }),
      );

    expect((await pay('0xreserve0001')).status).toBe(200);
    expect(await stock()).toBe(before - 1);

    expect((await setStatus('pending')).status).toBe(200);
    expect(await stock()).toBe(before);

    expect((await pay('0xreserve0002')).status).toBe(200);
    expect(await stock()).toBe(before - 1);
    expect((await setStatus('paid')).status).toBe(200);
    // Confirming does not take the stock a second time.
    expect(await stock()).toBe(before - 1);
  });

  it('cancels unpaid orders after the shop deadline', async () => {
    const token = await authToken(CUSTOMER_ID, 'Alice');
    const auth = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    await app.request('/api/cart/items', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ productId, quantity: 1 }),
    });
    const create = await app.request('/api/orders', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ contactUsername: '@test_user' }),
    });
    const { orderId } = (await create.json()) as { orderId: string };

    const fresh = await cancelExpiredOrders(db, { BOT_TOKEN } as Env);
    const [stillPending] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(stillPending?.status).toBe('pending');
    expect(fresh).toBe(0);

    await db
      .update(orders)
      .set({ updatedAt: new Date(Date.now() - 49 * 60 * 60 * 1000) })
      .where(eq(orders.id, orderId));
    expect(await cancelExpiredOrders(db, { BOT_TOKEN } as Env)).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(row?.status).toBe('cancelled');
    expect(row?.closedAt).not.toBeNull();
  });

  it('deletes a shop with its orders only after confirming its name', async () => {
    const admin = await authToken(ADMIN_ID, 'Ivan');
    const adminAuth = { Authorization: `Bearer ${admin}`, 'content-type': 'application/json' };
    await authToken(CUSTOMER_ID, 'Alice');

    const [shop] = await db
      .insert(shops)
      .values({ slug: `to-delete-${Date.now()}`, name: 'Test Shop', description: '', currency: 'USDC' })
      .returning();
    const [product] = await db
      .insert(products)
      .values({
        shopId: shop!.id,
        slug: 'thing',
        title: 'Thing',
        description: '',
        price: 100,
        currency: 'USDC',
        stock: null,
        isActive: true,
      })
      .returning();
    const [order] = await db
      .insert(orders)
      .values({ shopId: shop!.id, userId: CUSTOMER_ID, total: 100, currency: 'USDC' })
      .returning();
    await db.insert(orderItems).values({
      orderId: order!.id,
      productId: product!.id,
      title: 'Thing',
      unitPrice: 100,
      quantity: 1,
      subtotal: 100,
    });

    const contents = await app.request(`/api/platform/shops/${shop!.id}/contents`, {
      headers: adminAuth,
    });
    expect(await contents.json()).toEqual({ orders: 1, products: 1, categories: 0, carts: 0 });

    const wrong = await app.request(`/api/platform/shops/${shop!.id}/delete-all`, {
      method: 'POST',
      headers: adminAuth,
      body: JSON.stringify({ confirmName: 'Test' }),
    });
    expect(wrong.status).toBe(400);

    const ok = await app.request(`/api/platform/shops/${shop!.id}/delete-all`, {
      method: 'POST',
      headers: adminAuth,
      body: JSON.stringify({ confirmName: 'Test Shop' }),
    });
    expect(ok.status).toBe(200);
    expect(await db.select().from(shops).where(eq(shops.id, shop!.id))).toHaveLength(0);
    expect(await db.select().from(orders).where(eq(orders.id, order!.id))).toHaveLength(0);
  });

  it('saves the language chosen in the app', async () => {
    const token = await authToken(CUSTOMER_ID, 'Alice');
    const res = await app.request('/api/me/language', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'es' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ language: 'es', preferredLanguage: 'es' });

    const again = await app.request('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: signInitData(CUSTOMER_ID, 'Alice') }),
    });
    expect(((await again.json()) as { user: { language: string } }).user.language).toBe('es');

    // Spanish errors once the app asks for them.
    const missing = await app.request('/api/orders/00000000-0000-4000-8000-000000000000', {
      headers: { Authorization: `Bearer ${token}`, 'X-Lang': 'es' },
    });
    expect(((await missing.json()) as { error: { message: string } }).error.message).toBe(
      'Pedido no encontrado',
    );
  });

  it('enforces admin-only routes', async () => {
    const customer = await authToken(CUSTOMER_ID, 'Alice');
    const denied = await app.request('/api/admin/orders', {
      headers: { Authorization: `Bearer ${customer}` },
    });
    expect(denied.status).toBe(403);

    const admin = await authToken(ADMIN_ID, 'Ivan');
    const allowed = await app.request('/api/admin/orders', {
      headers: { Authorization: `Bearer ${admin}` },
    });
    expect(allowed.status).toBe(200);
  });
});
