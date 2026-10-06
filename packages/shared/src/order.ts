import { z } from 'zod';
import { currencyCode, id, isoDateTime, moneyAmount } from './common.js';
import { telegramUserId } from './user.js';

export const orderStatus = z.enum([
  'pending', // created, not yet paid
  'awaiting_payment', // Stars invoice issued, or crypto tx submitted and waiting for manual review
  'paid', // payment confirmed
  'cancelled',
  'fulfilled',
]);
export type OrderStatus = z.infer<typeof orderStatus>;

/** Line item snapshot — title and price are frozen at order time. */
export const orderItem = z.object({
  productId: id,
  title: z.string().min(1).max(256),
  unitPrice: moneyAmount,
  quantity: z.number().int().positive(),
  subtotal: moneyAmount,
});
export type OrderItem = z.infer<typeof orderItem>;

/** A customer's requested modification, waiting for admin approval. */
export const orderChangeRequest = z.object({
  /** The full new item list (replaces the current items once approved). */
  items: z.array(orderItem).min(1),
  total: moneyAmount,
  requestedAt: z.string(),
});
export type OrderChangeRequest = z.infer<typeof orderChangeRequest>;

/** A confirmed payment received, or a refund sent back to the customer. */
export const paymentLogEntry = z.object({
  type: z.enum(['payment', 'refund']),
  amount: moneyAmount,
  network: z.string().nullable(),
  txHash: z.string().nullable(),
  at: z.string(),
});
export type PaymentLogEntry = z.infer<typeof paymentLogEntry>;

export const order = z.object({
  id,
  shopId: id,
  userId: telegramUserId,
  status: orderStatus,
  items: z.array(orderItem).min(1),
  /** Total including `fee`. */
  total: moneyAmount,
  /** Per-order fee charged once, frozen when the order was created. */
  fee: moneyAmount,
  currency: currencyCode,
  /** Telegram payment charge id once paid. */
  paymentChargeId: z.string().nullable(),
  /** Crypto payment method chosen by the customer, e.g. "USDC · Base". */
  paymentNetwork: z.string().nullable(),
  /** Transaction hash submitted by the customer for manual verification. */
  paymentTxHash: z.string().nullable(),
  /** Block-explorer link for `paymentTxHash`, when the network is known. */
  paymentTxUrl: z.string().nullable(),
  /** Customer's Telegram username (without @), given at checkout for contact. */
  contactUsername: z.string().nullable(),
  /** Confirmed money received, net of refunds. */
  amountPaid: moneyAmount,
  /** `total - amountPaid`: >0 still to pay, <0 to refund to the customer. */
  amountDue: z.number().int(),
  /** Amount covered by the transaction currently awaiting verification. */
  amountSubmitted: moneyAmount,
  /** Pending modification requested by the customer, if any. */
  changeRequest: orderChangeRequest.nullable(),
  /** Confirmed payments and refunds, oldest first. */
  paymentLog: z.array(paymentLogEntry),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Order = z.infer<typeof order>;
