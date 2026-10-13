import { useNavigate } from 'react-router-dom';
import { Cell } from '@telegram-apps/telegram-ui';
import type { Product } from '@tma-shop/shared';
import { formatPrice } from '../lib/format.js';
import { ProductImage } from './ProductImage.js';
import { isSoldOut, priceRange } from '../lib/variants.js';
import { useShopPath } from '../providers/ShopProvider.js';
import { t } from '../i18n/index.js';

export function ProductCard({ product }: { product: Product }): React.JSX.Element {
  const navigate = useNavigate();
  const to = useShopPath();
  const outOfStock = isSoldOut(product);
  const { min, max } = priceRange(product);
  const price =
    min === max
      ? formatPrice(min, product.currency)
      : t('product.from', { price: formatPrice(min, product.currency) });

  return (
    <Cell
      onClick={() => navigate(to(`/product/${product.id}`))}
      before={<ProductImage url={product.imageUrl} alt={product.title} size={56} />}
      subtitle={product.description}
      after={price}
      hint={outOfStock ? t('product.outOfStock') : undefined}
      multiline
    >
      {product.title}
    </Cell>
  );
}
