import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Cell, List, Section } from '@telegram-apps/telegram-ui';
import { isSaleStatus, type ExportRequest, type ExportScope, type Order } from '@tma-shop/shared';
import { api, ApiClientError } from '../../api/client.js';
import { decryptAddress, loadPrivateKey } from '../../lib/addressCrypto.js';
import { shareOrDownload, toCsv } from '../../lib/download.js';
import { itemName } from '../../lib/variants.js';
import { useShop } from '../../providers/ShopProvider.js';
import { askWriteAccess } from '../../lib/writeAccess.js';
import { AdminOnly, ErrorBanner } from './common.js';
import { locale, t, tn, type MessageKey } from '../../i18n/index.js';

const SCOPES: Array<{ key: ExportScope; label: MessageKey }> = [
  { key: 'paid', label: 'export.paid' },
  { key: 'toFulfil', label: 'filter.toShip' },
  { key: 'shipped', label: 'orderStatus.shipped' },
  { key: 'fulfilled', label: 'orderStatus.fulfilled' },
  { key: 'unpaid', label: 'filter.unpaid' },
  { key: 'all', label: 'catalog.all' },
];

type Period = 'all' | 'thisMonth' | 'lastMonth';
const PERIODS: Array<{ key: Period; label: MessageKey }> = [
  { key: 'all', label: 'export.allTime' },
  { key: 'thisMonth', label: 'export.thisMonth' },
  { key: 'lastMonth', label: 'export.lastMonth' },
];

/** [from, to) of a period in local time, as ISO instants. */
function periodRange(period: Period): { from?: string; to?: string } {
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'thisMonth') return { from: thisMonth.toISOString() };
  if (period === 'lastMonth') {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { from: lastMonth.toISOString(), to: thisMonth.toISOString() };
  }
  return {};
}

function inScope(order: Order, scope: ExportScope): boolean {
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

/** Reports sent by the bot to the admin's chat, plus a shipping list made on this device. */
export function AdminExportPage(): React.JSX.Element {
  return (
    <AdminOnly>
      <AdminExport />
    </AdminOnly>
  );
}

function AdminExport(): React.JSX.Element {
  const { shop } = useShop();
  const [params] = useSearchParams();
  const initialScope = SCOPES.find((s) => s.key === params.get('scope'))?.key ?? 'paid';
  const [scope, setScope] = useState<ExportScope>(initialScope);
  const [period, setPeriod] = useState<Period>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (format: ExportRequest['format']): Promise<void> => {
    setBusy(format);
    setMessage(null);
    setError(null);
    try {
      // The bot can only send the file if it may message this admin.
      await askWriteAccess();
      const result = await api.adminExport({
        format,
        scope,
        ...periodRange(period),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setMessage(t('export.sent', { orders: tn(result.orders, 'count.orders.one', 'count.orders.other') }));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('export.failed'));
    } finally {
      setBusy(null);
    }
  };

  /** Shipping list: addresses are decrypted here, never on the server. */
  const shippingList = async (): Promise<void> => {
    setBusy('shipping');
    setMessage(null);
    setError(null);
    try {
      const privateKey = loadPrivateKey(shop.id);
      if (!privateKey) {
        setError(t('export.needKey'));
        return;
      }
      const { from, to } = periodRange(period);
      const orders = (await api.adminGetOrders()).filter(
        (o) =>
          o.encryptedAddress &&
          inScope(o, scope) &&
          (!from || o.createdAt >= from) &&
          (!to || o.createdAt < to),
      );
      if (orders.length === 0) {
        setError(t('export.noAddresses'));
        return;
      }
      const rows: Array<Array<string | number>> = [
        [
          t('csv.order'),
          t('csv.date'),
          t('csv.username'),
          t('csv.zone'),
          t('csv.name'),
          t('csv.address'),
          t('csv.address2'),
          t('csv.postalCode'),
          t('csv.city'),
          t('csv.region'),
          t('csv.country'),
          t('csv.phone'),
          t('csv.notes'),
          t('csv.items'),
        ],
      ];
      let failed = 0;
      for (const o of orders) {
        try {
          const a = await decryptAddress(o.encryptedAddress ?? '', privateKey);
          rows.push([
            `#${o.id.slice(0, 8)}`,
            new Date(o.createdAt).toLocaleString(locale()),
            o.contactUsername ? `@${o.contactUsername}` : '',
            o.shippingZoneName ?? '',
            a.name,
            a.line1,
            a.line2,
            a.postalCode,
            a.city,
            a.region,
            a.country,
            a.phone,
            a.notes,
            o.items.map((i) => `${i.quantity}× ${itemName(i)}`).join(', '),
          ]);
        } catch {
          failed += 1;
        }
      }
      const date = new Date().toISOString().slice(0, 10);
      const result = await shareOrDownload(`${shop.slug}-shipping-${date}.csv`, toCsv(rows));
      setMessage(
        result === 'failed'
          ? null
          : t('export.listReady', { count: rows.length - 1 }) +
            (failed ? ` ${t('export.needOtherKey', { count: failed })}` : ''),
      );
      if (result === 'failed') setError(t('export.saveFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <List>
      <ErrorBanner message={error} />
      {message && (
        <Section>
          <Cell multiline>{message}</Cell>
        </Section>
      )}

      <Section header={t('adminHome.orders')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
          {SCOPES.map((s) => (
            <Button
              key={s.key}
              size="s"
              mode={s.key === scope ? 'filled' : 'bezeled'}
              onClick={() => setScope(s.key)}
            >
              {t(s.label)}
            </Button>
          ))}
        </div>
      </Section>
      <Section header={t('export.period')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
          {PERIODS.map((p) => (
            <Button
              key={p.key}
              size="s"
              mode={p.key === period ? 'filled' : 'bezeled'}
              onClick={() => setPeriod(p.key)}
            >
              {t(p.label)}
            </Button>
          ))}
        </div>
      </Section>

      <Section
        header={t('export.toChat')}
        footer={t('export.toChatFooter')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
          <Button stretched loading={busy === 'xlsx'} onClick={() => void send('xlsx')}>
            {t('export.excel')}
          </Button>
          <Button
            stretched
            mode="bezeled"
            loading={busy === 'csv-orders'}
            onClick={() => void send('csv-orders')}
          >
            {t('export.csvOrders')}
          </Button>
          <Button
            stretched
            mode="bezeled"
            loading={busy === 'csv-lines'}
            onClick={() => void send('csv-lines')}
          >
            {t('export.csvLines')}
          </Button>
        </div>
      </Section>

      <Section
        header={t('export.shippingList')}
        footer={t('export.shippingListFooter')}
      >
        <div style={{ padding: 16 }}>
          <Button
            stretched
            mode="bezeled"
            loading={busy === 'shipping'}
            onClick={() => void shippingList()}
          >
            {t('export.shippingButton')}
          </Button>
        </div>
      </Section>
    </List>
  );
}
