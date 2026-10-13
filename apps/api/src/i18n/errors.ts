import type { Lang } from '@tma-shop/shared';

/**
 * Spanish versions of the API's error messages. Errors are written in English
 * in the code; this table translates them when the app asks for Spanish
 * (`X-Lang: es`). Unknown messages are returned as they are.
 */

const STATUS_ES: Record<string, string> = {
  pending: 'pendiente de pago',
  awaiting_payment: 'con un pago en revisión',
  paid: 'pagado',
  cancelled: 'cancelado',
  shipped: 'enviado',
  fulfilled: 'entregado',
};

type Rule = [RegExp, string | ((...groups: string[]) => string)];

const RULES: Rule[] = [
  [/^Enter your delivery address$/, 'Escribe tu dirección de entrega'],
  [/^Cannot create an order from an empty cart$/, 'No se puede hacer un pedido con el carrito vacío'],
  [/^Option names must be different$/, 'Los nombres de las opciones tienen que ser distintos'],
  [/^"(.+)" has repeated values$/, (n) => `«${n}» tiene valores repetidos`],
  [/^Invalid quantity for "(.+)"$/, (n) => `Cantidad no válida para «${n}»`],
  [/^Order total must be positive$/, 'El total del pedido tiene que ser mayor que cero'],
  [/^A product with options needs at least one variant$/, 'Un producto con opciones necesita al menos una variante'],
  [/^Add options before adding variants$/, 'Añade opciones antes de añadir variantes'],
  [/^Each variant needs one value per option$/, 'Cada variante necesita un valor por opción'],
  [/^The same combination appears twice$/, 'La misma combinación aparece dos veces'],
  [/^Each wallet needs a network and a token$/, 'Cada wallet necesita una red y un token'],
  [/^Two shipping zones have the same name$/, 'Hay dos zonas de envío con el mismo nombre'],
  [/^The name does not match the shop name$/, 'El nombre no coincide con el de la tienda'],
  [/^The order is unchanged$/, 'El pedido no ha cambiado'],
  [/^This product has no variants$/, 'Este producto no tiene variantes'],
  [/^"(.+)" has no options$/, (n) => `«${n}» no tiene opciones`],
  [/^No orders match these filters$/, 'Ningún pedido coincide con estos filtros'],
  [/^Choose a shipping zone$/, 'Elige una zona de envío'],
  [/^Stars payments are disabled$/, 'Los pagos con Stars están desactivados'],
  [/^Unknown payment method$/, 'Forma de pago desconocida'],
  [/^A product in the change is no longer available$/, 'Un producto del cambio ya no está disponible'],
  [/^Choose an available option for "(.+)"$/, (n) => `Elige una opción disponible de «${n}»`],
  [/^Choose an option for "(.+)"$/, (n) => `Elige una opción de «${n}»`],
  [/^Order is already paid$/, 'El pedido ya está pagado'],
  [/^There is no change to approve$/, 'No hay ningún cambio que aprobar'],
  [/^Order is (\w+) and cannot be changed$/, (s) => `El pedido está ${STATUS_ES[s] ?? s} y no se puede cambiar`],
  [/^Order is (\w+) and cannot take a payment$/, (s) => `El pedido está ${STATUS_ES[s] ?? s} y no admite pagos`],
  [/^An order that is (\w+) cannot be set to (\w+)$/, (a, b) => `Un pedido ${STATUS_ES[a] ?? a} no puede pasar a ${STATUS_ES[b] ?? b}`],
  [/^Nothing is left to pay for this order$/, 'No queda nada por pagar en este pedido'],
  [/^Nothing is owed to the customer$/, 'No hay nada que devolver al cliente'],
  [/^The order changed meanwhile\. Reload it\.$/, 'El pedido ha cambiado mientras tanto. Vuelve a cargarlo.'],
  [/^Only (\d+) of "(.+)" in stock$/, (n, p) => `Solo quedan ${n} de «${p}»`],
  [/^Only (\d+) of "(.+)" available$/, (n, p) => `Solo hay ${n} disponibles de «${p}»`],
  [/^Not enough stock of "(.+)" \((\d+) left\) to approve$/, (p, n) => `No hay stock suficiente de «${p}» (quedan ${n}) para aprobarlo`],
  [/^Not enough stock for this order: (.+)\. Confirm anyway, or reject the payment\.$/, (list) =>
    `No hay stock suficiente para este pedido: ${list.replace(/: (\d+) left, order needs (\d+)/g, ': quedan $1, el pedido necesita $2')}. Confírmalo igualmente o rechaza el pago.`],
  [/^A category with the slug "(.+)" already exists$/, (s) => `Ya existe una categoría con el enlace «${s}»`],
  [/^A product with the slug "(.+)" already exists$/, (s) => `Ya existe un producto con el enlace «${s}»`],
  [/^A shop with the slug "(.+)" already exists$/, (s) => `Ya existe una tienda con el enlace «${s}»`],
  [/^This transaction was already used for a payment$/, 'Esta transacción ya se usó para otro pago'],
  [/^Platform admin role required$/, 'Hace falta ser administrador de la plataforma'],
  [/^Shop admin role required$/, 'Hace falta ser administrador de la tienda'],
  [/^Category not found$/, 'Categoría no encontrada'],
  [/^Item is not in the cart$/, 'Ese artículo no está en el carrito'],
  [/^Order not found$/, 'Pedido no encontrado'],
  [/^Product not found$/, 'Producto no encontrado'],
  [/^Shop not found$/, 'Tienda no encontrada'],
  [/^That option is no longer available$/, 'Esa opción ya no está disponible'],
  [/^Invalid or expired token$/, 'La sesión ha caducado. Vuelve a abrir la app.'],
  [/^Missing bearer token$/, 'Falta la sesión. Vuelve a abrir la app.'],
  [/^initData does not contain a user$/, 'Telegram no ha enviado tu usuario. Vuelve a abrir la app.'],
  [/^initData validation failed \((.+)\)$/, (code) => `No se pudo verificar tu sesión de Telegram (${code})`],
  [/^No shop configured — create one first$/, 'No hay ninguna tienda configurada todavía'],
  [/^Orders with a submitted or confirmed payment cannot be deleted\. Contact the shop\.$/, 'Los pedidos con un pago enviado o confirmado no se pueden borrar. Escribe a la tienda.'],
  [/^The bot could not send you the file\. Open your chat with the bot, press Start, and try again\.$/, 'El bot no ha podido mandarte el archivo. Abre tu chat con el bot, pulsa Iniciar y vuelve a intentarlo.'],
  [/^This shop has orders and cannot be deleted\. Hide it instead\.$/, 'Esta tienda tiene pedidos y no se puede borrar así. Ocúltala o usa «Borrar tienda…».'],
  [/^Keep at least one product \(or ask the shop to cancel the order\)$/, 'Deja al menos un producto (o pide a la tienda que cancele el pedido)'],
  [/^That is not an RSA public key of 2048 bits or more/, 'Eso no es una clave pública RSA de 2048 bits o más («BEGIN PUBLIC KEY»)'],
  [/^Your cart has (\w+) products and this one is priced in (\w+)\. Check out or empty the cart first\.$/, (a, b) =>
    `Tu carrito tiene productos en ${a} y este está en ${b}. Haz el pedido o vacía el carrito primero.`],
  [/^"(.+)" is not a value of "(.+)"$/, (v, o) => `«${v}» no es un valor de «${o}»`],
  [/^The cart mixes currencies; remove the items priced in the other token$/, 'El carrito mezcla monedas; quita los productos de la otra moneda'],
  [/^This shop cannot take orders with delivery yet\. Please try again later\.$/, 'Esta tienda todavía no admite pedidos con envío. Inténtalo más tarde.'],
  [/^The shop updated its security key\. Please reopen the shop and try again\.$/, 'La tienda ha cambiado su clave de seguridad. Vuelve a abrir la tienda e inténtalo de nuevo.'],
  [/^Only paid orders, or orders whose payment is being verified, can be changed$/, 'Solo se pueden cambiar pedidos pagados o con el pago en revisión'],
  [/^"(.+)" is priced in (\w+); this order is in (\w+)$/, (p, a, b) => `«${p}» está en ${a} y este pedido en ${b}`],
];

/** The error message in the requested language. */
export function translateError(message: string, lang: Lang): string {
  if (lang !== 'es') return message;
  for (const [pattern, out] of RULES) {
    const match = pattern.exec(message);
    if (match) return typeof out === 'string' ? out : out(...match.slice(1));
  }
  return message;
}
