import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { retrieveLaunchParams } from '@telegram-apps/sdk-react';
import { Cell, List, Placeholder, Section } from '@telegram-apps/telegram-ui';
import { api } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { shopPath } from '../providers/ShopProvider.js';
import { Loader } from '../components/Loader.js';
import { ErrorView } from '../components/ErrorView.js';
import { ProductImage } from '../components/ProductImage.js';

let startParamUsed = false;

/** Shop slug from a `?startapp=<slug>` launch link, returned only the first time. */
function takeStartShop(): string | null {
  if (startParamUsed) return null;
  startParamUsed = true;
  try {
    const param = retrieveLaunchParams().tgWebAppStartParam;
    return typeof param === 'string' && /^[a-z0-9-]{1,64}$/.test(param) ? param : null;
  } catch {
    return null;
  }
}

/** Start screen: the shops in this bot. */
export function ShopsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const result = useAsync(() => api.getShops(), []);

  // Links like t.me/<bot>/<app>?startapp=<shop-slug> open that shop directly.
  useEffect(() => {
    const slug = takeStartShop();
    if (slug) navigate(shopPath(slug));
  }, [navigate]);

  if (result.loading) return <Loader />;
  if (result.error) return <ErrorView message={result.error} />;
  const shops = result.data?.shops ?? [];
  const isSuperAdmin = result.data?.isSuperAdmin ?? false;

  return (
    <List>
      {shops.length === 0 ? (
        <Placeholder
          header="No shops yet"
          description={isSuperAdmin ? 'Create the first one in Platform admin.' : 'Come back soon!'}
        >
          <span style={{ fontSize: 48 }}>🏪</span>
        </Placeholder>
      ) : (
        <Section header="Shops">
          {shops.map((shop) => (
            <Cell
              key={shop.id}
              onClick={() => navigate(shopPath(shop.slug))}
              before={<ProductImage url={shop.imageUrl} alt={shop.name} size={56} />}
              subtitle={shop.description || undefined}
              description={
                [shop.isVisible ? null : '🙈 Hidden', shop.canManage ? '🛠️ You manage it' : null]
                  .filter(Boolean)
                  .join(' · ') || undefined
              }
              multiline
            >
              {shop.name}
            </Cell>
          ))}
        </Section>
      )}

      {isSuperAdmin && (
        <Section header="Platform">
          <Cell onClick={() => navigate('/platform')} subtitle="Create, hide and assign admins">
            🛰️ Platform admin
          </Cell>
        </Section>
      )}
    </List>
  );
}
