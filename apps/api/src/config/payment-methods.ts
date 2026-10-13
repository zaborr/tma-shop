import {
  CHAINS,
  EMPTY_PAYMENT_SETUP,
  EVM_ADDRESS_RE,
  SOLANA_ADDRESS_RE,
  chainId,
  stableToken,
  type ChainId,
  type PaymentMethod,
  type PaymentSetup,
  type StableToken,
} from '@tma-shop/shared';
import type { LegacyWallet } from '../db/schema.js';

/** Human label stored on the order, e.g. "USDC · Base". */
export function paymentMethodLabel(method: PaymentMethod): string {
  return `${method.token} · ${method.network}`;
}

/**
 * Builds a block-explorer link for a transaction. `paymentNetwork` is the label
 * stored on the order ("USDC · Base").
 */
export function explorerTxUrl(paymentNetwork: string | null, txHash: string | null): string | null {
  if (!paymentNetwork || !txHash) return null;
  const network = (paymentNetwork.split('·').pop() ?? '').trim().toLowerCase();
  const chain = chainId.options.find((id) => network.startsWith(id));
  return chain ? `${CHAINS[chain].explorerTx}${encodeURIComponent(txHash)}` : null;
}

/** "Base mainnet" → base, "ETH" → ethereum, "Polygon" → null (not offered any more). */
function chainFromName(name: string): ChainId | null {
  const value = name.trim().toLowerCase();
  if (value.startsWith('base')) return 'base';
  if (value.startsWith('sol')) return 'solana';
  if (value.startsWith('eth') || value === 'erc20' || value === 'mainnet') return 'ethereum';
  return null;
}

/**
 * Converts the old free-text wallets ("Base/Ethereum" + "USDC/EURC" + address)
 * into the catalog setup. Networks or tokens outside the catalog are dropped.
 */
export function legacyToSetup(wallets: readonly LegacyWallet[]): {
  setup: PaymentSetup;
  dropped: string[];
} {
  const setup: PaymentSetup = { ...EMPTY_PAYMENT_SETUP, accepted: [] };
  const dropped: string[] = [];
  for (const wallet of wallets) {
    const address = wallet.address.trim();
    const isEvm = EVM_ADDRESS_RE.test(address);
    const isSolana = SOLANA_ADDRESS_RE.test(address);
    const tokens = wallet.token
      .split(/[/,|]/)
      .map((t) => t.trim().toUpperCase())
      .filter((t): t is StableToken => (stableToken.options as readonly string[]).includes(t));
    for (const name of wallet.network.split(/[/,|]/)) {
      const chain = chainFromName(name);
      const family = chain ? CHAINS[chain].family : null;
      if (!chain || (family === 'evm' && !isEvm) || (family === 'solana' && !isSolana)) {
        if (name.trim()) dropped.push(`${name.trim()} (${address})`);
        continue;
      }
      if (family === 'evm') setup.evmAddress ??= address;
      else setup.solanaAddress ??= address;
      for (const token of tokens) {
        if (!setup.accepted.some((a) => a.chain === chain && a.token === token)) {
          setup.accepted.push({ chain, token });
        }
      }
    }
  }
  return { setup, dropped };
}
