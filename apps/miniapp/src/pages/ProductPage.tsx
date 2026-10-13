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
  tierTable,
} from '../lib/variants.js';
import { ProductImage } from '../components/ProductImage.js';
import { useShopPath } from '../providers/ShopProvider.js';
import { t, tn } from '../i18n/index.js';

export function ProductPage(): React.JSX.Element {
  const { id = '' } = useParams();
  const { data: product, loading, error } = useAsync(() => api.getProduct(id), [id]);

  if (loading) return <Loader />;
  if (error || !product) return <ErrorView message={error ?? t('product.notFound')} />;
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
      setAddError(t('product.chooseFirst'));
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await add(product.id, variant?.id ?? null, 1);
      navigate(to('/cart'));
    } catch (err) {
      setAddError(err instanceof ApiClientError ? err.message : t('product.addFailed'));
    } finally {
      setAdding(false);
    }
  }, [product.id, withVariants, variant, add, navigate, to]);

  useMainButton({
    text: outOfStock ? t('product.outOfStock') : missing ? t('product.chooseOption') : t('product.addToCart'),
    visible: true,
    enabled: !outOfStock && !missing,
    loading: adding,
    onClick: onAdd,
  });

  const tiers = tierTable(product, variant);

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

      {tiers.length > 0 && (
        <Section
          header={t('product.volumePricing')}
          footer={withVariants ? t('product.volumeFooterVariants') : t('product.volumeFooter')}
        >
          {tiers.map((tier) => (
            <Cell key={tier.from} after={formatPrice(tier.price, product.currency)}>
              {tier.to === null
                ? t('product.unitsFrom', { from: tier.from })
                : tier.from === tier.to
                  ? tn(tier.from, 'units.one', 'units.other')
                  : t('product.unitsRange', { from: tier.from, to: tier.to })}
            </Cell>
          ))}
        </Section>
      )}

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
              ? t('product.chooseOption')
              : stock === null
                ? t('product.inStock')
                : stock > 0
                  ? t('product.left', { count: stock })
                  : t('product.outOfStock')
          }
        >
          {t('product.availability')}
        </Cell>
      </Section>
    </List>
  );
}
