import type { Match, StandingRow } from '../types/database';

// Standings engine (§97-98). ONLY CONFIRMED matches count.
// Tie-break default (§32): Points > GD > GF > Wins. Head-to-head left to UI layer / future.

export function calculateStandings(
  matches: Pick<Match, 'player_a_id' | 'player_b_id' | 'score_a' | 'score_b' | 'status'>[],
  pointsWin = 3,
  pointsDraw = 1,
  pointsLoss = 0,
): StandingRow[] {
  const table = new Map<string, StandingRow>();
  const row = (id: string): StandingRow => {
    let r = table.get(id);
    if (!r) {
      r = { player_id: id, played: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, goal_difference: 0, points: 0 };
      table.set(id, r);
    }
    return r;
  };

  for (const m of matches) {
    if (m.status !== 'CONFIRMED') continue;
    if (m.score_a == null || m.score_b == null) continue;
    const a = row(m.player_a_id);
    const b = row(m.player_b_id);
    a.played++; b.played++;
    a.goals_for += m.score_a; a.goals_against += m.score_b;
    b.goals_for += m.score_b; b.goals_against += m.score_a;
    if (m.score_a > m.score_b) {
      a.wins++; b.losses++; a.points += pointsWin; b.points += pointsLoss;
    } else if (m.score_a < m.score_b) {
      b.wins++; a.losses++; b.points += pointsWin; a.points += pointsLoss;
    } else {
      a.draws++; b.draws++; a.points += pointsDraw; b.points += pointsDraw;
    }
  }

  const rows = [...table.values()];
  for (const r of rows) r.goal_difference = r.goals_for - r.goals_against;
  rows.sort((x, y) =>
    y.points - x.points ||
    y.goal_difference - x.goal_difference ||
    y.goals_for - x.goals_for ||
    y.wins - x.wins,
  );
  return rows;
}
