import { describe, expect, it } from 'vitest';
import { generateRoundRobin } from './leagueEngine';

describe('leagueEngine (§29, §95)', () => {
  it('4 players -> 6 fixtures, 3 rounds', () => {
    const f = generateRoundRobin(['A', 'B', 'C', 'D']);
    expect(f).toHaveLength(6);
    expect(new Set(f.map((x) => x.round_number))).toEqual(new Set([1, 2, 3]));
  });

  it('every pair meets exactly once, no self-play', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F'];
    const f = generateRoundRobin(players);
    expect(f).toHaveLength(15); // 6*5/2
    const pairs = f.map((x) => [x.player_a_id, x.player_b_id].sort().join('-'));
    expect(new Set(pairs).size).toBe(15);
    for (const x of f) expect(x.player_a_id).not.toBe(x.player_b_id);
  });

  it('odd count works (bye rounds)', () => {
    const f = generateRoundRobin(['A', 'B', 'C', 'D', 'E']);
    expect(f).toHaveLength(10); // 5*4/2
    const counts = new Map<string, number>();
    for (const x of f) {
      counts.set(x.player_a_id, (counts.get(x.player_a_id) ?? 0) + 1);
      counts.set(x.player_b_id, (counts.get(x.player_b_id) ?? 0) + 1);
    }
    for (const p of ['A', 'B', 'C', 'D', 'E']) expect(counts.get(p)).toBe(4);
  });

  it('<2 players -> no fixtures', () => {
    expect(generateRoundRobin([])).toEqual([]);
    expect(generateRoundRobin(['A'])).toEqual([]);
  });
});
