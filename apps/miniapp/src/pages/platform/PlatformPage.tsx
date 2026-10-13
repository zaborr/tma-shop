import { useNavigate } from 'react-router-dom';
import { Cell, List, Placeholder, Section } from '@telegram-apps/telegram-ui';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useSession } from '../../providers/SessionProvider.js';
import { shopPath } from '../../providers/ShopProvider.js';
import { Loader } from '../../components/Loader.js';
import { ErrorView } from '../../components/ErrorView.js';
import { ProductImage } from '../../components/ProductImage.js';

/** Platform super-admin: every shop, hidden ones included. */
export function PlatformPage(): React.JSX.Element {
  const { isSuperAdmin } = useSession();
  if (!isSuperAdmin) return <ErrorView message="Platform admins only" />;
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
        <Cell onClick={() => navigate('/platform/shops/new')}>➕ New shop</Cell>
        <Cell onClick={() => navigate('/platform/retention')}>🧹 Data retention</Cell>
      </Section>

      {list.length === 0 ? (
        <Placeholder header="No shops yet" description="Create the first one.">
          <span style={{ fontSize: 48 }}>🏪</span>
        </Placeholder>
      ) : (
        <Section
          header={`All shops · ${list.length}`}
          footer="Tap a shop to edit its name, visibility and admins. Open it to manage its catalog, wallets and orders."
        >
          {list.map((shop) => (
            <Cell
              key={shop.id}
              onClick={() => navigate(`/platform/shops/${shop.id}`)}
              before={<ProductImage url={shop.imageUrl} alt={shop.name} size={48} />}
              subtitle={[
                `/${shop.slug}`,
                shop.isVisible ? 'visible' : '🙈 hidden',
                `${shop.adminIds.length} ${shop.adminIds.length === 1 ? 'admin' : 'admins'}`,
                `${shop.paymentMethods.length} payment methods`,
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
                  Open
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
