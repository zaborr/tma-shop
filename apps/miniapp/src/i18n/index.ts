import { retrieveRawInitData } from '@telegram-apps/sdk-react';
import { langFrom, type Lang } from '@tma-shop/shared';
import { en, type MessageKey } from './en.js';
import { es } from './es.js';

export type { MessageKey };

const dictionaries: Record<Lang, Record<MessageKey, string>> = { en, es };

/** The user's Telegram language, read from the launch data (browser language as a fallback). */
function detect(): Lang {
  try {
    const raw = retrieveRawInitData();
    const user = raw ? new URLSearchParams(raw).get('user') : null;
    const code = user ? (JSON.parse(user) as { language_code?: string }).language_code : undefined;
    if (code) return langFrom(code);
  } catch {
    // Not launched from Telegram (or no user): fall back to the browser.
  }
  return langFrom(typeof navigator === 'undefined' ? undefined : navigator.language);
}

let current: Lang | null = null;

/** Current language: Spanish or English. */
export function lang(): Lang {
  current ??= detect();
  return current;
}

/** Locale for dates and numbers in the current language. */
export function locale(): string {
  return lang() === 'es' ? 'es-ES' : 'en-GB';
}

/** Translated text for `key`, with `{name}` placeholders filled from `vars`. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let text = dictionaries[lang()][key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

/** `count` with the singular or plural text: `tn(3, 'units')` → "3 units" / "3 unidades". */
export function tn(
  count: number,
  one: MessageKey,
  other: MessageKey,
  vars?: Record<string, string | number>,
): string {
  return t(count === 1 ? one : other, { count, ...vars });
}
