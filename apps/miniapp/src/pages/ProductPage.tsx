import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Cell, List, Section, Text, Title } from '@telegram-apps/telegram-ui';
import type { Product } from '@tma-shop/shared';
import { api, ApiClientError } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useCart } from '../providers/CartProvider.js';
import { useMainButton } from '../hooks/useMainButton.js';
import { formatPrice } from '../lib/format.js';
import { Loader } from '../components/Loader.js';
import { ErrorView } from '../components/ErrorView.js';
import {
  findVariant,
  hasVariants,
  isSoldOut,
  isValueAvailable,
  priceRange,
} from '../lib/variants.js';
import { ProductImage } from '../components/ProductImage.js';
import { useShopPath } from '../providers/ShopProvider.js';

export function ProductPage(): React.JSX.Element {
  const { id = '' } = useParams();
  const { data: product, loading, error } = useAsync(() => api.getProduct(id), [id]);

  if (loading) return <Loader />;
  if (error || !product) return <ErrorView message={error ?? 'Product not found'} />;
  return <ProductView key={product.id} product={product} />;
}

function ProductView({ product }: { product: Product }): React.JSX.Element {
  const navigate = useNavigate();
  const to = useShopPath();
  const { add } = useCart();
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const withVariants = hasVariants(product);
  // Preselect values when an option has a single choice.
  const [selected, setSelected] = useState<Array<string | null>>(() =>
    product.options.map((o) => (o.values.length === 1 ? (o.values[0] ?? null) : null)),
  );
  const variant = withVariants ? findVariant(product, selected) : null;
  const missing = withVariants && !variant;

  const stock = withVariants ? (variant?.stock ?? null) : product.stock;
  const outOfStock = withVariants
    ? isSoldOut(product) || (variant !== null && variant.stock !== null && variant.stock <= 0)
    : product.stock !== null && product.stock <= 0;
  const { min, max } = priceRange(product);
  const priceText = variant
    ? formatPrice(variant.price, product.currency)
    : min === max
      ? formatPrice(min, product.currency)
      : `${formatPrice(min, product.currency)} – ${formatPrice(max, product.currency)}`;

  const onAdd = useCallback(async () => {
    if (withVariants && !variant) {
      setAddError('Choose an option first');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await add(product.id, variant?.id ?? null, 1);
      navigate(to('/cart'));
    } catch (err) {
      setAddError(err instanceof ApiClientError ? err.message : 'Could not add to cart');
    } finally {
      setAdding(false);
    }
  }, [product.id, withVariants, variant, add, navigate, to]);

  useMainButton({
    text: outOfStock ? 'Out of stock' : missing ? 'Choose an option' : 'Add to cart',
    visible: true,
    enabled: !outOfStock && !missing,
    loading: adding,
    onClick: onAdd,
  });

  const choose = (index: number, value: string): void =>
    setSelected((prev) => prev.map((v, i) => (i === index ? (v === value ? null : value) : v)));

  return (
    <List>
      <Section>
        <ProductImage url={product.imageUrl} alt={product.title} />
        <div style={{ padding: 16 }}>
          <Title level="2" weight="2">
            {product.title}
          </Title>
          <Title level="3" weight="1" style={{ marginTop: 8 }}>
            {priceText}
          </Title>
          <Text style={{ display: 'block', marginTop: 12 }}>{product.description}</Text>
        </div>
      </Section>

      {product.options.map((option, index) => (
        <Section key={option.name} header={option.name}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
            {option.values.map((value) => {
              const available = isValueAvailable(product, selected, index, value);
              return (
                <Button
                  key={value}
                  size="s"
                  mode={selected[index] === value ? 'filled' : 'bezeled'}
                  disabled={!available && selected[index] !== value}
                  onClick={() => choose(index, value)}
                >
                  {value}
                </Button>
              );
            })}
          </div>
        </Section>
      ))}

      {addError && (
        <Section>
          <Cell multiline style={{ color: 'var(--tgui--destructive_text_color)' }}>
            {addError}
          </Cell>
        </Section>
      )}
      <Section>
        <Cell
          after={
            missing
              ? 'Choose an option'
              : stock === null
                ? 'In stock'
                : stock > 0
                  ? `${stock} left`
                  : 'Out of stock'
          }
        >
          Availability
        </Cell>
      </Section>
    </List>
  );
}
