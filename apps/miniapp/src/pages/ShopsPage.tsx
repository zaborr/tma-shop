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
import { t, tn } from '../i18n/index.js';
import { LanguagePicker } from '../components/LanguagePicker.js';

let startParamUsed = false;

const SLUG_RE = /^[a-z0-9-]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where a launch link points, returned only the first time:
 * `?startapp=<slug>` opens a shop; `?shop=<slug>&order=<id>` (the bot's
 * payment reminders) opens that order.
 */
function takeStartPath(): string | null {
  if (startParamUsed) return null;
  startParamUsed = true;
  try {
    const query = new URLSearchParams(window.location.search);
    const shop = query.get('shop');
    const order = query.get('order');
    if (shop && order && SLUG_RE.test(shop) && UUID_RE.test(order)) {
      return shopPath(shop, `/orders/${order}`);
    }
  } catch {
    // No usable query string.
  }
  try {
    const param = retrieveLaunchParams().tgWebAppStartParam;
    return typeof param === 'string' && SLUG_RE.test(param) ? shopPath(param) : null;
  } catch {
    return null;
  }
}

/** Start screen: the shops in this bot. */
export function ShopsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const result = useAsync(() => api.getShops(), []);

  // Links like t.me/<bot>/<app>?startapp=<shop-slug> open that shop directly,
  // and the bot's reminders open the order to pay.
  useEffect(() => {
    const path = takeStartPath();
    if (path) navigate(path);
  }, [navigate]);

  if (result.loading) return <Loader />;
  if (result.error) return <ErrorView message={result.error} />;
  const shops = result.data?.shops ?? [];
  const isSuperAdmin = result.data?.isSuperAdmin ?? false;

  return (
    <List>
      {shops.length === 0 ? (
        <Placeholder
          header={t('shops.empty')}
          description={isSuperAdmin ? t('shops.emptyAdmin') : t('shops.emptyCustomer')}
        >
          <span style={{ fontSize: 48 }}>🏪</span>
        </Placeholder>
      ) : (
        <Section header={t('shops.title')} footer={t('shops.footer')} className="tma-shop-list">
          {shops.map((shop) => (
            <Cell
              key={shop.id}
              onClick={() => navigate(shopPath(shop.slug))}
              before={<ProductImage url={shop.imageUrl} alt={shop.name} size={56} />}
              subtitle={shop.description || undefined}
              description={
                [
                  shop.unpaidOrders > 0
                    ? tn(shop.unpaidOrders, 'shops.unpaid.one', 'shops.unpaid.other')
                    : null,
                  shop.cartItems > 0 ? t('shops.inCart', { count: shop.cartItems }) : null,
                  shop.isVisible ? null : t('shops.hidden'),
                  shop.isVisible && shop.vipOnly ? t('shops.vip') : null,
                  shop.canManage ? t('shops.youManage') : null,
                ]
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

      <LanguagePicker />

      {isSuperAdmin && (
        <Section header={t('shops.platform')}>
          <Cell onClick={() => navigate('/platform')} subtitle={t('shops.platformHint')}>
            {t('shops.platformAdmin')}
          </Cell>
        </Section>
      )}
    </List>
  );
}
