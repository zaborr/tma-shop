import { and, eq, isNull, or } from 'drizzle-orm';
import type { Cart, CartLine } from '@tma-shop/shared';
import type { Database } from '../db/client.js';
import { cartItems, carts, productVariants, products, shops } from '../db/schema.js';
import { toProductDTO, toVariantDTO, variantLabel } from '../db/mappers.js';
import { ApiError } from '../lib/errors.js';
import { basePrice, lineStock, loadVariants, type VariantRow } from './variants.js';

type CartRow = typeof carts.$inferSelect;
type ProductRow = typeof products.$inferSelect;

async function getOrCreateCart(db: Database, shopId: string, userId: number): Promise<CartRow> {
  const existing = await db.query.carts.findFirst({
    where: and(eq(carts.shopId, shopId), eq(carts.userId, userId)),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(carts)
    .values({ shopId, userId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  // Lost a race — fetch the row created by the concurrent request.
  const row = await db.query.carts.findFirst({
    where: and(eq(carts.shopId, shopId), eq(carts.userId, userId)),
  });
  if (!row) throw new Error('Failed to create cart');
  return row;
}

async function loadProductForShop(
  db: Database,
  shopId: string,
  productId: string,
): Promise<ProductRow> {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.shopId, shopId)),
  });
  if (!product || !product.isActive) {
    throw ApiError.notFound('Product not found');
  }
  return product;
}

/**
 * The variant a line refers to. Products with options require an active
 * variant of their own; products without options take none.
 */
async function resolveVariant(
  db: Database,
  product: ProductRow,
  variantId: string | null | undefined,
): Promise<VariantRow | null> {
  if (product.options.length === 0) {
    if (variantId) throw ApiError.badRequest('no_variants', 'This product has no variants');
    return null;
  }
  if (!variantId) {
    throw ApiError.badRequest('variant_required', `Choose an option for "${product.title}"`);
  }
  const variant = await db.query.productVariants.findFirst({
    where: and(eq(productVariants.id, variantId), eq(productVariants.productId, product.id)),
  });
  if (!variant || !variant.isActive) {
    throw ApiError.notFound('That option is no longer available');
  }
  return variant;
}

function lineTitle(product: ProductRow, variant: VariantRow | null): string {
  return variant ? `${product.title} (${variantLabel(variant.optionValues)})` : product.title;
}

function assertStock(product: ProductRow, variant: VariantRow | null, requestedQty: number): void {
  const stock = lineStock(product, variant);
  if (stock !== null && requestedQty > stock) {
    throw ApiError.conflict(
      'out_of_stock',
      `Only ${stock} of "${lineTitle(product, variant)}" in stock`,
    );
  }
}

export async function getCart(db: Database, shopId: string, userId: number): Promise<Cart> {
  const cart = await getOrCreateCart(db, shopId, userId);
  const [shop, rows] = await Promise.all([
    db.query.shops.findFirst({ where: eq(shops.id, shopId) }),
    db
      .select({ item: cartItems, product: products })
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .where(eq(cartItems.cartId, cart.id)),
  ]);

  const active = rows.filter((r) => r.product.isActive);
  const variants = await loadVariants(
    db,
    active.map((r) => r.product.id),
  );

  const lines: CartLine[] = [];
  for (const { item, product } of active) {
    const own = variants.get(product.id) ?? [];
    const variant = item.variantId ? (own.find((v) => v.id === item.variantId) ?? null) : null;
    // Skip lines that no longer match the product (variant disabled, options added).
    if (product.options.length > 0 && (!variant || !variant.isActive)) continue;
    if (product.options.length === 0 && item.variantId) continue;
    const unitPrice = basePrice(product, variant);
    lines.push({
      id: item.id,
      product: toProductDTO(
        product,
        own.filter((v) => v.isActive),
      ),
      variant: variant ? toVariantDTO(variant, product) : null,
      unitPrice,
      quantity: item.quantity,
      subtotal: unitPrice * item.quantity,
    });
  }

  // The per-order fee is added once, only when there is something to buy.
  const fee = lines.length > 0 ? (shop?.orderFee ?? 0) : 0;

  return {
    lines,
    // A cart holds a single currency (enforced in addItem); fall back to the shop's.
    currency: lines[0]?.product.currency ?? shop?.currency ?? 'USDC',
    fee,
    total: lines.reduce((sum, line) => sum + line.subtotal, 0) + fee,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

export async function addItem(
  db: Database,
  shopId: string,
  userId: number,
  productId: string,
  variantId: string | null | undefined,
  quantity: number,
): Promise<Cart> {
  const cart = await getOrCreateCart(db, shopId, userId);
  const product = await loadProductForShop(db, shopId, productId);
  const variant = await resolveVariant(db, product, variantId);

  const existing = await db.query.cartItems.findFirst({
    where: and(
      eq(cartItems.cartId, cart.id),
      eq(cartItems.productId, productId),
      variant ? eq(cartItems.variantId, variant.id) : isNull(cartItems.variantId),
    ),
  });
  const newQty = (existing?.quantity ?? 0) + quantity;
  assertStock(product, variant, newQty);

  // One order is paid with one token, so a cart cannot mix currencies.
  const other = await db
    .select({ currency: products.currency })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(and(eq(cartItems.cartId, cart.id), eq(products.isActive, true)));
  const mismatch = other.find((row) => row.currency !== product.currency);
  if (mismatch) {
    throw ApiError.conflict(
      'mixed_currency',
      `Your cart has ${mismatch.currency} products and this one is priced in ${product.currency}. ` +
        'Check out or empty the cart first.',
    );
  }

  if (existing) {
    await db.update(cartItems).set({ quantity: newQty }).where(eq(cartItems.id, existing.id));
  } else {
    await db
      .insert(cartItems)
      .values({ cartId: cart.id, productId, variantId: variant?.id ?? null, quantity: newQty });
  }
  await touchCart(db, cart.id);

  return getCart(db, shopId, userId);
}

/**
 * Sets a line's quantity (0 removes it). `lineId` is the cart line id; older
 * clients send a product id instead, which matches its line without a variant.
 */
export async function setItemQuantity(
  db: Database,
  shopId: string,
  userId: number,
  lineId: string,
  quantity: number,
): Promise<Cart> {
  const cart = await getOrCreateCart(db, shopId, userId);
  const line = await db.query.cartItems.findFirst({
    where: and(
      eq(cartItems.cartId, cart.id),
      or(
        eq(cartItems.id, lineId),
        and(eq(cartItems.productId, lineId), isNull(cartItems.variantId)),
      ),
    ),
  });
  if (!line) throw ApiError.notFound('Item is not in the cart');

  if (quantity === 0) {
    await db.delete(cartItems).where(eq(cartItems.id, line.id));
  } else {
    const product = await loadProductForShop(db, shopId, line.productId);
    const variant = line.variantId
      ? ((await db.query.productVariants.findFirst({
          where: eq(productVariants.id, line.variantId),
        })) ?? null)
      : null;
    assertStock(product, variant, quantity);
    await db.update(cartItems).set({ quantity }).where(eq(cartItems.id, line.id));
  }
  await touchCart(db, cart.id);
  return getCart(db, shopId, userId);
}

export async function clearCartItems(db: Database, cartId: string): Promise<void> {
  await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
}

async function touchCart(db: Database, cartId: string): Promise<void> {
  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
}

export { getOrCreateCart };
