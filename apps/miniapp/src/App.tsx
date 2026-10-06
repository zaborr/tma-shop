import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { miniApp, retrieveLaunchParams, useSignal } from '@telegram-apps/sdk-react';
import { AppRoot, Placeholder } from '@telegram-apps/telegram-ui';
import { SessionProvider, useSession } from './providers/SessionProvider.js';
import { CartProvider } from './providers/CartProvider.js';
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
      <Placeholder header="Couldn’t sign you in" description={error ?? 'Please reopen the app'}>
        <span style={{ fontSize: 48 }}>🔒</span>
      </Placeholder>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<CatalogPage />} />
      <Route path="/product/:id" element={<ProductPage />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/orders/:id" element={<PaymentPage />} />
      <Route path="/admin" element={<AdminHomePage />} />
      <Route path="/admin/catalog" element={<AdminCatalogPage />} />
      <Route path="/admin/products/:id" element={<AdminProductPage />} />
      <Route path="/admin/fee" element={<AdminFeePage />} />
      <Route path="/admin/orders" element={<AdminOrdersPage />} />
      <Route path="/admin/orders/:id" element={<AdminOrderPage />} />
      <Route path="/admin/summary" element={<AdminSummaryPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App(): React.JSX.Element {
  const isDark = useSignal(miniApp.isDark);

  return (
    <AppRoot appearance={isDark ? 'dark' : 'light'} platform={platform()}>
      <SessionProvider>
        <CartProvider>
          <HashRouter>
            <Shell />
          </HashRouter>
        </CartProvider>
      </SessionProvider>
    </AppRoot>
  );
}
