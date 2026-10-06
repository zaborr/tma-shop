import { useState } from 'react';
import { Button, Cell, Input, Section, Textarea } from '@telegram-apps/telegram-ui';
import type { Category, Product, ProductInput } from '@tma-shop/shared';
import { api, ApiClientError } from '../../api/client.js';
import { toSlug } from '../../lib/slug.js';
import { ProductImage } from '../../components/ProductImage.js';
import { TOKENS, toMajor, type Token } from './common.js';

/** Create a product, or edit `product` when given. */
export function ProductForm({
  product,
  categories,
  defaultToken,
  onSaved,
  onCancel,
}: {
  product: Product | null;
  categories: Category[];
  defaultToken: Token;
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
