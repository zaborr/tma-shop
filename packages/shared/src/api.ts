import { z } from 'zod';
import { id } from './common.js';
import { sessionUser } from './user.js';
import { cartItemInput } from './cart.js';

/** Client posts the raw Telegram `initData` query string for server validation. */
export const authRequest = z.object({
  initData: z.string().min(1),
});
export type AuthRequest = z.infer<typeof authRequest>;

export const authResponse = z.object({
  token: z.string().min(1),
  expiresAt: z.iso.datetime(),
  user: sessionUser,
});
export type AuthResponse = z.infer<typeof authResponse>;

export const addToCartRequest = cartItemInput;
export type AddToCartRequest = z.infer<typeof addToCartRequest>;

export const updateCartItemRequest = z.object({
  quantity: z.number().int().min(0).max(999),
});
export type UpdateCartItemRequest = z.infer<typeof updateCartItemRequest>;

/** Telegram username rules: 5–32 chars, letters, digits and underscores. */
export const telegramUsername = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@/, ''))
  .pipe(
    z
      .string()
      .regex(
        /^[A-Za-z0-9_]{5,32}$/,
        'Enter a valid Telegram username (5–32 letters, digits or _)',
      ),
  );

/** Checkout details sent when creating an order. */
export const createOrderRequest = z.object({
  contactUsername: telegramUsername,
});
export type CreateOrderRequest = z.input<typeof createOrderRequest>;

/** Order is created from the caller's current server-side cart. */
export const createOrderResponse = z.object({
  orderId: id,
});
export type CreateOrderResponse = z.infer<typeof createOrderResponse>;

/** Response of the Stars invoice endpoint — link is opened via `openInvoice`. */
export const invoiceResponse = z.object({
  invoiceLink: z.url(),
});
export type InvoiceResponse = z.infer<typeof invoiceResponse>;

/** Admin sets the per-order fee (0 hides it) and its label. */
export const updateOrderFeeRequest = z.object({
  orderFee: z.number().int().nonnegative().max(100_000_000),
  orderFeeLabel: z.string().trim().min(1).max(64),
});
export type UpdateOrderFeeRequest = z.infer<typeof updateOrderFeeRequest>;

/** Customer asks to change a paid order: the complete new list of lines. */
export const requestOrderChangeRequest = z.object({
  items: z
    .array(
      z.object({
        productId: id,
        quantity: z.number().int().positive().max(999),
      }),
    )
    .min(1, 'Keep at least one product (or ask the shop to cancel the order)')
    .max(100),
});
export type RequestOrderChangeRequest = z.infer<typeof requestOrderChangeRequest>;

/** Customer reports a crypto payment: which wallet they paid and the tx hash. */
export const submitPaymentRequest = z.object({
  methodId: z.string().min(1).max(64),
  txHash: z
    .string()
    .trim()
    .min(8, 'Transaction hash looks too short')
    .max(200, 'Transaction hash looks too long')
    .regex(/^[A-Za-z0-9]+$/, 'Paste only the transaction hash (letters and numbers)'),
});
export type SubmitPaymentRequest = z.infer<typeof submitPaymentRequest>;

export const apiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiError>;
