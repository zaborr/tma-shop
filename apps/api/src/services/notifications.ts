import type { Order } from '@tma-shop/shared';
import { TelegramApi } from '../telegram/api.js';

function formatAmount(order: Order): string {
  if (order.currency === 'XTR') return `${order.total} XTR`;
  return `${(order.total / 100).toFixed(2)} ${order.currency}`;
}

/** Plain-text summary of an order waiting for manual payment verification. */
export function buildPaymentReviewMessage(order: Order, customer: string): string {
  const lines = [
    '💰 Payment to verify',
    '',
    `Order #${order.id.slice(0, 8)}`,
    `Customer: ${customer}`,
    `Amount: ${formatAmount(order)}`,
    `Method: ${order.paymentNetwork ?? '—'}`,
    `Tx: ${order.paymentTxHash ?? '—'}`,
  ];
  if (order.paymentTxUrl) lines.push('', order.paymentTxUrl);
  lines.push('', 'Open the shop → Admin to confirm or cancel it.');
  return lines.join('\n');
}

/**
 * Tells every admin that an order needs payment verification. Best effort: a
 * failure (e.g. an admin who never started the bot) is logged, never thrown.
 */
export async function notifyAdminsOfPayment(
  botToken: string,
  adminIds: number[],
  order: Order,
  customer: string,
  telegram = new TelegramApi(botToken),
): Promise<void> {
  const text = buildPaymentReviewMessage(order, customer);
  await Promise.all(
    adminIds.map(async (adminId) => {
      try {
        await telegram.sendMessage(adminId, text);
      } catch (error) {
        console.error(`Could not notify admin ${adminId}:`, error);
      }
    }),
  );
}
