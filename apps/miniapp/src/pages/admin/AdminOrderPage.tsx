import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Cell, Input, List, Section, Textarea } from '@telegram-apps/telegram-ui';
import { ADMIN_STATUS_CHANGES, type Order } from '@tma-shop/shared';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { formatPrice } from '../../lib/format.js';
import { itemKey, itemName } from '../../lib/variants.js';
import { Loader } from '../../components/Loader.js';
import { ErrorView } from '../../components/ErrorView.js';
import {
  AdminOnly,
  ErrorBanner,
  formatDate,
  statusLabel,
  useAdminActions,
  type AdminActions,
} from './common.js';
import { useShopPath } from '../../providers/ShopProvider.js';
import { AddressSection } from './AddressSection.js';
import { TrackingText } from '../../components/TrackingText.js';

const breakAll: React.CSSProperties = { wordBreak: 'break-all', whiteSpace: 'normal' };

/** Everything about one order, with the admin actions that apply to it. */
export function AdminOrderPage(): React.JSX.Element {
  return (
    <AdminOnly>
      <AdminOrder />
    </AdminOnly>
  );
}

function AdminOrder(): React.JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const to = useShopPath();
  const [reloadKey, setReloadKey] = useState(0);
  const actions = useAdminActions(() => setReloadKey((k) => k + 1));
  const order = useAsync(() => api.adminGetOrder(id), [id, reloadKey]);
  const shop = useAsync(() => api.getShop(), []);

  if (order.loading && !order.data) return <Loader />;
  if (order.error) return <ErrorView message={order.error} />;
  if (!order.data) return <Loader />;
  const o = order.data;
  const money = (amount: number): string => formatPrice(amount, o.currency);

  return (
    <List>
      <ErrorBanner message={actions.error} />

      <Section header={`Order #${o.id.slice(0, 8)}`}>
        <Cell after={statusLabel(o)}>Status</Cell>
        <Cell after={formatDate(o.createdAt)}>Created</Cell>
        {o.updatedAt !== o.createdAt && <Cell after={formatDate(o.updatedAt)}>Updated</Cell>}
        <Cell
          after={
            o.contactUsername ? (
              <a href={`https://t.me/${o.contactUsername}`} target="_blank" rel="noreferrer">
                @{o.contactUsername}
              </a>
            ) : (
              '—'
            )
          }
        >
          Customer
        </Cell>
        <Cell after={String(o.userId)}>Telegram id</Cell>
        {o.trackingNumber && (
          <Cell subtitle="Tracking" multiline>
            <TrackingText value={o.trackingNumber} />
          </Cell>
        )}
        {o.statusNote && (
          <Cell subtitle="Last note to the customer" multiline>
            {o.statusNote}
          </Cell>
        )}
      </Section>

      <Section header={`Items · ${o.items.reduce((n, i) => n + i.quantity, 0)}`}>
        {o.items.map((item) => (
          <Cell
            key={itemKey(item)}
            subtitle={`${item.quantity} × ${money(item.unitPrice)}`}
            after={money(item.subtotal)}
            multiline
          >
            {itemName(item)}
          </Cell>
        ))}
        {o.fee > 0 && (
          <Cell after={money(o.fee)}>{shop.data?.orderFeeLabel ?? 'Order fee'}</Cell>
        )}
        {o.shippingZoneName && (
          <Cell after={o.shipping > 0 ? money(o.shipping) : 'Free'}>
            {`Shipping · ${o.shippingZoneName}`}
          </Cell>
        )}
        <Cell after={<strong>{money(o.total)}</strong>}>Total</Cell>
      </Section>

      <Section header="Payment">
        <Cell after={money(o.amountPaid)}>Paid (confirmed)</Cell>
        {o.amountSubmitted > 0 && <Cell after={money(o.amountSubmitted)}>To verify</Cell>}
        {o.amountDue > 0 && <Cell after={money(o.amountDue)}>Still due</Cell>}
        {o.amountDue < 0 && <Cell after={money(-o.amountDue)}>To refund</Cell>}
        {o.paymentNetwork && <Cell after={o.paymentNetwork}>Last method</Cell>}
        {o.paymentTxHash && (
          <Cell subtitle="Last transaction" multiline>
            {o.paymentTxUrl ? (
              <a href={o.paymentTxUrl} target="_blank" rel="noreferrer" style={breakAll}>
                {o.paymentTxHash}
              </a>
            ) : (
              <span style={breakAll}>{o.paymentTxHash}</span>
            )}
          </Cell>
        )}
      </Section>

      <AddressSection order={o} />

      {o.changeRequest && <ChangeRequestSection order={o} actions={actions} />}

      {o.paymentLog.length > 0 && (
        <Section header="Payment history">
          {o.paymentLog.map((entry, index) => (
            <Cell
              key={`${entry.at}-${index}`}
              subtitle={[formatDate(entry.at), entry.network].filter(Boolean).join(' · ')}
              description={
                entry.txHash ? <span style={breakAll}>{entry.txHash}</span> : undefined
              }
              after={`${entry.type === 'refund' ? '−' : '+'}${money(entry.amount)}`}
              multiline
            >
              {entry.type === 'refund' ? '↩️ Refund sent' : '💰 Payment received'}
            </Cell>
          ))}
        </Section>
      )}

      <ActionsSection order={o} actions={actions} onDeleted={() => navigate(to('/admin/orders'))} />
    </List>
  );
}

function ChangeRequestSection({
  order,
  actions,
}: {
  order: Order;
  actions: AdminActions;
}): React.JSX.Element | null {
  const change = order.changeRequest;
  if (!change) return null;
  const money = (amount: number): string => formatPrice(amount, order.currency);
  const covered = order.amountPaid + order.amountSubmitted;
  const diff = change.total - covered;

  return (
    <Section
      header="✏️ Change requested by the customer"
      footer={
        diff > 0
          ? `If approved, the customer pays ${money(diff)} more.`
          : diff < 0
            ? `If approved, you refund ${money(-diff)}.`
            : 'Same amount: nothing to pay or refund.'
      }
    >
      {change.items.map((item) => {
        const before = order.items.find((i) => itemKey(i) === itemKey(item))?.quantity ?? 0;
        return (
          <Cell
            key={itemKey(item)}
            subtitle={
              before === item.quantity
                ? `${item.quantity} × ${money(item.unitPrice)}`
                : `${before} → ${item.quantity} × ${money(item.unitPrice)}`
            }
            after={money(item.subtotal)}
            multiline
          >
            {before === 0 ? `🆕 ${itemName(item)}` : itemName(item)}
          </Cell>
        );
      })}
      {order.items
        .filter((item) => !change.items.some((c) => itemKey(c) === itemKey(item)))
        .map((item) => (
          <Cell key={itemKey(item)} subtitle={`${item.quantity} → 0`} multiline>
            ❌ {itemName(item)}
          </Cell>
        ))}
      <Cell after={`${money(order.total)} → ${money(change.total)}`}>Total</Cell>
      <div style={{ display: 'flex', gap: 8, padding: 16 }}>
        <Button
          size="m"
          mode="filled"
          onClick={() =>
            void actions.twoTap(`approve:${order.id}`, () => api.adminApproveChange(order.id))
          }
        >
          {actions.tapLabel(`approve:${order.id}`, 'Approve')}
        </Button>
        <Button
          size="m"
          mode="plain"
          onClick={() =>
            void actions.twoTap(`reject:${order.id}`, () => api.adminRejectChange(order.id))
          }
        >
          {actions.tapLabel(`reject:${order.id}`, 'Reject')}
        </Button>
      </div>
    </Section>
  );
}

function ActionsSection({
  order,
  actions,
  onDeleted,
}: {
  order: Order;
  actions: AdminActions;
  onDeleted: () => void;
}): React.JSX.Element {
  const money = (amount: number): string => formatPrice(amount, order.currency);
  const { twoTap, tapLabel, run, errorCode } = actions;
  const id = order.id;
  const [note, setNote] = useState('');
  const [tracking, setTracking] = useState(order.trackingNumber ?? '');
  const next = ADMIN_STATUS_CHANGES[order.status];

  /** Changes the status; the bot tells the customer, with the note if there is one. */
  const setStatus = async (
    status: Order['status'],
    more: { trackingNumber?: string; force?: boolean } = {},
  ): Promise<void> => {
    const text = note.trim();
    await api.adminSetOrderStatus(id, status, { ...(text ? { note: text } : {}), ...more });
    setNote('');
  };
  const trackingInput = (): { trackingNumber?: string } =>
    tracking.trim() ? { trackingNumber: tracking.trim() } : {};

  return (
    <Section
      header="Actions"
      footer={
        next.length > 0
          ? 'When the status changes, the bot sends the customer a message (with your note, if you write one).'
          : undefined
      }
    >
      {next.length > 0 && (
        <Textarea
          header="Note to the customer (optional)"
          placeholder="e.g. It will arrive on Friday"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      )}
      {next.includes('shipped') && (
        <Input
          header="Tracking number or link (optional)"
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
        {order.status === 'awaiting_payment' && (
          <>
            <Button
              stretched
              mode="filled"
              onClick={() => void twoTap(`paid:${id}`, () => setStatus('paid'))}
            >
              {tapLabel(
                `paid:${id}`,
                `✅ Mark paid · ${money(order.amountSubmitted || order.amountDue)}`,
              )}
            </Button>
            {errorCode === 'stock_short' && (
              <Button
                stretched
                mode="bezeled"
                onClick={() => void run(() => setStatus('paid', { force: true }))}
              >
                Confirm anyway (stock will stay at 0)
              </Button>
            )}
            <Button
              stretched
              mode="bezeled"
              onClick={() => void twoTap(`reject:${id}`, () => setStatus('pending'))}
            >
              {tapLabel(`reject:${id}`, 'Reject payment (customer sends it again)')}
            </Button>
          </>
        )}
        {order.status === 'paid' && (
          <Button
            stretched
            mode="filled"
            onClick={() => void run(() => setStatus('shipped', trackingInput()))}
          >
            🚚 Mark shipped
          </Button>
        )}
        {(order.status === 'paid' || order.status === 'shipped') && (
          <Button
            stretched
            mode="bezeled"
            onClick={() => void twoTap(`delivered:${id}`, () => setStatus('fulfilled'))}
          >
            {tapLabel(`delivered:${id}`, '📦 Mark delivered')}
          </Button>
        )}
        {order.amountDue < 0 && (
          <Button
            stretched
            mode="bezeled"
            onClick={() => void twoTap(`refund:${id}`, () => api.adminRecordRefund(id))}
          >
            {tapLabel(`refund:${id}`, `↩️ Mark refunded · ${money(-order.amountDue)}`)}
          </Button>
        )}
        {next.includes('cancelled') && (
          <Button
            stretched
            mode="plain"
            onClick={() => void twoTap(`cancel:${id}`, () => setStatus('cancelled'))}
          >
            {tapLabel(
              `cancel:${id}`,
              order.amountPaid > 0
                ? `Cancel order (refund ${money(order.amountPaid)})`
                : 'Cancel order',
            )}
          </Button>
        )}
        <Button
          stretched
          mode="plain"
          onClick={() =>
            void twoTap(`delete:${id}`, async () => {
              await api.adminDeleteOrder(id);
              onDeleted();
            })
          }
        >
          {tapLabel(`delete:${id}`, 'Delete order', 'Tap again to delete')}
        </Button>
      </div>
    </Section>
  );
}
