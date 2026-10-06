import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Cell, Input, List, Section } from '@telegram-apps/telegram-ui';
import type { Order } from '@tma-shop/shared';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { formatPrice } from '../../lib/format.js';
import { Loader } from '../../components/Loader.js';
import { ErrorView } from '../../components/ErrorView.js';
import { AdminOnly, formatDate, itemsSummary, needsAttention, statusLabel } from './common.js';

type FilterKey = 'all' | 'attention' | 'unpaid' | 'paid' | 'fulfilled' | 'cancelled';

const FILTERS: Record<FilterKey, { label: string; match: (order: Order) => boolean }> = {
  all: { label: 'All', match: () => true },
  attention: { label: '🔔 To review', match: needsAttention },
  unpaid: { label: 'Not paid', match: (o) => o.status === 'pending' },
  paid: { label: 'Paid', match: (o) => o.status === 'paid' },
  fulfilled: { label: 'Fulfilled', match: (o) => o.status === 'fulfilled' },
  cancelled: { label: 'Cancelled', match: (o) => o.status === 'cancelled' },
};

function isFilterKey(value: string | null): value is FilterKey {
  return value !== null && value in FILTERS;
}

/** All orders with status filters and search; tap one to open its detail. */
export function AdminOrdersPage(): React.JSX.Element {
  return (
    <AdminOnly>
      <AdminOrders />
    </AdminOnly>
  );
}

function AdminOrders(): React.JSX.Element {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filterParam = params.get('filter');
  const filter: FilterKey = isFilterKey(filterParam) ? filterParam : 'all';
  const [search, setSearch] = useState('');
  const orders = useAsync(() => api.adminGetOrders(), []);

  if (orders.loading) return <Loader />;
  if (orders.error) return <ErrorView message={orders.error} />;

  const all = orders.data ?? [];
  const query = search.trim().toLowerCase().replace(/^[@#]/, '');
  const visible = all.filter(
    (order) =>
      FILTERS[filter].match(order) &&
      (query === '' ||
        order.id.toLowerCase().startsWith(query) ||
        (order.contactUsername ?? '').toLowerCase().includes(query) ||
        order.items.some((item) => item.title.toLowerCase().includes(query))),
  );

  return (
    <List>
      <Section>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
          {(Object.keys(FILTERS) as FilterKey[]).map((key) => {
            const count = all.filter(FILTERS[key].match).length;
            return (
              <Button
                key={key}
                size="s"
                mode={key === filter ? 'filled' : 'bezeled'}
                onClick={() => setParams(key === 'all' ? {} : { filter: key }, { replace: true })}
              >
                {`${FILTERS[key].label} · ${count}`}
              </Button>
            );
          })}
        </div>
        <Input
          header="Search"
          placeholder="Order #, @username or product"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Section>

      <Section header={`${visible.length} orders`}>
        {visible.length === 0 && <Cell>No orders here</Cell>}
        {visible.map((order) => (
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
    </List>
  );
}
