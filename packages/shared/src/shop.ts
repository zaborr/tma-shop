import { z } from 'zod';
import { currencyCode, id, isoDateTime, slug } from './common.js';
import { telegramUserId } from './user.js';
import { addressFor, paymentMethod, paymentSetup } from './payments.js';

/**
 * A shop (store). One deployment hosts several shops; each has its own catalog,
 * carts, orders, wallets, fee and admins. Platform super-admins (configured on
 * the API) create shops, hide them and assign their admins.
 */
/** A shipping zone: a flat cost per order, optionally free from an order amount. */
export const shippingZone = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(64),
  /** Cost per order, in minor units of the order's token. */
  price: z.number().int().nonnegative(),
  /** Free shipping when the items reach this amount; null = never free. */
  freeFrom: z.number().int().positive().nullable(),
  isActive: z.boolean(),
});
export type ShippingZone = z.infer<typeof shippingZone>;

export const shop = z.object({
  id,
  /** URL-friendly unique name, e.g. `tea-shop`. */
  slug,
  name: z.string().min(1).max(128),
  description: z.string().max(1024),
  /** Logo or cover shown in the shop list. */
  imageUrl: z.url().nullable(),
  /** Hidden shops are only visible to their admins and platform super-admins. */
  isVisible: z.boolean(),
  /** Visible only to VIP club members (and admins). Only matters while visible. */
  vipOnly: z.boolean(),
  /** Position in the shop list (ascending). */
  sortOrder: z.number().int(),
  currency: currencyCode,
  /** Telegram bot username that hosts the Mini App, without the leading `@`. */
  botUsername: z.string().max(64).nullable(),
  /** Whether checkout is paid with Telegram Stars. */
  starsEnabled: z.boolean(),
  /** Fixed fee added once to every order, in minor units of the order's token. 0 = none. */
  orderFee: z.number().int().nonnegative(),
  /** How the fee is shown to customers, e.g. "Service fee". */
  orderFeeLabel: z.string().min(1).max(64),
  /** Unpaid orders are cancelled after this many hours without activity (0 = never). */
  autoCancelHours: z.number().int().min(0).max(720),
  /** Shipping zones; with active ones, checkout asks for a zone and an address. */
  shippingZones: z.array(shippingZone),
  /**
   * Public key (RSA-OAEP, base64 SPKI) the customer's device encrypts the
   * address with. Only the shop admin, holding the private key, can read it.
   */
  addressPublicKey: z.string().nullable(),
  /** Short fingerprint of `addressPublicKey`, to tell keys apart. */
  addressKeyFingerprint: z.string().nullable(),
  createdAt: isoDateTime,
});
export type Shop = z.infer<typeof shop>;

export const shopConfig = shop
  .pick({
    id: true,
    slug: true,
    name: true,
    description: true,
    imageUrl: true,
    isVisible: true,
    vipOnly: true,
    currency: true,
    botUsername: true,
    starsEnabled: true,
    orderFee: true,
    orderFeeLabel: true,
    autoCancelHours: true,
    shippingZones: true,
    addressPublicKey: true,
    addressKeyFingerprint: true,
  })
  .extend({
    /** Ways to pay in crypto (empty when the shop set none). */
    paymentMethods: z.array(paymentMethod),
    /** Whether the current user can manage this shop (shop admin or super-admin). */
    canManage: z.boolean(),
    /** Whether the current user is a VIP of this shop (only checked for VIP-only shops). */
    isVip: z.boolean(),
  });
export type ShopConfig = z.infer<typeof shopConfig>;

/** A shop as listed on the start screen. */
export const shopSummary = shop
  .pick({
    id: true,
    slug: true,
    name: true,
    description: true,
    imageUrl: true,
    isVisible: true,
    vipOnly: true,
  })
  .extend({
    canManage: z.boolean(),
    isVip: z.boolean(),
    /** Units in the user's cart in this shop. */
    cartItems: z.number().int().nonnegative(),
    /** The user's orders here still waiting for a payment. */
    unpaidOrders: z.number().int().nonnegative(),
  });
export type ShopSummary = z.infer<typeof shopSummary>;

/** Everything about a shop that its admins (and super-admins) can see. */
export const shopAdminView = shopConfig.extend({
  sortOrder: z.number().int(),
  adminIds: z.array(telegramUserId),
  paymentSetup: paymentSetup,
});
export type ShopAdminView = z.infer<typeof shopAdminView>;

/** Profile fields a shop's own admins can edit. */
export const shopProfileInput = z.object({
  name: z.string().trim().min(1).max(128),
  description: z.string().trim().max(1024),
  imageUrl: z.url().nullable(),
});
export type ShopProfileInput = z.infer<typeof shopProfileInput>;

/** Fields only platform super-admins can set (create or update a shop). */
export const platformShopInput = shopProfileInput.extend({
  slug,
  isVisible: z.boolean(),
  vipOnly: z.boolean(),
  sortOrder: z.number().int().min(-1000).max(1000),
  adminIds: z.array(telegramUserId).max(50),
});
export type PlatformShopInput = z.infer<typeof platformShopInput>;

export const updateShippingRequest = z.object({
  zones: z
    .array(shippingZone.extend({ id: z.string().min(1).max(64).optional() }))
    .max(50),
});
export type UpdateShippingRequest = z.infer<typeof updateShippingRequest>;

/** Sets (or, with null, removes) the shop's address public key. */
export const updateAddressKeyRequest = z.object({
  publicKey: z.string().trim().min(100).max(4000).nullable(),
});
export type UpdateAddressKeyRequest = z.infer<typeof updateAddressKeyRequest>;

export const updateAutoCancelRequest = z.object({
  hours: z.number().int().min(0).max(720),
});
export type UpdateAutoCancelRequest = z.infer<typeof updateAutoCancelRequest>;

/** When an unpaid order will be cancelled, or null when it will not be. */
export function payBefore(
  order: { status: string; amountPaid: number; amountSubmitted: number; updatedAt: string },
  autoCancelHours: number,
): Date | null {
  if (autoCancelHours <= 0 || order.status !== 'pending') return null;
  if (order.amountPaid > 0 || order.amountSubmitted > 0) return null;
  return new Date(Date.parse(order.updatedAt) + autoCancelHours * 60 * 60 * 1000);
}

/** Replaces the shop's payment setup; each accepted network needs its address. */
export const updatePaymentSetupRequest = paymentSetup.refine(
  (setup) => setup.accepted.every((a) => addressFor(setup, a.chain) !== null),
  { message: 'Each accepted network needs its receiving address' },
);

/** What the customer types; encrypted on their device before it is sent. */
export interface DeliveryAddress {
  name: string;
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  region: string;
  country: string;
  phone: string;
  notes: string;
}

/** Shipping cost of an order with `itemsTotal` worth of products in `zone`. */
export function shippingCost(zone: Pick<ShippingZone, 'price' | 'freeFrom'>, itemsTotal: number): number {
  return zone.freeFrom !== null && itemsTotal >= zone.freeFrom ? 0 : zone.price;
}

/**
 * Platform-wide data retention: how long personal data is kept. A cleanup
 * runs regularly and can be run by hand from Platform admin.
 */
export const retentionSettings = z.object({
  /** Days after an order is delivered or cancelled before its address is deleted and it is unlinked from the customer (the @username stays). */
  addressRetentionDays: z.number().int().min(1).max(3650),
  /** Days an untouched cart is kept. */
  cartRetentionDays: z.number().int().min(1).max(3650),
  /** Days without opening the app before a user with no orders is deleted. */
  inactiveUserDays: z.number().int().min(1).max(3650),
});
export type RetentionSettings = z.infer<typeof retentionSettings>;

export const retentionStatus = retentionSettings.extend({
  lastRunAt: z.string().nullable(),
});
export type RetentionStatus = z.infer<typeof retentionStatus>;

/** What one cleanup run did. */
export const retentionReport = z.object({
  ordersAnonymized: z.number().int().nonnegative(),
  cartsDeleted: z.number().int().nonnegative(),
  usersDeleted: z.number().int().nonnegative(),
  ranAt: z.string(),
});
export type RetentionReport = z.infer<typeof retentionReport>;
