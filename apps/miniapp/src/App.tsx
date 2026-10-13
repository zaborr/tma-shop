import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { miniApp, retrieveLaunchParams, useSignal } from '@telegram-apps/sdk-react';
import { AppRoot, Placeholder } from '@telegram-apps/telegram-ui';
import { SessionProvider, useSession } from './providers/SessionProvider.js';
import { ShopLayout } from './providers/ShopProvider.js';
import { useBackButton } from './hooks/useBackButton.js';
import { Loader } from './components/Loader.js';
import { CatalogPage } from './pages/CatalogPage.js';
import { ProductPage } from './pages/ProductPage.js';
import { CartPage } from './pages/CartPage.js';
import { OrdersPage } from './pages/OrdersPage.js';
import { PaymentPage } from './pages/PaymentPage.js';
import { AdminHomePage } from './pages/admin/AdminHomePage.js';
import { AdminCatalogPage } from './pages/admin/AdminCatalogPage.js';
import { AdminProductPage } from './pages/admin/AdminProductPage.js';
import { AdminFeePage } from './pages/admin/AdminFeePage.js';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage.js';
import { AdminOrderPage } from './pages/admin/AdminOrderPage.js';
import { AdminSummaryPage } from './pages/admin/AdminSummaryPage.js';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage.js';
import { AdminWalletsPage } from './pages/admin/AdminWalletsPage.js';
import { AdminShippingPage } from './pages/admin/AdminShippingPage.js';
import { AdminAddressKeyPage } from './pages/admin/AdminAddressKeyPage.js';
import { AdminExportPage } from './pages/admin/AdminExportPage.js';
import { ShopsPage } from './pages/ShopsPage.js';
import { PlatformPage } from './pages/platform/PlatformPage.js';
import { PlatformShopPage } from './pages/platform/PlatformShopPage.js';
import { PlatformRetentionPage } from './pages/platform/PlatformRetentionPage.js';
import { lang, onLangChange, t } from './i18n/index.js';

function platform(): 'ios' | 'base' {
  try {
    return retrieveLaunchParams().tgWebAppPlatform === 'ios' ? 'ios' : 'base';
  } catch {
    return 'base';
  }
}

function Shell(): React.JSX.Element {
  useBackButton();
  const { status, error } = useSession();

  if (status === 'loading') return <Loader />;
  if (status === 'error') {
    return (
      <Placeholder header={t('app.signInFailed')} description={error ?? t('app.reopen')}>
        <span style={{ fontSize: 48 }}>🔒</span>
      </Placeholder>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<ShopsPage />} />
      <Route path="/platform" element={<PlatformPage />} />
      <Route path="/platform/shops/:id" element={<PlatformShopPage />} />
      <Route path="/platform/retention" element={<PlatformRetentionPage />} />

      <Route path="/s/:shopRef" element={<ShopLayout />}>
        <Route index element={<CatalogPage />} />
        <Route path="product/:id" element={<ProductPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:id" element={<PaymentPage />} />
        <Route path="admin" element={<AdminHomePage />} />
        <Route path="admin/catalog" element={<AdminCatalogPage />} />
        <Route path="admin/products/:id" element={<AdminProductPage />} />
        <Route path="admin/fee" element={<AdminFeePage />} />
        <Route path="admin/settings" element={<AdminSettingsPage />} />
        <Route path="admin/wallets" element={<AdminWalletsPage />} />
        <Route path="admin/shipping" element={<AdminShippingPage />} />
        <Route path="admin/address-key" element={<AdminAddressKeyPage />} />
        <Route path="admin/orders" element={<AdminOrdersPage />} />
        <Route path="admin/orders/:id" element={<AdminOrderPage />} />
        <Route path="admin/summary" element={<AdminSummaryPage />} />
        <Route path="admin/export" element={<AdminExportPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App(): React.JSX.Element {
  const isDark = useSignal(miniApp.isDark);
  // Changing the language redraws every screen (same page, same session).
  const [language, setLanguage] = useState(lang());
  useEffect(() => onLangChange(setLanguage), []);

  return (
    <AppRoot appearance={isDark ? 'dark' : 'light'} platform={platform()}>
      <SessionProvider>
        <HashRouter key={language}>
          <Shell />
        </HashRouter>
      </SessionProvider>
    </AppRoot>
  );
}
