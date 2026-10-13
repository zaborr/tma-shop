import { describe, expect, it } from 'vitest';
import { paymentMethodsOf } from '@tma-shop/shared';
import { explorerTxUrl, legacyToSetup } from './payment-methods.js';

const EVM = '0x1111111111111111111111111111111111111111';
const SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

describe('legacyToSetup', () => {
  it('turns "Ethereum/Base" + "USDC/EURC" into catalog entries and drops the rest', () => {
    const { setup, dropped } = legacyToSetup([
      { network: 'Ethereum/Base', token: 'USDC/EURC', address: EVM },
      { network: 'Solana', token: 'USDC', address: SOL },
      { network: 'Polygon', token: 'USDC', address: EVM },
    ]);
    expect(setup.evmAddress).toBe(EVM);
    expect(setup.solanaAddress).toBe(SOL);
    expect(setup.accepted).toEqual([
      { chain: 'ethereum', token: 'USDC' },
      { chain: 'ethereum', token: 'EURC' },
      { chain: 'base', token: 'USDC' },
      { chain: 'base', token: 'EURC' },
      { chain: 'solana', token: 'USDC' },
    ]);
    expect(dropped).toEqual([`Polygon (${EVM})`]);
  });

  it('ignores an address of the wrong kind for the network', () => {
    const { setup } = legacyToSetup([{ network: 'Solana', token: 'USDC', address: EVM }]);
    expect(setup.accepted).toEqual([]);
  });
});

describe('paymentMethodsOf', () => {
  it('lists methods in catalog order with the official contract', () => {
    const methods = paymentMethodsOf({
      evmAddress: EVM,
      solanaAddress: null,
      accepted: [
        { chain: 'ethereum', token: 'USDC' },
        { chain: 'base', token: 'EURC' },
        { chain: 'solana', token: 'USDC' },
      ],
    });
    expect(methods.map((m) => m.id)).toEqual(['eurc-base', 'usdc-ethereum']);
    expect(methods[1]?.contract).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
  });
});

describe('explorerTxUrl', () => {
  it('links to the explorer of the order network', () => {
    expect(explorerTxUrl('USDC · Base', '0xabc')).toBe('https://basescan.org/tx/0xabc');
    expect(explorerTxUrl('USDC · Polygon', '0xabc')).toBeNull();
  });
});
