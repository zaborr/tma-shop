import { describe, expect, it } from 'vitest';
import { langFrom } from '@tma-shop/shared';
import { en } from './en.js';
import { es } from './es.js';

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();

describe('translations', () => {
  it('has a Spanish text for every English one, with the same placeholders', () => {
    for (const [key, text] of Object.entries(en)) {
      const spanish = es[key as keyof typeof en];
      expect(spanish, key).toBeTruthy();
      expect(placeholders(spanish), key).toEqual(placeholders(text));
    }
  });

  it('picks Spanish for any Spanish locale and English otherwise', () => {
    expect(langFrom('es')).toBe('es');
    expect(langFrom('es-AR')).toBe('es');
    expect(langFrom('en-US')).toBe('en');
    expect(langFrom('ru')).toBe('en');
    expect(langFrom(undefined)).toBe('en');
  });
});
