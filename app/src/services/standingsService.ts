import { calculateStandings } from '../competition/standingsEngine';
import { supabase } from '../lib/supabase';
import type { Match, StandingRow } from '../types/database';

// Standings derive from CONFIRMED matches only (§97-98). No manual entry.
export async function getStandings(competitionId: string): Promise<StandingRow[]> {
  const [{ data: comp }, { data: matches, error }] = await Promise.all([
    supabase.from('competitions').select('points_win,points_draw,points_loss').eq('id', competitionId).single(),
    supabase.from('matches').select('player_a_id,player_b_id,score_a,score_b,status').eq('competition_id', competitionId),
  ]);
  if (error) throw new Error(error.message);
  const c = (comp ?? { points_win: 3, points_draw: 1, points_loss: 0 }) as { points_win: number; points_draw: number; points_loss: number };
  return calculateStandings(
    ((matches ?? []) as Pick<Match, 'player_a_id' | 'player_b_id' | 'score_a' | 'score_b' | 'status'>[]),
    c.points_win,
    c.points_draw,
    c.points_loss,
  );
}

export const standingsService = { getStandings, client: supabase };
