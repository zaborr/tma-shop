import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Cell, Input, List, Placeholder, Section } from '@telegram-apps/telegram-ui';
import type { Order, PaymentMethod } from '@tma-shop/shared';
import { api, ApiClientError } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useMainButton } from '../hooks/useMainButton.js';
import { copyText } from '../lib/clipboard.js';
import { formatPrice, formatTokenAmount } from '../lib/format.js';
import { Loader } from '../components/Loader.js';
import { ErrorView } from '../components/ErrorView.js';

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
    text: 'Back to shop',
    visible: current !== null && !needsPayment && !editing,
    onClick: () => navigate('/'),
  });

  if (order.loading || shop.loading) return <Loader />;
  if (order.error) return <ErrorView message={order.error} />;
  if (shop.error) return <ErrorView message={shop.error} />;
  if (!current || !shop.data) return <Loader />;

  // Pay in the order's token (USDC/EURC); legacy USD/XTR orders accept any wallet.
  const methods =
    current.currency === 'USD' || current.currency === 'XTR'
      ? shop.data.paymentMethods
      : shop.data.paymentMethods.filter((m) => m.token === current.currency);
  const reload = (): void => setReloadKey((k) => k + 1);
  const feeLabel = shop.data.orderFeeLabel;

  return (
    <List>
      {done && <DoneSection kind={done} onShop={() => navigate('/')} onOrders={() => navigate('/orders')} />}

      <Section header={`Order #${current.id.slice(0, 8)}`}>
        {current.items.map((item) => (
          <Cell
            key={item.productId}
            after={formatPrice(item.subtotal, current.currency)}
            subtitle={`${item.quantity} × ${formatPrice(item.unitPrice, current.currency)}`}
          >
            {item.title}
          </Cell>
        ))}
        {current.fee > 0 && (
          <Cell after={formatPrice(current.fee, current.currency)}>{feeLabel}</Cell>
        )}
        <Cell after={formatPrice(current.total, current.currency)}>Total</Cell>
        {current.amountPaid > 0 && (
          <Cell after={formatPrice(current.amountPaid, current.currency)}>Paid so far</Cell>
        )}
        {current.amountPaid > 0 && current.amountDue > 0 && (
          <Cell after={formatPrice(current.amountDue, current.currency)}>Difference to pay</Cell>
        )}
        {current.amountDue < 0 && (
          <Cell after={formatPrice(-current.amountDue, current.currency)}>Refund from the shop</Cell>
        )}
        {current.contactUsername && <Cell after={`@${current.contactUsername}`}>Contact</Cell>}
      </Section>

      {!done && <StatusSection order={current} />}

      {needsPayment && methods.length > 0 && (
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
          header={`No ${current.currency} wallet configured`}
          description="Contact the shop to pay this order."
        >
          <span style={{ fontSize: 48 }}>💳</span>
        </Placeholder>
      )}

      {current.changeRequest ? (
        <PendingChange order={current} feeLabel={feeLabel} onWithdrawn={reload} />
      ) : (
        CHANGEABLE.includes(current.status) &&
        (editing ? (
          <ChangeEditor
            order={current}
            feeLabel={feeLabel}
            onCancel={() => setEditing(false)}
            onRequested={() => {
              setEditing(false);
              setDone('change');
              reload();
            }}
          />
        ) : (
          <Section footer="The shop has to approve changes. Then you pay the difference, or get the extra back if the order costs less.">
            <div style={{ padding: 16 }}>
              <Button stretched mode="bezeled" onClick={() => setEditing(true)}>
                ✏️ Request a change
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
        header={kind === 'payment' ? 'Payment sent!' : 'Change requested!'}
        description={
          kind === 'payment'
            ? 'Thanks for your purchase. We will confirm your payment shortly — you can follow it in My orders.'
            : 'The shop will review your change. You will get a message when it is approved.'
        }
      >
        <span style={{ fontSize: 56 }}>✅</span>
      </Placeholder>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px 16px' }}>
        <Button stretched onClick={onShop}>
          Back to shop
        </Button>
        <Button stretched mode="plain" onClick={onOrders}>
          My orders
        </Button>
      </div>
    </Section>
  );
}

function StatusSection({ order }: { order: Order }): React.JSX.Element {
  switch (order.status) {
    case 'awaiting_payment':
      return (
        <Section
          header="Payment submitted"
          footer="We are checking your transaction. You will see the order as Paid once it is confirmed."
        >
          <Cell subtitle="Method">{order.paymentNetwork ?? '—'}</Cell>
          <Cell subtitle="Transaction" multiline>
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
              ? '✅ Payment confirmed — the shop will send you the difference back'
              : '✅ Payment confirmed'}
          </Cell>
        </Section>
      );
    case 'fulfilled':
      return (
        <Section>
          <Cell>📦 Order fulfilled</Cell>
        </Section>
      );
    case 'cancelled':
      return (
        <Section>
          <Cell>❌ Order cancelled</Cell>
        </Section>
      );
    case 'pending':
      return order.amountPaid > 0 ? (
        <Section>
          <Cell multiline>✏️ Your change was approved — please pay the difference below</Cell>
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
      setError(err instanceof ApiClientError ? err.message : 'Could not submit the payment');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Section header={resubmit ? 'Wrong transaction? Submit it again' : '1. Choose a network'}>
        {methods.map((m) => (
          <Cell
            key={m.id}
            onClick={() => {
              setMethodId(m.id);
              setCopied(null);
            }}
            after={m.id === method.id ? '✓' : ''}
          >
            {m.token} on {m.network}
          </Cell>
        ))}
      </Section>

      <Section
        header="2. Send exactly this amount"
        footer={`Send ${method.token} on the ${method.network} network only. Another network or token can mean losing the funds.`}
      >
        <Cell
          subtitle={order.amountPaid > 0 ? 'Difference to pay' : 'Amount'}
          after={
            <Button
              size="s"
              mode="bezeled"
              onClick={() => void copy('amount', (due / 100).toFixed(2))}
            >
              {copied === 'amount' ? 'Copied' : 'Copy'}
            </Button>
          }
        >
          {amount}
        </Cell>
        <Cell
          subtitle={`${method.network} address`}
          multiline
          after={
            <Button size="s" mode="bezeled" onClick={() => void copy('address', method.address)}>
              {copied === 'address' ? 'Copied' : 'Copy'}
            </Button>
          }
        >
          <span style={breakAll}>{method.address}</span>
        </Cell>
      </Section>

      <Section
        header="3. Paste the transaction hash"
        footer="You can find it in your wallet or exchange, in the details of the transfer."
      >
        <Input
          header="Transaction hash"
          placeholder="0x… / signature"
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
            {resubmit ? 'Update transaction' : 'I have paid'}
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
  if (diff > 0) return `You would pay ${formatPrice(diff, currency)} more`;
  if (diff < 0) return `You would get ${formatPrice(-diff, currency)} back`;
  return 'Same amount — nothing to pay';
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
      setError(err instanceof ApiClientError ? err.message : 'Could not withdraw the request');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      header="Change requested — waiting for approval"
      footer={differenceLabel(change.total - coveredAmount(order), order.currency)}
    >
      {change.items.map((item) => (
        <Cell
          key={item.productId}
          after={formatPrice(item.subtotal, order.currency)}
          subtitle={`${item.quantity} × ${formatPrice(item.unitPrice, order.currency)}`}
        >
          {item.title}
        </Cell>
      ))}
      {order.fee > 0 && <Cell after={formatPrice(order.fee, order.currency)}>{feeLabel}</Cell>}
      <Cell after={formatPrice(change.total, order.currency)}>New total</Cell>
      <div style={{ padding: 16 }}>
        <Button stretched mode="plain" loading={busy} onClick={() => void withdraw()}>
          Withdraw request
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
  title: string;
  unitPrice: number;
  quantity: number;
}

/** Edit the order like a cart, then send it to the shop for approval. */
function ChangeEditor({
  order,
  feeLabel,
  onCancel,
  onRequested,
}: {
  order: Order;
  feeLabel: string;
  onCancel: () => void;
  onRequested: () => void;
}): React.JSX.Element {
  const [lines, setLines] = useState<DraftLine[]>(() =>
    order.items.map((item) => ({
      productId: item.productId,
      title: item.title,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const catalog = useAsync(() => api.getProducts({ limit: 100 }), []);

  const setQty = (productId: string, quantity: number): void =>
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.productId !== productId)
        : prev.map((l) => (l.productId === productId ? { ...l, quantity } : l)),
    );

  // The order's fee is charged once, whatever the items.
  const total = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) + order.fee;
  const diff = total - coveredAmount(order);
  const addable = (catalog.data?.items ?? []).filter(
    (p) =>
      p.currency === order.currency &&
      (p.stock === null || p.stock > 0) &&
      !lines.some((l) => l.productId === p.id),
  );

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.requestOrderChange(
        order.id,
        lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      );
      onRequested();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not send the request');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Section header="Change your order" footer={differenceLabel(diff, order.currency)}>
        {lines.length === 0 && <Cell multiline>Keep at least one product.</Cell>}
        {lines.map((line) => (
          <Cell
            key={line.productId}
            subtitle={formatPrice(line.unitPrice, order.currency)}
            after={formatPrice(line.unitPrice * line.quantity, order.currency)}
            multiline
            description={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <Button
                  size="s"
                  mode="bezeled"
                  onClick={() => setQty(line.productId, line.quantity - 1)}
                >
                  −
                </Button>
                <span>{line.quantity}</span>
                <Button
                  size="s"
                  mode="bezeled"
                  onClick={() => setQty(line.productId, line.quantity + 1)}
                >
                  +
                </Button>
                <Button size="s" mode="plain" onClick={() => setQty(line.productId, 0)}>
                  Remove
                </Button>
              </div>
            }
          >
            {line.title}
          </Cell>
        ))}
        {order.fee > 0 && (
          <Cell after={formatPrice(order.fee, order.currency)}>{feeLabel}</Cell>
        )}
        <Cell after={formatPrice(total, order.currency)}>New total</Cell>
      </Section>

      {addable.length > 0 && (
        <Section header="Add products">
          {addable.map((product) => (
            <Cell
              key={product.id}
              subtitle={formatPrice(product.price, product.currency)}
              after={
                <Button
                  size="s"
                  mode="bezeled"
                  onClick={() =>
                    setLines((prev) => [
                      ...prev,
                      {
                        productId: product.id,
                        title: product.title,
                        unitPrice: product.price,
                        quantity: 1,
                      },
                    ])
                  }
                >
                  Add
                </Button>
              }
            >
              {product.title}
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
            Send change for approval
          </Button>
          <Button stretched mode="plain" onClick={onCancel}>
            Cancel
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
