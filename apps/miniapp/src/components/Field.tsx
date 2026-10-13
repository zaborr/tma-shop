import type { ComponentProps, ReactNode } from 'react';
import { Input as TgInput, Textarea as TgTextarea } from '@telegram-apps/telegram-ui';

/**
 * Drop-in `Input` and `Textarea` that always show their `header` as a label.
 * Telegram UI only draws that header on Android ("base") and hides it on
 * iPhone, which left fields without any label there.
 */

const labelStyle: React.CSSProperties = {
  padding: '12px 22px 4px',
  fontSize: 13,
  lineHeight: '18px',
  color: 'var(--tgui--hint_color, var(--tg-theme-hint-color, #8e8e93))',
};

function Label({ children }: { children: ReactNode }): React.JSX.Element {
  return <div style={labelStyle}>{children}</div>;
}

export function Input({ header, ...props }: ComponentProps<typeof TgInput>): React.JSX.Element {
  return (
    <div>
      {header ? <Label>{header}</Label> : null}
      <TgInput {...props} />
    </div>
  );
}

export function Textarea({
  header,
  ...props
}: ComponentProps<typeof TgTextarea>): React.JSX.Element {
  return (
    <div>
      {header ? <Label>{header}</Label> : null}
      <TgTextarea {...props} />
    </div>
  );
}
