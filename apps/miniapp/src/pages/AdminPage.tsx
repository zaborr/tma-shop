import { useState } from 'react';
import { Button, Cell, Input, List, Section, Textarea } from '@telegram-apps/telegram-ui';
import type { OrderStatus, Product, ProductInput } from '@tma-shop/shared';
import { api, ApiClientError } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useSession } from '../providers/SessionProvider.js';
import { formatPrice } from '../lib/format.js';
import { Loader } from '../components/Loader.js';
import { ErrorView } from '../components/ErrorView.js';
import { ProductImage } from '../components/ProductImage.js';

/** Tokens a product can be priced in. Prices are stored in cents (1290 = 12.90). */
const TOKENS = ['USDC', 'EURC'] as const;

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Not paid yet',
  awaiting_payment: '🔎 Verify payment',
  paid: 'Paid',
  cancelled: 'Cancelled',
  fulfilled: 'Fulfilled',
};

function toInput(product: Product, isActive: boolean): ProductInput {
  return {
    categoryId: product.categoryId,
    slug: product.slug,
    title: product.title,
    description: product.description,
    price: product.price,
    currency: product.currency,
    imageUrl: product.imageUrl,
    stock: product.stock,
    isActive,
  };
}

export function AdminPage(): React.JSX.Element {
  const { isAdmin } = useSession();
  const [reloadKey, setReloadKey] = useState(0);
  const reload = (): void => setReloadKey((k) => k + 1);

  const shop = useAsync(() => api.getShop(), []);
  const orders = useAsync(() => api.adminGetOrders(), [reloadKey]);
  const products = useAsync(() => api.adminGetProducts(), [reloadKey]);
  const [error, setError] = useState<string | null>(null);
  // Two-tap confirmation (native confirm dialogs are unreliable in Telegram webviews).
  const [armed, setArmed] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);

  if (!isAdmin) return <ErrorView message="Admins only" />;

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong');
    }
  };

  /** Runs `action` on the second tap of the button identified by `key`. */
  const twoTap = async (key: string, action: () => Promise<unknown>): Promise<void> => {
    if (armed !== key) {
      setArmed(key);
      return;
    }
    setArmed(null);
    await run(action);
  };

  const tapLabel = (key: string, text: string, confirmText = 'Tap again to confirm'): string =>
    armed === key ? confirmText : text;

  const defaultToken = TOKENS.find((t) => t === shop.data?.currency) ?? 'USDC';

  return (
    <List>
      {error && (
        <Section>
          <Cell multiline style={{ color: 'var(--tgui--destructive_text_color)' }}>
            {error}
          </Cell>
        </Section>
      )}

      <ProductForm
        key={editing?.id ?? 'new'}
        product={editing}
        defaultToken={defaultToken}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
        onCancel={() => setEditing(null)}
      />

      <Section
        header="Products"
        footer="Hidden products are not shown in the shop. Deleting a product that already has orders hides it instead, so order history stays intact."
      >
        {products.loading && <Loader />}
        {products.error && <ErrorView message={products.error} />}
        {products.data?.length === 0 && <Cell>No products</Cell>}
        {products.data?.map((product) => (
          <Cell
            key={product.id}
            before={<ProductImage url={product.imageUrl} alt={product.title} size={48} />}
            subtitle={`${formatPrice(product.price, product.currency)} · ${
              product.stock === null ? 'not stock-tracked' : `${product.stock} in stock`
            }${product.isActive ? '' : ' · 🙈 hidden'}`}
            after={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button
                  size="s"
                  mode="bezeled"
                  onClick={() => {
                    setEditing(product);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="s"
                  mode="bezeled"
                  onClick={() =>
                    void run(() =>
                      api.adminUpdateProduct(product.id, toInput(product, !product.isActive)),
                    )
                  }
                >
                  {product.isActive ? 'Hide' : 'Show'}
                </Button>
                <Button
                  size="s"
                  mode="plain"
                  onClick={() =>
                    void twoTap(`product:${product.id}`, () => api.adminDeleteProduct(product.id))
                  }
                >
                  {tapLabel(`product:${product.id}`, 'Delete', 'Tap again to delete')}
                </Button>
              </div>
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
                    onClick={() =>
                      void twoTap(`paid:${order.id}`, () =>
                        api.adminSetOrderStatus(order.id, 'paid'),
                      )
                    }
                  >
                    {tapLabel(`paid:${order.id}`, 'Mark paid')}
                  </Button>
                )}
                {order.status === 'paid' && (
                  <Button
                    size="s"
                    mode="bezeled"
                    onClick={() => void run(() => api.adminSetOrderStatus(order.id, 'fulfilled'))}
                  >
                    Fulfill
                  </Button>
                )}
                {(order.status === 'pending' || order.status === 'awaiting_payment') && (
                  <Button
                    size="s"
                    mode="plain"
                    onClick={() =>
                      void twoTap(`cancel:${order.id}`, () =>
                        api.adminSetOrderStatus(order.id, 'cancelled'),
                      )
                    }
                  >
                    {tapLabel(`cancel:${order.id}`, 'Cancel')}
                  </Button>
                )}
                <Button
                  size="s"
                  mode="plain"
                  onClick={() =>
                    void twoTap(`delete:${order.id}`, () => api.adminDeleteOrder(order.id))
                  }
                >
                  {tapLabel(`delete:${order.id}`, 'Delete', 'Tap again to delete')}
                </Button>
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

/** Major units ("12.90") from a price stored in cents. */
function toMajor(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Create a product, or edit `product` when given. */
function ProductForm({
  product,
  defaultToken,
  onSaved,
  onCancel,
}: {
  product: Product | null;
  defaultToken: (typeof TOKENS)[number];
  onSaved: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [title, setTitle] = useState(product?.title ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [price, setPrice] = useState(product ? toMajor(product.price) : '');
  const [token, setToken] = useState<string>(product?.currency ?? defaultToken);
  const [stock, setStock] = useState(
    product && product.stock !== null ? String(product.stock) : '',
  );
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const image = imageUrl.trim();
  const imageInvalid = image !== '' && !/^https:\/\/\S+$/i.test(image);
  const stockValue = stock.trim();
  const stockInvalid = stockValue !== '' && !/^\d+$/.test(stockValue);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    const input: ProductInput = {
      categoryId: product?.categoryId ?? null,
      slug: slug.trim(),
      title: title.trim(),
      description: description.trim(),
      // Typed in token units (12.90) and stored in cents.
      price: Math.round((Number(price.replace(',', '.')) || 0) * 100),
      currency: token,
      imageUrl: image === '' ? null : image,
      stock: stockValue === '' ? null : Number(stockValue),
      isActive: product?.isActive ?? true,
    };
    try {
      const saved = product
        ? await api.adminUpdateProduct(product.id, input)
        : await api.adminCreateProduct(input);
      setMessage(`${product ? 'Saved' : 'Created'} "${saved.title}"`);
      if (!product) {
        setTitle('');
        setSlug('');
        setPrice('');
        setStock('');
        setImageUrl('');
        setDescription('');
      }
      onSaved();
    } catch (err) {
      setMessage(err instanceof ApiClientError ? err.message : 'Could not save the product');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section header={product ? `Edit product: ${product.title}` : 'Add product'}>
      <Input header="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input header="Slug (kebab-case)" value={slug} onChange={(e) => setSlug(e.target.value)} />
      <Cell
        subtitle="Price currency"
        after={
          <div style={{ display: 'flex', gap: 8 }}>
            {TOKENS.map((t) => (
              <Button
                key={t}
                size="s"
                mode={t === token ? 'filled' : 'bezeled'}
                onClick={() => setToken(t)}
              >
                {t}
              </Button>
            ))}
          </div>
        }
      >
        {token}
      </Cell>
      <Input
        header={`Price (${token}, e.g. 12.90)`}
        type="text"
        inputMode="decimal"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      <Input
        header={stockInvalid ? 'Stock — whole number, or empty' : 'Stock (empty = unlimited)'}
        type="text"
        inputMode="numeric"
        status={stockInvalid ? 'error' : 'default'}
        value={stock}
        onChange={(e) => setStock(e.target.value)}
      />
      <Input
        header={imageInvalid ? 'Image URL — must start with https://' : 'Image URL (optional)'}
        type="url"
        placeholder="https://…/photo.jpg"
        status={imageInvalid ? 'error' : 'default'}
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
      />
      {image !== '' && !imageInvalid && (
        <div style={{ padding: '8px 16px' }}>
          <ProductImage url={image} alt="Preview" size={96} />
        </div>
      )}
      <Textarea
        header="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button
          stretched
          loading={busy}
          disabled={!title || !slug || imageInvalid || stockInvalid}
          onClick={() => void submit()}
        >
          {product ? 'Save changes' : 'Create product'}
        </Button>
        {product && (
          <Button stretched mode="plain" onClick={onCancel}>
            Cancel editing
          </Button>
        )}
        {message && <Cell multiline>{message}</Cell>}
      </div>
    </Section>
  );
}
