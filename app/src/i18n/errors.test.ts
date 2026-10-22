import { describe, expect, it } from 'vitest';
import { translateError } from './errors';

describe('translateError', () => {
  it('keeps English messages unchanged', () => {
    expect(translateError(new Error('Competition not found.'), 'en')).toBe('Competition not found.');
  });

  it('translates known messages and dynamic patterns', () => {
    expect(translateError(new Error('Not logged in.'), 'fr')).toBe('Vous n’êtes pas connecté.');
    expect(translateError(new Error('Not enough players: 3 / 4 minimum.'), 'ar')).toContain('3 / 4');
    expect(translateError(new Error('Squad logo upload failed: timeout'), 'fr')).toContain('timeout');
  });

  it('falls back to the raw message for unknown errors', () => {
    expect(translateError(new Error('Something new.'), 'fr')).toBe('Something new.');
  });
});
