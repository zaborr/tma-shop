import type { Lang } from '@tma-shop/shared';

/**
 * Texts the bot sends (notifications, /start) and that go into exported
 * files, in English, Spanish, Italian and Portuguese. `{name}` placeholders are filled by `tr`.
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

  // The bot was added to a group or channel (to the person who added it)
  'vipGroup.added': '✅ I have been added to "{title}".',
  'vipGroup.useIt': "To use it in a VIP club, add this to the club's groups: {id}",
  'vipGroup.channelAdmin': 'In channels I must be an administrator to see who is subscribed.',

  // Wallet changes (to every admin)
  'wallets.changed': '⚠️ The payment addresses of {shop} were changed by {who}.',
  'wallets.evm': 'Base / Ethereum: {before} → {after}',
  'wallets.solana': 'Solana: {before} → {after}',
  'wallets.checkIt': 'If it was not you or another admin, check it right away: payments would go to the new address.',

  // Automatic payment check
  'check.autoConfirmed': '✅ Payment checked on the blockchain and confirmed automatically',
  'check.overpaid': 'The customer paid {amount} more than due: refund it from the order.',
  'check.failedHeader': '⚠️ Not confirmed automatically: {reason}',
  'check.not_found': 'the transaction was not found on {network}, or is not confirmed yet.',
  'check.tx_failed': 'the transaction failed on the blockchain.',
  'check.no_transfer': 'the transaction does not send this token to the shop address.',
  'check.too_old': 'the transaction is older than the order.',
  'check.short': 'received {received}, expected {expected}.',
  'check.ambiguous': '{count} open orders are waiting for this same amount; check which one it belongs to.',
  'check.stock_short': 'there is not enough stock left to confirm it.',
  'check.no_method': 'the shop no longer accepts that network or token.',
  'check.rpc_error': 'the {network} network could not be reached.',

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

  'vipGroup.added': '✅ Me han añadido a «{title}».',
  'vipGroup.useIt': 'Para usarlo en un club VIP, añade esto a los grupos del club: {id}',
  'vipGroup.channelAdmin': 'En los canales tengo que ser administrador para ver quién está suscrito.',

  'wallets.changed': '⚠️ {who} ha cambiado las direcciones de cobro de {shop}.',
  'wallets.evm': 'Base / Ethereum: {before} → {after}',
  'wallets.solana': 'Solana: {before} → {after}',
  'wallets.checkIt': 'Si no has sido tú ni otro administrador, revísalo ya: los pagos irían a la dirección nueva.',

  'check.autoConfirmed': '✅ Pago comprobado en la blockchain y confirmado automáticamente',
  'check.overpaid': 'El cliente pagó {amount} de más: devuélveselo desde el pedido.',
  'check.failedHeader': '⚠️ No se ha confirmado solo: {reason}',
  'check.not_found': 'la transacción no aparece en {network}, o todavía no está confirmada.',
  'check.tx_failed': 'la transacción falló en la blockchain.',
  'check.no_transfer': 'la transacción no envía este token a la dirección de la tienda.',
  'check.too_old': 'la transacción es anterior al pedido.',
  'check.short': 'recibido {received}, se esperaba {expected}.',
  'check.ambiguous': 'hay {count} pedidos abiertos esperando este mismo importe; comprueba de cuál es.',
  'check.stock_short': 'no queda stock suficiente para confirmarlo.',
  'check.no_method': 'la tienda ya no acepta esa red o token.',
  'check.rpc_error': 'no se ha podido conectar con la red {network}.',

  'export.captionOne': '📊 {shop} — {count} pedido',
  'export.captionOther': '📊 {shop} — {count} pedidos',
};

const it: Record<BotMessageKey, string> = {
  'order.ref': '{shop} · ordine #{id}',
  'order.number': 'Ordine #{id}',
  'line.customer': 'Cliente: {customer}',
  'line.contact': 'Contatto: {contact}',
  'line.amount': 'Importo: {amount}',
  'line.shipping': 'Spedizione: {zone}',
  'line.method': 'Metodo: {method}',
  'line.tx': 'Tx: {tx}',
  'customer.fallback': 'Cliente',

  'admin.paymentToVerify': '💰 Pagamento da verificare',
  'admin.differenceToVerify': '💰 Pagamento della differenza da verificare',
  'admin.openToConfirm': 'Apri il negozio → Admin per confermarlo o annullarlo.',
  'admin.changeRequested': "✏️ Modifica dell'ordine richiesta",
  'admin.newItems': 'Nuovi articoli:',
  'admin.total': 'Totale: {from} → {to}',
  'admin.customerWouldPay': 'Il cliente pagherebbe: {amount}',
  'admin.youWouldRefund': 'Dovresti rimborsare: {amount}',
  'admin.sameAmount': 'Stesso importo, niente da pagare né da rimborsare',
  'admin.openToApprove': 'Apri il negozio → Admin per approvarla o rifiutarla.',

  'change.rejected': "La tua modifica a {ref} non è stata approvata. L'ordine resta com'era.",
  'change.approved': '✅ La tua modifica a {ref} è stata approvata.',
  'change.newTotal': 'Nuovo totale: {amount}',
  'change.payDifference': 'Paga la differenza di {amount}: apri il negozio → I miei ordini.',
  'refund.willRefund': 'Il negozio ti rimborserà {amount}.',
  'status.paid': 'Pagamento confermato per {ref}. Il negozio sta preparando il tuo ordine.',
  'status.rejected': 'Non siamo riusciti a verificare il tuo pagamento per {ref}.',
  'status.rejectedHint': 'Controlla la transazione e inviala di nuovo da I miei ordini nel negozio.',
  'status.partial': 'Abbiamo ricevuto il tuo pagamento per {ref}.',
  'status.partialHint': 'Resta da pagare: {amount}. Apri I miei ordini nel negozio per pagarlo.',
  'status.shipped': 'Il tuo ordine {ref} è stato spedito.',
  'status.tracking': 'Tracciamento: {tracking}',
  'status.delivered': 'Il tuo ordine {ref} è stato consegnato. Grazie!',
  'status.cancelled': 'Il tuo ordine {ref} è stato annullato.',
  'status.shopMessage': 'Messaggio dal negozio: {note}',
  'autoCancel.note': 'Non è stato pagato entro {hours} ore. Puoi fare un nuovo ordine quando vuoi.',

  'start.hello': 'Ciao {name}!',
  'start.helloAnon': 'Ciao!',
  'start.tapButton': 'Tocca il pulsante qui sotto per aprire il negozio.',
  'start.useMenu': 'Apri il negozio con il pulsante menu accanto alla casella di testo.',
  'start.updates':
    "D'ora in poi ti scriverò qui quando i tuoi ordini cambiano: pagamento confermato, spedito, consegnato…",
  'start.button': 'Apri negozio',

  'vipGroup.added': '✅ Sono stato aggiunto a «{title}».',
  'vipGroup.useIt': 'Per usarlo in un club VIP, aggiungi questo ai gruppi del club: {id}',
  'vipGroup.channelAdmin': 'Nei canali devo essere amministratore per vedere chi è iscritto.',

  'wallets.changed': '⚠️ {who} ha cambiato gli indirizzi di pagamento di {shop}.',
  'wallets.evm': 'Base / Ethereum: {before} → {after}',
  'wallets.solana': 'Solana: {before} → {after}',
  'wallets.checkIt': 'Se non sei stato tu o un altro amministratore, controlla subito: i pagamenti andrebbero al nuovo indirizzo.',

  'check.autoConfirmed': '✅ Pagamento controllato sulla blockchain e confermato automaticamente',
  'check.overpaid': "Il cliente ha pagato {amount} in più: rimborsalo dall'ordine.",
  'check.failedHeader': '⚠️ Non confermato automaticamente: {reason}',
  'check.not_found': 'la transazione non è stata trovata su {network}, oppure non è ancora confermata.',
  'check.tx_failed': 'la transazione è fallita sulla blockchain.',
  'check.no_transfer': "la transazione non invia questo token all'indirizzo del negozio.",
  'check.too_old': "la transazione è precedente all'ordine.",
  'check.short': 'ricevuto {received}, previsto {expected}.',
  'check.ambiguous': 'ci sono {count} ordini aperti in attesa dello stesso importo; controlla a quale appartiene.',
  'check.stock_short': 'non ci sono più scorte sufficienti per confermarlo.',
  'check.no_method': 'il negozio non accetta più quella rete o quel token.',
  'check.rpc_error': 'impossibile collegarsi alla rete {network}.',

  'export.captionOne': '📊 {shop} — {count} ordine',
  'export.captionOther': '📊 {shop} — {count} ordini',
};

const pt: Record<BotMessageKey, string> = {
  'order.ref': '{shop} · pedido #{id}',
  'order.number': 'Pedido #{id}',
  'line.customer': 'Cliente: {customer}',
  'line.contact': 'Contacto: {contact}',
  'line.amount': 'Valor: {amount}',
  'line.shipping': 'Envio: {zone}',
  'line.method': 'Método: {method}',
  'line.tx': 'Tx: {tx}',
  'customer.fallback': 'Cliente',

  'admin.paymentToVerify': '💰 Pagamento por verificar',
  'admin.differenceToVerify': '💰 Pagamento da diferença por verificar',
  'admin.openToConfirm': 'Abra a loja → Admin para o confirmar ou cancelar.',
  'admin.changeRequested': '✏️ Alteração de pedido solicitada',
  'admin.newItems': 'Novos artigos:',
  'admin.total': 'Total: {from} → {to}',
  'admin.customerWouldPay': 'O cliente pagaria: {amount}',
  'admin.youWouldRefund': 'Teria de reembolsar: {amount}',
  'admin.sameAmount': 'Mesmo valor, nada a pagar nem a reembolsar',
  'admin.openToApprove': 'Abra a loja → Admin para a aprovar ou rejeitar.',

  'change.rejected': 'A sua alteração em {ref} não foi aprovada. O pedido fica como estava.',
  'change.approved': '✅ A sua alteração em {ref} foi aprovada.',
  'change.newTotal': 'Novo total: {amount}',
  'change.payDifference': 'Pague a diferença de {amount}: abra a loja → Os meus pedidos.',
  'refund.willRefund': 'A loja vai reembolsar {amount}.',
  'status.paid': 'Pagamento confirmado em {ref}. A loja está a preparar o seu pedido.',
  'status.rejected': 'Não foi possível verificar o seu pagamento em {ref}.',
  'status.rejectedHint': 'Verifique a transação e envie-a de novo em Os meus pedidos, na loja.',
  'status.partial': 'Recebemos o seu pagamento em {ref}.',
  'status.partialHint': 'Falta pagar: {amount}. Abra Os meus pedidos na loja para o pagar.',
  'status.shipped': 'O seu pedido {ref} foi enviado.',
  'status.tracking': 'Rastreio: {tracking}',
  'status.delivered': 'O seu pedido {ref} foi entregue. Obrigado!',
  'status.cancelled': 'O seu pedido {ref} foi cancelado.',
  'status.shopMessage': 'Mensagem da loja: {note}',
  'autoCancel.note': 'Não foi pago em {hours} horas. Pode fazer um novo pedido quando quiser.',

  'start.hello': 'Olá, {name}!',
  'start.helloAnon': 'Olá!',
  'start.tapButton': 'Toque no botão abaixo para abrir a loja.',
  'start.useMenu': 'Abra a loja com o botão de menu ao lado da caixa de texto.',
  'start.updates':
    'A partir de agora escrevo-lhe aqui quando os seus pedidos mudarem: pagamento confirmado, enviado, entregue…',
  'start.button': 'Abrir loja',

  'vipGroup.added': '✅ Fui adicionado a «{title}».',
  'vipGroup.useIt': 'Para o usar num clube VIP, adicione isto aos grupos do clube: {id}',
  'vipGroup.channelAdmin': 'Nos canais tenho de ser administrador para ver quem está inscrito.',

  'wallets.changed': '⚠️ {who} alterou os endereços de pagamento de {shop}.',
  'wallets.evm': 'Base / Ethereum: {before} → {after}',
  'wallets.solana': 'Solana: {before} → {after}',
  'wallets.checkIt': 'Se não foi você nem outro administrador, verifique já: os pagamentos iriam para o novo endereço.',

  'check.autoConfirmed': '✅ Pagamento verificado na blockchain e confirmado automaticamente',
  'check.overpaid': 'O cliente pagou {amount} a mais: reembolse-o a partir do pedido.',
  'check.failedHeader': '⚠️ Não confirmado automaticamente: {reason}',
  'check.not_found': 'a transação não foi encontrada em {network}, ou ainda não está confirmada.',
  'check.tx_failed': 'a transação falhou na blockchain.',
  'check.no_transfer': 'a transação não envia este token para o endereço da loja.',
  'check.too_old': 'a transação é anterior ao pedido.',
  'check.short': 'recebido {received}, esperado {expected}.',
  'check.ambiguous': 'há {count} pedidos abertos à espera deste mesmo valor; verifique a qual pertence.',
  'check.stock_short': 'já não há stock suficiente para o confirmar.',
  'check.no_method': 'a loja já não aceita essa rede ou token.',
  'check.rpc_error': 'não foi possível ligar à rede {network}.',

  'export.captionOne': '📊 {shop} — {count} pedido',
  'export.captionOther': '📊 {shop} — {count} pedidos',
};

const dictionaries: Record<Lang, Record<BotMessageKey, string>> = { en, es, it, pt };

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
