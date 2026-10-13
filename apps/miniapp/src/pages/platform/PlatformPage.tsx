import { useNavigate } from 'react-router-dom';
import { Cell, List, Placeholder, Section } from '@telegram-apps/telegram-ui';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useSession } from '../../providers/SessionProvider.js';
import { shopPath } from '../../providers/ShopProvider.js';
import { Loader } from '../../components/Loader.js';
import { ErrorView } from '../../components/ErrorView.js';
import { ProductImage } from '../../components/ProductImage.js';
import { t, tn } from '../../i18n/index.js';

/** Platform super-admin: every shop, hidden ones included. */
export function PlatformPage(): React.JSX.Element {
  const { isSuperAdmin } = useSession();
  if (!isSuperAdmin) return <ErrorView message={t('platform.only')} />;
  return <Platform />;
}

function Platform(): React.JSX.Element {
  const navigate = useNavigate();
  const shops = useAsync(() => api.platformGetShops(), []);

  if (shops.loading) return <Loader />;
  if (shops.error) return <ErrorView message={shops.error} />;
  const list = shops.data ?? [];

  return (
    <List>
      <Section>
        <Cell onClick={() => navigate('/platform/shops/new')}>{t('platform.newShop')}</Cell>
        <Cell onClick={() => navigate('/platform/retention')}>{t('platform.retention')}</Cell>
      </Section>

      {list.length === 0 ? (
        <Placeholder header={t('shops.empty')} description={t('platform.createFirst')}>
          <span style={{ fontSize: 48 }}>🏪</span>
        </Placeholder>
      ) : (
        <Section
          header={t('platform.allShops', { count: list.length })}
          footer={t('platform.footer')}
        >
          {list.map((shop) => (
            <Cell
              key={shop.id}
              onClick={() => navigate(`/platform/shops/${shop.id}`)}
              before={<ProductImage url={shop.imageUrl} alt={shop.name} size={48} />}
              subtitle={[
                `/${shop.slug}`,
                shop.isVisible ? t('platform.visible') : t('platform.hidden'),
                tn(shop.adminIds.length, 'count.admins.one', 'count.admins.other'),
                tn(shop.paymentMethods.length, 'count.paymentOptions.one', 'count.paymentOptions.other'),
              ].join(' · ')}
              after={
                <span
                  role="button"
                  style={{ color: 'var(--tg-theme-link-color, #2481cc)' }}
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate(shopPath(shop.slug));
                  }}
                >
                  {t('platform.open')}
                </span>
              }
              multiline
            >
              {shop.name}
            </Cell>
          ))}
        </Section>
      )}
    </List>
  );
}
