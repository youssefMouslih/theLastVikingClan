import { describe, expect, it } from 'vitest';
import { LOCALES, dictionaries } from './dictionaries';

describe('dictionaries', () => {
  it('covers every locale with a direction', () => {
    expect(LOCALES.map((locale) => locale.code)).toEqual(['en', 'fr', 'ar']);
    expect(LOCALES.find((locale) => locale.code === 'ar')?.dir).toBe('rtl');
  });

  it('keeps the same keys in every locale', () => {
    const englishKeys = Object.keys(dictionaries.en).sort();
    for (const { code } of LOCALES) {
      expect(Object.keys(dictionaries[code]).sort()).toEqual(englishKeys);
    }
  });

  it('has no blank translations', () => {
    for (const { code } of LOCALES) {
      for (const [key, value] of Object.entries(dictionaries[code])) {
        expect(value.trim(), `${code}:${key}`).not.toBe('');
      }
    }
  });
});
