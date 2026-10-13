import { useCallback, useState } from 'react';
import { shippingCost, type DeliveryAddress } from '@tma-shop/shared';
import { useNavigate } from 'react-router-dom';
import { openInvoice } from '@telegram-apps/sdk-react';
import { Button, Cell, List, Placeholder, Section } from '@telegram-apps/telegram-ui';
import { Input } from '../components/Field.js';
import { api, ApiClientError } from '../api/client.js';
import { useCart } from '../providers/CartProvider.js';
import { useSession } from '../providers/SessionProvider.js';
import { useMainButton } from '../hooks/useMainButton.js';
import { formatPrice } from '../lib/format.js';
import { lineName } from '../lib/variants.js';
import { useAsync } from '../hooks/useAsync.js';
import { Loader } from '../components/Loader.js';
import { useShopPath } from '../providers/ShopProvider.js';
import {
  AddressForm,
  addressComplete,
  EMPTY_ADDRESS,
  trimAddress,
} from '../components/AddressForm.js';
import {
  cryptoAvailable,
  encryptAddress,
  loadSavedAddress,
  saveAddress,
} from '../lib/addressCrypto.js';
import { askWriteAccess } from '../lib/writeAccess.js';

export function CartPage(): React.JSX.Element {
  const navigate = useNavigate();
  const to = useShopPath();
  const { cart, loading, setQuantity, remove, refresh } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useSession();
  // Pre-filled with the customer's Telegram @username when they have one.
  const [contact, setContact] = useState(user?.username ? `@${user.username}` : '');
  const contactName = contact.trim().replace(/^@/, '');
  const contactValid = /^[A-Za-z0-9_]{5,32}$/.test(contactName);
  const shop = useAsync(() => api.getShop(), []);

  // Shipping: shops with active zones ask for a zone and a delivery address.
  const zones = (shop.data?.shippingZones ?? []).filter((z) => z.isActive);
  const needsShipping = zones.length > 0;
  const [zoneId, setZoneId] = useState<string | null>(null);
  const zone = zones.find((z) => z.id === zoneId) ?? (zones.length === 1 ? zones[0] : undefined);
  const [address, setAddress] = useState<DeliveryAddress>(() => {
    const saved = loadSavedAddress();
    if (saved) return { ...EMPTY_ADDRESS, ...saved };
    const name = user?.firstName ?? '';
    return { ...EMPTY_ADDRESS, name };
  });
  const [remember, setRemember] = useState(true);
  const itemsTotal = cart ? cart.total - cart.fee : 0;
  const shipping = zone ? shippingCost(zone, itemsTotal) : 0;
  const grandTotal = (cart?.total ?? 0) + shipping;
  const shippingReady =
    !needsShipping || (zone !== undefined && addressComplete(address));
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
      let shippingDetails: { shippingZoneId: string; encryptedAddress: string } | null = null;
      if (needsShipping) {
        const config = shop.data;
        if (!zone) {
          setError('Choose a shipping zone.');
          return;
        }
        if (!addressComplete(address)) {
          setError('Fill in your delivery address (fields marked with *).');
          return;
        }
        if (!config?.addressPublicKey || !config.addressKeyFingerprint || !cryptoAvailable()) {
          setError('This shop cannot take orders with delivery yet. Please try again later.');
          return;
        }
        const clean = trimAddress(address);
        shippingDetails = {
          shippingZoneId: zone.id,
          encryptedAddress: await encryptAddress(
            clean,
            config.addressPublicKey,
            config.addressKeyFingerprint,
          ),
        };
        // Remembered only on this phone, to prefill the next order.
        saveAddress(remember ? clean : null);
      }
      const { orderId } = await api.createOrder(contactName, shippingDetails);
      // The server empties the cart when it creates the order.
      void refresh();
      // So the bot can tell the customer how the order goes.
      void askWriteAccess();
      if (!starsCheckout) {
        // Manual crypto payment: show wallets and collect the tx hash.
        navigate(to(`/orders/${orderId}`), { replace: true });
        return;
      }
      const { invoiceLink } = await api.createInvoice(orderId);
      if (openInvoice.isAvailable()) {
        await openInvoice(invoiceLink, 'url');
        navigate(to('/orders'));
      } else {
        // Outside Telegram (browser dev) we cannot open the native invoice.
        navigate(to('/orders'));
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Checkout failed');
    } finally {
      setBusy(false);
    }
  }, [
    navigate,
    to,
    starsCheckout,
    refresh,
    contactValid,
    contactName,
    needsShipping,
    shop.data,
    zone,
    address,
    remember,
  ]);

  const hasItems = (cart?.lines.length ?? 0) > 0;

  useMainButton({
    text: cart ? `Checkout · ${formatPrice(grandTotal, cart.currency)}` : 'Checkout',
    visible: hasItems,
    // Wait for the shop config so checkout never picks the wrong payment flow.
    enabled: shop.data !== null && contactValid && shippingReady,
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
            key={line.id}
            subtitle={formatPrice(line.unitPrice, cart.currency)}
            after={formatPrice(line.subtotal, cart.currency)}
            description={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <Button
                  size="s"
                  mode="bezeled"
                  onClick={() => void setQuantity(line.id, line.quantity - 1)}
                >
                  −
                </Button>
                <span>{line.quantity}</span>
                <Button
                  size="s"
                  mode="bezeled"
                  onClick={() => void setQuantity(line.id, line.quantity + 1)}
                >
                  +
                </Button>
                <Button size="s" mode="plain" onClick={() => void remove(line.id)}>
                  Remove
                </Button>
              </div>
            }
            multiline
          >
            {lineName(line.product.title, line.variant?.label)}
          </Cell>
        ))}
      </Section>
      <Section>
        {cart && cart.fee > 0 && (
          <Cell after={formatPrice(cart.fee, cart.currency)}>
            {shop.data?.orderFeeLabel ?? 'Service fee'}
          </Cell>
        )}
        {needsShipping && (
          <Cell after={zone && cart ? formatPrice(shipping, cart.currency) : '—'}>
            {zone ? `Shipping · ${zone.name}` : 'Shipping'}
          </Cell>
        )}
        <Cell after={cart ? formatPrice(grandTotal, cart.currency) : ''}>Total</Cell>
      </Section>
      {needsShipping && cart && (
        <Section header="Shipping zone">
          {zones.map((z) => {
            const cost = shippingCost(z, itemsTotal);
            return (
              <Cell
                key={z.id}
                onClick={() => setZoneId(z.id)}
                subtitle={
                  z.freeFrom !== null
                    ? `Free from ${formatPrice(z.freeFrom, cart.currency)}`
                    : undefined
                }
                after={
                  <span>
                    {cost === 0 ? 'Free' : formatPrice(cost, cart.currency)}
                    {zone?.id === z.id ? ' ✓' : ''}
                  </span>
                }
              >
                {z.name}
              </Cell>
            );
          })}
        </Section>
      )}
      {needsShipping && (
        <>
          <AddressForm value={address} onChange={setAddress} />
          <Section>
            <Cell
              onClick={() => setRemember((r) => !r)}
              after={remember ? '✓' : ''}
              multiline
            >
              Remember this address on this phone
            </Cell>
          </Section>
        </>
      )}
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
