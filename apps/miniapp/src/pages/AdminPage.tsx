import { useState } from 'react';
import { Button, Cell, Input, List, Section, Textarea } from '@telegram-apps/telegram-ui';
import type { Category, OrderStatus, Product, ProductInput } from '@tma-shop/shared';
import { api, ApiClientError } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useSession } from '../providers/SessionProvider.js';
import { formatPrice } from '../lib/format.js';
import { toSlug } from '../lib/slug.js';
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
  const categories = useAsync(() => api.getCategories(), [reloadKey]);
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
  const categoryList = categories.data ?? [];
  const categoryName = (id: string | null): string | undefined =>
    categoryList.find((c) => c.id === id)?.title;

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
        categories={categoryList}
        defaultToken={defaultToken}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
        onCancel={() => setEditing(null)}
      />

      <CategoriesSection
        categories={categoryList}
        loading={categories.loading}
        productCount={(id) => products.data?.filter((p) => p.categoryId === id).length ?? 0}
        run={run}
        twoTap={twoTap}
        tapLabel={tapLabel}
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
            subtitle={[
              formatPrice(product.price, product.currency),
              product.stock === null ? 'not stock-tracked' : `${product.stock} in stock`,
              categoryName(product.categoryId) ?? 'no category',
              product.isActive ? null : '🙈 hidden',
            ]
              .filter(Boolean)
              .join(' · ')}
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
            {order.contactUsername && (
              <>
                {' · '}
                <a
                  href={`https://t.me/${order.contactUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  @{order.contactUsername}
                </a>
              </>
            )}
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
  categories,
  defaultToken,
  onSaved,
  onCancel,
}: {
  product: Product | null;
  categories: Category[];
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
  const [categoryId, setCategoryId] = useState<string | null>(product?.categoryId ?? null);
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
      // A category deleted meanwhile falls back to "no category".
      categoryId: categories.some((c) => c.id === categoryId) ? categoryId : null,
      // Left empty, the slug is derived from the title.
      slug: slug.trim() || toSlug(title),
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
        setCategoryId(null);
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
      <Input
        header="Slug (optional, auto from title)"
        placeholder={title ? toSlug(title) : 'te-verde-sencha'}
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
      />
      <Cell
        subtitle="Category"
        multiline
        description={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <Button
              size="s"
              mode={categoryId === null ? 'filled' : 'bezeled'}
              onClick={() => setCategoryId(null)}
            >
              None
            </Button>
            {categories.map((c) => (
              <Button
                key={c.id}
                size="s"
                mode={categoryId === c.id ? 'filled' : 'bezeled'}
                onClick={() => setCategoryId(c.id)}
              >
                {c.title}
              </Button>
            ))}
          </div>
        }
      >
        {categories.find((c) => c.id === categoryId)?.title ?? 'No category'}
      </Cell>
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
          disabled={!title.trim() || imageInvalid || stockInvalid}
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

/** Create, rename, reorder and delete the shop's categories. */
function CategoriesSection({
  categories,
  loading,
  productCount,
  run,
  twoTap,
  tapLabel,
}: {
  categories: Category[];
  loading: boolean;
  productCount: (categoryId: string) => number;
  run: (action: () => Promise<unknown>) => Promise<void>;
  twoTap: (key: string, action: () => Promise<unknown>) => Promise<void>;
  tapLabel: (key: string, text: string, confirmText?: string) => string;
}): React.JSX.Element {
  const [newTitle, setNewTitle] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');

  const nextOrder = categories.reduce((max, c) => Math.max(max, c.sortOrder + 1), 0);

  const add = (): Promise<void> => {
    const title = newTitle.trim();
    return run(async () => {
      await api.adminCreateCategory({ slug: toSlug(title), title, sortOrder: nextOrder });
      setNewTitle('');
    });
  };

  const rename = (category: Category): Promise<void> =>
    run(async () => {
      await api.adminUpdateCategory(category.id, {
        slug: category.slug,
        title: renameTitle.trim(),
        sortOrder: category.sortOrder,
      });
      setRenaming(null);
    });

  /** Moves a category up/down by renumbering the whole list 0..n. */
  const move = (index: number, delta: -1 | 1): Promise<void> => {
    const order = [...categories];
    const target = index + delta;
    const a = order[index];
    const b = order[target];
    if (!a || !b) return Promise.resolve();
    order[index] = b;
    order[target] = a;
    return run(() =>
      Promise.all(
        order.map((c, i) =>
          c.sortOrder === i
            ? null
            : api.adminUpdateCategory(c.id, { slug: c.slug, title: c.title, sortOrder: i }),
        ),
      ),
    );
  };

  return (
    <Section
      header="Categories"
      footer="Customers can filter the catalog by category. Deleting a category keeps its products, without a category."
    >
      {loading && <Loader />}
      {!loading && categories.length === 0 && <Cell>No categories yet</Cell>}
      {categories.map((category, index) =>
        renaming === category.id ? (
          <div key={category.id}>
            <Input
              header={`Rename "${category.title}"`}
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px' }}>
              <Button
                size="s"
                mode="filled"
                disabled={!renameTitle.trim()}
                onClick={() => void rename(category)}
              >
                Save
              </Button>
              <Button size="s" mode="plain" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Cell
            key={category.id}
            subtitle={`${productCount(category.id)} products`}
            multiline
            description={
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <Button
                  size="s"
                  mode="bezeled"
                  disabled={index === 0}
                  onClick={() => void move(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  size="s"
                  mode="bezeled"
                  disabled={index === categories.length - 1}
                  onClick={() => void move(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  size="s"
                  mode="bezeled"
                  onClick={() => {
                    setRenaming(category.id);
                    setRenameTitle(category.title);
                  }}
                >
                  Rename
                </Button>
                <Button
                  size="s"
                  mode="plain"
                  onClick={() =>
                    void twoTap(`category:${category.id}`, () =>
                      api.adminDeleteCategory(category.id),
                    )
                  }
                >
                  {tapLabel(`category:${category.id}`, 'Delete', 'Tap again to delete')}
                </Button>
              </div>
            }
          >
            {category.title}
          </Cell>
        ),
      )}
      <Input
        header="New category"
        placeholder="e.g. Green tea"
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
      />
      <div style={{ padding: '0 16px 16px' }}>
        <Button stretched mode="bezeled" disabled={!newTitle.trim()} onClick={() => void add()}>
          Add category
        </Button>
      </div>
    </Section>
  );
}
