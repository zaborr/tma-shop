import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { openInvoice } from '@telegram-apps/sdk-react';
import { Button, Cell, Input, List, Placeholder, Section } from '@telegram-apps/telegram-ui';
import { api, ApiClientError } from '../api/client.js';
import { useCart } from '../providers/CartProvider.js';
import { useSession } from '../providers/SessionProvider.js';
import { useMainButton } from '../hooks/useMainButton.js';
import { formatPrice } from '../lib/format.js';
import { useAsync } from '../hooks/useAsync.js';
import { Loader } from '../components/Loader.js';

export function CartPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { cart, loading, setQuantity, remove, refresh } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useSession();
  // Pre-filled with the customer's Telegram @username when they have one.
  const [contact, setContact] = useState(user?.username ? `@${user.username}` : '');
  const contactName = contact.trim().replace(/^@/, '');
  const contactValid = /^[A-Za-z0-9_]{5,32}$/.test(contactName);
  const shop = useAsync(() => api.getShop(), []);
  // Telegram Stars only for a Stars-priced cart in a shop with no crypto wallets;
  // everything else goes to the manual crypto payment page.
  const starsCheckout =
    shop.data !== null &&
    shop.data.starsEnabled &&
    shop.data.paymentMethods.length === 0 &&
    cart?.currency === 'XTR';

  const checkout = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (!contactValid) {
        setError('Enter your Telegram username so the shop can contact you.');
        return;
      }
      const { orderId } = await api.createOrder(contactName);
      // The server empties the cart when it creates the order.
      void refresh();
      if (!starsCheckout) {
        // Manual crypto payment: show wallets and collect the tx hash.
        navigate(`/orders/${orderId}`, { replace: true });
        return;
      }
      const { invoiceLink } = await api.createInvoice(orderId);
      if (openInvoice.isAvailable()) {
        const status = await openInvoice(invoiceLink, 'url');
        navigate(status === 'paid' ? '/orders' : `/orders`);
      } else {
        // Outside Telegram (browser dev) we cannot open the native invoice.
        navigate('/orders');
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Checkout failed');
    } finally {
      setBusy(false);
    }
  }, [navigate, starsCheckout, refresh, contactValid, contactName]);

  const hasItems = (cart?.lines.length ?? 0) > 0;

  useMainButton({
    text: cart ? `Checkout · ${formatPrice(cart.total, cart.currency)}` : 'Checkout',
    visible: hasItems,
    // Wait for the shop config so checkout never picks the wrong payment flow.
    enabled: shop.data !== null && contactValid,
    loading: busy || shop.loading,
    onClick: checkout,
  });

  if (loading && !cart) return <Loader />;

  if (!hasItems) {
    return (
      <Placeholder header="Your cart is empty" description="Add products from the catalog">
        <span style={{ fontSize: 48 }}>🛒</span>
      </Placeholder>
    );
  }

  return (
    <List>
      {error && (
        <Section>
          <Cell style={{ color: 'var(--tgui--destructive_text_color)' }}>{error}</Cell>
        </Section>
      )}
      <Section header="Cart">
        {cart?.lines.map((line) => (
          <Cell
            key={line.product.id}
            subtitle={formatPrice(line.product.price, line.product.currency)}
            after={formatPrice(line.subtotal, cart.currency)}
            description={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <Button
                  size="s"
                  mode="bezeled"
                  onClick={() => void setQuantity(line.product.id, line.quantity - 1)}
                >
                  −
                </Button>
                <span>{line.quantity}</span>
                <Button
                  size="s"
                  mode="bezeled"
                  onClick={() => void setQuantity(line.product.id, line.quantity + 1)}
                >
                  +
                </Button>
                <Button size="s" mode="plain" onClick={() => void remove(line.product.id)}>
                  Remove
                </Button>
              </div>
            }
            multiline
          >
            {line.product.title}
          </Cell>
        ))}
      </Section>
      <Section>
        {cart && cart.fee > 0 && (
          <Cell after={formatPrice(cart.fee, cart.currency)}>
            {shop.data?.orderFeeLabel ?? 'Service fee'}
          </Cell>
        )}
        <Cell after={cart ? formatPrice(cart.total, cart.currency) : ''}>Total</Cell>
      </Section>
      <Section
        header="Your Telegram username"
        footer={
          contactValid
            ? 'The shop will contact you here about your order.'
            : 'Required: 5–32 letters, digits or _ (you can find it in Telegram → Settings).'
        }
      >
        <Input
          header="Telegram username"
          placeholder="@username"
          status={contact.trim() === '' || contactValid ? 'default' : 'error'}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </Section>
    </List>
  );
}
