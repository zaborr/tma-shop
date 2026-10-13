import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Cell, List, Section } from '@telegram-apps/telegram-ui';
import type { Category, Product } from '@tma-shop/shared';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { formatPrice } from '../../lib/format.js';
import { Loader } from '../../components/Loader.js';
import { ErrorView } from '../../components/ErrorView.js';
import { ProductImage } from '../../components/ProductImage.js';
import { CategoriesSection } from './CategoriesSection.js';
import { AdminOnly, ErrorBanner, toInput, useAdminActions, type AdminActions } from './common.js';
import { useShopPath } from '../../providers/ShopProvider.js';
import { t, tn } from '../../i18n/index.js';

/** Categories (create, rename, reorder, delete) and the products grouped by category. */
export function AdminCatalogPage(): React.JSX.Element {
  return (
    <AdminOnly>
      <AdminCatalog />
    </AdminOnly>
  );
}

function AdminCatalog(): React.JSX.Element {
  const navigate = useNavigate();
  const to = useShopPath();
  const [reloadKey, setReloadKey] = useState(0);
  const actions = useAdminActions(() => setReloadKey((k) => k + 1));
  const products = useAsync(() => api.adminGetProducts(), [reloadKey]);
  const categories = useAsync(() => api.getCategories(), [reloadKey]);

  const categoryList = categories.data ?? [];
  const productList = products.data ?? [];
  const groups: Array<{ key: string; title: string; items: Product[] }> = [
    ...categoryList.map((category: Category) => ({
      key: category.id,
      title: category.title,
      items: productList.filter((p) => p.categoryId === category.id),
    })),
    {
      key: 'none',
      title: t('adminCatalog.noCategory'),
      items: productList.filter(
        (p) => p.categoryId === null || !categoryList.some((c) => c.id === p.categoryId),
      ),
    },
  ];

  return (
    <List>
      <ErrorBanner message={actions.error} />

      <Section>
        <Cell onClick={() => navigate(to('/admin/products/new'))}>{t('adminHome.newProduct')}</Cell>
      </Section>

      <CategoriesSection
        categories={categoryList}
        loading={categories.loading}
        productCount={(id) => productList.filter((p) => p.categoryId === id).length}
        run={actions.run}
        twoTap={actions.twoTap}
        tapLabel={actions.tapLabel}
      />

      {products.loading && <Loader />}
      {products.error && <ErrorView message={products.error} />}
      {products.data &&
        groups
          .filter((group) => group.items.length > 0 || group.key !== 'none')
          .map((group) => (
            <Section key={group.key} header={`${group.title} · ${group.items.length}`}>
              {group.items.length === 0 && <Cell>{t('adminCatalog.emptyCategory')}</Cell>}
              {group.items.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  actions={actions}
                  onEdit={() => navigate(to(`/admin/products/${product.id}`))}
                />
              ))}
            </Section>
          ))}

      <Section footer={t('adminCatalog.footer')}>
        {null}
      </Section>
    </List>
  );
}

/** "12 in stock", "unlimited stock" or, with variants, "6 variants · 40 in stock". */
function stockSummary(product: Product): string {
  if (product.options.length === 0) {
    return product.stock === null
      ? t('adminCatalog.unlimited')
      : t('adminCatalog.inStock', { count: product.stock });
  }
  const active = product.variants.filter((v) => v.isActive);
  const tracked = active.every((v) => v.stock !== null);
  const total = active.reduce((sum, v) => sum + (v.stock ?? 0), 0);
  return `${tn(active.length, 'count.variants.one', 'count.variants.other')} · ${
    tracked ? t('adminCatalog.inStock', { count: total }) : t('adminCatalog.unlimited')
  }`;
}

function ProductRow({
  product,
  actions,
  onEdit,
}: {
  product: Product;
  actions: AdminActions;
  onEdit: () => void;
}): React.JSX.Element {
  const key = `product:${product.id}`;
  return (
    <Cell
      before={<ProductImage url={product.imageUrl} alt={product.title} size={48} />}
      subtitle={[
        formatPrice(product.price, product.currency),
        stockSummary(product),
        product.isActive ? null : t('adminCatalog.hidden'),
      ]
        .filter(Boolean)
        .join(' · ')}
      multiline
      description={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <Button size="s" mode="bezeled" onClick={onEdit}>
            {t('common.edit')}
          </Button>
          <Button
            size="s"
            mode="bezeled"
            onClick={() =>
              void actions.run(() =>
                api.adminUpdateProduct(product.id, toInput(product, !product.isActive)),
              )
            }
          >
            {product.isActive ? t('common.hide') : t('common.show')}
          </Button>
          <Button
            size="s"
            mode="plain"
            onClick={() => void actions.twoTap(key, () => api.adminDeleteProduct(product.id))}
          >
            {actions.tapLabel(key, t('common.delete'), t('common.tapAgainToDelete'))}
          </Button>
        </div>
      }
    >
      {product.title}
    </Cell>
  );
}
