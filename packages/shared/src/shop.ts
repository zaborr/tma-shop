import { z } from 'zod';
import { currencyCode, id, isoDateTime, slug } from './common.js';
import { telegramUserId } from './user.js';

/**
 * A shop (store). One deployment hosts several shops; each has its own catalog,
 * carts, orders, wallets, fee and admins. Platform super-admins (configured on
 * the API) create shops, hide them and assign their admins.
 */
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
  createdAt: isoDateTime,
});
export type Shop = z.infer<typeof shop>;

/**
 * A wallet as the admin enters it. Several networks and/or tokens that share
 * one address can be joined with "/" (`Ethereum/Base`, `USDC/EURC`); the shop
 * expands them into one payment method per combination.
 */
export const walletInput = z.object({
  network: z.string().trim().min(1).max(128),
  token: z.string().trim().min(1).max(64),
  address: z.string().trim().min(1).max(128),
});
export type WalletInput = z.infer<typeof walletInput>;

/**
 * A crypto wallet the customer can pay into (one network + one token), derived
 * from the shop's wallets. Payments are verified manually.
 */
export const paymentMethod = z.object({
  /** Stable identifier, e.g. `usdc-base`. */
  id: z.string().min(1).max(64),
  /** Network name shown to the customer, e.g. `Base`, `Solana`, `Polygon`. */
  network: z.string().min(1).max(64),
  /** Token symbol, e.g. `USDC` or `EURC`. */
  token: z.string().min(1).max(16),
  /** Receiving wallet address on that network. */
  address: z.string().min(1).max(128),
});
export type PaymentMethod = z.infer<typeof paymentMethod>;

export const shopConfig = shop
  .pick({
    id: true,
    slug: true,
    name: true,
    description: true,
    imageUrl: true,
    isVisible: true,
    currency: true,
    botUsername: true,
    starsEnabled: true,
    orderFee: true,
    orderFeeLabel: true,
  })
  .extend({
    /** Crypto wallets for manual-verification checkout (empty when not configured). */
    paymentMethods: z.array(paymentMethod),
    /** Whether the current user can manage this shop (shop admin or super-admin). */
    canManage: z.boolean(),
  });
export type ShopConfig = z.infer<typeof shopConfig>;

/** A shop as listed on the start screen. */
export const shopSummary = shop
  .pick({ id: true, slug: true, name: true, description: true, imageUrl: true, isVisible: true })
  .extend({ canManage: z.boolean() });
export type ShopSummary = z.infer<typeof shopSummary>;

/** Everything about a shop that its admins (and super-admins) can see. */
export const shopAdminView = shopConfig.extend({
  sortOrder: z.number().int(),
  adminIds: z.array(telegramUserId),
  wallets: z.array(walletInput),
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
  sortOrder: z.number().int().min(-1000).max(1000),
  adminIds: z.array(telegramUserId).max(50),
});
export type PlatformShopInput = z.infer<typeof platformShopInput>;

export const updateWalletsRequest = z.object({
  wallets: z.array(walletInput).max(50),
});
export type UpdateWalletsRequest = z.infer<typeof updateWalletsRequest>;
