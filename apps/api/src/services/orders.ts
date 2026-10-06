import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { Order } from '@tma-shop/shared';
import type { Database } from '../db/client.js';
import { cartItems, orderItems, orders, products, shops } from '../db/schema.js';
import { toOrderDTO } from '../db/mappers.js';
import { ApiError } from '../lib/errors.js';

type OrderItemRow = typeof orderItems.$inferSelect;

export interface DraftLine {
  productId: string;
  title: string;
  unitPrice: number;
  quantity: number;
  /** `null` when not stock-tracked. */
  stock: number | null;
}

export interface OrderDraft {
  items: Array<{
    productId: string;
    title: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
  }>;
  total: number;
}

/**
 * Pure helper: turns resolved cart lines into a priced order draft, validating
 * that the cart is non-empty and every tracked line is within stock. Extracted
 * so the pricing/validation rules can be unit-tested without a database.
 */
export function buildOrderDraft(lines: DraftLine[]): OrderDraft {
  if (lines.length === 0) {
    throw ApiError.badRequest('empty_cart', 'Cannot create an order from an empty cart');
  }
  const items = lines.map((line) => {
    if (line.quantity <= 0) {
      throw ApiError.badRequest('invalid_quantity', `Invalid quantity for "${line.title}"`);
    }
    if (line.stock !== null && line.quantity > line.stock) {
      throw ApiError.conflict('out_of_stock', `Only ${line.stock} of "${line.title}" in stock`);
    }
    return {
      productId: line.productId,
      title: line.title,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      subtotal: line.unitPrice * line.quantity,
    };
  });
  return { items, total: items.reduce((sum, item) => sum + item.subtotal, 0) };
}

/** Creates an order from the user's current cart inside a single transaction. */
export async function createOrderFromCart(
  db: Database,
  shopId: string,
  userId: number,
): Promise<Order> {
  return db.transaction(async (tx) => {
    const shop = await tx.query.shops.findFirst({ where: eq(shops.id, shopId) });
    if (!shop) throw ApiError.notFound('Shop not found');

    const cart = await tx.query.carts.findFirst({
      where: (c, { and: andOp, eq: eqOp }) => andOp(eqOp(c.shopId, shopId), eqOp(c.userId, userId)),
    });
    const lines = cart
      ? await tx
          .select({ item: cartItems, product: products })
          .from(cartItems)
          .innerJoin(products, eq(cartItems.productId, products.id))
          .where(eq(cartItems.cartId, cart.id))
      : [];

    const activeLines = lines.filter((l) => l.product.isActive);
    const currencies = new Set(activeLines.map((l) => l.product.currency));
    if (currencies.size > 1) {
      throw ApiError.badRequest(
        'mixed_currency',
        'The cart mixes currencies; remove the items priced in the other token',
      );
    }
    const currency = activeLines[0]?.product.currency ?? shop.currency;

    const draft = buildOrderDraft(
      activeLines
        .map((l) => ({
          productId: l.product.id,
          title: l.product.title,
          unitPrice: l.product.price,
          quantity: l.item.quantity,
          stock: l.product.stock,
        })),
    );

    const [order] = await tx
      .insert(orders)
      .values({
        shopId,
        userId,
        status: 'pending',
        total: draft.total,
        currency,
      })
      .returning();
    if (!order) throw new Error('Failed to create order');

    await tx.insert(orderItems).values(draft.items.map((item) => ({ orderId: order.id, ...item })));
    if (cart) await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));

    return toOrderDTO(
      order,
      draft.items.map((item) => ({ ...item, id: '', orderId: order.id })),
    );
  });
}

export async function listOrders(db: Database, shopId: string, userId: number): Promise<Order[]> {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.shopId, shopId), eq(orders.userId, userId)))
    .orderBy(desc(orders.createdAt));
  return attachItems(db, rows);
}

export async function getOrder(
  db: Database,
  shopId: string,
  orderId: string,
  userId?: number,
): Promise<Order | undefined> {
  const filters = [eq(orders.shopId, shopId), eq(orders.id, orderId)];
  if (userId !== undefined) filters.push(eq(orders.userId, userId));
  const order = await db.query.orders.findFirst({ where: and(...filters) });
  if (!order) return undefined;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return toOrderDTO(order, items);
}

export async function listAllOrders(db: Database, shopId: string): Promise<Order[]> {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.shopId, shopId))
    .orderBy(desc(orders.createdAt));
  return attachItems(db, rows);
}

export async function setOrderStatus(
  db: Database,
  shopId: string,
  orderId: string,
  status: Order['status'],
): Promise<Order> {
  const [updated] = await db
    .update(orders)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(orders.shopId, shopId), eq(orders.id, orderId)))
    .returning();
  if (!updated) throw ApiError.notFound('Order not found');
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, updated.id));
  return toOrderDTO(updated, items);
}

/**
 * Marks an order paid and decrements tracked stock, idempotently: a repeated
 * webhook for the same order is a no-op. Returns the up-to-date order.
 */
export async function markOrderPaid(
  db: Database,
  orderId: string,
  paymentChargeId: string,
): Promise<Order> {
  return db.transaction(async (tx) => {
    const order = await tx.query.orders.findFirst({ where: eq(orders.id, orderId) });
    if (!order) throw ApiError.notFound('Order not found');

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    if (order.status === 'paid' || order.status === 'fulfilled') {
      return toOrderDTO(order, items);
    }

    const [updated] = await tx
      .update(orders)
      .set({ status: 'paid', paymentChargeId, updatedAt: new Date() })
      .where(eq(orders.id, order.id))
      .returning();
    if (!updated) throw new Error('Failed to update order');

    for (const item of items) {
      await tx
        .update(products)
        .set({ stock: sql`GREATEST(${products.stock} - ${item.quantity}, 0)` })
        .where(and(eq(products.id, item.productId), sql`${products.stock} IS NOT NULL`));
    }

    return toOrderDTO(updated, items);
  });
}

/**
 * Records a crypto payment reported by the customer: the wallet they paid into
 * and the transaction hash. Moves the order to `awaiting_payment` so an admin
 * can verify it on-chain and confirm it manually. The customer may resubmit
 * (e.g. to fix a typo) until an admin confirms the payment.
 */
export async function submitCryptoPayment(
  db: Database,
  shopId: string,
  orderId: string,
  userId: number,
  paymentNetwork: string,
  txHash: string,
): Promise<Order> {
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.shopId, shopId), eq(orders.id, orderId), eq(orders.userId, userId)),
  });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status !== 'pending' && order.status !== 'awaiting_payment') {
    throw ApiError.conflict('not_payable', `Order is ${order.status} and cannot take a payment`);
  }

  // A transaction can only pay for one order.
  const reused = await db.query.orders.findFirst({
    where: and(eq(orders.paymentTxHash, txHash), ne(orders.id, order.id)),
  });
  if (reused) {
    throw ApiError.conflict('tx_already_used', 'This transaction was already used for another order');
  }

  const [updated] = await db
    .update(orders)
    .set({
      status: 'awaiting_payment',
      paymentNetwork,
      paymentTxHash: txHash,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id))
    .returning();
  if (!updated) throw new Error('Failed to update order');
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, updated.id));
  return toOrderDTO(updated, items);
}

/** Statuses a customer may delete: nothing paid or under verification. */
const CUSTOMER_DELETABLE: Order['status'][] = ['pending', 'cancelled'];

/**
 * Deletes an order (its items cascade). Admins (no `userId`) may delete any
 * order; customers only their own, and only while nothing has been paid or
 * submitted for verification, so a payment never loses its record.
 */
export async function deleteOrder(
  db: Database,
  shopId: string,
  orderId: string,
  userId?: number,
): Promise<void> {
  const filters = [eq(orders.shopId, shopId), eq(orders.id, orderId)];
  if (userId !== undefined) filters.push(eq(orders.userId, userId));
  const order = await db.query.orders.findFirst({ where: and(...filters) });
  if (!order) throw ApiError.notFound('Order not found');

  if (userId !== undefined && !CUSTOMER_DELETABLE.includes(order.status)) {
    throw ApiError.conflict(
      'not_deletable',
      'Orders with a submitted or confirmed payment cannot be deleted. Contact the shop.',
    );
  }

  await db.delete(orders).where(eq(orders.id, order.id));
}

async function attachItems(db: Database, rows: (typeof orders.$inferSelect)[]): Promise<Order[]> {
  if (rows.length === 0) return [];
  const result: Order[] = [];
  for (const order of rows) {
    const items: OrderItemRow[] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    result.push(toOrderDTO(order, items));
  }
  return result;
}
