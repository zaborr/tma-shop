import { useState } from 'react';
import { Button, Cell, List, Section } from '@telegram-apps/telegram-ui';
import {
  CHAINS,
  EVM_ADDRESS_RE,
  SOLANA_ADDRESS_RE,
  paymentMethodsOf,
  stableToken,
  type ChainId,
  type PaymentSetup,
  type StableToken,
} from '@tma-shop/shared';
import { Input } from '../../components/Field.js';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useShop } from '../../providers/ShopProvider.js';
import { Loader } from '../../components/Loader.js';
import { ErrorView } from '../../components/ErrorView.js';
import { AdminOnly, ErrorBanner, useAdminActions } from './common.js';
import { t, tn } from '../../i18n/index.js';

/** The receiving addresses and the networks/tokens the shop accepts. */
export function AdminWalletsPage(): React.JSX.Element {
  return (
    <AdminOnly>
      <AdminWallets />
    </AdminOnly>
  );
}

function AdminWallets(): React.JSX.Element {
  const [reloadKey, setReloadKey] = useState(0);
  const [saved, setSaved] = useState(false);
  const view = useAsync(() => api.adminGetShop(), [reloadKey]);

  if (view.loading && !view.data) return <Loader />;
  if (view.error) return <ErrorView message={view.error} />;
  if (!view.data) return <Loader />;

  return (
    <PaymentsForm
      key={reloadKey}
      setup={view.data.paymentSetup}
      saved={saved}
      onSaved={() => {
        setSaved(true);
        setReloadKey((k) => k + 1);
      }}
    />
  );
}

function PaymentsForm({
  setup,
  saved,
  onSaved,
}: {
  setup: PaymentSetup;
  saved: boolean;
  onSaved: () => void;
}): React.JSX.Element {
  const { reload } = useShop();
  const actions = useAdminActions(() => {
    onSaved();
    reload();
  });
  const [evm, setEvm] = useState(setup.evmAddress ?? '');
  const [solana, setSolana] = useState(setup.solanaAddress ?? '');
  const [accepted, setAccepted] = useState(setup.accepted);
  const [busy, setBusy] = useState(false);

  const evmValue = evm.trim();
  const solanaValue = solana.trim();
  const evmInvalid = evmValue !== '' && !EVM_ADDRESS_RE.test(evmValue);
  const solanaInvalid = solanaValue !== '' && !SOLANA_ADDRESS_RE.test(solanaValue);
  const next: PaymentSetup = {
    evmAddress: evmValue && !evmInvalid ? evmValue : null,
    solanaAddress: solanaValue && !solanaInvalid ? solanaValue : null,
    // Only networks whose address is set.
    accepted: accepted.filter((a) =>
      CHAINS[a.chain].family === 'evm' ? evmValue !== '' : solanaValue !== '',
    ),
  };
  const methods = paymentMethodsOf(next);

  const isOn = (chain: ChainId, token: StableToken): boolean =>
    accepted.some((a) => a.chain === chain && a.token === token);
  const toggle = (chain: ChainId, token: StableToken): void =>
    setAccepted((prev) =>
      isOn(chain, token)
        ? prev.filter((a) => !(a.chain === chain && a.token === token))
        : [...prev, { chain, token }],
    );

  const save = async (): Promise<void> => {
    setBusy(true);
    await actions.run(() => api.adminUpdatePayments(next));
    setBusy(false);
  };

  /** USDC / EURC toggles for one network. */
  const tokenRow = (chain: ChainId, hasAddress: boolean): React.JSX.Element => (
    <Cell
      key={chain}
      subtitle={hasAddress ? t('wallets.accept') : t('wallets.needAddress')}
      after={
        <div style={{ display: 'flex', gap: 8 }}>
          {stableToken.options.map((token) => (
            <Button
              key={token}
              size="s"
              disabled={!hasAddress}
              mode={hasAddress && isOn(chain, token) ? 'filled' : 'bezeled'}
              onClick={() => toggle(chain, token)}
            >
              {token}
            </Button>
          ))}
        </div>
      }
    >
      {CHAINS[chain].name}
    </Cell>
  );

  return (
    <List>
      <ErrorBanner message={actions.error} />
      <Section>
        <Cell multiline>{t('wallets.intro')}</Cell>
      </Section>

      <Section header={t('wallets.evmTitle')} footer={t('wallets.evmFooter')}>
        <Input
          header={evmInvalid ? t('wallets.evmInvalid') : t('wallets.evmAddress')}
          placeholder="0x…"
          status={evmInvalid ? 'error' : 'default'}
          value={evm}
          onChange={(e) => setEvm(e.target.value)}
        />
        {tokenRow('base', evmValue !== '' && !evmInvalid)}
        {tokenRow('ethereum', evmValue !== '' && !evmInvalid)}
      </Section>

      <Section header={t('wallets.solanaTitle')} footer={t('wallets.solanaFooter')}>
        <Input
          header={solanaInvalid ? t('wallets.solanaInvalid') : t('wallets.solanaAddress')}
          status={solanaInvalid ? 'error' : 'default'}
          value={solana}
          onChange={(e) => setSolana(e.target.value)}
        />
        {tokenRow('solana', solanaValue !== '' && !solanaInvalid)}
      </Section>

      <Section
        footer={
          methods.length > 0
            ? t('wallets.summary', {
                options: tn(methods.length, 'count.paymentOptions.one', 'count.paymentOptions.other'),
              })
            : t('wallets.none')
        }
      >
        <div style={{ padding: 16 }}>
          <Button
            stretched
            loading={busy}
            disabled={evmInvalid || solanaInvalid}
            onClick={() => void save()}
          >
            {t('wallets.save')}
          </Button>
        </div>
        {saved && <Cell multiline>{t('wallets.saved')}</Cell>}
      </Section>
    </List>
  );
}
