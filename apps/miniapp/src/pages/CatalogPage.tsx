import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Cell, List, Section } from '@telegram-apps/telegram-ui';
import { Input } from '../components/Field.js';
import { api } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useCart } from '../providers/CartProvider.js';
import { Loader } from '../components/Loader.js';
import { ErrorView } from '../components/ErrorView.js';
import { ProductCard } from '../components/ProductCard.js';
import { ProductImage } from '../components/ProductImage.js';
import { useShop, useShopPath } from '../providers/ShopProvider.js';
import { t } from '../i18n/index.js';
import { LanguagePicker } from '../components/LanguagePicker.js';

export function CatalogPage(): React.JSX.Element {
  const navigate = useNavigate();
  const to = useShopPath();
  const { itemCount } = useCart();
  const { shop, canManage } = useShop();
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');

  const categories = useAsync(() => api.getCategories(), []);
  const products = useAsync(
    () => api.getProducts({ categoryId, search: search.trim() || undefined }),
    [categoryId, search],
  );

  return (
    <List>
      <Section>
        <Cell
          before={<ProductImage url={shop.imageUrl} alt={shop.name} size={48} />}
          subtitle={shop.description || undefined}
          description={shop.isVisible ? undefined : t('catalog.hiddenShop')}
          multiline
        >
          <strong>{shop.name}</strong>
        </Cell>
      </Section>
      <Section>
        <Cell
          onClick={() => navigate(to('/cart'))}
          after={itemCount > 0 ? <Badge type="number">{itemCount}</Badge> : undefined}
        >
          {t('catalog.cart')}
        </Cell>
        <Cell onClick={() => navigate(to('/orders'))}>{t('catalog.myOrders')}</Cell>
        {canManage && <Cell onClick={() => navigate(to('/admin'))}>{t('catalog.admin')}</Cell>}
      </Section>

      <Section header={t('catalog.title')}>
        <Input
          placeholder={t('catalog.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexWrap: 'wrap' }}>
          <Button
            size="s"
            mode={categoryId === undefined ? 'filled' : 'bezeled'}
            onClick={() => setCategoryId(undefined)}
          >
            {t('catalog.all')}
          </Button>
          {categories.data?.map((category) => (
            <Button
              key={category.id}
              size="s"
              mode={categoryId === category.id ? 'filled' : 'bezeled'}
              onClick={() => setCategoryId(category.id)}
            >
              {category.title}
            </Button>
          ))}
        </div>
      </Section>

      {products.loading && <Loader />}
      {products.error && <ErrorView message={products.error} />}
      {products.data && (
        <Section>
          {products.data.items.length === 0 ? (
            <Cell>{t('catalog.noProducts')}</Cell>
          ) : (
            products.data.items.map((product) => <ProductCard key={product.id} product={product} />)
          )}
        </Section>
      )}

      <LanguagePicker />
    </List>
  );
}
