/** Languages the shop speaks. Spanish for Spanish-speaking users, English for everyone else. */
export type Lang = 'en' | 'es';

/** Picks the language from a Telegram/BCP-47 code such as `es`, `es-AR` or `en-US`. */
export function langFrom(code: string | null | undefined): Lang {
  return code?.toLowerCase().startsWith('es') ? 'es' : 'en';
}
