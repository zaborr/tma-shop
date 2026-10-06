/**
 * Formats a money amount stored in minor units. Telegram Stars (`XTR`) are
 * whole units shown with a star; other currencies are shown as major units with
 * two decimals and the ISO code.
 */
export function formatPrice(amount: number, currency: string): string {
  if (currency === 'XTR') {
    return `⭐ ${amount.toLocaleString('en-US')}`;
  }
  const major = (amount / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${major} ${currency}`;
}

export function pluralize(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Amount the customer must send in a stablecoin (USDC/USDT are pegged 1:1 to
 * USD), from a total stored in cents. Shown without thousands separators so it
 * can be typed or pasted straight into a wallet.
 */
export function formatTokenAmount(amount: number, token: string): string {
  return `${(amount / 100).toFixed(2)} ${token}`;
}
