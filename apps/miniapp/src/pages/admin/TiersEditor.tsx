import { Button, Cell, Section } from '@telegram-apps/telegram-ui';
import { Input } from '../../components/Field.js';
import type { PriceTier, Product } from '@tma-shop/shared';
import { toMajor } from './common.js';

/** A tier as typed: "from" quantity and unit price in token units. */
export interface TierDraft {
  minQty: string;
  price: string;
}

const PRICE_RE = /^\d+([.,]\d{1,2})?$/;
const QTY_RE = /^\d+$/;
export const MAX_TIERS = 10;

export function initialTiers(product: Product | null): TierDraft[] {
  return (product?.priceTiers ?? []).map((t) => ({
    minQty: String(t.minQty),
    price: toMajor(t.price),
  }));
}

/** Tiers ready to save (sorted), or the first problem found. */
export function buildTiers(drafts: readonly TierDraft[]): { tiers: PriceTier[] } | { error: string } {
  const rows = drafts.filter((d) => d.minQty.trim() !== '' || d.price.trim() !== '');
  const tiers: PriceTier[] = [];
  for (const row of rows) {
    const qty = row.minQty.trim();
    const price = row.price.trim();
    if (!QTY_RE.test(qty) || Number(qty) < 2) {
      return { error: 'Each tier starts at 2 units or more' };
    }
    if (!PRICE_RE.test(price)) return { error: `Invalid price for ${qty}+ units` };
    tiers.push({ minQty: Number(qty), price: Math.round(Number(price.replace(',', '.')) * 100) });
  }
  tiers.sort((a, b) => a.minQty - b.minQty);
  if (tiers.some((t, i) => i > 0 && t.minQty === tiers[i - 1]?.minQty)) {
    return { error: 'Two tiers start at the same quantity' };
  }
  return { tiers };
}

/** Quantity breaks: from N units of the product, each unit costs X. */
export function TiersEditor({
  tiers,
  setTiers,
  basePrice,
  currency,
  withVariants,
}: {
  tiers: TierDraft[];
  setTiers: (next: TierDraft[]) => void;
  basePrice: string;
  currency: string;
  withVariants: boolean;
}): React.JSX.Element {
  const update = (index: number, patch: Partial<TierDraft>): void =>
    setTiers(tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  return (
    <Section
      header="Quantity tiers"
      footer={
        `From 1 unit the price is ${basePrice || '—'} ${currency}. Add tiers for lower prices when buying more` +
        (withVariants
          ? '; all options count together and keep their own price difference (e.g. XL +2).'
          : '.')
      }
    >
      {tiers.length === 0 && <Cell multiline>No tiers: the same price for any quantity.</Cell>}
      {tiers.map((tier, index) => {
        const qtyBad =
          tier.minQty.trim() !== '' &&
          (!QTY_RE.test(tier.minQty.trim()) || Number(tier.minQty) < 2);
        const priceBad = tier.price.trim() !== '' && !PRICE_RE.test(tier.price.trim());
        return (
          <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: '0 8px' }}>
            <div style={{ flex: 1 }}>
              <Input
                header="From (units)"
                type="text"
                inputMode="numeric"
                placeholder="5"
                status={qtyBad ? 'error' : 'default'}
                value={tier.minQty}
                onChange={(e) => update(index, { minQty: e.target.value })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Input
                header={`Unit price (${currency})`}
                type="text"
                inputMode="decimal"
                placeholder="9.00"
                status={priceBad ? 'error' : 'default'}
                value={tier.price}
                onChange={(e) => update(index, { price: e.target.value })}
              />
            </div>
            <Button
              size="s"
              mode="plain"
              onClick={() => setTiers(tiers.filter((_, i) => i !== index))}
            >
              ✕
            </Button>
          </div>
        );
      })}
      {tiers.length < MAX_TIERS && (
        <div style={{ padding: 16 }}>
          <Button
            stretched
            mode="bezeled"
            onClick={() => setTiers([...tiers, { minQty: '', price: '' }])}
          >
            ➕ Add tier
          </Button>
        </div>
      )}
    </Section>
  );
}
