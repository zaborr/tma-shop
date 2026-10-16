import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
import { createApp } from '../app.js';
import type { Env } from '../config/env.js';
import { createDb, createPool, type Database } from '../db/client.js';
import { and, eq, inArray } from 'drizzle-orm';
import {
  cartItems,
  carts,
  categories,
  orderItems,
  orders,
  productVariants,
  products,
  shops,
  users,
} from '../db/schema.js';
import { runRetention } from '../services/retention.js';
import { cancelExpiredOrders } from '../services/autoCancel.js';
import { sendPaymentReminders } from '../services/reminders.js';
import { resetMiniAppUrlCache } from '../services/bot.js';
import { closeDueShops } from '../services/closing.js';
import { TelegramApi } from '../telegram/api.js';

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
  let testEnv: Env;

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
    testEnv = env;
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

  it('lets the customer edit an unpaid order at once, without approval', async () => {
    const token = await authToken(CUSTOMER_ID, 'Alice');
    const auth = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    await app.request('/api/cart/items', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ productId, quantity: 2 }),
    });
    const create = await app.request('/api/orders', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ contactUsername: '@test_user' }),
    });
    const { orderId } = (await create.json()) as { orderId: string };
    await db
      .update(orders)
      .set({ updatedAt: new Date(Date.now() - 10 * 3_600_000), paymentReminderAt: new Date() })
      .where(eq(orders.id, orderId));

    const edit = await app.request(`/api/orders/${orderId}/change`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ items: [{ productId, quantity: 3 }] }),
    });
    expect(edit.status).toBe(200);
    const edited = (await edit.json()) as {
      status: string;
      total: number;
      changeRequest: unknown;
      items: Array<{ quantity: number }>;
    };
    expect(edited).toMatchObject({ status: 'pending', total: 450, changeRequest: null });
    expect(edited.items.map((i) => i.quantity)).toEqual([3]);
    // The countdown to auto-cancel starts again, and a new reminder can be sent.
    const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(Date.now() - row!.updatedAt.getTime()).toBeLessThan(60_000);
    expect(row!.paymentReminderAt).toBeNull();

    await app.request(`/api/orders/${orderId}`, { method: 'DELETE', headers: auth });
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

    expect((await pay(`0x${'a'.repeat(64)}`)).status).toBe(200);
    expect(await stock()).toBe(before - 1);

    expect((await setStatus('pending')).status).toBe(200);
    expect(await stock()).toBe(before);

    expect((await pay(`0x${'b'.repeat(64)}`)).status).toBe(200);
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

  it('shows VIP-only shops only to members of their VIP club', async () => {
    const BOB_ID = 555000222;
    const alice = await authToken(CUSTOMER_ID, 'Alice');
    const bob = await authToken(BOB_ID, 'Bob');
    const admin = await authToken(ADMIN_ID, 'Ivan');
    await db.update(users).set({ username: 'Bob_Vip' }).where(eq(users.telegramId, BOB_ID));

    const [shop] = await db
      .insert(shops)
      .values({
        slug: `vip-${Date.now()}`,
        name: 'VIP Shop',
        description: '',
        currency: 'USDC',
        vipOnly: true,
        useGlobalVipClub: false,
        vipClub: { groups: [], userIds: [], usernames: ['bob_vip'] },
      })
      .returning();
    const shopRef = shop!.id;

    const listed = async (token: string): Promise<Array<{ id: string; isVip: boolean }>> => {
      const res = await app.request('/api/shops', { headers: { Authorization: `Bearer ${token}` } });
      return ((await res.json()) as { shops: Array<{ id: string; isVip: boolean }> }).shops;
    };
    const open = (token: string): Promise<Response> =>
      Promise.resolve(
        app.request('/api/shop', { headers: { Authorization: `Bearer ${token}`, 'X-Shop': shopRef } }),
      );

    // Not in the club: the shop does not exist for Alice.
    expect((await listed(alice)).some((s) => s.id === shopRef)).toBe(false);
    expect((await open(alice)).status).toBe(404);

    // Listed by @username: Bob sees it, and the username becomes his id.
    expect((await listed(bob)).find((s) => s.id === shopRef)?.isVip).toBe(true);
    const bobOpens = await open(bob);
    expect(bobOpens.status).toBe(200);
    expect(((await bobOpens.json()) as { isVip: boolean }).isVip).toBe(true);
    const [row] = await db.select().from(shops).where(eq(shops.id, shopRef));
    expect(row?.vipClub).toEqual({ groups: [], userIds: [BOB_ID], usernames: [] });

    // Admins always see it.
    expect((await listed(admin)).some((s) => s.id === shopRef)).toBe(true);

    // The platform club counts once the shop accepts it.
    const adminAuth = { Authorization: `Bearer ${admin}`, 'content-type': 'application/json' };
    const saved = await app.request('/api/platform/vip-club', {
      method: 'PUT',
      headers: adminAuth,
      body: JSON.stringify({ groups: [], userIds: [CUSTOMER_ID], usernames: [] }),
    });
    expect(saved.status).toBe(200);
    expect((await listed(alice)).some((s) => s.id === shopRef)).toBe(false);
    await db.update(shops).set({ useGlobalVipClub: true }).where(eq(shops.id, shopRef));
    expect((await listed(alice)).some((s) => s.id === shopRef)).toBe(true);

    // Shop admins edit the shop's own club.
    const own = await app.request('/api/admin/shop/vip-club', {
      method: 'PUT',
      headers: { ...adminAuth, 'X-Shop': shopRef },
      body: JSON.stringify({ groups: [], userIds: [], usernames: ['carol_x'], useGlobalClub: false }),
    });
    expect(own.status).toBe(200);
    expect(await own.json()).toEqual({
      groups: [],
      userIds: [],
      usernames: ['carol_x'],
      useGlobalClub: false,
    });
    expect((await listed(bob)).some((s) => s.id === shopRef)).toBe(false);

    await app.request('/api/platform/vip-club', {
      method: 'PUT',
      headers: adminAuth,
      body: JSON.stringify({ groups: [], userIds: [], usernames: [] }),
    });
    await db.delete(shops).where(eq(shops.id, shopRef));
  });

  it('copies products with variants and categories from another shop', async () => {
    const admin = await authToken(ADMIN_ID, 'Ivan');
    const auth = { Authorization: `Bearer ${admin}`, 'content-type': 'application/json' };
    const stamp = Date.now();
    const [from] = await db
      .insert(shops)
      .values({ slug: `from-${stamp}`, name: 'From', description: '', currency: 'USDC' })
      .returning();
    const [into] = await db
      .insert(shops)
      .values({ slug: `into-${stamp}`, name: 'Into', description: '', currency: 'USDC' })
      .returning();
    const [cat] = await db
      .insert(categories)
      .values({ shopId: from!.id, slug: 'shirts', title: 'Shirts', sortOrder: 3 })
      .returning();
    const [shirt] = await db
      .insert(products)
      .values({
        shopId: from!.id,
        categoryId: cat!.id,
        slug: 'shirt',
        title: 'Shirt',
        description: 'Cotton',
        price: 1000,
        currency: 'USDC',
        stock: null,
        isActive: true,
        options: [{ name: 'Size', values: ['S', 'M'] }],
        priceTiers: [{ minQty: 5, price: 900 }],
      })
      .returning();
    await db.insert(productVariants).values([
      { productId: shirt!.id, optionValues: ['S'], price: null, stock: 4, sortOrder: 0 },
      { productId: shirt!.id, optionValues: ['M'], price: 1100, stock: 2, sortOrder: 1 },
    ]);
    // The target already has a product with the same link name.
    await db.insert(products).values({
      shopId: into!.id,
      slug: 'shirt',
      title: 'Old shirt',
      description: '',
      price: 500,
      currency: 'USDC',
      stock: null,
      isActive: true,
    });

    const sources = await app.request('/api/admin/clone-sources', {
      headers: { ...auth, 'X-Shop': into!.id },
    });
    const list = (await sources.json()) as Array<{ id: string; products: Array<{ variantCount: number }> }>;
    expect(list.find((s) => s.id === from!.id)?.products[0]?.variantCount).toBe(2);

    const res = await app.request('/api/admin/clone', {
      method: 'POST',
      headers: { ...auth, 'X-Shop': into!.id },
      body: JSON.stringify({ sourceShopId: from!.id, productIds: [shirt!.id], copyStock: false }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ products: 1, categories: 1 });

    const [copy] = await db
      .select()
      .from(products)
      .where(and(eq(products.shopId, into!.id), eq(products.slug, 'shirt-2')));
    expect(copy).toMatchObject({ title: 'Shirt', price: 1000, isActive: false, stock: null });
    expect(copy?.priceTiers).toEqual([{ minQty: 5, price: 900 }]);
    const copiedVariants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, copy!.id));
    expect(copiedVariants.map((v) => [v.optionValues, v.price, v.stock])).toEqual([
      [['S'], null, null],
      [['M'], 1100, null],
    ]);
    const [newCat] = await db.select().from(categories).where(eq(categories.id, copy!.categoryId!));
    expect(newCat).toMatchObject({ shopId: into!.id, slug: 'shirts', title: 'Shirts' });

    // Customers cannot copy.
    const alice = await authToken(CUSTOMER_ID, 'Alice');
    const denied = await app.request('/api/admin/clone', {
      method: 'POST',
      headers: { Authorization: `Bearer ${alice}`, 'content-type': 'application/json', 'X-Shop': into!.id },
      body: JSON.stringify({ sourceShopId: from!.id, productIds: [shirt!.id], copyStock: false }),
    });
    expect(denied.status).toBe(403);

    await db.delete(shops).where(inArray(shops.id, [from!.id, into!.id]));
  });

  it('reminds customers once about orders still to pay, with a link to the order', async () => {
    await authToken(CUSTOMER_ID, 'Alice');
    const [shop] = await db
      .insert(shops)
      .values({ slug: `remind-${Date.now()}`, name: 'Remind', description: '', currency: 'USDC', autoCancelHours: 48 })
      .returning();
    const hoursAgo = (h: number): Date => new Date(Date.now() - h * 3_600_000);
    const [due] = await db
      .insert(orders)
      .values({ shopId: shop!.id, userId: CUSTOMER_ID, total: 500, currency: 'USDC', updatedAt: hoursAgo(30) })
      .returning();
    const [fresh] = await db
      .insert(orders)
      .values({ shopId: shop!.id, userId: CUSTOMER_ID, total: 700, currency: 'USDC', updatedAt: hoursAgo(2) })
      .returning();

    // The shop list shows the unpaid orders.
    const alice = await authToken(CUSTOMER_ID, 'Alice');
    const list = await app.request('/api/shops', { headers: { Authorization: `Bearer ${alice}` } });
    const listed = ((await list.json()) as { shops: Array<{ id: string; unpaidOrders: number }> }).shops;
    expect(listed.find((s) => s.id === shop!.id)?.unpaidOrders).toBe(2);

    const telegram = new TelegramApi(BOT_TOKEN);
    resetMiniAppUrlCache();
    vi.spyOn(telegram, 'getChatMenuButton').mockResolvedValue({
      type: 'web_app',
      web_app: { url: 'https://shop.example.app/' },
    });
    const send = vi.spyOn(telegram, 'sendMessage').mockResolvedValue(true);
    await sendPaymentReminders(db, testEnv, telegram);
    const mine = send.mock.calls.filter(([, text]) => text.includes(due!.id.slice(0, 8)));
    expect(mine).toHaveLength(1);
    expect(mine[0]?.[1]).toContain('5.00 USDC');
    expect(mine[0]?.[1]).toContain('18 h');
    expect(mine[0]?.[2]?.inline_keyboard[0]?.[0]?.web_app?.url).toBe(
      `https://shop.example.app/?shop=${shop!.slug}&order=${due!.id}`,
    );
    expect(send.mock.calls.some(([, text]) => text.includes(fresh!.id.slice(0, 8)))).toBe(false);

    // Only once.
    send.mockClear();
    await sendPaymentReminders(db, testEnv, telegram);
    expect(send.mock.calls.some(([, text]) => text.includes(due!.id.slice(0, 8)))).toBe(false);
    resetMiniAppUrlCache();
    await db.delete(shops).where(eq(shops.id, shop!.id));
  });

  it('closes a GB: no new orders, unpaid ones and carts go, paid ones stay', async () => {
    const BOB_ID = 555000222;
    const admin = await authToken(ADMIN_ID, 'Ivan');
    const alice = await authToken(CUSTOMER_ID, 'Alice');
    const bob = await authToken(BOB_ID, 'Bob');
    const [shop] = await db
      .insert(shops)
      .values({ slug: `closing-${Date.now()}`, name: 'Closing', description: '', currency: 'USDC' })
      .returning();
    const ref = shop!.id;
    const [product] = await db
      .insert(products)
      .values({ shopId: ref, slug: 'thing', title: 'Thing', description: '', price: 100, currency: 'USDC', stock: null, isActive: true })
      .returning();
    const [unpaid] = await db
      .insert(orders)
      .values({ shopId: ref, userId: CUSTOMER_ID, total: 100, currency: 'USDC' })
      .returning();
    const [paid] = await db
      .insert(orders)
      .values({ shopId: ref, userId: BOB_ID, total: 100, amountPaid: 100, status: 'paid', currency: 'USDC' })
      .returning();
    const [cart] = await db.insert(carts).values({ shopId: ref, userId: BOB_ID }).returning();
    await db.insert(cartItems).values({ cartId: cart!.id, productId: product!.id, quantity: 1 });

    const as = (token: string) => ({ Authorization: `Bearer ${token}`, 'content-type': 'application/json', 'X-Shop': ref });
    const listed = async (token: string) =>
      ((await (await app.request('/api/shops', { headers: as(token) })).json()) as {
        shops: Array<{ id: string; isClosed: boolean }>;
      }).shops.find((s) => s.id === ref);

    const preview = await app.request('/api/admin/shop/close-preview', { headers: as(admin) });
    expect(await preview.json()).toMatchObject({ unpaidOrders: 1, carts: 1, paymentsToReview: 0 });

    const close = await app.request('/api/admin/shop/close', { method: 'POST', headers: as(admin) });
    expect(((await close.json()) as { isClosed: boolean }).isClosed).toBe(true);
    expect(await db.select().from(orders).where(eq(orders.id, unpaid!.id))).toHaveLength(0);
    expect(await db.select().from(orders).where(eq(orders.id, paid!.id))).toHaveLength(1);
    expect(await db.select().from(carts).where(eq(carts.shopId, ref))).toHaveLength(0);

    // Alice has no orders left there: it is gone for her. Bob can still look.
    expect(await listed(alice)).toBeUndefined();
    expect((await listed(bob))?.isClosed).toBe(true);
    expect((await app.request(`/api/orders/${paid!.id}`, { headers: as(bob) })).status).toBe(200);
    const add = await app.request('/api/cart/items', {
      method: 'POST',
      headers: as(bob),
      body: JSON.stringify({ productId: product!.id, quantity: 1 }),
    });
    expect(add.status).toBe(409);

    // Reopen, then a scheduled closing: closed from that moment, finalized by maintenance.
    await app.request('/api/admin/shop/reopen', { method: 'POST', headers: as(admin) });
    const past = await app.request('/api/admin/shop/closing', {
      method: 'PUT',
      headers: as(admin),
      body: JSON.stringify({ closesAt: new Date(Date.now() - 60_000).toISOString() }),
    });
    expect(past.status).toBe(400);
    const future = await app.request('/api/admin/shop/closing', {
      method: 'PUT',
      headers: as(admin),
      body: JSON.stringify({ closesAt: new Date(Date.now() + 3_600_000).toISOString() }),
    });
    expect(((await future.json()) as { isClosed: boolean; closesAt: string }).isClosed).toBe(false);
    await db.update(shops).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(shops.id, ref));
    const late = await app.request('/api/cart/items', {
      method: 'POST',
      headers: as(bob),
      body: JSON.stringify({ productId: product!.id, quantity: 1 }),
    });
    expect(late.status).toBe(409);
    expect(await closeDueShops(db, testEnv)).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(shops).where(eq(shops.id, ref));
    expect(row?.closedAt).not.toBeNull();
    expect(row?.closesAt).toBeNull();

    await db.delete(shops).where(eq(shops.id, ref));
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
