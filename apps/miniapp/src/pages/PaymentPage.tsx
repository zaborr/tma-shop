import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Cell, Input, List, Placeholder, Section } from '@telegram-apps/telegram-ui';
import type { Order, PaymentMethod } from '@tma-shop/shared';
import { api, ApiClientError } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { copyText } from '../lib/clipboard.js';
import { formatPrice, formatTokenAmount } from '../lib/format.js';
import { Loader } from '../components/Loader.js';
import { ErrorView } from '../components/ErrorView.js';

const breakAll: React.CSSProperties = { wordBreak: 'break-all', whiteSpace: 'normal' };

/** Order detail + crypto checkout: pick a wallet, send the amount, paste the tx hash. */
export function PaymentPage(): React.JSX.Element {
  const { id = '' } = useParams();
  const [reloadKey, setReloadKey] = useState(0);
  const order = useAsync(() => api.getOrder(id), [id, reloadKey]);
  const shop = useAsync(() => api.getShop(), []);

  if (order.loading || shop.loading) return <Loader />;
  if (order.error) return <ErrorView message={order.error} />;
  if (shop.error) return <ErrorView message={shop.error} />;
  if (!order.data || !shop.data) return <Loader />;

  const current = order.data;
  // Pay in the order's token (USDC/EURC); legacy USD/XTR orders accept any wallet.
  const tokenMethods = shop.data.paymentMethods.filter((m) => m.token === current.currency);
  const methods =
    current.currency === 'USD' || current.currency === 'XTR'
      ? shop.data.paymentMethods
      : tokenMethods;
  const payable = current.status === 'pending' || current.status === 'awaiting_payment';

  return (
    <List>
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
        <Cell after={formatPrice(current.total, current.currency)}>Total</Cell>
      </Section>

      <StatusSection order={current} />

      {payable && methods.length > 0 && (
        <PaymentForm
          key={current.paymentTxHash ?? 'new'}
          order={current}
          methods={methods}
          onSubmitted={() => setReloadKey((k) => k + 1)}
        />
      )}
      {payable && methods.length === 0 && (
        <Placeholder
          header={`No ${current.currency} wallet configured`}
          description="Contact the shop to pay this order."
        >
          <span style={{ fontSize: 48 }}>💳</span>
        </Placeholder>
      )}
    </List>
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
          <Cell>✅ Payment confirmed</Cell>
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
      return <></>;
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
  const amount = formatTokenAmount(order.total, method.token);
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
          subtitle="Amount"
          after={
            <Button
              size="s"
              mode="bezeled"
              onClick={() => void copy('amount', (order.total / 100).toFixed(2))}
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
            <Cell multiline style={{ color: 'var(--tgui--destructive_text_color)' }}>
              {error}
            </Cell>
          )}
        </div>
      </Section>
    </>
  );
}
