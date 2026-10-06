import { useState } from 'react';
import { Button, Cell, Input, List, Section, Textarea } from '@telegram-apps/telegram-ui';
import type { OrderStatus, ProductInput } from '@tma-shop/shared';
import { api, ApiClientError } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useSession } from '../providers/SessionProvider.js';
import { formatPrice } from '../lib/format.js';
import { Loader } from '../components/Loader.js';
import { ErrorView } from '../components/ErrorView.js';

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Not paid yet',
  awaiting_payment: '🔎 Verify payment',
  paid: 'Paid',
  cancelled: 'Cancelled',
  fulfilled: 'Fulfilled',
};

export function AdminPage(): React.JSX.Element {
  const { isAdmin } = useSession();
  const [reloadKey, setReloadKey] = useState(0);
  const reload = (): void => setReloadKey((k) => k + 1);

  const shop = useAsync(() => api.getShop(), []);
  const orders = useAsync(() => api.adminGetOrders(), [reloadKey]);
  const products = useAsync(() => api.getProducts({ limit: 100 }), [reloadKey]);
  const [productError, setProductError] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);

  if (!isAdmin) return <ErrorView message="Admins only" />;

  const setStatus = async (id: string, status: OrderStatus): Promise<void> => {
    await api.adminSetOrderStatus(id, status);
    reload();
  };

  // Two-tap confirmation (native confirm dialogs are unreliable in Telegram webviews).
  const confirm = async (id: string, status: OrderStatus): Promise<void> => {
    const key = `${id}:${status}`;
    if (armed !== key) {
      setArmed(key);
      return;
    }
    setArmed(null);
    await setStatus(id, status);
  };
  const label = (id: string, status: OrderStatus, text: string): string =>
    armed === `${id}:${status}` ? 'Tap again to confirm' : text;

  const removeProduct = async (id: string): Promise<void> => {
    const key = `${id}:delete`;
    if (armed !== key) {
      setArmed(key);
      return;
    }
    setArmed(null);
    setProductError(null);
    try {
      await api.adminDeleteProduct(id);
      reload();
    } catch (err) {
      setProductError(err instanceof ApiClientError ? err.message : 'Could not delete the product');
    }
  };

  return (
    <List>
      <NewProductForm currency={shop.data?.currency ?? 'XTR'} onCreated={reload} />

      <Section
        header="Products"
        footer="Products that already have orders are archived: hidden from the shop, kept in order history."
      >
        {products.loading && <Loader />}
        {products.error && <ErrorView message={products.error} />}
        {productError && (
          <Cell multiline style={{ color: 'var(--tgui--destructive_text_color)' }}>
            {productError}
          </Cell>
        )}
        {products.data?.items.length === 0 && <Cell>No products</Cell>}
        {products.data?.items.map((product) => (
          <Cell
            key={product.id}
            subtitle={`${formatPrice(product.price, product.currency)} · ${
              product.stock === null ? 'not stock-tracked' : `${product.stock} in stock`
            }`}
            after={
              <Button size="s" mode="plain" onClick={() => void removeProduct(product.id)}>
                {armed === `${product.id}:delete` ? 'Tap again to delete' : 'Delete'}
              </Button>
            }
            multiline
          >
            {product.title}
          </Cell>
        ))}
      </Section>

      <Section header="All orders">
        {orders.loading && <Loader />}
        {orders.error && <ErrorView message={orders.error} />}
        {orders.data?.length === 0 && <Cell>No orders</Cell>}
        {orders.data?.map((order) => (
          <Cell
            key={order.id}
            subtitle={`${STATUS_LABEL[order.status]} · ${formatPrice(order.total, order.currency)}`}
            description={
              order.paymentTxHash ? (
                <span style={{ wordBreak: 'break-all', whiteSpace: 'normal' }}>
                  {order.paymentNetwork ?? ''}
                  {' · '}
                  {order.paymentTxUrl ? (
                    <a href={order.paymentTxUrl} target="_blank" rel="noreferrer">
                      {order.paymentTxHash}
                    </a>
                  ) : (
                    order.paymentTxHash
                  )}
                </span>
              ) : undefined
            }
            after={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {order.status === 'awaiting_payment' && (
                  <Button
                    size="s"
                    mode="filled"
                    onClick={() => void confirm(order.id, 'paid')}
                  >
                    {label(order.id, 'paid', 'Mark paid')}
                  </Button>
                )}
                {order.status === 'paid' && (
                  <Button
                    size="s"
                    mode="bezeled"
                    onClick={() => void setStatus(order.id, 'fulfilled')}
                  >
                    Fulfill
                  </Button>
                )}
                {(order.status === 'pending' || order.status === 'awaiting_payment') && (
                  <Button
                    size="s"
                    mode="plain"
                    onClick={() => void confirm(order.id, 'cancelled')}
                  >
                    {label(order.id, 'cancelled', 'Cancel')}
                  </Button>
                )}
              </div>
            }
            multiline
          >
            #{order.id.slice(0, 8)}
          </Cell>
        ))}
      </Section>
    </List>
  );
}

function NewProductForm({
  currency,
  onCreated,
}: {
  currency: string;
  onCreated: () => void;
}): React.JSX.Element {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    const input: ProductInput = {
      categoryId: null,
      slug: slug.trim(),
      title: title.trim(),
      description: description.trim(),
      // Fiat prices are typed in major units (12.90) and stored in cents.
      price:
        currency === 'XTR'
          ? Math.round(Number(price) || 0)
          : Math.round((Number(price) || 0) * 100),
      currency,
      imageUrl: null,
      stock: null,
      isActive: true,
    };
    try {
      const created = await api.adminCreateProduct(input);
      setMessage(`Created "${created.title}"`);
      setTitle('');
      setSlug('');
      setPrice('');
      setDescription('');
      onCreated();
    } catch (err) {
      setMessage(err instanceof ApiClientError ? err.message : 'Failed to create product');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section header="Add product">
      <Input header="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input header="Slug (kebab-case)" value={slug} onChange={(e) => setSlug(e.target.value)} />
      <Input
        header={currency === 'XTR' ? 'Price (Stars)' : `Price (${currency}, e.g. 12.90)`}
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      <Textarea
        header="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div style={{ padding: 16 }}>
        <Button stretched loading={busy} disabled={!title || !slug} onClick={() => void submit()}>
          Create product
        </Button>
        {message && <Cell>{message}</Cell>}
      </div>
    </Section>
  );
}
