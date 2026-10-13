import { useState } from 'react';
import { Button, Cell, Section } from '@telegram-apps/telegram-ui';
import { Input } from '../../components/Field.js';
import type { Product, ProductOption, VariantInput } from '@tma-shop/shared';
import { toMajor } from './common.js';

/** An option as typed in the form: values are comma-separated text. */
export interface OptionDraft {
  name: string;
  values: string;
}

/** Per-combination fields as typed: empty price = product price, empty stock = unlimited. */
export interface VariantDraft {
  price: string;
  stock: string;
  active: boolean;
}

export const MAX_OPTIONS = 3;
export const MAX_VARIANTS = 200;

const PRICE_RE = /^\d+([.,]\d{1,2})?$/;
const STOCK_RE = /^\d+$/;

export function parseValues(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(',')
    .map((v) => v.trim())
    .filter((v) => {
      const key = v.toLowerCase();
      if (!v || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function comboKey(values: readonly string[]): string {
  return values.map((v) => v.toLowerCase()).join('\u0000');
}

/** Every combination of the options' values, in option order. */
export function combinations(options: readonly ProductOption[]): string[][] {
  return options.reduce<string[][]>(
    (acc, option) => acc.flatMap((combo) => option.values.map((value) => [...combo, value])),
    [[]],
  );
}

export function initialOptions(product: Product | null): OptionDraft[] {
  return (product?.options ?? []).map((o) => ({ name: o.name, values: o.values.join(', ') }));
}

export function initialDrafts(product: Product | null): Record<string, VariantDraft> {
  const drafts: Record<string, VariantDraft> = {};
  for (const v of product?.variants ?? []) {
    drafts[comboKey(v.values)] = {
      price: v.priceOverride === null ? '' : toMajor(v.priceOverride),
      stock: v.stock === null ? '' : String(v.stock),
      active: v.isActive,
    };
  }
  return drafts;
}

/** Options and variants ready to save, or the first problem found. */
export function buildVariants(
  optionDrafts: readonly OptionDraft[],
  drafts: Readonly<Record<string, VariantDraft>>,
): { options: ProductOption[]; variants: VariantInput[] } | { error: string } {
  const options = optionDrafts
    .map((o) => ({ name: o.name.trim(), values: parseValues(o.values) }))
    .filter((o) => o.name !== '' || o.values.length > 0);
  if (options.some((o) => o.name === '')) return { error: 'Every option needs a name' };
  if (options.some((o) => o.values.length === 0)) return { error: 'Every option needs values' };
  const names = new Set(options.map((o) => o.name.toLowerCase()));
  if (names.size !== options.length) return { error: 'Option names must be different' };
  if (options.length === 0) return { options: [], variants: [] };

  const combos = combinations(options);
  if (combos.length > MAX_VARIANTS) {
    return { error: `Too many combinations (${combos.length}); the limit is ${MAX_VARIANTS}` };
  }
  const variants: VariantInput[] = [];
  for (const values of combos) {
    const draft = drafts[comboKey(values)] ?? { price: '', stock: '', active: true };
    const price = draft.price.trim();
    const stock = draft.stock.trim();
    if (price !== '' && !PRICE_RE.test(price)) {
      return { error: `Invalid price for ${values.join(' / ')}` };
    }
    if (stock !== '' && !STOCK_RE.test(stock)) {
      return { error: `Invalid stock for ${values.join(' / ')}` };
    }
    variants.push({
      values,
      price: price === '' ? null : Math.round(Number(price.replace(',', '.')) * 100),
      stock: stock === '' ? null : Number(stock),
      isActive: draft.active,
    });
  }
  if (!variants.some((v) => v.isActive)) return { error: 'Turn on at least one variant' };
  return { options, variants };
}

/** Options (Color, Size…) and the price/stock of each combination. */
export function VariantsEditor({
  options,
  setOptions,
  drafts,
  setDrafts,
  basePrice,
  currency,
}: {
  options: OptionDraft[];
  setOptions: (next: OptionDraft[]) => void;
  drafts: Record<string, VariantDraft>;
  setDrafts: (next: Record<string, VariantDraft>) => void;
  basePrice: string;
  currency: string;
}): React.JSX.Element {
  const [bulkStock, setBulkStock] = useState('');
  const parsed = options
    .map((o) => ({ name: o.name.trim(), values: parseValues(o.values) }))
    .filter((o) => o.name !== '' && o.values.length > 0);
  const combos = parsed.length > 0 ? combinations(parsed) : [];
  const tooMany = combos.length > MAX_VARIANTS;

  const updateOption = (index: number, patch: Partial<OptionDraft>): void =>
    setOptions(options.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  const draftFor = (values: string[]): VariantDraft =>
    drafts[comboKey(values)] ?? { price: '', stock: '', active: true };
  const updateDraft = (values: string[], patch: Partial<VariantDraft>): void =>
    setDrafts({ ...drafts, [comboKey(values)]: { ...draftFor(values), ...patch } });

  return (
    <>
      <Section
        header="Options"
        footer="E.g. Color: Red, Blue · Size: S, M, L. Each combination becomes a variant with its own stock and, optionally, its own price."
      >
        {options.map((option, index) => (
          <div key={index}>
            <Input
              header={`Option ${index + 1} name`}
              placeholder={index === 0 ? 'Color' : 'Size'}
              value={option.name}
              onChange={(e) => updateOption(index, { name: e.target.value })}
            />
            <Input
              header="Values (comma-separated)"
              placeholder={index === 0 ? 'Red, Blue, Green' : 'S, M, L, XL'}
              value={option.values}
              onChange={(e) => updateOption(index, { values: e.target.value })}
            />
            <div style={{ padding: '0 16px 12px' }}>
              <Button
                size="s"
                mode="plain"
                onClick={() => setOptions(options.filter((_, i) => i !== index))}
              >
                Remove option
              </Button>
            </div>
          </div>
        ))}
        {options.length < MAX_OPTIONS && (
          <div style={{ padding: 16 }}>
            <Button
              stretched
              mode="bezeled"
              onClick={() => setOptions([...options, { name: '', values: '' }])}
            >
              ➕ Add option
            </Button>
          </div>
        )}
      </Section>

      {combos.length > 0 && (
        <Section
          header={`Variants · ${combos.length}`}
          footer={
            tooMany
              ? `Too many combinations: the limit is ${MAX_VARIANTS}.`
              : `Empty price = product price (${basePrice || '0'} ${currency}). Empty stock = unlimited.`
          }
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: '8px 16px' }}>
            <div style={{ flex: 1 }}>
              <Input
                header="Same stock for all"
                type="text"
                inputMode="numeric"
                placeholder="e.g. 10"
                value={bulkStock}
                onChange={(e) => setBulkStock(e.target.value)}
              />
            </div>
            <Button
              size="s"
              mode="bezeled"
              disabled={bulkStock.trim() !== '' && !STOCK_RE.test(bulkStock.trim())}
              onClick={() => {
                const next = { ...drafts };
                for (const values of combos) {
                  next[comboKey(values)] = { ...draftFor(values), stock: bulkStock.trim() };
                }
                setDrafts(next);
              }}
            >
              Apply
            </Button>
          </div>
          {!tooMany &&
            combos.map((values) => {
              const draft = draftFor(values);
              const priceBad = draft.price.trim() !== '' && !PRICE_RE.test(draft.price.trim());
              const stockBad = draft.stock.trim() !== '' && !STOCK_RE.test(draft.stock.trim());
              return (
                <div
                  key={comboKey(values)}
                  style={{ opacity: draft.active ? 1 : 0.5, paddingBottom: 8 }}
                >
                  <Cell
                    after={
                      <Button
                        size="s"
                        mode={draft.active ? 'bezeled' : 'plain'}
                        onClick={() => updateDraft(values, { active: !draft.active })}
                      >
                        {draft.active ? 'On' : 'Off'}
                      </Button>
                    }
                  >
                    <strong>{values.join(' / ')}</strong>
                  </Cell>
                  <div style={{ display: 'flex', gap: 8, padding: '0 8px' }}>
                    <div style={{ flex: 1 }}>
                      <Input
                        header={`Price (${currency})`}
                        type="text"
                        inputMode="decimal"
                        placeholder={basePrice || '—'}
                        status={priceBad ? 'error' : 'default'}
                        value={draft.price}
                        onChange={(e) => updateDraft(values, { price: e.target.value })}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Input
                        header="Stock"
                        type="text"
                        inputMode="numeric"
                        placeholder="∞"
                        status={stockBad ? 'error' : 'default'}
                        value={draft.stock}
                        onChange={(e) => updateDraft(values, { stock: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
        </Section>
      )}
    </>
  );
}
