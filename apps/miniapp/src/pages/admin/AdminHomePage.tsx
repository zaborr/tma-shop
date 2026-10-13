import { useNavigate } from 'react-router-dom';
import { Badge, Cell, List, Section } from '@telegram-apps/telegram-ui';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { AdminOnly, isSale, needsAttention, toMajor } from './common.js';
import { useShop, useShopPath } from '../../providers/ShopProvider.js';
import { t, tn } from '../../i18n/index.js';

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
      <Section header={t('adminHome.orders')}>
        <Cell
          onClick={() => navigate(to('/admin/orders?filter=attention'))}
          subtitle={t('adminHome.toReviewHint')}
          after={toReview > 0 ? <Badge type="number">{toReview}</Badge> : undefined}
        >
          {t('adminHome.toReview')}
        </Cell>
        <Cell
          onClick={() => navigate(to('/admin/orders'))}
          subtitle={orders.data ? tn(all.length, 'count.orders.one', 'count.orders.other') : t('common.loading')}
        >
          {t('adminHome.allOrders')}
        </Cell>
        <Cell
          onClick={() => navigate(to('/admin/summary'))}
          subtitle={orders.data ? tn(sales, 'count.paidOrders.one', 'count.paidOrders.other') : t('common.loading')}
        >
          {t('adminHome.summary')}
        </Cell>
        <Cell
          onClick={() => navigate(to('/admin/export'))}
          subtitle={t('adminHome.exportHint')}
        >
          {t('adminHome.export')}
        </Cell>
      </Section>

      <Section header={t('catalog.title')}>
        <Cell
          onClick={() => navigate(to('/admin/catalog'))}
          subtitle={
            products.data
              ? tn(products.data.length, 'count.products.one', 'count.products.other')
              : t('common.loading')
          }
        >
          {t('adminHome.catalog')}
        </Cell>
        <Cell onClick={() => navigate(to('/admin/products/new'))}>{t('adminHome.newProduct')}</Cell>
      </Section>

      <Section header={t('adminHome.settings')}>
        <Cell
          onClick={() => navigate(to('/admin/settings'))}
          subtitle={config.isVisible ? config.name : t('adminHome.nameHidden', { name: config.name })}
        >
          {t('adminHome.profile')}
        </Cell>
        <Cell
          onClick={() => navigate(to('/admin/wallets'))}
          subtitle={
            config.paymentMethods.length > 0
              ? tn(config.paymentMethods.length, 'count.paymentOptions.one', 'count.paymentOptions.other')
              : t('adminHome.noWallets')
          }
        >
          {t('adminHome.wallets')}
        </Cell>
        <Cell
          onClick={() => navigate(to('/admin/fee'))}
          subtitle={
            fee > 0
              ? t('adminHome.feeOn', { label: config.orderFeeLabel, amount: toMajor(fee) })
              : t('common.off')
          }
        >
          {t('adminHome.fee')}
        </Cell>
        <Cell
          onClick={() => navigate(to('/admin/shipping'))}
          subtitle={
            activeZones > 0
              ? tn(activeZones, 'count.zones.one', 'count.zones.other') +
                (config.addressPublicKey ? '' : t('adminHome.noAddressKey'))
              : t('adminHome.shippingOff')
          }
        >
          {t('adminHome.shipping')}
        </Cell>
        <Cell
          onClick={() => navigate(to('/admin/address-key'))}
          subtitle={
            config.addressKeyFingerprint
              ? t('adminHome.keyId', { id: config.addressKeyFingerprint })
              : t('common.notSet')
          }
        >
          {t('adminHome.addressKey')}
        </Cell>
      </Section>
    </List>
  );
}
