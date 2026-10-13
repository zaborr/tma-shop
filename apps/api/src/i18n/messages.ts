import type { Lang } from '@tma-shop/shared';

/**
 * Texts the bot sends (notifications, /start) and that go into exported
 * files, in English and Spanish. `{name}` placeholders are filled by `tr`.
 */
const en = {
  // Shared bits
  'order.ref': '{shop} · order #{id}',
  'order.number': 'Order #{id}',
  'line.customer': 'Customer: {customer}',
  'line.contact': 'Contact: {contact}',
  'line.amount': 'Amount: {amount}',
  'line.shipping': 'Shipping: {zone}',
  'line.method': 'Method: {method}',
  'line.tx': 'Tx: {tx}',
  'customer.fallback': 'Customer',

  // To admins
  'admin.paymentToVerify': '💰 Payment to verify',
  'admin.differenceToVerify': '💰 Difference payment to verify',
  'admin.openToConfirm': 'Open the shop → Admin to confirm or cancel it.',
  'admin.changeRequested': '✏️ Order change requested',
  'admin.newItems': 'New items:',
  'admin.total': 'Total: {from} → {to}',
  'admin.customerWouldPay': 'Customer would pay: {amount}',
  'admin.youWouldRefund': 'You would refund: {amount}',
  'admin.sameAmount': 'Same amount, nothing to pay or refund',
  'admin.openToApprove': 'Open the shop → Admin to approve or reject it.',

  // To customers
  'change.rejected': 'Your change request for {ref} was not approved. The order stays as it was.',
  'change.approved': '✅ Your change to {ref} was approved.',
  'change.newTotal': 'New total: {amount}',
  'change.payDifference': 'Please pay the difference of {amount}: open the shop → My orders.',
  'refund.willRefund': 'The shop will refund you {amount}.',
  'status.paid': 'Payment confirmed for {ref}. The shop is preparing your order.',
  'status.rejected': 'We could not verify your payment for {ref}.',
  'status.rejectedHint': 'Check the transaction and send it again from My orders in the shop.',
  'status.partial': 'We received your payment for {ref}.',
  'status.partialHint': 'Still to pay: {amount}. Open My orders in the shop to pay it.',
  'status.shipped': 'Your order {ref} has been shipped.',
  'status.tracking': 'Tracking: {tracking}',
  'status.delivered': 'Your order {ref} has been delivered. Thank you!',
  'status.cancelled': 'Your order {ref} was cancelled.',
  'status.shopMessage': 'Message from the shop: {note}',
  'autoCancel.note': 'It was not paid within {hours} hours. You can place a new order any time.',

  // /start
  'start.hello': 'Hi {name}!',
  'start.helloAnon': 'Hi!',
  'start.tapButton': 'Tap the button below to open the shop.',
  'start.useMenu': 'Open the shop with the menu button next to the message box.',
  'start.updates':
    'From now on I will message you here when your orders change: payment confirmed, shipped, delivered…',
  'start.button': 'Open shop',

  // Exports
  'export.captionOne': '📊 {shop} — {count} order',
  'export.captionOther': '📊 {shop} — {count} orders',
} as const;

export type BotMessageKey = keyof typeof en;

const es: Record<BotMessageKey, string> = {
  'order.ref': '{shop} · pedido #{id}',
  'order.number': 'Pedido #{id}',
  'line.customer': 'Cliente: {customer}',
  'line.contact': 'Contacto: {contact}',
  'line.amount': 'Importe: {amount}',
  'line.shipping': 'Envío: {zone}',
  'line.method': 'Método: {method}',
  'line.tx': 'Tx: {tx}',
  'customer.fallback': 'Cliente',

  'admin.paymentToVerify': '💰 Pago por comprobar',
  'admin.differenceToVerify': '💰 Pago de la diferencia por comprobar',
  'admin.openToConfirm': 'Abre la tienda → Administrar para confirmarlo o cancelarlo.',
  'admin.changeRequested': '✏️ Cambio de pedido solicitado',
  'admin.newItems': 'Artículos nuevos:',
  'admin.total': 'Total: {from} → {to}',
  'admin.customerWouldPay': 'El cliente pagaría: {amount}',
  'admin.youWouldRefund': 'Tendrías que devolver: {amount}',
  'admin.sameAmount': 'Mismo importe, nada que pagar ni devolver',
  'admin.openToApprove': 'Abre la tienda → Administrar para aprobarlo o rechazarlo.',

  'change.rejected': 'Tu cambio en {ref} no se ha aprobado. El pedido se queda como estaba.',
  'change.approved': '✅ Se ha aprobado tu cambio en {ref}.',
  'change.newTotal': 'Nuevo total: {amount}',
  'change.payDifference': 'Paga la diferencia de {amount}: abre la tienda → Mis pedidos.',
  'refund.willRefund': 'La tienda te devolverá {amount}.',
  'status.paid': 'Pago confirmado en {ref}. La tienda está preparando tu pedido.',
  'status.rejected': 'No hemos podido verificar tu pago en {ref}.',
  'status.rejectedHint': 'Revisa la transacción y vuelve a enviarla desde Mis pedidos en la tienda.',
  'status.partial': 'Hemos recibido tu pago en {ref}.',
  'status.partialHint': 'Falta por pagar: {amount}. Abre Mis pedidos en la tienda para pagarlo.',
  'status.shipped': 'Tu pedido {ref} ya está enviado.',
  'status.tracking': 'Seguimiento: {tracking}',
  'status.delivered': 'Tu pedido {ref} se ha entregado. ¡Gracias!',
  'status.cancelled': 'Tu pedido {ref} se ha cancelado.',
  'status.shopMessage': 'Mensaje de la tienda: {note}',
  'autoCancel.note': 'No se pagó en {hours} horas. Puedes hacer un pedido nuevo cuando quieras.',

  'start.hello': '¡Hola, {name}!',
  'start.helloAnon': '¡Hola!',
  'start.tapButton': 'Pulsa el botón de abajo para abrir la tienda.',
  'start.useMenu': 'Abre la tienda con el botón de menú junto a la caja de texto.',
  'start.updates':
    'A partir de ahora te escribiré aquí cuando cambien tus pedidos: pago confirmado, enviado, entregado…',
  'start.button': 'Abrir tienda',

  'export.captionOne': '📊 {shop} — {count} pedido',
  'export.captionOther': '📊 {shop} — {count} pedidos',
};

const dictionaries: Record<Lang, Record<BotMessageKey, string>> = { en, es };

/** Text for `key` in `lang`, with `{name}` placeholders filled from `vars`. */
export function tr(lang: Lang, key: BotMessageKey, vars?: Record<string, string | number>): string {
  let text = dictionaries[lang][key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
