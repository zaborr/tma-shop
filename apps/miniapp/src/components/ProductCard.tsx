import { useNavigate } from 'react-router-dom';
import { Cell } from '@telegram-apps/telegram-ui';
import type { Product } from '@tma-shop/shared';
import { formatPrice } from '../lib/format.js';
import { ProductImage } from './ProductImage.js';

export function ProductCard({ product }: { product: Product }): React.JSX.Element {
  const navigate = useNavigate();
  const outOfStock = product.stock !== null && product.stock <= 0;

  return (
    <Cell
      onClick={() => navigate(`/product/${product.id}`)}
      before={<ProductImage url={product.imageUrl} alt={product.title} size={56} />}
      subtitle={product.description}
      after={formatPrice(product.price, product.currency)}
      hint={outOfStock ? 'Out of stock' : undefined}
      multiline
    >
      {product.title}
    </Cell>
  );
}
