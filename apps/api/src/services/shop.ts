import { and, asc, eq, or } from 'drizzle-orm';
import { createHash, createPublicKey, randomUUID } from 'node:crypto';
import type {
  PlatformShopInput,
  ShopAdminView,
  ShopConfig,
  ShopProfileInput,
  ShopSummary,
  UpdateShippingRequest,
  WalletInput,
} from '@tma-shop/shared';
import type { Database } from '../db/client.js';
import type { Env } from '../config/env.js';
import { orders, shops } from '../db/schema.js';
import { toShopAdminDTO, toShopConfigDTO, toShopSummaryDTO } from '../db/mappers.js';
import { expandWallets } from '../config/payment-methods.js';
import { ApiError } from '../lib/errors.js';

export type ShopRow = typeof shops.$inferSelect;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Platform super-admins (ADMIN_TELEGRAM_IDS) manage every shop. */
export function isSuperAdmin(env: Env, userId: number | undefined): boolean {
  return userId !== undefined && env.ADMIN_TELEGRAM_IDS.includes(userId);
}

/** A shop's own admins, plus platform super-admins. */
export function canManageShop(env: Env, shop: ShopRow, userId: number | undefined): boolean {
  if (userId === undefined) return false;
  return isSuperAdmin(env, userId) || shop.adminIds.includes(userId);
}

/** Who gets the bot's messages about a shop's orders: its admins, else the super-admins. */
export function shopNotificationChatIds(env: Env, shop: ShopRow): number[] {
  return shop.adminIds.length > 0 ? shop.adminIds : env.ADMIN_TELEGRAM_IDS;
}

/**
 * Finds the shop a request is for. `ref` (the `X-Shop` header) is a shop id or
 * slug; without it — older clients — the configured `SHOP_ID` or the oldest
 * shop is used, as in single-store deployments.
 */
export async function resolveShop(db: Database, env: Env, ref: string | undefined): Promise<ShopRow> {
  const value = ref?.trim();
  let shop: ShopRow | undefined;
  if (value) {
    shop = await db.query.shops.findFirst({
      where: UUID_RE.test(value) ? or(eq(shops.id, value), eq(shops.slug, value)) : eq(shops.slug, value),
    });
    if (!shop) throw ApiError.notFound('Shop not found');
    return shop;
  }
  shop = env.SHOP_ID
    ? await db.query.shops.findFirst({ where: eq(shops.id, env.SHOP_ID) })
    : await db.query.shops.findFirst({ orderBy: asc(shops.createdAt) });
  if (!shop) {
    throw new ApiError(503, 'no_shop', 'No shop configured — create one first');
  }
  return shop;
}

/** Shops shown on the start screen: visible ones, plus hidden ones the user manages. */
export async function listShops(db: Database, env: Env, userId: number): Promise<ShopSummary[]> {
  const rows = await db
    .select()
    .from(shops)
    .orderBy(asc(shops.sortOrder), asc(shops.createdAt));
  return rows
    .map((row) => toShopSummaryDTO(row, canManageShop(env, row, userId)))
    .filter((shop) => shop.isVisible || shop.canManage);
}

export function getShopConfig(shop: ShopRow, canManage: boolean): ShopConfig {
  return toShopConfigDTO(shop, canManage);
}

export function getShopAdminView(shop: ShopRow): ShopAdminView {
  return toShopAdminDTO(shop);
}

async function updateShop(
  db: Database,
  shopId: string,
  values: Partial<typeof shops.$inferInsert>,
): Promise<ShopRow> {
  const [row] = await db.update(shops).set(values).where(eq(shops.id, shopId)).returning();
  if (!row) throw ApiError.notFound('Shop not found');
  return row;
}

/** Sets the fixed fee added once to every new order (0 = no fee) and its label. */
export async function updateOrderFee(
  db: Database,
  shopId: string,
  input: { orderFee: number; orderFeeLabel: string },
): Promise<ShopAdminView> {
  const row = await updateShop(db, shopId, {
    orderFee: input.orderFee,
    orderFeeLabel: input.orderFeeLabel,
  });
  return toShopAdminDTO(row);
}

/** Name, description and image — editable by the shop's own admins. */
export async function updateShopProfile(
  db: Database,
  shopId: string,
  input: ShopProfileInput,
): Promise<ShopAdminView> {
  return toShopAdminDTO(await updateShop(db, shopId, input));
}

/** Replaces the shop's wallets. Rejects entries that expand to nothing. */
export async function updateShopWallets(
  db: Database,
  shopId: string,
  wallets: WalletInput[],
): Promise<ShopAdminView> {
  const cleaned = wallets.map((w) => ({
    network: w.network.trim(),
    token: w.token.trim().toUpperCase(),
    address: w.address.trim(),
  }));
  if (cleaned.length > 0 && expandWallets(cleaned).length === 0) {
    throw ApiError.badRequest('invalid_wallets', 'Each wallet needs a network and a token');
  }
  return toShopAdminDTO(
    await updateShop(db, shopId, { wallets: cleaned, walletsInitialized: true }),
  );
}

/** Replaces the shop's shipping zones; zones keep their id, new ones get one. */
export async function updateShippingZones(
  db: Database,
  shopId: string,
  zones: UpdateShippingRequest['zones'],
): Promise<ShopAdminView> {
  const names = new Set(zones.map((z) => z.name.trim().toLowerCase()));
  if (names.size !== zones.length) {
    throw ApiError.badRequest('invalid_zones', 'Two shipping zones have the same name');
  }
  const cleaned = zones.map((z) => ({
    id: z.id ?? randomUUID(),
    name: z.name.trim(),
    price: z.price,
    freeFrom: z.freeFrom,
    isActive: z.isActive,
  }));
  return toShopAdminDTO(await updateShop(db, shopId, { shippingZones: cleaned }));
}

/** Short fingerprint of a public key: first 16 hex chars of SHA-256 over its DER bytes. */
export function keyFingerprint(der: Buffer): string {
  return createHash('sha256').update(der).digest('hex').slice(0, 16);
}

/**
 * Sets the shop's address public key (PEM or base64 SPKI, RSA ≥ 2048 bits), or
 * removes it with null. The private key never reaches the server.
 */
export async function updateAddressKey(
  db: Database,
  shopId: string,
  publicKey: string | null,
): Promise<ShopAdminView> {
  if (publicKey === null) {
    return toShopAdminDTO(
      await updateShop(db, shopId, { addressPublicKey: null, addressKeyFingerprint: null }),
    );
  }
  const base64 = publicKey
    .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  let der: Buffer;
  try {
    der = Buffer.from(base64, 'base64');
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
    const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
    if (key.asymmetricKeyType !== 'rsa' || bits < 2048) {
      throw new Error('weak');
    }
  } catch {
    throw ApiError.badRequest(
      'invalid_key',
      'That is not an RSA public key of 2048 bits or more (SPKI / "BEGIN PUBLIC KEY")',
    );
  }
  return toShopAdminDTO(
    await updateShop(db, shopId, {
      addressPublicKey: der.toString('base64'),
      addressKeyFingerprint: keyFingerprint(der),
    }),
  );
}

// --- Platform (super-admin) ---------------------------------------------------

async function assertSlugFree(db: Database, slug: string, exceptId?: string): Promise<void> {
  const taken = await db.query.shops.findFirst({ where: eq(shops.slug, slug) });
  if (taken && taken.id !== exceptId) {
    throw ApiError.conflict('slug_taken', `A shop with the slug "${slug}" already exists`);
  }
}

function uniqueIds(ids: number[]): number[] {
  return [...new Set(ids)];
}

export async function listAllShops(db: Database): Promise<ShopAdminView[]> {
  const rows = await db
    .select()
    .from(shops)
    .orderBy(asc(shops.sortOrder), asc(shops.createdAt));
  return rows.map(toShopAdminDTO);
}

export async function createShop(db: Database, input: PlatformShopInput): Promise<ShopAdminView> {
  await assertSlugFree(db, input.slug);
  const [row] = await db
    .insert(shops)
    .values({
      ...input,
      adminIds: uniqueIds(input.adminIds),
      currency: 'USDC',
      starsEnabled: false,
      // New shops start with their own (empty) wallets; never import legacy ones.
      walletsInitialized: true,
    })
    .returning();
  if (!row) throw new Error('Failed to create shop');
  return toShopAdminDTO(row);
}

export async function updatePlatformShop(
  db: Database,
  shopId: string,
  input: PlatformShopInput,
): Promise<ShopAdminView> {
  await assertSlugFree(db, input.slug, shopId);
  return toShopAdminDTO(
    await updateShop(db, shopId, { ...input, adminIds: uniqueIds(input.adminIds) }),
  );
}

/** Deletes a shop with everything in it — only while it has no orders. */
export async function deleteShop(db: Database, shopId: string): Promise<void> {
  const withOrders = await db.query.orders.findFirst({ where: eq(orders.shopId, shopId) });
  if (withOrders) {
    throw ApiError.conflict(
      'shop_has_orders',
      'This shop has orders and cannot be deleted. Hide it instead.',
    );
  }
  const deleted = await db.delete(shops).where(eq(shops.id, shopId)).returning({ id: shops.id });
  if (deleted.length === 0) throw ApiError.notFound('Shop not found');
}

/**
 * One-time migration of the legacy `PAYMENT_METHODS` env var: copies those
 * wallets into the first shop, unless its wallets were already set up.
 */
export async function importLegacyWallets(db: Database, env: Env): Promise<void> {
  if (env.PAYMENT_METHODS.length === 0) return;
  const shop = env.SHOP_ID
    ? await db.query.shops.findFirst({ where: eq(shops.id, env.SHOP_ID) })
    : await db.query.shops.findFirst({ orderBy: asc(shops.createdAt) });
  if (!shop || shop.walletsInitialized) return;
  await db
    .update(shops)
    .set({ wallets: env.PAYMENT_METHODS, walletsInitialized: true })
    .where(and(eq(shops.id, shop.id), eq(shops.walletsInitialized, false)));
  console.log(
    `Imported ${env.PAYMENT_METHODS.length} wallet(s) from PAYMENT_METHODS into shop "${shop.name}". ` +
      'Manage them from the shop admin from now on.',
  );
}
