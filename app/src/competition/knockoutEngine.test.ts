import { describe, expect, it } from 'vitest';
import { generateKnockout } from './knockoutEngine';

describe('knockoutEngine (§55-56)', () => {
  it.each([4, 8, 16])('size %i -> size-1 matches, R1 fully seeded', (n) => {
    const ids = Array.from({ length: n }, (_, i) => `P${i}`);
    const b = generateKnockout(ids);
    expect(b).toHaveLength(n - 1);
    const r1 = b.filter((x) => x.round_number === 1);
    expect(r1).toHaveLength(n / 2);
    for (const m of r1) {
      expect(m.player_a_id).toBeTruthy();
      expect(m.player_b_id).toBeTruthy();
    }
    const later = b.filter((x) => x.round_number > 1);
    for (const m of later) {
      expect(m.player_a_id).toBeNull();
      expect(m.player_b_id).toBeNull();
    }
  });

  it('ends with FINAL', () => {
    const b = generateKnockout(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(b[b.length - 1].round_name).toBe('FINAL');
  });

  it('rejects non-power-of-two sizes', () => {
    expect(() => generateKnockout(['a', 'b', 'c'])).toThrow();
    expect(() => generateKnockout(['a', 'b'])).toThrow();
  });
});
