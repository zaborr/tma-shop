import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type {
  OrderChangeRequest,
  PaymentLogEntry,
  PriceTier,
  ProductOption,
  ShippingZone,
  PaymentCheck,
  PaymentSetup,
  VipClub,
} from '@tma-shop/shared';

/** A wallet as the old free-text form stored it ("Base/Ethereum", "USDC/EURC"). */
export interface LegacyWallet {
  network: string;
  token: string;
  address: string;
}

export const userRoleEnum = pgEnum('user_role', ['customer', 'admin']);

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'awaiting_payment',
  'paid',
  'cancelled',
  'shipped',
  'fulfilled',
]);

export const shops = pgTable('shops', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** URL-friendly unique name. */
  slug: text('slug').notNull().unique('shops_slug_unique'),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  imageUrl: text('image_url'),
  /** Hidden shops are only visible to their admins and platform super-admins. */
  isVisible: boolean('is_visible').notNull().default(true),
  /** Visible shops only show to VIP club members (and admins). */
  vipOnly: boolean('vip_only').notNull().default(false),
  /** The shop's own VIP club. */
  vipClub: jsonb('vip_club').$type<VipClub>().notNull().default({ groups: [], userIds: [], usernames: [] }),
  /** Whether members of the platform's VIP club count as VIPs here too. */
  useGlobalVipClub: boolean('use_global_vip_club').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  /** Telegram ids of this shop's admins. */
  adminIds: jsonb('admin_ids').$type<number[]>().notNull().default([]),
  /** Wallets as entered by the admins (may join networks/tokens with "/"). */
  /** Legacy free-text wallets; converted once into `paymentSetup`. */
  wallets: jsonb('wallets').$type<LegacyWallet[]>().notNull().default([]),
  /** Receiving addresses and accepted networks/tokens (null = none yet). */
  paymentSetup: jsonb('payment_setup').$type<PaymentSetup>(),
  /** Set once wallets were saved or imported, so the legacy env import runs only once. */
  walletsInitialized: boolean('wallets_initialized').notNull().default(false),
  currency: text('currency').notNull().default('XTR'),
  botUsername: text('bot_username'),
  starsEnabled: boolean('stars_enabled').notNull().default(true),
  /** Fixed fee added once to every order (minor units of the order's token). */
  orderFee: integer('order_fee').notNull().default(0),
  orderFeeLabel: text('order_fee_label').notNull().default('Service fee'),
  /** Unpaid orders are cancelled after this many hours without activity (0 = never). */
  autoCancelHours: integer('auto_cancel_hours').notNull().default(48),
  /** Shipping zones with a flat cost per order. */
  shippingZones: jsonb('shipping_zones').$type<ShippingZone[]>().notNull().default([]),
  /** RSA-OAEP public key (base64 SPKI) used to encrypt delivery addresses. */
  addressPublicKey: text('address_public_key'),
  addressKeyFingerprint: text('address_key_fingerprint'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [unique('categories_shop_slug_unique').on(table.shopId, table.slug)],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    /** Price in the currency's minor units (whole Stars for XTR). */
    price: integer('price').notNull(),
    currency: text('currency').notNull(),
    imageUrl: text('image_url'),
    /** NULL means the product is not stock-tracked. Unused when it has variants. */
    stock: integer('stock'),
    isActive: boolean('is_active').notNull().default(true),
    /** Option groups (Color, Size…); empty for a product without variants. */
    options: jsonb('options').$type<ProductOption[]>().notNull().default([]),
    /** Quantity breaks on the product's price, sorted by `minQty`. */
    priceTiers: jsonb('price_tiers').$type<PriceTier[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('products_shop_slug_unique').on(table.shopId, table.slug)],
);

/** One combination of a product's option values, with optional own price and stock. */
export const productVariants = pgTable('product_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  /** One value per option, in the product's option order. */
  optionValues: jsonb('option_values').$type<string[]>().notNull(),
  /** Own price; NULL = the product's price. */
  price: integer('price'),
  /** NULL = not stock-tracked. */
  stock: integer('stock'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const users = pgTable('users', {
  telegramId: bigint('telegram_id', { mode: 'number' }).primaryKey(),
  firstName: text('first_name').notNull(),
  username: text('username'),
  languageCode: text('language_code'),
  /** Language chosen in the app ('en' | 'es' | 'it' | 'pt'); null = follow Telegram. */
  preferredLang: text('preferred_lang'),
  role: userRoleEnum('role').notNull().default('customer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** Last time they opened the Mini App; inactive users are deleted (retention). */
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

export const carts = pgTable(
  'carts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.telegramId, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('carts_shop_user_unique').on(table.shopId, table.userId)],
);

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
  },
  (table) => [
    unique('cart_items_cart_product_variant_unique')
      .on(table.cartId, table.productId, table.variantId)
      .nullsNotDistinct(),
  ],
);

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id')
    .notNull()
    .references(() => shops.id, { onDelete: 'cascade' }),
  /** Customer; null once the order is anonymized (data retention). */
  userId: bigint('user_id', { mode: 'number' }).references(() => users.telegramId, {
    onDelete: 'set null',
  }),
  status: orderStatusEnum('status').notNull().default('pending'),
  /** Total including `fee`. */
  total: integer('total').notNull(),
  /** Per-order fee charged once, frozen at creation. */
  fee: integer('fee').notNull().default(0),
  /** Shipping charged once, frozen at creation (0 = free or not shipped). */
  shipping: integer('shipping').notNull().default(0),
  shippingZoneName: text('shipping_zone_name'),
  /** Address encrypted on the customer's device; the server cannot read it. */
  encryptedAddress: text('encrypted_address'),
  addressKeyFingerprint: text('address_key_fingerprint'),
  currency: text('currency').notNull(),
  paymentChargeId: text('payment_charge_id'),
  /** Crypto payment method label chosen by the customer, e.g. "USDC · Base". */
  paymentNetwork: text('payment_network'),
  /** Crypto transaction hash submitted by the customer for manual review. */
  paymentTxHash: text('payment_tx_hash'),
  /** Payment method id of that transaction, e.g. `usdc-base`. */
  paymentMethodId: text('payment_method_id'),
  /** Result of the automatic on-chain check of that transaction. */
  paymentCheck: jsonb('payment_check').$type<PaymentCheck>(),
  /** Customer's Telegram username (without @) given at checkout. */
  contactUsername: text('contact_username'),
  /** Shipment tracking number or link, set when the order is shipped. */
  trackingNumber: text('tracking_number'),
  /** Last message from the shop to the customer about this order. */
  statusNote: text('status_note'),
  /** Confirmed money received, net of refunds (minor units of `currency`). */
  amountPaid: integer('amount_paid').notNull().default(0),
  /** Amount covered by the transaction currently awaiting verification. */
  amountSubmitted: integer('amount_submitted').notNull().default(0),
  /** Whether tracked stock was already decremented for this order's items. */
  stockApplied: boolean('stock_applied').notNull().default(false),
  /** Customer's pending modification, awaiting admin approval. */
  changeRequest: jsonb('change_request').$type<OrderChangeRequest>(),
  /** Confirmed payments and refunds, oldest first. */
  paymentLog: jsonb('payment_log').$type<PaymentLogEntry[]>().notNull().default([]),
  /** When it was delivered or cancelled; retention counts from here. */
  closedAt: timestamp('closed_at', { withTimezone: true }),
  /** When the address and the link to the customer were removed (retention). */
  anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
  /** When the bot reminded the customer to pay (sent once per order). */
  paymentReminderAt: timestamp('payment_reminder_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Platform-wide settings (a single row, id = 1). */
export const platformSettings = pgTable('platform_settings', {
  id: integer('id').primaryKey().default(1),
  /** Days after an order is closed before its address and customer link go. */
  addressRetentionDays: integer('address_retention_days').notNull().default(30),
  /** Days an untouched cart is kept. */
  cartRetentionDays: integer('cart_retention_days').notNull().default(30),
  /** Days without opening the app before a user with no orders is deleted. */
  inactiveUserDays: integer('inactive_user_days').notNull().default(30),
  lastRetentionRunAt: timestamp('last_retention_run_at', { withTimezone: true }),
  /** The platform-wide VIP club (shops can count its members as their VIPs). */
  vipClub: jsonb('vip_club').$type<VipClub>().notNull().default({ groups: [], userIds: [], usernames: [] }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  /** Snapshot of the variant's label at order time, e.g. "Red / M". */
  variantLabel: text('variant_label'),
  unitPrice: integer('unit_price').notNull(),
  quantity: integer('quantity').notNull(),
  subtotal: integer('subtotal').notNull(),
});

// --- relations (used by Drizzle's relational query API) ---

export const shopsRelations = relations(shops, ({ many }) => ({
  categories: many(categories),
  products: many(products),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  shop: one(shops, { fields: [categories.shopId], references: [shops.id] }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one }) => ({
  shop: one(shops, { fields: [products.shopId], references: [shops.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
}));

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, { fields: [carts.userId], references: [users.telegramId] }),
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  product: one(products, { fields: [cartItems.productId], references: [products.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.telegramId] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));
