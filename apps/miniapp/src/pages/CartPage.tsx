import { useCallback, useState } from 'react';
import { awaitsPayment, shippingCost, type DeliveryAddress } from '@tma-shop/shared';
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
import { useShop, useShopPath } from '../providers/ShopProvider.js';
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
import { t } from '../i18n/index.js';

export function CartPage(): React.JSX.Element {
  const navigate = useNavigate();
  const to = useShopPath();
  const closed = useShop().shop.isClosed;
  const { cart, loading, setQuantity, remove, refresh } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useSession();
  // Pre-filled with the customer's Telegram @username when they have one.
  const [contact, setContact] = useState(user?.username ? `@${user.username}` : '');
  const contactName = contact.trim().replace(/^@/, '');
  const contactValid = /^[A-Za-z0-9_]{5,32}$/.test(contactName);
  const shop = useAsync(() => api.getShop(), []);
  // An order already waiting for payment: warn before placing a second one.
  const myOrders = useAsync(() => api.getOrders(), []);
  const unpaid = (myOrders.data ?? []).filter(awaitsPayment);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [duplicateOk, setDuplicateOk] = useState(false);

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

  const checkout = useCallback(async (force = false) => {
    if (!force && !duplicateOk && unpaid.length > 0) {
      setDuplicateWarning(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setDuplicateWarning(false);
    setBusy(true);
    setError(null);
    try {
      if (!contactValid) {
        setError(t('cart.needUsername'));
        return;
      }
      let shippingDetails: { shippingZoneId: string; encryptedAddress: string } | null = null;
      if (needsShipping) {
        const config = shop.data;
        if (!zone) {
          setError(t('cart.needZone'));
          return;
        }
        if (!addressComplete(address)) {
          setError(t('cart.needAddress'));
          return;
        }
        if (!config?.addressPublicKey || !config.addressKeyFingerprint || !cryptoAvailable()) {
          setError(t('cart.noDeliveryYet'));
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
      setError(err instanceof ApiClientError ? err.message : t('cart.checkoutFailed'));
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
    unpaid.length,
    duplicateOk,
  ]);

  const hasItems = (cart?.lines.length ?? 0) > 0;
  const onCheckout = useCallback(() => void checkout(), [checkout]);

  useMainButton({
    text: cart
      ? t('cart.checkoutTotal', { total: formatPrice(grandTotal, cart.currency) })
      : t('cart.checkout'),
    visible: hasItems && !closed,
    // Wait for the shop config so checkout never picks the wrong payment flow.
    enabled: shop.data !== null && contactValid && shippingReady,
    loading: busy || shop.loading,
    onClick: onCheckout,
  });

  if (loading && !cart) return <Loader />;

  if (closed) {
    return (
      <Placeholder header={t('closed.title')} description={t('closed.hint')}>
        <span style={{ fontSize: 48 }}>🔒</span>
      </Placeholder>
    );
  }

  if (!hasItems) {
    return (
      <Placeholder header={t('cart.empty')} description={t('cart.emptyHint')}>
        <span style={{ fontSize: 48 }}>🛒</span>
      </Placeholder>
    );
  }

  const firstUnpaid = unpaid[0];

  return (
    <List>
      {duplicateWarning && firstUnpaid && (
        <Section header={t('cart.duplicateTitle')}>
          <Cell multiline>
            {unpaid.length === 1
              ? t('cart.duplicateOne', {
                  id: firstUnpaid.id.slice(0, 8),
                  amount: formatPrice(firstUnpaid.amountDue, firstUnpaid.currency),
                })
              : t('cart.duplicateMany', { count: unpaid.length })}
          </Cell>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px 16px' }}>
            <Button
              stretched
              onClick={() =>
                navigate(to(unpaid.length === 1 ? `/orders/${firstUnpaid.id}` : '/orders'))
              }
            >
              {unpaid.length === 1 ? t('cart.duplicatePay') : t('cart.duplicateSee')}
            </Button>
            <Button
              stretched
              mode="bezeled"
              onClick={() => {
                setDuplicateOk(true);
                void checkout(true);
              }}
            >
              {t('cart.duplicateContinue')}
            </Button>
          </div>
        </Section>
      )}
      {error && (
        <Section>
          <Cell style={{ color: 'var(--tgui--destructive_text_color)' }}>{error}</Cell>
        </Section>
      )}
      <Section header={t('cart.title')}>
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
                  {t('cart.remove')}
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
            {shop.data?.orderFeeLabel ?? t('cart.serviceFee')}
          </Cell>
        )}
        {needsShipping && (
          <Cell after={zone && cart ? formatPrice(shipping, cart.currency) : '—'}>
            {zone ? t('cart.shippingZoneLine', { zone: zone.name }) : t('cart.shipping')}
          </Cell>
        )}
        <Cell after={cart ? formatPrice(grandTotal, cart.currency) : ''}>{t('cart.total')}</Cell>
      </Section>
      {needsShipping && cart && (
        <Section header={t('cart.shippingZone')}>
          {zones.map((z) => {
            const cost = shippingCost(z, itemsTotal);
            return (
              <Cell
                key={z.id}
                onClick={() => setZoneId(z.id)}
                subtitle={
                  z.freeFrom !== null
                    ? t('cart.freeFrom', { amount: formatPrice(z.freeFrom, cart.currency) })
                    : undefined
                }
                after={
                  <span>
                    {cost === 0 ? t('cart.free') : formatPrice(cost, cart.currency)}
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
              {t('cart.rememberAddress')}
            </Cell>
          </Section>
        </>
      )}
      <Section
        header={t('cart.usernameSection')}
        footer={contactValid ? t('cart.usernameOk') : t('cart.usernameRule')}
      >
        <Input
          header={t('cart.usernameField')}
          placeholder={t('cart.usernamePlaceholder')}
          status={contact.trim() === '' || contactValid ? 'default' : 'error'}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </Section>
    </List>
  );
}
