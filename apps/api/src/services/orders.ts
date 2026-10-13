import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import type { Order, OrderChangeRequest, PaymentLogEntry } from '@tma-shop/shared';
import type { Database } from '../db/client.js';
import { cartItems, orderItems, orders, productVariants, products, shops } from '../db/schema.js';
import { toOrderDTO, variantLabel } from '../db/mappers.js';
import { lineStock, loadVariants, quantitiesByProduct, tieredPrice } from './variants.js';
import { ApiError } from '../lib/errors.js';

type OrderItemRow = typeof orderItems.$inferSelect;

/** Key of an order or cart line: product plus variant. */
export function lineKey(productId: string, variantId: string | null | undefined): string {
  return `${productId}:${variantId ?? ''}`;
}

export interface DraftLine {
  productId: string;
  variantId?: string | null;
  variantLabel?: string | null;
  title: string;
  unitPrice: number;
  quantity: number;
  /** `null` when not stock-tracked. */
  stock: number | null;
}

export interface OrderDraft {
  items: Array<{
    productId: string;
    variantId: string | null;
    variantLabel: string | null;
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
    const name = line.variantLabel ? `${line.title} (${line.variantLabel})` : line.title;
    if (line.stock !== null && line.quantity > line.stock) {
      throw ApiError.conflict('out_of_stock', `Only ${line.stock} of "${name}" in stock`);
    }
    return {
      productId: line.productId,
      variantId: line.variantId ?? null,
      variantLabel: line.variantLabel ?? null,
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
  contactUsername: string | null = null,
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

    const variants = await loadVariants(
      tx,
      activeLines.map((l) => l.product.id),
    );
    // Same rule as the cart: lines that no longer match the product are dropped.
    const valid = activeLines.flatMap(({ item, product }) => {
      const variant = item.variantId
        ? (variants.get(product.id)?.find((v) => v.id === item.variantId) ?? null)
        : null;
      if (product.options.length > 0 && (!variant || !variant.isActive)) return [];
      if (product.options.length === 0 && item.variantId) return [];
      return [{ item, product, variant }];
    });
    // Quantity tiers count every unit of a product, across its variants.
    const productQty = quantitiesByProduct(valid.map((v) => v.item));
    const draftLines: DraftLine[] = valid.map(({ item, product, variant }) => ({
      productId: product.id,
      variantId: variant?.id ?? null,
      variantLabel: variant ? variantLabel(variant.optionValues) : null,
      title: product.title,
      unitPrice: tieredPrice(product, variant, productQty.get(product.id) ?? item.quantity),
      quantity: item.quantity,
      stock: lineStock(product, variant),
    }));
    const draft = buildOrderDraft(draftLines);

    const [order] = await tx
      .insert(orders)
      .values({
        shopId,
        userId,
        status: 'pending',
        // The shop's per-order fee is frozen on the order and charged once.
        total: draft.total + shop.orderFee,
        fee: shop.orderFee,
        currency,
        contactUsername,
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
 * Confirms the payment currently under review (or, for Stars and legacy orders,
 * whatever is still due): adds it to `amountPaid`, logs it, and decrements
 * tracked stock the first time an order is paid. Idempotent for orders that are
 * not waiting for a payment (a repeated webhook is a no-op).
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
    if (order.status !== 'pending' && order.status !== 'awaiting_payment') {
      return toOrderDTO(order, items);
    }

    const received =
      order.amountSubmitted > 0 ? order.amountSubmitted : Math.max(order.total - order.amountPaid, 0);
    const amountPaid = order.amountPaid + received;
    const entry: PaymentLogEntry = {
      type: 'payment',
      amount: received,
      network: order.paymentNetwork,
      txHash: order.paymentTxHash ?? paymentChargeId,
      at: new Date().toISOString(),
    };

    const [updated] = await tx
      .update(orders)
      .set({
        status: amountPaid >= order.total ? 'paid' : 'pending',
        amountPaid,
        amountSubmitted: 0,
        paymentChargeId,
        paymentLog: [...order.paymentLog, entry],
        stockApplied: true,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();
    if (!updated) throw new Error('Failed to update order');

    if (!order.stockApplied) {
      for (const item of items) {
        if (item.variantId) {
          await tx
            .update(productVariants)
            .set({ stock: sql`GREATEST(${productVariants.stock} - ${item.quantity}, 0)` })
            .where(
              and(
                eq(productVariants.id, item.variantId),
                sql`${productVariants.stock} IS NOT NULL`,
              ),
            );
        } else {
          await tx
            .update(products)
            .set({ stock: sql`GREATEST(${products.stock} - ${item.quantity}, 0)` })
            .where(and(eq(products.id, item.productId), sql`${products.stock} IS NOT NULL`));
        }
      }
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
  const due = order.total - order.amountPaid;
  if (due <= 0) throw ApiError.conflict('nothing_due', 'Nothing is left to pay for this order');

  // A transaction can only pay once: not for another order, and not twice here.
  const reused = await db.query.orders.findFirst({
    where: or(
      and(eq(orders.paymentTxHash, txHash), ne(orders.id, order.id)),
      sql`${orders.paymentLog} @> ${JSON.stringify([{ txHash }])}::jsonb`,
    ),
  });
  if (reused) {
    throw ApiError.conflict('tx_already_used', 'This transaction was already used for a payment');
  }

  const [updated] = await db
    .update(orders)
    .set({
      status: 'awaiting_payment',
      paymentNetwork,
      paymentTxHash: txHash,
      amountSubmitted: due,
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

  const moneyInvolved = order.amountPaid > 0 || order.amountSubmitted > 0;
  if (userId !== undefined && (!CUSTOMER_DELETABLE.includes(order.status) || moneyInvolved)) {
    throw ApiError.conflict(
      'not_deletable',
      'Orders with a submitted or confirmed payment cannot be deleted. Contact the shop.',
    );
  }

  await db.delete(orders).where(eq(orders.id, order.id));
}

/** Orders a customer may ask to modify: already paid or under verification. */
const CHANGEABLE: Order['status'][] = ['paid', 'awaiting_payment'];

/**
 * Stores a customer's requested modification (the full new item list) for
 * admin approval. Lines already in the order keep their original unit price;
 * new products use the current price. Stock is checked against what the order
 * already holds. Replaces any earlier pending request.
 */
export async function requestOrderChange(
  db: Database,
  shopId: string,
  orderId: string,
  userId: number,
  lines: Array<{ productId: string; variantId?: string | null | undefined; quantity: number }>,
): Promise<Order> {
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.shopId, shopId), eq(orders.id, orderId), eq(orders.userId, userId)),
  });
  if (!order) throw ApiError.notFound('Order not found');
  if (!CHANGEABLE.includes(order.status)) {
    throw ApiError.conflict(
      'not_changeable',
      'Only paid orders, or orders whose payment is being verified, can be changed',
    );
  }

  const current = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const currentQty = new Map(current.map((i) => [lineKey(i.productId, i.variantId), i.quantity]));
  const currentPrice = new Map(
    current.map((i) => [lineKey(i.productId, i.variantId), i.unitPrice]),
  );

  // Merge duplicate lines.
  const wanted = new Map<string, { productId: string; variantId: string | null; quantity: number }>();
  for (const line of lines) {
    const variantId = line.variantId ?? null;
    const key = lineKey(line.productId, variantId);
    const prev = wanted.get(key);
    wanted.set(key, {
      productId: line.productId,
      variantId,
      quantity: (prev?.quantity ?? 0) + line.quantity,
    });
  }

  const productIds = [...new Set([...wanted.values()].map((w) => w.productId))];
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.shopId, shopId), inArray(products.id, productIds)));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const variants = await loadVariants(db, productIds);

  const oldProductQty = quantitiesByProduct(current);
  const newProductQty = quantitiesByProduct([...wanted.values()]);

  const items: OrderChangeRequest['items'] = [];
  for (const [key, { productId, variantId, quantity }] of wanted) {
    const product = byId.get(productId);
    const inOrder = currentQty.has(key);
    if (!product || (!inOrder && !product.isActive)) {
      throw ApiError.badRequest('unknown_product', 'A product in the change is no longer available');
    }
    const variant = variantId
      ? (variants.get(productId)?.find((v) => v.id === variantId) ?? null)
      : null;
    if (product.options.length > 0 && (!variant || (!inOrder && !variant.isActive))) {
      throw ApiError.badRequest('variant_required', `Choose an available option for "${product.title}"`);
    }
    if (product.options.length === 0 && variantId) {
      throw ApiError.badRequest('no_variants', `"${product.title}" has no options`);
    }
    if (product.currency !== order.currency) {
      throw ApiError.badRequest(
        'mixed_currency',
        `"${product.title}" is priced in ${product.currency}; this order is in ${order.currency}`,
      );
    }
    const label = variant ? variantLabel(variant.optionValues) : null;
    const stock = lineStock(product, variant);
    const held = order.stockApplied ? (currentQty.get(key) ?? 0) : 0;
    if (stock !== null && quantity > stock + held) {
      throw ApiError.conflict(
        'out_of_stock',
        `Only ${stock + held} of "${label ? `${product.title} (${label})` : product.title}" available`,
      );
    }
    // A product whose total quantity is unchanged keeps the prices paid; when it
    // changes, every line of it is priced again with the current tiers.
    const unitPrice =
      newProductQty.get(productId) === oldProductQty.get(productId)
        ? (currentPrice.get(key) ?? tieredPrice(product, variant, newProductQty.get(productId) ?? quantity))
        : tieredPrice(product, variant, newProductQty.get(productId) ?? quantity);
    items.push({
      productId,
      variantId: variant?.id ?? null,
      variantLabel: label,
      title: product.title,
      unitPrice,
      quantity,
      subtotal: unitPrice * quantity,
    });
  }

  const unchanged =
    items.length === current.length &&
    items.every((item) => currentQty.get(lineKey(item.productId, item.variantId)) === item.quantity);
  if (unchanged) throw ApiError.badRequest('no_changes', 'The order is unchanged');

  const changeRequest: OrderChangeRequest = {
    items,
    // The order's fee stays the same: it is charged once per order.
    total: items.reduce((sum, item) => sum + item.subtotal, 0) + order.fee,
    requestedAt: new Date().toISOString(),
  };
  const [updated] = await db
    .update(orders)
    .set({ changeRequest, updatedAt: new Date() })
    .where(eq(orders.id, order.id))
    .returning();
  if (!updated) throw new Error('Failed to update order');
  return toOrderDTO(updated, current);
}

/** Withdraws (customer) or rejects (admin, no `userId`) a pending change. */
export async function clearOrderChange(
  db: Database,
  shopId: string,
  orderId: string,
  userId?: number,
): Promise<Order> {
  const filters = [eq(orders.shopId, shopId), eq(orders.id, orderId)];
  if (userId !== undefined) filters.push(eq(orders.userId, userId));
  const [updated] = await db
    .update(orders)
    .set({ changeRequest: null, updatedAt: new Date() })
    .where(and(...filters))
    .returning();
  if (!updated) throw ApiError.notFound('Order not found');
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, updated.id));
  return toOrderDTO(updated, items);
}

/**
 * Applies an approved change: replaces the items and total, moves tracked stock
 * by the difference (when the order already holds stock) and works out what is
 * owed. A paid order that now costs more goes back to `pending` so the customer
 * can pay the difference; one that costs less stays paid with a refund due.
 */
export async function approveOrderChange(
  db: Database,
  shopId: string,
  orderId: string,
): Promise<Order> {
  return db.transaction(async (tx) => {
    const order = await tx.query.orders.findFirst({
      where: and(eq(orders.shopId, shopId), eq(orders.id, orderId)),
    });
    if (!order) throw ApiError.notFound('Order not found');
    const change = order.changeRequest;
    if (!change) throw ApiError.conflict('no_change', 'There is no change to approve');
    if (!CHANGEABLE.includes(order.status)) {
      throw ApiError.conflict('not_changeable', `Order is ${order.status} and cannot be changed`);
    }

    const current = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));

    if (order.stockApplied) {
      const delta = new Map<string, { productId: string; variantId: string | null; diff: number }>();
      const bump = (productId: string, variantId: string | null, by: number): void => {
        const key = lineKey(productId, variantId);
        const prev = delta.get(key);
        delta.set(key, { productId, variantId, diff: (prev?.diff ?? 0) + by });
      };
      for (const item of current) bump(item.productId, item.variantId, -item.quantity);
      for (const item of change.items) bump(item.productId, item.variantId ?? null, item.quantity);

      for (const { productId, variantId, diff } of delta.values()) {
        if (diff === 0) continue;
        if (variantId) {
          const variant = await tx.query.productVariants.findFirst({
            where: eq(productVariants.id, variantId),
          });
          if (!variant || variant.stock === null) continue;
          if (diff > variant.stock) {
            throw ApiError.conflict(
              'out_of_stock',
              `Not enough stock of "${variantLabel(variant.optionValues)}" (${variant.stock} left) to approve`,
            );
          }
          await tx
            .update(productVariants)
            .set({ stock: variant.stock - diff })
            .where(eq(productVariants.id, variantId));
        } else {
          const product = await tx.query.products.findFirst({ where: eq(products.id, productId) });
          if (!product || product.stock === null) continue;
          if (diff > product.stock) {
            throw ApiError.conflict(
              'out_of_stock',
              `Not enough stock of "${product.title}" (${product.stock} left) to approve`,
            );
          }
          await tx
            .update(products)
            .set({ stock: product.stock - diff })
            .where(eq(products.id, productId));
        }
      }
    }

    await tx.delete(orderItems).where(eq(orderItems.orderId, order.id));
    const inserted = await tx
      .insert(orderItems)
      .values(
        change.items.map((item) => ({
          orderId: order.id,
          ...item,
          variantId: item.variantId ?? null,
          variantLabel: item.variantLabel ?? null,
        })),
      )
      .returning();

    const status =
      order.status === 'paid' && change.total > order.amountPaid ? 'pending' : order.status;
    const [updated] = await tx
      .update(orders)
      .set({ total: change.total, changeRequest: null, status, updatedAt: new Date() })
      .where(eq(orders.id, order.id))
      .returning();
    if (!updated) throw new Error('Failed to update order');
    return toOrderDTO(updated, inserted);
  });
}

/** Records that the admin sent back the overpaid amount (`amountPaid > total`). */
export async function recordRefund(db: Database, shopId: string, orderId: string): Promise<Order> {
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.shopId, shopId), eq(orders.id, orderId)),
  });
  if (!order) throw ApiError.notFound('Order not found');
  const refund = order.amountPaid - order.total;
  if (refund <= 0) throw ApiError.conflict('nothing_to_refund', 'Nothing is owed to the customer');

  const entry: PaymentLogEntry = {
    type: 'refund',
    amount: refund,
    network: null,
    txHash: null,
    at: new Date().toISOString(),
  };
  const [updated] = await db
    .update(orders)
    .set({
      amountPaid: order.total,
      paymentLog: [...order.paymentLog, entry],
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id))
    .returning();
  if (!updated) throw new Error('Failed to update order');
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, updated.id));
  return toOrderDTO(updated, items);
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
