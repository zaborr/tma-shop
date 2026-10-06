import { useState } from 'react';
import { Cell, Section } from '@telegram-apps/telegram-ui';
import type { Order, OrderStatus, Product, ProductInput } from '@tma-shop/shared';
import { ApiClientError } from '../../api/client.js';
import { useSession } from '../../providers/SessionProvider.js';
import { ErrorView } from '../../components/ErrorView.js';

/** Tokens a product can be priced in. Prices are stored in cents (1290 = 12.90). */
export const TOKENS = ['USDC', 'EURC'] as const;
export type Token = (typeof TOKENS)[number];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Not paid yet',
  awaiting_payment: '🔎 Verify payment',
  paid: 'Paid',
  cancelled: 'Cancelled',
  fulfilled: 'Fulfilled',
};

/** Status shown to the admin, including change requests and pending refunds. */
export function statusLabel(order: Order): string {
  if (order.changeRequest) return '✏️ Change requested';
  if (order.status === 'pending' && order.amountPaid > 0) return 'Difference not paid yet';
  if (order.status === 'paid' && order.amountDue < 0) return '↩️ Refund owed';
  return STATUS_LABEL[order.status];
}

/** Orders counted as sales: payment confirmed (fulfilled included). */
export function isSale(order: Order): boolean {
  return order.status === 'paid' || order.status === 'fulfilled';
}

/** Orders that need the admin to do something. */
export function needsAttention(order: Order): boolean {
  return (
    order.status === 'awaiting_payment' ||
    order.changeRequest !== null ||
    (order.status === 'paid' && order.amountDue < 0)
  );
}

/** Major units ("12.90") from a price stored in cents. */
export function toMajor(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function toInput(product: Product, isActive: boolean): ProductInput {
  return {
    categoryId: product.categoryId,
    slug: product.slug,
    title: product.title,
    description: product.description,
    price: product.price,
    currency: product.currency,
    imageUrl: product.imageUrl,
    stock: product.stock,
    isActive,
  };
}

/** One line per order: "2× Sencha, 1× Gaiwan". */
export function itemsSummary(order: Order): string {
  return order.items.map((item) => `${item.quantity}× ${item.title}`).join(', ');
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
}

export interface AdminActions {
  /** Runs an API action, shows its error if any, then calls `onDone`. */
  run: (action: () => Promise<unknown>) => Promise<void>;
  /** Same as `run`, but only on the second tap of the button `key`. */
  twoTap: (key: string, action: () => Promise<unknown>) => Promise<void>;
  /** Button text, swapped for the confirmation prompt once armed. */
  tapLabel: (key: string, text: string, confirmText?: string) => string;
  error: string | null;
}

/**
 * Shared admin action helpers. Destructive actions use a two-tap confirmation
 * because native confirm dialogs are unreliable in Telegram webviews.
 */
export function useAdminActions(onDone: () => void): AdminActions {
  const [armed, setArmed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null);
    try {
      await action();
      onDone();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong');
    }
  };

  const twoTap = async (key: string, action: () => Promise<unknown>): Promise<void> => {
    if (armed !== key) {
      setArmed(key);
      return;
    }
    setArmed(null);
    await run(action);
  };

  const tapLabel = (key: string, text: string, confirmText = 'Tap again to confirm'): string =>
    armed === key ? confirmText : text;

  return { run, twoTap, tapLabel, error };
}

export function ErrorBanner({ message }: { message: string | null }): React.JSX.Element | null {
  if (!message) return null;
  return (
    <Section>
      <Cell multiline style={{ color: 'var(--tgui--destructive_text_color)' }}>
        {message}
      </Cell>
    </Section>
  );
}

/** Renders its children only for admins. */
export function AdminOnly({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { isAdmin } = useSession();
  if (!isAdmin) return <ErrorView message="Admins only" />;
  return <>{children}</>;
}
