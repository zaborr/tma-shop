import { useNavigate } from 'react-router-dom';
import { Badge, Cell, List, Section } from '@telegram-apps/telegram-ui';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { AdminOnly, isSale, needsAttention, toMajor } from './common.js';

/** Admin menu: one entry per section, with live counters. */
export function AdminHomePage(): React.JSX.Element {
  return (
    <AdminOnly>
      <AdminHome />
    </AdminOnly>
  );
}

function AdminHome(): React.JSX.Element {
  const navigate = useNavigate();
  const orders = useAsync(() => api.adminGetOrders(), []);
  const products = useAsync(() => api.adminGetProducts(), []);
  const shop = useAsync(() => api.getShop(), []);

  const all = orders.data ?? [];
  const toReview = all.filter(needsAttention).length;
  const sales = all.filter(isSale).length;
  const fee = shop.data?.orderFee ?? 0;

  return (
    <List>
      <Section header="Orders">
        <Cell
          onClick={() => navigate('/admin/orders?filter=attention')}
          subtitle="Payments to verify, change requests, refunds"
          after={toReview > 0 ? <Badge type="number">{toReview}</Badge> : undefined}
        >
          🔔 To review
        </Cell>
        <Cell
          onClick={() => navigate('/admin/orders')}
          subtitle={orders.data ? `${all.length} orders` : 'Loading…'}
        >
          📦 All orders
        </Cell>
        <Cell
          onClick={() => navigate('/admin/summary')}
          subtitle={orders.data ? `${sales} paid orders` : 'Loading…'}
        >
          📊 Sales summary
        </Cell>
      </Section>

      <Section header="Catalog">
        <Cell
          onClick={() => navigate('/admin/catalog')}
          subtitle={products.data ? `${products.data.length} products` : 'Loading…'}
        >
          🗂️ Categories & products
        </Cell>
        <Cell onClick={() => navigate('/admin/products/new')}>➕ New product</Cell>
      </Section>

      <Section header="Settings">
        <Cell
          onClick={() => navigate('/admin/fee')}
          subtitle={
            fee > 0
              ? `${shop.data?.orderFeeLabel ?? 'Fee'}: ${toMajor(fee)} per order`
              : 'Off'
          }
        >
          💸 Order fee
        </Cell>
      </Section>
    </List>
  );
}
