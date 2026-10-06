import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Cell, List, Section } from '@telegram-apps/telegram-ui';
import type { Order } from '@tma-shop/shared';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { copyText } from '../../lib/clipboard.js';
import { formatPrice } from '../../lib/format.js';
import { Loader } from '../../components/Loader.js';
import { ErrorView } from '../../components/ErrorView.js';
import { AdminOnly, formatDate, itemsSummary, statusLabel } from './common.js';

type Scope = 'all' | 'toFulfil' | 'fulfilled';

const SCOPES: Record<Scope, { label: string; match: (order: Order) => boolean }> = {
  all: {
    label: 'All paid',
    match: (o) => o.status === 'paid' || o.status === 'fulfilled',
  },
  toFulfil: { label: 'To fulfil', match: (o) => o.status === 'paid' },
  fulfilled: { label: 'Fulfilled', match: (o) => o.status === 'fulfilled' },
};

interface ProductTotal {
  productId: string;
  title: string;
  currency: string;
  quantity: number;
  revenue: number;
  orders: number;
}

interface CurrencyTotal {
  currency: string;
  orders: number;
  items: number;
  revenue: number;
  fees: number;
}

/** Totals per product (and per currency) over the selected paid orders. */
function summarize(orders: Order[]): { products: ProductTotal[]; currencies: CurrencyTotal[] } {
  const products = new Map<string, ProductTotal>();
  const currencies = new Map<string, CurrencyTotal>();

  for (const order of orders) {
    const cur = currencies.get(order.currency) ?? {
      currency: order.currency,
      orders: 0,
      items: 0,
      revenue: 0,
      fees: 0,
    };
    cur.orders += 1;
    cur.revenue += order.total;
    cur.fees += order.fee;

    for (const item of order.items) {
      const key = `${item.productId}:${order.currency}`;
      const row = products.get(key) ?? {
        productId: item.productId,
        title: item.title,
        currency: order.currency,
        quantity: 0,
        revenue: 0,
        orders: 0,
      };
      row.quantity += item.quantity;
      row.revenue += item.subtotal;
      row.orders += 1;
      products.set(key, row);
      cur.items += item.quantity;
    }
    currencies.set(order.currency, cur);
  }

  return {
    products: [...products.values()].sort((a, b) => b.quantity - a.quantity),
    currencies: [...currencies.values()],
  };
}

/** Plain-text version of the summary, to paste anywhere. */
function summaryText(
  label: string,
  products: ProductTotal[],
  currencies: CurrencyTotal[],
  orders: Order[],
): string {
  const lines = [`Sales summary — ${label}`, ''];
  for (const c of currencies) {
    lines.push(
      `${c.currency}: ${c.orders} orders, ${c.items} items, ${formatPrice(c.revenue, c.currency)}` +
        (c.fees > 0 ? ` (fees ${formatPrice(c.fees, c.currency)})` : ''),
    );
  }
  lines.push('', 'Products:');
  for (const p of products) {
    lines.push(`• ${p.quantity}× ${p.title} — ${formatPrice(p.revenue, p.currency)}`);
  }
  lines.push('', 'Orders:');
  for (const o of orders) {
    lines.push(
      `• #${o.id.slice(0, 8)}${o.contactUsername ? ` @${o.contactUsername}` : ''} — ` +
        `${formatPrice(o.total, o.currency)} — ${itemsSummary(o)}`,
    );
  }
  return lines.join('\n');
}

/** Sales summary: what was sold across all paid orders, plus the list of those orders. */
export function AdminSummaryPage(): React.JSX.Element {
  return (
    <AdminOnly>
      <AdminSummary />
    </AdminOnly>
  );
}

function AdminSummary(): React.JSX.Element {
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>('all');
  const [copied, setCopied] = useState(false);
  const orders = useAsync(() => api.adminGetOrders(), []);

  if (orders.loading) return <Loader />;
  if (orders.error) return <ErrorView message={orders.error} />;

  const selected = (orders.data ?? []).filter(SCOPES[scope].match);
  const { products, currencies } = summarize(selected);

  const copy = async (): Promise<void> => {
    setCopied(
      await copyText(summaryText(SCOPES[scope].label, products, currencies, selected)),
    );
  };

  return (
    <List>
      <Section>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
          {(Object.keys(SCOPES) as Scope[]).map((key) => (
            <Button
              key={key}
              size="s"
              mode={key === scope ? 'filled' : 'bezeled'}
              onClick={() => {
                setScope(key);
                setCopied(false);
              }}
            >
              {SCOPES[key].label}
            </Button>
          ))}
        </div>
      </Section>

      <Section header="Totals">
        {currencies.length === 0 && <Cell>No paid orders yet</Cell>}
        {currencies.map((c) => (
          <Cell
            key={c.currency}
            subtitle={`${c.orders} orders · ${c.items} items${
              c.fees > 0 ? ` · fees ${formatPrice(c.fees, c.currency)}` : ''
            }`}
            after={<strong>{formatPrice(c.revenue, c.currency)}</strong>}
            multiline
          >
            {c.currency}
          </Cell>
        ))}
      </Section>

      {products.length > 0 && (
        <Section header="Products sold">
          {products.map((p) => (
            <Cell
              key={`${p.productId}:${p.currency}`}
              subtitle={`in ${p.orders} ${p.orders === 1 ? 'order' : 'orders'}`}
              after={formatPrice(p.revenue, p.currency)}
              multiline
            >
              {`${p.quantity}× ${p.title}`}
            </Cell>
          ))}
        </Section>
      )}

      {selected.length > 0 && (
        <Section header={`Orders · ${selected.length}`}>
          {selected.map((order) => (
            <Cell
              key={order.id}
              onClick={() => navigate(`/admin/orders/${order.id}`)}
              subtitle={`${statusLabel(order)} · ${formatDate(order.createdAt)}`}
              description={itemsSummary(order)}
              after={formatPrice(order.total, order.currency)}
              multiline
            >
              {`#${order.id.slice(0, 8)}${order.contactUsername ? ` · @${order.contactUsername}` : ''}`}
            </Cell>
          ))}
        </Section>
      )}

      {selected.length > 0 && (
        <Section footer="Copies the totals, products and orders as text, to paste in a chat or a note.">
          <div style={{ padding: 16 }}>
            <Button stretched mode="bezeled" onClick={() => void copy()}>
              {copied ? 'Copied ✓' : 'Copy summary as text'}
            </Button>
          </div>
        </Section>
      )}
    </List>
  );
}
