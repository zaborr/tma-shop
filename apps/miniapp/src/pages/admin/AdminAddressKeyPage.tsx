import { useEffect, useState } from 'react';
import { Button, Cell, List, Section } from '@telegram-apps/telegram-ui';
import { Textarea } from '../../components/Field.js';
import { api } from '../../api/client.js';
import { copyText } from '../../lib/clipboard.js';
import {
  cryptoAvailable,
  generateAddressKeys,
  loadPrivateKey,
  privateKeyMatches,
  savePrivateKey,
} from '../../lib/addressCrypto.js';
import { useShop } from '../../providers/ShopProvider.js';
import { AdminOnly, ErrorBanner, useAdminActions } from './common.js';

/**
 * The shop's address key pair. The public key is stored on the server; the
 * private key stays on the admin's device (and wherever they back it up).
 */
export function AdminAddressKeyPage(): React.JSX.Element {
  return (
    <AdminOnly>
      <AdminAddressKey />
    </AdminOnly>
  );
}

type DeviceKey = 'none' | 'matches' | 'other' | 'checking';

function AdminAddressKey(): React.JSX.Element {
  const { shop, reload } = useShop();
  const actions = useAdminActions(reload);
  const [deviceKey, setDeviceKey] = useState<DeviceKey>('checking');
  const [newPrivateKey, setNewPrivateKey] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [allowMismatch, setAllowMismatch] = useState(false);
  const [pastedPublic, setPastedPublic] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const stored = loadPrivateKey(shop.id);
    if (!stored) {
      setDeviceKey('none');
      return;
    }
    if (!shop.addressPublicKey) {
      setDeviceKey('other');
      return;
    }
    setDeviceKey('checking');
    void privateKeyMatches(stored, shop.addressPublicKey).then((ok) => {
      if (!cancelled) setDeviceKey(ok ? 'matches' : 'other');
    });
    return () => {
      cancelled = true;
    };
  }, [shop.id, shop.addressPublicKey, refresh]);

  if (!cryptoAvailable()) {
    return (
      <List>
        <Section>
          <Cell multiline>This device can’t run the encryption needed for address keys.</Cell>
        </Section>
      </List>
    );
  }

  const generate = async (): Promise<void> => {
    setBusy(true);
    await actions.run(async () => {
      const keys = await generateAddressKeys();
      await api.adminUpdateAddressKey(keys.publicKey);
      savePrivateKey(shop.id, keys.privateKeyPem);
      setNewPrivateKey(keys.privateKeyPem);
      setCopied(false);
      setRefresh((n) => n + 1);
    });
    setBusy(false);
  };

  const savePasted = async (): Promise<void> => {
    setPasteError(null);
    const pem = pasted.trim();
    if (!pem.includes('PRIVATE KEY')) {
      setPasteError('Paste the whole key, from -----BEGIN PRIVATE KEY----- to the END line.');
      return;
    }
    const matches = shop.addressPublicKey ? await privateKeyMatches(pem, shop.addressPublicKey) : false;
    if (!matches && !allowMismatch) {
      setPasteError(
        'This key doesn’t match the shop’s current key. Tap “Save anyway” only if it is an older key you need to read old addresses.',
      );
      setAllowMismatch(true);
      return;
    }
    if (!savePrivateKey(shop.id, pem)) {
      setPasteError('This device doesn’t allow saving it (private browsing?).');
      return;
    }
    setPasted('');
    setAllowMismatch(false);
    setRefresh((n) => n + 1);
  };

  const uploadPublic = async (): Promise<void> => {
    setBusy(true);
    await actions.run(async () => {
      await api.adminUpdateAddressKey(pastedPublic.trim());
      setPastedPublic('');
      setRefresh((n) => n + 1);
    });
    setBusy(false);
  };

  const hasKey = shop.addressPublicKey !== null;

  return (
    <List>
      <ErrorBanner message={actions.error} />

      <Section
        header="Address key"
        footer="Customers’ phones encrypt the delivery address with the shop’s public key. Only the private key can read it — the server and the platform never can."
      >
        <Cell after={hasKey ? (shop.addressKeyFingerprint ?? '✓') : 'Not set'}>Shop public key</Cell>
        <Cell
          after={
            deviceKey === 'checking'
              ? '…'
              : deviceKey === 'matches'
                ? '✓ Matches'
                : deviceKey === 'other'
                  ? '⚠️ Other key'
                  : 'None'
          }
        >
          Private key on this device
        </Cell>
      </Section>

      {newPrivateKey && (
        <Section
          header="⚠️ Save your private key now"
          footer="It is stored on this device only. Keep a copy in a password manager: if you lose it, the addresses can’t be read by anyone. Never share it."
        >
          <Textarea value={newPrivateKey} readOnly />
          <div style={{ padding: 16 }}>
            <Button
              stretched
              onClick={() => void copyText(newPrivateKey).then(setCopied)}
            >
              {copied ? 'Copied ✓' : 'Copy private key'}
            </Button>
          </div>
        </Section>
      )}

      <Section
        header={hasKey ? 'Replace key' : 'Create key'}
        footer={
          hasKey
            ? 'A new key applies to new orders. Addresses already received can only be read with the old private key, so keep it.'
            : 'Generates the key pair on this phone. The public key goes to the shop; the private key is shown once and kept on this device.'
        }
      >
        <div style={{ padding: 16 }}>
          <Button
            stretched
            mode={hasKey ? 'bezeled' : 'filled'}
            loading={busy}
            onClick={() =>
              hasKey ? void actions.twoTap('generate', generate) : void generate()
            }
          >
            {hasKey
              ? actions.tapLabel('generate', '🔄 Generate a new key pair', 'Tap again — old addresses need the old key')
              : '🔑 Generate key pair'}
          </Button>
        </div>
      </Section>

      <Section
        header="Use your private key on this device"
        footer="Paste the private key you saved to read addresses here (e.g. on a new phone)."
      >
        <Textarea
          header="Private key"
          placeholder="-----BEGIN PRIVATE KEY----- …"
          value={pasted}
          onChange={(e) => {
            setPasted(e.target.value);
            setAllowMismatch(false);
          }}
        />
        {pasteError && (
          <Cell multiline style={{ color: 'var(--tgui--destructive_text_color)' }}>
            {pasteError}
          </Cell>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
          <Button stretched disabled={!pasted.trim()} onClick={() => void savePasted()}>
            {allowMismatch ? 'Save anyway' : 'Save on this device'}
          </Button>
          {deviceKey !== 'none' && (
            <Button
              stretched
              mode="plain"
              onClick={() =>
                void actions.twoTap('forget', async () => {
                  savePrivateKey(shop.id, null);
                  setRefresh((n) => n + 1);
                })
              }
            >
              {actions.tapLabel('forget', 'Forget the key on this device')}
            </Button>
          )}
        </div>
      </Section>

      <Section
        header="Advanced"
        footer="Use a public key made elsewhere (RSA 2048+, “BEGIN PUBLIC KEY”). Removing the key turns off checkout with delivery."
      >
        <Textarea
          header="Public key"
          placeholder="-----BEGIN PUBLIC KEY----- …"
          value={pastedPublic}
          onChange={(e) => setPastedPublic(e.target.value)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
          <Button
            stretched
            mode="bezeled"
            disabled={pastedPublic.trim().length < 100}
            onClick={() => void uploadPublic()}
          >
            Set this public key
          </Button>
          {hasKey && (
            <Button
              stretched
              mode="plain"
              onClick={() =>
                void actions.twoTap('remove', () => api.adminUpdateAddressKey(null))
              }
            >
              {actions.tapLabel('remove', 'Remove the shop key')}
            </Button>
          )}
        </div>
      </Section>
    </List>
  );
}
