import { Cell, Section } from '@telegram-apps/telegram-ui';
import type { ShopConfig } from '@tma-shop/shared';
import { locale, t } from '../i18n/index.js';

/** "20 Oct, 23:59" in the user's language. */
export function closingDate(iso: string): string {
  return new Date(iso).toLocaleString(locale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * At the top of the catalog: the GB is closed (orders can still be looked at),
 * or it closes soon.
 */
export function ClosingNotice({ shop }: { shop: ShopConfig }): React.JSX.Element | null {
  if (shop.isClosed) {
    return (
      <Section>
        <Cell
          className="tma-notice"
          before={<span style={{ fontSize: 22 }}>🔒</span>}
          subtitle={t('closed.hint')}
          multiline
        >
          {t('closed.title')}
        </Cell>
      </Section>
    );
  }
  if (!shop.closesAt) return null;
  return (
    <Section>
      <Cell
        className="tma-notice"
        before={<span style={{ fontSize: 22 }}>⏳</span>}
        subtitle={t('closing.hint')}
        multiline
      >
        {t('closing.title', { date: closingDate(shop.closesAt) })}
      </Cell>
    </Section>
  );
}
