import type { Product, ProductVariant } from '@tma-shop/shared';

/** Active variants (the catalog only sends active ones; admin lists all). */
export function activeVariants(product: Product): ProductVariant[] {
  return product.variants.filter((v) => v.isActive);
}

export function hasVariants(product: Product): boolean {
  return product.options.length > 0;
}

/** Lowest and highest unit price, across variants when the product has them. */
export function priceRange(product: Product): { min: number; max: number } {
  const prices = hasVariants(product)
    ? activeVariants(product).map((v) => v.price)
    : [product.price];
  if (prices.length === 0) return { min: product.price, max: product.price };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** Whether nothing can be bought: no stock left anywhere. */
export function isSoldOut(product: Product): boolean {
  if (!hasVariants(product)) return product.stock !== null && product.stock <= 0;
  const variants = activeVariants(product);
  return variants.length === 0 || variants.every((v) => v.stock !== null && v.stock <= 0);
}

/** The variant matching one chosen value per option, if every option is chosen. */
export function findVariant(
  product: Product,
  selected: ReadonlyArray<string | null>,
): ProductVariant | null {
  if (selected.some((value) => value === null)) return null;
  return (
    activeVariants(product).find((v) => v.values.every((value, i) => value === selected[i])) ??
    null
  );
}

/**
 * Whether choosing `value` for option `index` still leads to a sellable
 * variant, given the other choices made so far.
 */
export function isValueAvailable(
  product: Product,
  selected: ReadonlyArray<string | null>,
  index: number,
  value: string,
): boolean {
  return activeVariants(product).some(
    (v) =>
      v.values[index] === value &&
      (v.stock === null || v.stock > 0) &&
      v.values.every((other, i) => i === index || selected[i] === null || selected[i] === other),
  );
}

/** "T-shirt (Red / M)" */
export function lineName(title: string, variantLabel: string | null | undefined): string {
  return variantLabel ? `${title} (${variantLabel})` : title;
}

/** Identity of an order line: product plus variant. */
export function itemKey(item: { productId: string; variantId?: string | null }): string {
  return `${item.productId}:${item.variantId ?? ''}`;
}

/** Display name of an order line, with its variant. */
export function itemName(item: { title: string; variantLabel?: string | null }): string {
  return lineName(item.title, item.variantLabel);
}
