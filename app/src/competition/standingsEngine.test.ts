import { describe, expect, it } from 'vitest';
import { calculateStandings } from './standingsEngine';

const M = (a: string, b: string, sa: number | null, sb: number | null, status: 'CONFIRMED' | 'RESULT_SUBMITTED' | 'SCHEDULED' = 'CONFIRMED') => ({
  player_a_id: a, player_b_id: b, score_a: sa, score_b: sb, status,
});

describe('standingsEngine (§31-32, §97-98)', () => {
  it('computes P/W/D/L/GD/PTS with defaults 3/1/0', () => {
    const rows = calculateStandings([M('A', 'B', 3, 1), M('A', 'C', 2, 2)]);
    const a = rows.find((r) => r.player_id === 'A')!;
    expect(a).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0, goals_for: 5, goals_against: 3, goal_difference: 2, points: 4 });
  });

  it('ONLY confirmed results count (Rule 7)', () => {
    const rows = calculateStandings([M('A', 'B', 5, 0, 'RESULT_SUBMITTED'), M('A', 'B', 1, 0, 'SCHEDULED')]);
    expect(rows).toEqual([]);
  });

  it('tie-break: points > GD > GF > wins', () => {
    const rows = calculateStandings([
      M('A', 'C', 2, 0), // A: 3pts GD+2 GF2
      M('B', 'C', 3, 0), // B: 3pts GD+3 GF3 -> first
    ]);
    expect(rows[0].player_id).toBe('B');
    expect(rows[1].player_id).toBe('A');
  });

  it('custom points config respected', () => {
    const rows = calculateStandings([M('A', 'B', 1, 0)], 2, 1, 0);
    expect(rows.find((r) => r.player_id === 'A')!.points).toBe(2);
  });
});
