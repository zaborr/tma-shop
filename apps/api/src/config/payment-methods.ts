import { z } from 'zod';
import { walletInput, type PaymentMethod, type WalletInput } from '@tma-shop/shared';

/**
 * Wallets as entered by an admin. One entry may list several networks and/or
 * tokens separated by `/` (same address), e.g.
 *
 *   {"network":"Ethereum/Base","token":"USDC/EURC","address":"0xabc..."}
 *
 * and is expanded into one payment method per combination.
 * Payments are not checked on-chain: the customer submits a transaction hash
 * and an admin confirms it manually from the admin panel.
 */
export function expandWallets(wallets: readonly WalletInput[]): PaymentMethod[] {
  const methods: PaymentMethod[] = [];
  const seen = new Set<string>();
  for (const wallet of wallets) {
    const networks = splitList(wallet.network).map(prettyNetwork);
    const tokens = splitList(wallet.token).map((token) => token.toUpperCase());
    for (const network of networks) {
      for (const token of tokens) {
        const base = slugify(`${token}-${network}`).slice(0, 60) || 'wallet';
        // Same token + network twice (different addresses): keep both, unique ids.
        let id = base;
        for (let n = 2; seen.has(id); n += 1) id = `${base}-${n}`;
        seen.add(id);
        methods.push({ id, network, token, address: wallet.address.trim() });
      }
    }
  }
  return methods;
}

/**
 * Legacy `PAYMENT_METHODS` env var: a JSON array of wallets, imported once into
 * the first shop on startup. Since multi-store, wallets live on each shop.
 */
export const walletsEnvSchema = z
  .string()
  .default('[]')
  .transform((value, ctx): WalletInput[] => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value.trim() || '[]');
    } catch {
      ctx.addIssue({ code: 'custom', message: 'PAYMENT_METHODS must be a JSON array' });
      return z.NEVER;
    }
    // Older configs may carry an `id`; it is derived again on expansion.
    const result = z.array(walletInput.extend({ id: z.string().optional() })).safeParse(parsed);
    if (!result.success) {
      ctx.addIssue({
        code: 'custom',
        message: `PAYMENT_METHODS is invalid: ${result.error.issues
          .map((issue) => `${issue.path.join('.')} ${issue.message}`)
          .join('; ')}`,
      });
      return z.NEVER;
    }
    return result.data.map(({ network, token, address }) => ({ network, token, address }));
  });

/** "Ethereum/Base" or "USDC, EURC" → trimmed, non-empty parts. */
function splitList(value: string): string[] {
  return value
    .split(/[/,|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** "ETHEREUM" → "Ethereum"; mixed-case names ("BNB Chain") are kept as written. */
function prettyNetwork(name: string): string {
  return name.length > 3 && name === name.toUpperCase()
    ? name.charAt(0) + name.slice(1).toLowerCase()
    : name;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Human label stored on the order, e.g. "USDC · Base". */
export function paymentMethodLabel(method: PaymentMethod): string {
  return `${method.token} · ${method.network}`;
}

/** Block-explorer transaction URL templates for well-known networks. */
const EXPLORERS: Record<string, string> = {
  ethereum: 'https://etherscan.io/tx/',
  base: 'https://basescan.org/tx/',
  polygon: 'https://polygonscan.com/tx/',
  arbitrum: 'https://arbiscan.io/tx/',
  optimism: 'https://optimistic.etherscan.io/tx/',
  bsc: 'https://bscscan.com/tx/',
  bnb: 'https://bscscan.com/tx/',
  avalanche: 'https://snowtrace.io/tx/',
  solana: 'https://solscan.io/tx/',
  tron: 'https://tronscan.org/#/transaction/',
};

/**
 * Builds a block-explorer link for a transaction. `paymentNetwork` is the label
 * stored on the order ("USDC · Base"); the network part is matched by name.
 */
export function explorerTxUrl(paymentNetwork: string | null, txHash: string | null): string | null {
  if (!paymentNetwork || !txHash) return null;
  const network = (paymentNetwork.split('·').pop() ?? '').trim().toLowerCase();
  const key = Object.keys(EXPLORERS).find((name) => network.startsWith(name));
  const base = key ? EXPLORERS[key] : undefined;
  return base ? `${base}${encodeURIComponent(txHash)}` : null;
}
