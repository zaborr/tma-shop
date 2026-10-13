import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Cell, List, Section } from '@telegram-apps/telegram-ui';
import type { ExportRequest, ExportScope, Order } from '@tma-shop/shared';
import { api, ApiClientError } from '../../api/client.js';
import { decryptAddress, loadPrivateKey } from '../../lib/addressCrypto.js';
import { shareOrDownload, toCsv } from '../../lib/download.js';
import { itemName } from '../../lib/variants.js';
import { useShop } from '../../providers/ShopProvider.js';
import { AdminOnly, ErrorBanner } from './common.js';

const SCOPES: Array<{ key: ExportScope; label: string }> = [
  { key: 'paid', label: 'Paid' },
  { key: 'toFulfil', label: 'To fulfil' },
  { key: 'fulfilled', label: 'Fulfilled' },
  { key: 'unpaid', label: 'Not paid' },
  { key: 'all', label: 'All' },
];

type Period = 'all' | 'thisMonth' | 'lastMonth';
const PERIODS: Array<{ key: Period; label: string }> = [
  { key: 'all', label: 'All time' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
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
      return order.status === 'paid' || order.status === 'fulfilled';
    case 'toFulfil':
      return order.status === 'paid';
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
      const result = await api.adminExport({
        format,
        scope,
        ...periodRange(period),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setMessage(`Sent to your chat with the bot ✓ (${result.orders} orders)`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not export');
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
        setError('Paste your private key in Admin → Address key first.');
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
        setError('No orders with a delivery address match these filters.');
        return;
      }
      const rows: Array<Array<string | number>> = [
        ['Order', 'Date', 'Username', 'Zone', 'Name', 'Address', 'Address 2', 'Postal code', 'City', 'Region', 'Country', 'Phone', 'Notes', 'Items'],
      ];
      let failed = 0;
      for (const o of orders) {
        try {
          const a = await decryptAddress(o.encryptedAddress ?? '', privateKey);
          rows.push([
            `#${o.id.slice(0, 8)}`,
            new Date(o.createdAt).toLocaleString(),
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
          : `Shipping list ready: ${rows.length - 1} addresses${failed ? ` (${failed} need another key)` : ''}`,
      );
      if (result === 'failed') setError('This device could not save the file.');
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

      <Section header="Orders">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
          {SCOPES.map((s) => (
            <Button
              key={s.key}
              size="s"
              mode={s.key === scope ? 'filled' : 'bezeled'}
              onClick={() => setScope(s.key)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </Section>
      <Section header="Period">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
          {PERIODS.map((p) => (
            <Button
              key={p.key}
              size="s"
              mode={p.key === period ? 'filled' : 'bezeled'}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </Section>

      <Section
        header="Send to my chat"
        footer="The bot sends the file to your private chat with it. The Excel has 4 sheets: summary, orders, order lines and products sold. Addresses are not included (they are encrypted)."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
          <Button stretched loading={busy === 'xlsx'} onClick={() => void send('xlsx')}>
            📊 Excel report
          </Button>
          <Button
            stretched
            mode="bezeled"
            loading={busy === 'csv-orders'}
            onClick={() => void send('csv-orders')}
          >
            CSV · one row per order
          </Button>
          <Button
            stretched
            mode="bezeled"
            loading={busy === 'csv-lines'}
            onClick={() => void send('csv-lines')}
          >
            CSV · one row per product
          </Button>
        </div>
      </Section>

      <Section
        header="Shipping list (CSV)"
        footer="Decrypts the delivery addresses here with the private key on this device, so they never reach the server unencrypted."
      >
        <div style={{ padding: 16 }}>
          <Button
            stretched
            mode="bezeled"
            loading={busy === 'shipping'}
            onClick={() => void shippingList()}
          >
            📦 Shipping list
          </Button>
        </div>
      </Section>
    </List>
  );
}
