import { z } from 'zod';
import { currencyCode, id, isoDateTime } from './common.js';

/**
 * Shop configuration makes the store "universal": a single deployment is driven
 * entirely by this record (name, branding, currency). Multi-tenant support is a
 * future path — today one configured shop is active at a time.
 */
export const shop = z.object({
  id,
  name: z.string().min(1).max(128),
  description: z.string().max(1024),
  currency: currencyCode,
  /** Telegram bot username that hosts the Mini App, without the leading `@`. */
  botUsername: z.string().max(64).nullable(),
  /** Whether checkout is paid with Telegram Stars. */
  starsEnabled: z.boolean(),
  createdAt: isoDateTime,
});
export type Shop = z.infer<typeof shop>;

/**
 * A crypto wallet the customer can pay into. Configured on the API through the
 * `PAYMENT_METHODS` environment variable; payments are verified manually.
 */
export const paymentMethod = z.object({
  /** Stable identifier, e.g. `usdc-base`. */
  id: z.string().min(1).max(64),
  /** Network name shown to the customer, e.g. `Base`, `Solana`, `Polygon`. */
  network: z.string().min(1).max(64),
  /** Token symbol, e.g. `USDC` or `USDT`. */
  token: z.string().min(1).max(16),
  /** Receiving wallet address on that network. */
  address: z.string().min(1).max(128),
});
export type PaymentMethod = z.infer<typeof paymentMethod>;

export const shopConfig = shop
  .pick({
    id: true,
    name: true,
    description: true,
    currency: true,
    botUsername: true,
    starsEnabled: true,
  })
  .extend({
    /** Crypto wallets for manual-verification checkout (empty when not configured). */
    paymentMethods: z.array(paymentMethod),
  });
export type ShopConfig = z.infer<typeof shopConfig>;
