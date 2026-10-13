import { useNavigate } from 'react-router-dom';
import { Badge, Cell, List, Section } from '@telegram-apps/telegram-ui';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { AdminOnly, isSale, needsAttention, toMajor } from './common.js';
import { useShop, useShopPath } from '../../providers/ShopProvider.js';

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
  const to = useShopPath();
  const orders = useAsync(() => api.adminGetOrders(), []);
  const products = useAsync(() => api.adminGetProducts(), []);
  const { shop: config } = useShop();

  const all = orders.data ?? [];
  const toReview = all.filter(needsAttention).length;
  const sales = all.filter(isSale).length;
  const fee = config.orderFee;
  const activeZones = config.shippingZones.filter((z) => z.isActive).length;

  return (
    <List>
      <Section header="Orders">
        <Cell
          onClick={() => navigate(to('/admin/orders?filter=attention'))}
          subtitle="Payments to verify, change requests, refunds"
          after={toReview > 0 ? <Badge type="number">{toReview}</Badge> : undefined}
        >
          🔔 To review
        </Cell>
        <Cell
          onClick={() => navigate(to('/admin/orders'))}
          subtitle={orders.data ? `${all.length} orders` : 'Loading…'}
        >
          📦 All orders
        </Cell>
        <Cell
          onClick={() => navigate(to('/admin/summary'))}
          subtitle={orders.data ? `${sales} paid orders` : 'Loading…'}
        >
          📊 Sales summary
        </Cell>
      </Section>

      <Section header="Catalog">
        <Cell
          onClick={() => navigate(to('/admin/catalog'))}
          subtitle={products.data ? `${products.data.length} products` : 'Loading…'}
        >
          🗂️ Categories & products
        </Cell>
        <Cell onClick={() => navigate(to('/admin/products/new'))}>➕ New product</Cell>
      </Section>

      <Section header="Settings">
        <Cell
          onClick={() => navigate(to('/admin/settings'))}
          subtitle={config.isVisible ? config.name : `${config.name} · 🙈 hidden`}
        >
          🏪 Store profile
        </Cell>
        <Cell
          onClick={() => navigate(to('/admin/wallets'))}
          subtitle={
            config.paymentMethods.length > 0
              ? `${config.paymentMethods.length} payment options`
              : '⚠️ None — customers can’t pay yet'
          }
        >
          👛 Wallets
        </Cell>
        <Cell
          onClick={() => navigate(to('/admin/fee'))}
          subtitle={
            fee > 0
              ? `${config.orderFeeLabel}: ${toMajor(fee)} per order`
              : 'Off'
          }
        >
          💸 Order fee
        </Cell>
        <Cell
          onClick={() => navigate(to('/admin/shipping'))}
          subtitle={
            activeZones > 0
              ? `${activeZones} zone${activeZones === 1 ? '' : 's'}${
                  config.addressPublicKey ? '' : ' · ⚠️ no address key'
                }`
              : 'Off — no delivery address asked'
          }
        >
          🚚 Shipping zones
        </Cell>
        <Cell
          onClick={() => navigate(to('/admin/address-key'))}
          subtitle={config.addressKeyFingerprint ? `Key ${config.addressKeyFingerprint}` : 'Not set'}
        >
          🔑 Address key
        </Cell>
      </Section>
    </List>
  );
}
