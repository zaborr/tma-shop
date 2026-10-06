import { z } from 'zod';
import { paymentMethod, type PaymentMethod } from '@tma-shop/shared';

/**
 * Crypto wallets the shop accepts, configured with the `PAYMENT_METHODS`
 * environment variable as a JSON array. `id` is optional and derived from the
 * token and network when omitted. One entry may list several networks and/or
 * tokens separated by `/` (same address), and is expanded into one method per
 * combination. Example:
 *
 *   [{"network":"Ethereum/Base","token":"USDC/EURC","address":"0xabc..."},
 *    {"network":"Solana","token":"USDC/EURC","address":"7xKX..."}]
 *
 * Payments are not checked on-chain: the customer submits a transaction hash
 * and an admin confirms it manually from the admin panel.
 */
const rawMethod = paymentMethod.extend({ id: paymentMethod.shape.id.optional() });

export const paymentMethodsSchema = z
  .string()
  .default('[]')
  .transform((value, ctx): PaymentMethod[] => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value.trim() || '[]');
    } catch {
      ctx.addIssue({ code: 'custom', message: 'PAYMENT_METHODS must be a JSON array' });
      return z.NEVER;
    }
    const result = z.array(rawMethod).safeParse(parsed);
    if (!result.success) {
      ctx.addIssue({
        code: 'custom',
        message: `PAYMENT_METHODS is invalid: ${result.error.issues
          .map((issue) => `${issue.path.join('.')} ${issue.message}`)
          .join('; ')}`,
      });
      return z.NEVER;
    }
    const methods = result.data.flatMap((method) => {
      const networks = splitList(method.network).map(prettyNetwork);
      const tokens = splitList(method.token).map((token) => token.toUpperCase());
      const expanded = networks.length * tokens.length > 1;
      return networks.flatMap((network) =>
        tokens.map((token) => {
          const derived = slugify(`${token}-${network}`);
          return {
            id: method.id ? (expanded ? `${method.id}-${derived}` : method.id) : derived,
            network,
            token,
            address: method.address.trim(),
          };
        }),
      );
    });
    if (methods.length === 0) return [];
    const ids = new Set(methods.map((method) => method.id));
    if (ids.size !== methods.length) {
      ctx.addIssue({ code: 'custom', message: 'PAYMENT_METHODS has duplicate ids' });
      return z.NEVER;
    }
    return methods;
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
