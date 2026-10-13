import { isSaleStatus, type ExportRequest, type ExportScope, type Order } from '@tma-shop/shared';
import { buildCsv, buildXlsx, type CellValue, type Sheet } from './xlsx.js';

export interface CustomerInfo {
  name: string;
  username: string | null;
}

export interface ReportInput {
  shopName: string;
  shopSlug: string;
  feeLabel: string;
  orders: Order[];
  customers: Map<number, CustomerInfo>;
  request: ExportRequest;
  now?: Date;
}

export interface ReportFile {
  fileName: string;
  contentType: string;
  data: Buffer;
  orderCount: number;
}

const SCOPE_LABEL: Record<ExportScope, string> = {
  paid: 'Paid (incl. shipped and delivered)',
  toFulfil: 'Paid, not shipped yet',
  shipped: 'Shipped',
  fulfilled: 'Delivered',
  unpaid: 'Not paid / verifying',
  cancelled: 'Cancelled',
  all: 'All orders',
};

const STATUS_LABEL: Record<Order['status'], string> = {
  pending: 'Not paid',
  awaiting_payment: 'Verifying payment',
  paid: 'Paid',
  shipped: 'Shipped',
  fulfilled: 'Delivered',
  cancelled: 'Cancelled',
};

export function matchesScope(order: Order, scope: ExportScope): boolean {
  switch (scope) {
    case 'paid':
      return isSaleStatus(order.status);
    case 'toFulfil':
      return order.status === 'paid';
    case 'shipped':
      return order.status === 'shipped';
    case 'fulfilled':
      return order.status === 'fulfilled';
    case 'unpaid':
      return order.status === 'pending' || order.status === 'awaiting_payment';
    case 'cancelled':
      return order.status === 'cancelled';
    case 'all':
      return true;
  }
}

/** Orders in scope and in the [from, to) date range, oldest first. */
export function selectOrders(orders: readonly Order[], request: ExportRequest): Order[] {
  const from = request.from ? Date.parse(request.from) : -Infinity;
  const to = request.to ? Date.parse(request.to) : Infinity;
  return orders
    .filter((o) => {
      const created = Date.parse(o.createdAt);
      return matchesScope(o, request.scope) && created >= from && created < to;
    })
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** Amount in token units as a spreadsheet number (Stars are whole units). */
function money(amount: number, currency: string): CellValue {
  return { money: currency === 'XTR' ? amount : amount / 100 };
}

function itemName(item: Order['items'][number]): string {
  return item.variantLabel ? `${item.title} (${item.variantLabel})` : item.title;
}

function notes(order: Order): string {
  const parts: string[] = [];
  if (order.changeRequest) parts.push('Change requested');
  if (order.amountDue < 0) parts.push('Refund owed');
  if (order.amountDue > 0 && order.amountPaid > 0) parts.push('Difference due');
  return parts.join('; ');
}

function ordersSheet(input: ReportInput, orders: readonly Order[]): Sheet {
  const header: CellValue[] = [
    'Order',
    'Date',
    'Status',
    'Customer',
    'Username',
    'Telegram ID',
    'Shipping zone',
    'Currency',
    'Units',
    'Products',
    input.feeLabel,
    'Shipping',
    'Total',
    'Paid',
    'Balance (+due / −refund)',
    'Payment method',
    'Transaction',
    'Tracking',
    'Notes',
    'Items',
  ];
  const rows = orders.map((o): CellValue[] => {
    const customer = input.customers.get(o.userId);
    const products = o.items.reduce((sum, i) => sum + i.subtotal, 0);
    const username = o.contactUsername ?? customer?.username ?? null;
    return [
      `#${o.id.slice(0, 8)}`,
      { date: new Date(o.createdAt) },
      STATUS_LABEL[o.status],
      customer?.name ?? '',
      username ? `@${username}` : '',
      o.userId,
      o.shippingZoneName ?? '',
      o.currency,
      o.items.reduce((n, i) => n + i.quantity, 0),
      money(products, o.currency),
      money(o.fee, o.currency),
      money(o.shipping, o.currency),
      money(o.total, o.currency),
      money(o.amountPaid, o.currency),
      money(o.amountDue, o.currency),
      o.paymentNetwork ?? '',
      o.paymentTxHash
        ? o.paymentTxUrl
          ? { link: o.paymentTxUrl, text: o.paymentTxHash }
          : o.paymentTxHash
        : '',
      o.trackingNumber ?? '',
      notes(o),
      o.items.map((i) => `${i.quantity}× ${itemName(i)}`).join(', '),
    ];
  });
  return {
    name: 'Orders',
    rows: [header, ...rows],
    widths: [11, 17, 17, 20, 18, 13, 16, 9, 7, 11, 11, 10, 11, 11, 14, 16, 30, 18, 18, 50],
  };
}

function linesSheet(orders: readonly Order[]): Sheet {
  const header: CellValue[] = [
    'Order',
    'Date',
    'Status',
    'Username',
    'Product',
    'Variant',
    'Quantity',
    'Unit price',
    'Subtotal',
    'Currency',
  ];
  const rows = orders.flatMap((o) =>
    o.items.map((i): CellValue[] => [
      `#${o.id.slice(0, 8)}`,
      { date: new Date(o.createdAt) },
      STATUS_LABEL[o.status],
      o.contactUsername ? `@${o.contactUsername}` : '',
      i.title,
      i.variantLabel ?? '',
      i.quantity,
      money(i.unitPrice, o.currency),
      money(i.subtotal, o.currency),
      o.currency,
    ]),
  );
  return {
    name: 'Lines',
    rows: [header, ...rows],
    widths: [11, 17, 17, 18, 28, 18, 9, 11, 11, 9],
  };
}

function productsSheet(orders: readonly Order[]): Sheet {
  const totals = new Map<
    string,
    { title: string; variant: string; currency: string; units: number; revenue: number; orders: Set<string> }
  >();
  for (const o of orders) {
    for (const i of o.items) {
      const key = `${i.productId}:${i.variantId ?? ''}:${o.currency}`;
      const row = totals.get(key) ?? {
        title: i.title,
        variant: i.variantLabel ?? '',
        currency: o.currency,
        units: 0,
        revenue: 0,
        orders: new Set<string>(),
      };
      row.units += i.quantity;
      row.revenue += i.subtotal;
      row.orders.add(o.id);
      totals.set(key, row);
    }
  }
  const rows = [...totals.values()]
    .sort((a, b) => b.units - a.units || a.title.localeCompare(b.title))
    .map((r): CellValue[] => [
      r.title,
      r.variant,
      r.currency,
      r.units,
      money(r.revenue, r.currency),
      r.orders.size,
    ]);
  return {
    name: 'Products',
    rows: [['Product', 'Variant', 'Currency', 'Units', 'Revenue', 'Orders'], ...rows],
    widths: [30, 20, 9, 8, 12, 8],
  };
}

function summarySheet(input: ReportInput, orders: readonly Order[], now: Date): Sheet {
  const byCurrency = new Map<
    string,
    { orders: number; units: number; products: number; fees: number; shipping: number; total: number; paid: number }
  >();
  for (const o of orders) {
    const row = byCurrency.get(o.currency) ?? {
      orders: 0,
      units: 0,
      products: 0,
      fees: 0,
      shipping: 0,
      total: 0,
      paid: 0,
    };
    row.orders += 1;
    row.units += o.items.reduce((n, i) => n + i.quantity, 0);
    row.products += o.items.reduce((n, i) => n + i.subtotal, 0);
    row.fees += o.fee;
    row.shipping += o.shipping;
    row.total += o.total;
    row.paid += o.amountPaid;
    byCurrency.set(o.currency, row);
  }
  const { request } = input;
  const rows: CellValue[][] = [
    ['Currency', 'Orders', 'Units', 'Products', input.feeLabel, 'Shipping', 'Total', 'Paid'],
    ...[...byCurrency.entries()].map(([currency, r]): CellValue[] => [
      currency,
      r.orders,
      r.units,
      money(r.products, currency),
      money(r.fees, currency),
      money(r.shipping, currency),
      money(r.total, currency),
      money(r.paid, currency),
    ]),
    [],
    ['Shop', input.shopName],
    ['Orders included', SCOPE_LABEL[request.scope]],
    ['From', request.from ? { date: new Date(request.from) } : 'Beginning'],
    ['To', request.to ? { date: new Date(request.to) } : 'Now'],
    ['Generated', { date: now }],
  ];
  return { name: 'Summary', rows, widths: [18, 24, 9, 12, 12, 11, 12, 12], filter: false };
}

function dateStamp(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Builds the requested report file for a shop's orders. */
export function buildReport(input: ReportInput): ReportFile {
  const now = input.now ?? new Date();
  const timeZone = input.request.timeZone ?? 'UTC';
  const orders = selectOrders(input.orders, input.request);
  const base = `${input.shopSlug}-orders-${input.request.scope}-${dateStamp(now, timeZone)}`;

  switch (input.request.format) {
    case 'xlsx':
      return {
        fileName: `${base}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        data: buildXlsx(
          [
            summarySheet(input, orders, now),
            ordersSheet(input, orders),
            linesSheet(orders),
            productsSheet(orders),
          ],
          { timeZone },
        ),
        orderCount: orders.length,
      };
    case 'csv-orders':
      return {
        fileName: `${base}.csv`,
        contentType: 'text/csv',
        data: buildCsv(ordersSheet(input, orders).rows, { timeZone }),
        orderCount: orders.length,
      };
    case 'csv-lines':
      return {
        fileName: `${base}-lines.csv`,
        contentType: 'text/csv',
        data: buildCsv(linesSheet(orders).rows, { timeZone }),
        orderCount: orders.length,
      };
  }
}
