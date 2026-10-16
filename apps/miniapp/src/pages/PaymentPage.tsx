import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Cell, List, Placeholder, Section } from '@telegram-apps/telegram-ui';
import { Input } from '../components/Field.js';
import {
  editableDirectly,
  payBefore,
  shippingCost,
  unitPriceFor,
  type Order,
  type PaymentMethod,
  type ShippingZone,
} from '@tma-shop/shared';
import { api, ApiClientError } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useMainButton } from '../hooks/useMainButton.js';
import { useLiveRefresh } from '../hooks/useLiveRefresh.js';
import { copyText } from '../lib/clipboard.js';
import { formatPrice, formatTokenAmount } from '../lib/format.js';
import { activeVariants, hasVariants, itemKey, itemName } from '../lib/variants.js';
import { Loader } from '../components/Loader.js';
import { ErrorView } from '../components/ErrorView.js';
import { useShopPath } from '../providers/ShopProvider.js';
import { TrackingText } from '../components/TrackingText.js';
import { locale, t } from '../i18n/index.js';

const breakAll: React.CSSProperties = { wordBreak: 'break-all', whiteSpace: 'normal' };
const errorStyle: React.CSSProperties = { color: 'var(--tgui--destructive_text_color)' };

/** Statuses whose order a customer can ask to modify (needs admin approval). */
const CHANGEABLE: Order['status'][] = ['paid', 'awaiting_payment'];

type Done = 'payment' | 'change' | null;

/**
 * Order detail: items and amounts, crypto checkout (pick a wallet, send what is
 * due, paste the tx hash) and change requests on paid orders.
 */
export function PaymentPage(): React.JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const to = useShopPath();
  const [reloadKey, setReloadKey] = useState(0);
  const [done, setDone] = useState<Done>(null);
  const [editing, setEditing] = useState(false);
  const order = useAsync(() => api.getOrder(id), [id, reloadKey]);
  const shop = useAsync(() => api.getShop(), []);

  const current = order.data;
  const needsPayment =
    current !== null &&
    (current.status === 'pending' || current.status === 'awaiting_payment') &&
    current.amountDue > 0 &&
    done !== 'payment';

  // When nothing is left to do here, the main button takes the customer back.
  useMainButton({
    text: t('order.backToShop'),
    visible: current !== null && !needsPayment && !editing,
    onClick: () => navigate(to('/')),
  });

  // While the blockchain check runs, follow it live; and refresh when the
  // customer comes back from reading the bot's message.
  useLiveRefresh(
    () => setReloadKey((k) => k + 1),
    current?.paymentCheck?.status === 'checking',
  );

  // Refreshes keep showing the order instead of flashing a spinner.
  if ((order.loading && !order.data) || (shop.loading && !shop.data)) return <Loader />;
  if (order.error) return <ErrorView message={order.error} />;
  if (shop.error) return <ErrorView message={shop.error} />;
  if (!current || !shop.data) return <Loader />;

  // Nothing paid or sent yet: the customer edits the order directly.
  const direct = editableDirectly(current);
  // Pay in the order's token (USDC/EURC); legacy USD/XTR orders accept any wallet.
  const methods =
    current.currency === 'USD' || current.currency === 'XTR'
      ? shop.data.paymentMethods
      : shop.data.paymentMethods.filter((m) => m.token === current.currency);
  const reload = (): void => setReloadKey((k) => k + 1);
  const feeLabel = shop.data.orderFeeLabel;

  return (
    <List>
      {done && <DoneSection kind={done} onShop={() => navigate(to('/'))} onOrders={() => navigate(to('/orders'))} />}

      <Section header={t('orders.orderNumber', { id: current.id.slice(0, 8) })}>
        {current.items.map((item) => (
          <Cell
            key={itemKey(item)}
            after={formatPrice(item.subtotal, current.currency)}
            subtitle={`${item.quantity} × ${formatPrice(item.unitPrice, current.currency)}`}
          >
            {itemName(item)}
          </Cell>
        ))}
        {current.fee > 0 && (
          <Cell after={formatPrice(current.fee, current.currency)}>{feeLabel}</Cell>
        )}
        {current.shippingZoneName && (
          <Cell
            after={
              current.shipping > 0 ? formatPrice(current.shipping, current.currency) : t('cart.free')
            }
          >
            {t('cart.shippingZoneLine', { zone: current.shippingZoneName })}
          </Cell>
        )}
        <Cell after={formatPrice(current.total, current.currency)}>{t('cart.total')}</Cell>
        {current.amountPaid > 0 && (
          <Cell after={formatPrice(current.amountPaid, current.currency)}>{t('order.paidSoFar')}</Cell>
        )}
        {current.amountPaid > 0 && current.amountDue > 0 && (
          <Cell after={formatPrice(current.amountDue, current.currency)}>{t('orders.differenceToPay')}</Cell>
        )}
        {current.amountDue < 0 && (
          <Cell after={formatPrice(-current.amountDue, current.currency)}>{t('order.refund')}</Cell>
        )}
        {current.contactUsername && (
          <Cell after={`@${current.contactUsername}`}>{t('order.contact')}</Cell>
        )}
      </Section>

      {!done && <StatusSection order={current} autoCancelHours={shop.data.autoCancelHours} />}

      {needsPayment && !editing && methods.length > 0 && (
        <PaymentForm
          key={`${current.paymentTxHash ?? 'new'}-${current.amountDue}`}
          order={current}
          methods={methods}
          onSubmitted={() => {
            setDone('payment');
            reload();
          }}
        />
      )}
      {needsPayment && methods.length === 0 && (
        <Placeholder
          header={t('order.noWallet', { currency: current.currency })}
          description={t('order.noWalletHint')}
        >
          <span style={{ fontSize: 48 }}>💳</span>
        </Placeholder>
      )}

      {current.changeRequest ? (
        <PendingChange order={current} feeLabel={feeLabel} onWithdrawn={reload} />
      ) : (
        (direct || CHANGEABLE.includes(current.status)) &&
        (editing ? (
          <ChangeEditor
            order={current}
            feeLabel={feeLabel}
            direct={direct}
            zones={shop.data.shippingZones}
            onCancel={() => setEditing(false)}
            onRequested={() => {
              setEditing(false);
              // An unpaid order changes at once; a paid one waits for approval.
              if (!direct) setDone('change');
              reload();
            }}
          />
        ) : (
          <Section footer={direct ? t('order.editFooter') : t('order.changeFooter')}>
            <div style={{ padding: 16 }}>
              <Button stretched mode="bezeled" onClick={() => setEditing(true)}>
                {direct ? t('order.edit') : t('order.requestChange')}
              </Button>
            </div>
          </Section>
        ))
      )}
    </List>
  );
}

function DoneSection({
  kind,
  onShop,
  onOrders,
}: {
  kind: 'payment' | 'change';
  onShop: () => void;
  onOrders: () => void;
}): React.JSX.Element {
  return (
    <Section>
      <Placeholder
        header={kind === 'payment' ? t('order.paymentSent') : t('order.changeSent')}
        description={kind === 'payment' ? t('order.paymentSentHint') : t('order.changeSentHint')}
      >
        <span style={{ fontSize: 56 }}>✅</span>
      </Placeholder>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px 16px' }}>
        <Button stretched onClick={onShop}>
          {t('order.backToShop')}
        </Button>
        <Button stretched mode="plain" onClick={onOrders}>
          {t('orders.title')}
        </Button>
      </div>
    </Section>
  );
}

function StatusSection({
  order,
  autoCancelHours,
}: {
  order: Order;
  autoCancelHours: number;
}): React.JSX.Element {
  const deadline = payBefore(order, autoCancelHours);
  return (
    <>
      <StatusDetail order={order} />
      {deadline && (
        <Section>
          <Cell multiline>
            {t('order.payBefore', {
              date: deadline.toLocaleString(locale(), {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </Cell>
        </Section>
      )}
      {order.statusNote && (
        <Section header={t('order.shopMessage')}>
          <Cell multiline>{order.statusNote}</Cell>
        </Section>
      )}
    </>
  );
}

function StatusDetail({ order }: { order: Order }): React.JSX.Element {
  const money = (amount: number): string => formatPrice(amount, order.currency);
  switch (order.status) {
    case 'awaiting_payment':
      return (
        <Section
          header={t('order.paymentSubmitted')}
          footer={
            order.paymentCheck?.status === 'failed'
              ? t('order.checkFailedHint')
              : order.paymentCheck?.status === 'checking'
                ? t('order.checkingHint')
                : t('order.paymentSubmittedHint')
          }
        >
          <Cell subtitle={t('order.method')}>{order.paymentNetwork ?? '—'}</Cell>
          <Cell subtitle={t('order.transaction')} multiline>
            {order.paymentTxUrl ? (
              <a href={order.paymentTxUrl} target="_blank" rel="noreferrer" style={breakAll}>
                {order.paymentTxHash}
              </a>
            ) : (
              <span style={breakAll}>{order.paymentTxHash ?? '—'}</span>
            )}
          </Cell>
        </Section>
      );
    case 'paid':
      return (
        <Section>
          <Cell multiline>
            {order.amountDue < 0
              ? t('order.confirmedRefund')
              : t('order.confirmed')}
          </Cell>
        </Section>
      );
    case 'shipped':
      return (
        <Section>
          <Cell multiline>{t('order.onItsWay')}</Cell>
          {order.trackingNumber && (
            <Cell subtitle={t('order.tracking')} multiline>
              <TrackingText value={order.trackingNumber} />
            </Cell>
          )}
        </Section>
      );
    case 'fulfilled':
      return (
        <Section>
          <Cell>{t('order.delivered')}</Cell>
          {order.trackingNumber && (
            <Cell subtitle={t('order.tracking')} multiline>
              <TrackingText value={order.trackingNumber} />
            </Cell>
          )}
        </Section>
      );
    case 'cancelled':
      return (
        <Section>
          <Cell multiline>
            {order.amountDue < 0
              ? t('order.cancelledRefund', { amount: money(-order.amountDue) })
              : t('order.cancelled')}
          </Cell>
        </Section>
      );
    case 'pending':
      return order.amountPaid > 0 ? (
        <Section>
          <Cell multiline>{t('order.payRest')}</Cell>
        </Section>
      ) : (
        <></>
      );
  }
}

function PaymentForm({
  order,
  methods,
  onSubmitted,
}: {
  order: Order;
  methods: PaymentMethod[];
  onSubmitted: () => void;
}): React.JSX.Element {
  const [methodId, setMethodId] = useState(methods[0]?.id ?? '');
  const [txHash, setTxHash] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const method = methods.find((m) => m.id === methodId) ?? methods[0];
  if (!method) return <></>;
  const due = order.amountDue;
  const amount = formatTokenAmount(due, method.token);
  const resubmit = order.status === 'awaiting_payment';

  const copy = async (label: string, value: string): Promise<void> => {
    const ok = await copyText(value);
    setCopied(ok ? label : null);
  };

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.submitPayment(order.id, method.id, txHash.trim());
      setTxHash('');
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('order.submitFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Section header={resubmit ? t('order.resubmit') : t('order.step1')}>
        {methods.map((m) => (
          <Cell
            key={m.id}
            onClick={() => {
              setMethodId(m.id);
              setCopied(null);
            }}
            after={m.id === method.id ? '✓' : ''}
          >
            {t('order.tokenOn', { token: m.token, network: m.network })}
          </Cell>
        ))}
      </Section>

      <Section
        header={t('order.step2')}
        footer={t('order.step2Warning', { token: method.token, network: method.network })}
      >
        <Cell
          subtitle={order.amountPaid > 0 ? t('orders.differenceToPay') : t('order.amount')}
          after={
            <Button
              size="s"
              mode="bezeled"
              onClick={() => void copy('amount', (due / 100).toFixed(2))}
            >
              {copied === 'amount' ? t('common.copied') : t('common.copy')}
            </Button>
          }
        >
          {amount}
        </Cell>
        <Cell
          subtitle={t('order.networkAddress', { network: method.network })}
          multiline
          after={
            <Button size="s" mode="bezeled" onClick={() => void copy('address', method.address)}>
              {copied === 'address' ? t('common.copied') : t('common.copy')}
            </Button>
          }
        >
          <span style={breakAll}>{method.address}</span>
        </Cell>
      </Section>

      <Section
        header={t('order.step3')}
        footer={t('order.step3Hint')}
      >
        <Input
          header={t('order.txHash')}
          placeholder={t('order.txHashPlaceholder')}
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
        />
        <div style={{ padding: 16 }}>
          <Button
            stretched
            loading={busy}
            disabled={txHash.trim().length < 8}
            onClick={() => void submit()}
          >
            {resubmit ? t('order.updateTx') : t('order.iHavePaid')}
          </Button>
          {error && (
            <Cell multiline style={errorStyle}>
              {error}
            </Cell>
          )}
        </div>
      </Section>
    </>
  );
}

/** What the customer has already paid or sent for review, to compute the difference. */
function coveredAmount(order: Order): number {
  return order.amountPaid + order.amountSubmitted;
}

function differenceLabel(diff: number, currency: string): string {
  if (diff > 0) return t('change.payMore', { amount: formatPrice(diff, currency) });
  if (diff < 0) return t('change.getBack', { amount: formatPrice(-diff, currency) });
  return t('change.same');
}

function PendingChange({
  order,
  feeLabel,
  onWithdrawn,
}: {
  order: Order;
  feeLabel: string;
  onWithdrawn: () => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = order.changeRequest;
  if (!change) return <></>;

  const withdraw = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.withdrawOrderChange(order.id);
      onWithdrawn();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('change.withdrawFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      header={t('change.pending')}
      footer={differenceLabel(change.total - coveredAmount(order), order.currency)}
    >
      {change.items.map((item) => (
        <Cell
          key={itemKey(item)}
          after={formatPrice(item.subtotal, order.currency)}
          subtitle={`${item.quantity} × ${formatPrice(item.unitPrice, order.currency)}`}
        >
          {itemName(item)}
        </Cell>
      ))}
      {order.fee > 0 && <Cell after={formatPrice(order.fee, order.currency)}>{feeLabel}</Cell>}
      {order.shipping > 0 && (
        <Cell after={formatPrice(order.shipping, order.currency)}>{t('cart.shipping')}</Cell>
      )}
      <Cell after={formatPrice(change.total, order.currency)}>{t('change.newTotal')}</Cell>
      <div style={{ padding: 16 }}>
        <Button stretched mode="plain" loading={busy} onClick={() => void withdraw()}>
          {t('change.withdraw')}
        </Button>
        {error && (
          <Cell multiline style={errorStyle}>
            {error}
          </Cell>
        )}
      </div>
    </Section>
  );
}

interface DraftLine {
  productId: string;
  variantId: string | null;
  variantLabel: string | null;
  title: string;
  unitPrice: number;
  quantity: number;
}

/** Edit the order like a cart, then send it to the shop for approval. */
function ChangeEditor({
  order,
  feeLabel,
  direct,
  zones,
  onCancel,
  onRequested,
}: {
  order: Order;
  feeLabel: string;
  /** Unpaid order: saved at once instead of sent for approval. */
  direct: boolean;
  zones: ShippingZone[];
  onCancel: () => void;
  onRequested: () => void;
}): React.JSX.Element {
  const [lines, setLines] = useState<DraftLine[]>(() =>
    order.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      variantLabel: item.variantLabel,
      title: item.title,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const catalog = useAsync(() => api.getProducts({ limit: 150 }), []);

  const setQty = (key: string, quantity: number): void =>
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => itemKey(l) !== key)
        : prev.map((l) => (itemKey(l) === key ? { ...l, quantity } : l)),
    );

  // The order's fee is charged once, whatever the items.
  // Same rule as the shop: a product whose total quantity is unchanged keeps the
  // prices paid; otherwise all its lines get the current tier price.
  const products = new Map((catalog.data?.items ?? []).map((p) => [p.id, p]));
  const sumByProduct = (list: ReadonlyArray<{ productId: string; quantity: number }>) =>
    list.reduce(
      (acc, l) => acc.set(l.productId, (acc.get(l.productId) ?? 0) + l.quantity),
      new Map<string, number>(),
    );
  const oldQty = sumByProduct(order.items);
  const newQty = sumByProduct(lines);
  const priced = lines.map((line) => {
    const product = products.get(line.productId);
    const paid = order.items.find((i) => itemKey(i) === itemKey(line));
    if (!product) return line;
    if (paid && oldQty.get(line.productId) === newQty.get(line.productId)) {
      return { ...line, unitPrice: paid.unitPrice };
    }
    const variant = product.variants.find((v) => v.id === line.variantId) ?? null;
    return {
      ...line,
      unitPrice: unitPriceFor(
        product.price,
        variant?.priceOverride ?? null,
        product.priceTiers,
        newQty.get(line.productId) ?? line.quantity,
      ),
    };
  });
  const itemsTotal = priced.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  // The fee is charged once per order. Shipping stays as it was, except for an
  // unpaid order, where it follows the zone again (free shipping threshold).
  const zone = direct ? zones.find((z) => z.name === order.shippingZoneName) : undefined;
  const shipping = zone ? shippingCost(zone, itemsTotal) : order.shipping;
  const total = itemsTotal + order.fee + shipping;
  const diff = total - coveredAmount(order);
  // One addable entry per product, or per variant for products with options.
  const addable: DraftLine[] = (catalog.data?.items ?? [])
    .filter((p) => p.currency === order.currency)
    .flatMap((p): DraftLine[] =>
      hasVariants(p)
        ? activeVariants(p)
            .filter((v) => v.stock === null || v.stock > 0)
            .map((v) => ({
              productId: p.id,
              variantId: v.id,
              variantLabel: v.label,
              title: p.title,
              unitPrice: v.price,
              quantity: 1,
            }))
        : p.stock === null || p.stock > 0
          ? [
              {
                productId: p.id,
                variantId: null,
                variantLabel: null,
                title: p.title,
                unitPrice: p.price,
                quantity: 1,
              },
            ]
          : [],
    )
    .filter((candidate) => !lines.some((l) => itemKey(l) === itemKey(candidate)));

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.requestOrderChange(
        order.id,
        lines.map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
          quantity: l.quantity,
        })),
      );
      onRequested();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('change.sendFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Section
        header={direct ? t('order.edit') : t('change.title')}
        footer={direct ? undefined : differenceLabel(diff, order.currency)}
      >
        {lines.length === 0 && <Cell multiline>{t('change.keepOne')}</Cell>}
        {priced.map((line) => (
          <Cell
            key={itemKey(line)}
            subtitle={formatPrice(line.unitPrice, order.currency)}
            after={formatPrice(line.unitPrice * line.quantity, order.currency)}
            multiline
            description={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <Button
                  size="s"
                  mode="bezeled"
                  onClick={() => setQty(itemKey(line), line.quantity - 1)}
                >
                  −
                </Button>
                <span>{line.quantity}</span>
                <Button
                  size="s"
                  mode="bezeled"
                  onClick={() => setQty(itemKey(line), line.quantity + 1)}
                >
                  +
                </Button>
                <Button size="s" mode="plain" onClick={() => setQty(itemKey(line), 0)}>
                  {t('cart.remove')}
                </Button>
              </div>
            }
          >
            {itemName(line)}
          </Cell>
        ))}
        {order.fee > 0 && (
          <Cell after={formatPrice(order.fee, order.currency)}>{feeLabel}</Cell>
        )}
        {(order.shipping > 0 || shipping > 0) && (
          <Cell after={shipping > 0 ? formatPrice(shipping, order.currency) : t('cart.free')}>
            {t('cart.shipping')}
          </Cell>
        )}
        <Cell after={formatPrice(total, order.currency)}>{t('change.newTotal')}</Cell>
      </Section>

      {addable.length > 0 && (
        <Section header={t('change.addProducts')}>
          {addable.map((candidate) => (
            <Cell
              key={itemKey(candidate)}
              subtitle={formatPrice(candidate.unitPrice, order.currency)}
              after={
                <Button
                  size="s"
                  mode="bezeled"
                  onClick={() => setLines((prev) => [...prev, candidate])}
                >
                  {t('common.add')}
                </Button>
              }
              multiline
            >
              {itemName(candidate)}
            </Cell>
          ))}
        </Section>
      )}

      <Section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
          <Button
            stretched
            loading={busy}
            disabled={lines.length === 0}
            onClick={() => void submit()}
          >
            {direct ? t('change.save') : t('change.send')}
          </Button>
          <Button stretched mode="plain" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          {error && (
            <Cell multiline style={errorStyle}>
              {error}
            </Cell>
          )}
        </div>
      </Section>
    </>
  );
}
