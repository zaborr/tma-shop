import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Cell, List, Placeholder, Section } from '@telegram-apps/telegram-ui';
import type { OrderStatus } from '@tma-shop/shared';
import { api, ApiClientError } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatPrice, pluralize } from '../lib/format.js';
import { Loader } from '../components/Loader.js';
import { ErrorView } from '../components/ErrorView.js';

const STATUS_META: Record<OrderStatus, { label: string; type: 'number' | 'dot' }> = {
  pending: { label: 'Awaiting payment', type: 'dot' },
  awaiting_payment: { label: 'Verifying payment', type: 'dot' },
  paid: { label: 'Paid', type: 'dot' },
  cancelled: { label: 'Cancelled', type: 'dot' },
  fulfilled: { label: 'Fulfilled', type: 'dot' },
};

/** Customers can delete orders with nothing paid or under verification. */
const DELETABLE: OrderStatus[] = ['pending', 'cancelled'];

export function OrdersPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [reloadKey, setReloadKey] = useState(0);
  const { data: orders, loading, error } = useAsync(() => api.getOrders(), [reloadKey]);
  const [armed, setArmed] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Two taps: the first arms the button, the second deletes.
  const remove = async (orderId: string): Promise<void> => {
    if (armed !== orderId) {
      setArmed(orderId);
      return;
    }
    setArmed(null);
    setDeleteError(null);
    try {
      await api.deleteOrder(orderId);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Could not delete the order');
    }
  };

  if (loading) return <Loader />;
  if (error) return <ErrorView message={error} />;
  if (!orders || orders.length === 0) {
    return (
      <Placeholder header="No orders yet" description="Your orders will appear here">
        <span style={{ fontSize: 48 }}>📦</span>
      </Placeholder>
    );
  }

  return (
    <List>
      {deleteError && (
        <Section>
          <Cell multiline style={{ color: 'var(--tgui--destructive_text_color)' }}>
            {deleteError}
          </Cell>
        </Section>
      )}
      <Section header="My orders">
        {orders.map((order) => (
          <Cell
            key={order.id}
            onClick={() => navigate(`/orders/${order.id}`)}
            subtitle={pluralize(order.items.length, 'item', 'items')}
            after={formatPrice(order.total, order.currency)}
            description={
              DELETABLE.includes(order.status) &&
              order.amountPaid === 0 &&
              order.amountSubmitted === 0 ? (
                <Button
                  size="s"
                  mode="plain"
                  onClick={(event) => {
                    // The cell itself opens the order; don't navigate on delete.
                    event.stopPropagation();
                    void remove(order.id);
                  }}
                >
                  {armed === order.id ? 'Tap again to delete' : 'Delete'}
                </Button>
              ) : (
                <Badge type="dot" />
              )
            }
            hint={
              order.changeRequest
                ? 'Change requested'
                : order.status === 'pending' && order.amountPaid > 0
                  ? 'Difference to pay'
                  : STATUS_META[order.status].label
            }
            multiline
          >
            Order #{order.id.slice(0, 8)}
          </Cell>
        ))}
      </Section>
    </List>
  );
}
