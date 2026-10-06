import type { Order } from '@tma-shop/shared';
import { TelegramApi } from '../telegram/api.js';

function money(amount: number, currency: string): string {
  if (currency === 'XTR') return `${amount} XTR`;
  return `${(amount / 100).toFixed(2)} ${currency}`;
}

function contactLine(order: Order): string {
  return `Contact: ${order.contactUsername ? `@${order.contactUsername}` : '—'}`;
}

/** Plain-text summary of an order waiting for manual payment verification. */
export function buildPaymentReviewMessage(order: Order, customer: string): string {
  const amount = order.amountSubmitted > 0 ? order.amountSubmitted : order.amountDue;
  const lines = [
    order.amountPaid > 0 ? '💰 Difference payment to verify' : '💰 Payment to verify',
    '',
    `Order #${order.id.slice(0, 8)}`,
    `Customer: ${customer}`,
    contactLine(order),
    `Amount: ${money(amount, order.currency)}`,
    `Method: ${order.paymentNetwork ?? '—'}`,
    `Tx: ${order.paymentTxHash ?? '—'}`,
  ];
  if (order.paymentTxUrl) lines.push('', order.paymentTxUrl);
  lines.push('', 'Open the shop → Admin to confirm or cancel it.');
  return lines.join('\n');
}

/** Tells admins a customer wants to modify a paid order. */
export function buildChangeRequestMessage(order: Order, customer: string): string {
  const change = order.changeRequest;
  if (!change) return '';
  const diff = change.total - order.amountPaid;
  const lines = [
    '✏️ Order change requested',
    '',
    `Order #${order.id.slice(0, 8)}`,
    `Customer: ${customer}`,
    contactLine(order),
    '',
    'New items:',
    ...change.items.map((item) => `• ${item.quantity}× ${item.title}`),
    '',
    `Total: ${money(order.total, order.currency)} → ${money(change.total, order.currency)}`,
    diff > 0
      ? `Customer would pay: ${money(diff, order.currency)}`
      : diff < 0
        ? `You would refund: ${money(-diff, order.currency)}`
        : 'Same amount, nothing to pay or refund',
    '',
    'Open the shop → Admin to approve or reject it.',
  ];
  return lines.join('\n');
}

/** Tells the customer what happened to their change request. */
export function buildChangeDecisionMessage(order: Order, approved: boolean): string {
  const ref = `order #${order.id.slice(0, 8)}`;
  if (!approved) {
    return `Your change request for ${ref} was not approved. The order stays as it was.`;
  }
  const lines = [`✅ Your change to ${ref} was approved.`, `New total: ${money(order.total, order.currency)}`];
  if (order.amountDue > 0) {
    lines.push(
      `Please pay the difference of ${money(order.amountDue, order.currency)}: open the shop → My orders.`,
    );
  } else if (order.amountDue < 0) {
    lines.push(`The shop will refund you ${money(-order.amountDue, order.currency)}.`);
  }
  return lines.join('\n');
}

/**
 * Sends a message to each chat. Best effort: a failure (e.g. a user who never
 * started the bot) is logged, never thrown.
 */
export async function notifyChats(
  botToken: string,
  chatIds: number[],
  text: string,
  telegram = new TelegramApi(botToken),
): Promise<void> {
  if (!text) return;
  await Promise.all(
    chatIds.map(async (chatId) => {
      try {
        await telegram.sendMessage(chatId, text);
      } catch (error) {
        console.error(`Could not notify chat ${chatId}:`, error);
      }
    }),
  );
}

/** Tells every admin that an order needs payment verification. */
export async function notifyAdminsOfPayment(
  botToken: string,
  adminIds: number[],
  order: Order,
  customer: string,
): Promise<void> {
  await notifyChats(botToken, adminIds, buildPaymentReviewMessage(order, customer));
}
