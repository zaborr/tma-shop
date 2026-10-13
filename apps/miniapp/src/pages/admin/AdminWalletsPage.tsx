import { useState } from 'react';
import { Button, Cell, List, Section } from '@telegram-apps/telegram-ui';
import { Input } from '../../components/Field.js';
import type { WalletInput } from '@tma-shop/shared';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useShop } from '../../providers/ShopProvider.js';
import { Loader } from '../../components/Loader.js';
import { ErrorView } from '../../components/ErrorView.js';
import { AdminOnly, ErrorBanner, TOKENS, useAdminActions } from './common.js';
import { t, tn } from '../../i18n/index.js';

interface Row {
  key: number;
  network: string;
  tokens: string[];
  address: string;
}

function toRow(wallet: WalletInput, key: number): Row {
  return {
    key,
    network: wallet.network,
    tokens: wallet.token
      .split(/[/,|]/)
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean),
    address: wallet.address,
  };
}

/** The crypto wallets customers of this shop pay into. */
export function AdminWalletsPage(): React.JSX.Element {
  return (
    <AdminOnly>
      <AdminWallets />
    </AdminOnly>
  );
}

function AdminWallets(): React.JSX.Element {
  const [reloadKey, setReloadKey] = useState(0);
  const view = useAsync(() => api.adminGetShop(), [reloadKey]);

  if (view.loading && !view.data) return <Loader />;
  if (view.error) return <ErrorView message={view.error} />;
  if (!view.data) return <Loader />;

  return (
    <WalletsForm
      key={reloadKey}
      wallets={view.data.wallets}
      onSaved={() => setReloadKey((k) => k + 1)}
    />
  );
}

function WalletsForm({
  wallets,
  onSaved,
}: {
  wallets: WalletInput[];
  onSaved: () => void;
}): React.JSX.Element {
  const { reload } = useShop();
  const actions = useAdminActions(() => {
    onSaved();
    reload();
  });
  const [rows, setRows] = useState<Row[]>(() => wallets.map(toRow));
  const [nextKey, setNextKey] = useState(wallets.length);
  const [busy, setBusy] = useState(false);

  const update = (key: number, patch: Partial<Row>): void =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const toggleToken = (row: Row, token: string): void =>
    update(row.key, {
      tokens: row.tokens.includes(token)
        ? row.tokens.filter((other) => other !== token)
        : [...row.tokens, token],
    });

  const invalid = rows.some(
    (r) => !r.network.trim() || r.tokens.length === 0 || !r.address.trim(),
  );
  const methodCount = rows.reduce(
    (n, r) => n + r.network.split(/[/,|]/).filter((x) => x.trim()).length * r.tokens.length,
    0,
  );

  const save = async (): Promise<void> => {
    setBusy(true);
    await actions.run(() =>
      api.adminUpdateWallets(
        rows.map((r) => ({
          network: r.network.trim(),
          token: r.tokens.join('/'),
          address: r.address.trim(),
        })),
      ),
    );
    setBusy(false);
  };

  return (
    <List>
      <ErrorBanner message={actions.error} />

      {rows.length === 0 && (
        <Section>
          <Cell multiline>
            {t('wallets.empty')}
          </Cell>
        </Section>
      )}

      {rows.map((row, index) => (
        <Section key={row.key} header={t('wallets.wallet', { n: index + 1 })}>
          <Input
            header={t('wallets.networks')}
            placeholder="Base/Ethereum"
            value={row.network}
            onChange={(e) => update(row.key, { network: e.target.value })}
          />
          <Cell
            subtitle={t('wallets.tokens')}
            after={
              <div style={{ display: 'flex', gap: 8 }}>
                {[...new Set([...TOKENS, ...row.tokens])].map((token) => (
                  <Button
                    key={token}
                    size="s"
                    mode={row.tokens.includes(token) ? 'filled' : 'bezeled'}
                    onClick={() => toggleToken(row, token)}
                  >
                    {token}
                  </Button>
                ))}
              </div>
            }
          >
            {row.tokens.join(' / ') || t('productForm.none')}
          </Cell>
          <Input
            header={t('wallets.address')}
            placeholder={t('wallets.addressPlaceholder')}
            value={row.address}
            onChange={(e) => update(row.key, { address: e.target.value })}
          />
          <div style={{ padding: '0 16px 12px' }}>
            <Button
              size="s"
              mode="plain"
              onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
            >
              {t('wallets.remove')}
            </Button>
          </div>
        </Section>
      ))}

      <Section
        footer={t('wallets.footer', {
          options: tn(methodCount, 'count.paymentOptions.one', 'count.paymentOptions.other'),
        })}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
          <Button
            stretched
            mode="bezeled"
            onClick={() => {
              setRows((prev) => [
                ...prev,
                { key: nextKey, network: '', tokens: ['USDC'], address: '' },
              ]);
              setNextKey((k) => k + 1);
            }}
          >
            {t('wallets.add')}
          </Button>
          <Button stretched loading={busy} disabled={invalid} onClick={() => void save()}>
            {t('wallets.save')}
          </Button>
        </div>
      </Section>
    </List>
  );
}
