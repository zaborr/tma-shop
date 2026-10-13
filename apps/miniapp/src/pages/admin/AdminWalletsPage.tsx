import { useState } from 'react';
import { Button, Cell, Input, List, Section } from '@telegram-apps/telegram-ui';
import type { WalletInput } from '@tma-shop/shared';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useShop } from '../../providers/ShopProvider.js';
import { Loader } from '../../components/Loader.js';
import { ErrorView } from '../../components/ErrorView.js';
import { AdminOnly, ErrorBanner, TOKENS, useAdminActions } from './common.js';

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
      .map((t) => t.trim().toUpperCase())
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
        ? row.tokens.filter((t) => t !== token)
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
            No wallets yet. Customers can’t pay until you add at least one.
          </Cell>
        </Section>
      )}

      {rows.map((row, index) => (
        <Section key={row.key} header={`Wallet ${index + 1}`}>
          <Input
            header="Networks (join several with /)"
            placeholder="Base/Ethereum"
            value={row.network}
            onChange={(e) => update(row.key, { network: e.target.value })}
          />
          <Cell
            subtitle="Tokens"
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
            {row.tokens.join(' / ') || 'None'}
          </Cell>
          <Input
            header="Address"
            placeholder="0x… / Solana address"
            value={row.address}
            onChange={(e) => update(row.key, { address: e.target.value })}
          />
          <div style={{ padding: '0 16px 12px' }}>
            <Button
              size="s"
              mode="plain"
              onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
            >
              Remove wallet
            </Button>
          </div>
        </Section>
      ))}

      <Section
        footer={`Customers will see ${methodCount} payment option${methodCount === 1 ? '' : 's'} (one per network and token). Double-check every address: payments sent to a wrong address are lost.`}
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
            ➕ Add wallet
          </Button>
          <Button stretched loading={busy} disabled={invalid} onClick={() => void save()}>
            Save wallets
          </Button>
        </div>
      </Section>
    </List>
  );
}
