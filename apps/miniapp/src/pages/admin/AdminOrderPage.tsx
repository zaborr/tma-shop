import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Cell, List, Section } from '@telegram-apps/telegram-ui';
import type { Order } from '@tma-shop/shared';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { formatPrice } from '../../lib/format.js';
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
      </Section>

      <Section header={`Items · ${o.items.reduce((n, i) => n + i.quantity, 0)}`}>
        {o.items.map((item) => (
          <Cell
            key={item.productId}
            subtitle={`${item.quantity} × ${money(item.unitPrice)}`}
            after={money(item.subtotal)}
            multiline
          >
            {item.title}
          </Cell>
        ))}
        {o.fee > 0 && (
          <Cell after={money(o.fee)}>{shop.data?.orderFeeLabel ?? 'Order fee'}</Cell>
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

      <ActionsSection order={o} actions={actions} onDeleted={() => navigate('/admin/orders')} />
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
        const before = order.items.find((i) => i.productId === item.productId)?.quantity ?? 0;
        return (
          <Cell
            key={item.productId}
            subtitle={
              before === item.quantity
                ? `${item.quantity} × ${money(item.unitPrice)}`
                : `${before} → ${item.quantity} × ${money(item.unitPrice)}`
            }
            after={money(item.subtotal)}
            multiline
          >
            {before === 0 ? `🆕 ${item.title}` : item.title}
          </Cell>
        );
      })}
      {order.items
        .filter((item) => !change.items.some((c) => c.productId === item.productId))
        .map((item) => (
          <Cell key={item.productId} subtitle={`${item.quantity} → 0`} multiline>
            ❌ {item.title}
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
  const { twoTap, tapLabel, run } = actions;
  const id = order.id;

  return (
    <Section header="Actions">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
        {order.status === 'awaiting_payment' && (
          <Button
            stretched
            mode="filled"
            onClick={() => void twoTap(`paid:${id}`, () => api.adminSetOrderStatus(id, 'paid'))}
          >
            {tapLabel(
              `paid:${id}`,
              `✅ Mark paid · ${money(order.amountSubmitted || order.amountDue)}`,
            )}
          </Button>
        )}
        {order.status === 'paid' && (
          <Button
            stretched
            mode="bezeled"
            onClick={() => void run(() => api.adminSetOrderStatus(id, 'fulfilled'))}
          >
            📦 Mark fulfilled
          </Button>
        )}
        {order.amountDue < 0 && order.status !== 'cancelled' && (
          <Button
            stretched
            mode="bezeled"
            onClick={() => void twoTap(`refund:${id}`, () => api.adminRecordRefund(id))}
          >
            {tapLabel(`refund:${id}`, `↩️ Mark refunded · ${money(-order.amountDue)}`)}
          </Button>
        )}
        {(order.status === 'pending' || order.status === 'awaiting_payment') && (
          <Button
            stretched
            mode="plain"
            onClick={() =>
              void twoTap(`cancel:${id}`, () => api.adminSetOrderStatus(id, 'cancelled'))
            }
          >
            {tapLabel(`cancel:${id}`, 'Cancel order')}
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
