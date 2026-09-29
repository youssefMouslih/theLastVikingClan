import { describe, expect, it } from 'vitest';
import { generateJoinCode } from './joinCode';
import { validateReplacement } from './replacementEngine';

describe('replacementEngine (§46-51, Rule 13)', () => {
  const base = {
    originalPlayerId: 'SHADOW',
    replacementPlayerId: 'ACE',
    participantPlayerIds: ['PRIDE', 'SHADOW', 'RYU'],
    isReplacementClanMember: true,
    isReplacementActive: true,
  };
  it('accepts valid replacement', () => {
    expect(validateReplacement(base)).toEqual({ ok: true });
  });
  it('rejects same player', () => {
    expect(validateReplacement({ ...base, replacementPlayerId: 'SHADOW' }).ok).toBe(false);
  });
  it('rejects already-participating replacement (Rule 13)', () => {
    expect(validateReplacement({ ...base, replacementPlayerId: 'RYU' })).toMatchObject({ ok: false });
  });
  it('rejects inactive/non-member replacement', () => {
    expect(validateReplacement({ ...base, isReplacementActive: false }).ok).toBe(false);
    expect(validateReplacement({ ...base, isReplacementClanMember: false }).ok).toBe(false);
  });
  it('rejects unknown original', () => {
    expect(validateReplacement({ ...base, originalPlayerId: 'GHOST' }).ok).toBe(false);
  });
});

describe('joinCode (§22)', () => {
  it('format VIK + 5 unambiguous chars', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateJoinCode();
      expect(c).toMatch(/^VIK[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    }
  });
  it('codes are unique in practice', () => {
    const set = new Set(Array.from({ length: 200 }, () => generateJoinCode()));
    expect(set.size).toBeGreaterThan(190);
  });
});
