/** Languages the shop speaks. Spanish for Spanish-speaking users, English for everyone else. */
export type Lang = 'en' | 'es';

/** Picks the language from a Telegram/BCP-47 code such as `es`, `es-AR` or `en-US`. */
export function langFrom(code: string | null | undefined): Lang {
  return code?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

/** A user's language: the one they chose in the app, else their Telegram one. */
export function userLang(
  preferred: string | null | undefined,
  telegramCode: string | null | undefined,
): Lang {
  return preferred === 'en' || preferred === 'es' ? preferred : langFrom(telegramCode);
}
