import { z } from 'zod';

/**
 * Networks and tokens the shop accepts, with their official contracts (Circle).
 * A closed list: payments can be checked on-chain and nothing depends on how
 * an admin spells a network name.
 */
export const CHAINS = {
  base: { name: 'Base', family: 'evm', evmChainId: 8453, explorerTx: 'https://basescan.org/tx/' },
  solana: { name: 'Solana', family: 'solana', evmChainId: null, explorerTx: 'https://solscan.io/tx/' },
  ethereum: { name: 'Ethereum', family: 'evm', evmChainId: 1, explorerTx: 'https://etherscan.io/tx/' },
} as const;

export const chainId = z.enum(['base', 'solana', 'ethereum']);
export type ChainId = z.infer<typeof chainId>;

export const stableToken = z.enum(['USDC', 'EURC']);
export type StableToken = z.infer<typeof stableToken>;

/** Official token contracts (EVM) and mints (Solana). Both tokens use 6 decimals. */
export const TOKEN_CONTRACTS: Record<ChainId, Record<StableToken, string>> = {
  base: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    EURC: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42',
  },
  ethereum: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    EURC: '0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c',
  },
  solana: {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    EURC: 'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr',
  },
};
export const TOKEN_DECIMALS = 6;

export const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** How a shop gets paid: one EVM address, one Solana address, and what it accepts. */
export const paymentSetup = z.object({
  /** Receives payments on Base and Ethereum. */
  evmAddress: z.string().trim().regex(EVM_ADDRESS_RE).nullable(),
  /** Receives payments on Solana. */
  solanaAddress: z.string().trim().regex(SOLANA_ADDRESS_RE).nullable(),
  /** Network + token pairs the shop accepts. */
  accepted: z.array(z.object({ chain: chainId, token: stableToken })).max(12),
});
export type PaymentSetup = z.infer<typeof paymentSetup>;

export const EMPTY_PAYMENT_SETUP: PaymentSetup = {
  evmAddress: null,
  solanaAddress: null,
  accepted: [],
};

/** The address that receives payments on `chain`, if the shop set one. */
export function addressFor(setup: PaymentSetup, chain: ChainId): string | null {
  return CHAINS[chain].family === 'evm' ? setup.evmAddress : setup.solanaAddress;
}

/**
 * A way to pay (one network + one token) offered to customers, derived from
 * the shop's payment setup.
 */
export const paymentMethod = z.object({
  /** Stable identifier, e.g. `usdc-base`. */
  id: z.string().min(1).max(64),
  chain: chainId,
  /** Network name shown to the customer, e.g. `Base`. */
  network: z.string().min(1).max(64),
  token: stableToken,
  /** Receiving address on that network. */
  address: z.string().min(1).max(128),
  /** Token contract (EVM) or mint (Solana). */
  contract: z.string(),
});
export type PaymentMethod = z.infer<typeof paymentMethod>;

/** Payment methods a shop offers, in catalog order, skipping those without an address. */
export function paymentMethodsOf(setup: PaymentSetup | null | undefined): PaymentMethod[] {
  const current = setup ?? EMPTY_PAYMENT_SETUP;
  const methods: PaymentMethod[] = [];
  for (const chain of chainId.options) {
    const address = addressFor(current, chain);
    if (!address) continue;
    for (const token of stableToken.options) {
      if (!current.accepted.some((a) => a.chain === chain && a.token === token)) continue;
      methods.push({
        id: `${token.toLowerCase()}-${chain}`,
        chain,
        network: CHAINS[chain].name,
        token,
        address,
        contract: TOKEN_CONTRACTS[chain][token],
      });
    }
  }
  return methods;
}

/**
 * Payment request a wallet understands (QR or link), with address, token and
 * amount filled in: Solana Pay for Solana, EIP-681 for Base/Ethereum.
 * `cents` is the amount in minor units of the token.
 */
export function paymentUri(
  method: PaymentMethod,
  cents: number,
  label: string,
  message: string,
): string {
  if (method.chain === 'solana') {
    const params = new URLSearchParams({
      amount: (cents / 100).toFixed(2),
      'spl-token': method.contract,
      label,
      message,
    });
    return `solana:${method.address}?${params.toString()}`;
  }
  const raw = BigInt(cents) * 10n ** BigInt(TOKEN_DECIMALS - 2);
  return `ethereum:${method.contract}@${CHAINS[method.chain].evmChainId}/transfer?address=${method.address}&uint256=${raw.toString()}`;
}

/** Link that opens the same EVM payment in the MetaMask app. */
export function metamaskUrl(method: PaymentMethod, cents: number): string | null {
  if (method.chain === 'solana') return null;
  const uri = paymentUri(method, cents, '', '');
  return `https://metamask.app.link/send/${uri.slice('ethereum:'.length)}`;
}
