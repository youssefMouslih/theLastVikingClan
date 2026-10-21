import { supabase } from '../lib/supabase';
import type {
  LeaguePenalty,
  LeagueStandingRow,
  LeagueTiebreakOrder,
} from '../types/league4v4';

export async function getLeagueStandings(seasonId: string): Promise<LeagueStandingRow[]> {
  const { data, error } = await supabase.rpc('league_standings', { p_season_id: seasonId });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeagueStandingRow[];
}

export async function listLeaguePenalties(seasonId: string): Promise<LeaguePenalty[]> {
  const { data, error } = await supabase
    .from('league_penalties')
    .select('*')
    .eq('season_id', seasonId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeaguePenalty[];
}

export async function listLeagueTiebreakOrder(seasonId: string): Promise<LeagueTiebreakOrder[]> {
  const { data, error } = await supabase
    .from('league_tiebreak_orders')
    .select('*')
    .eq('season_id', seasonId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeagueTiebreakOrder[];
}

export async function applyLeaguePenalty(input: {
  seasonId: string;
  teamId: string;
  points: number;
  reason: string;
  matchdayId?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('league_apply_penalty', {
    p_season_id: input.seasonId,
    p_team_id: input.teamId,
    p_points: input.points,
    p_reason: input.reason.trim(),
    p_matchday_id: input.matchdayId || null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function saveLeagueTiebreakOrder(input: {
  seasonId: string;
  teamIds: string[];
  reason: string;
}): Promise<void> {
  const { error } = await supabase.rpc('league_set_tiebreak_order', {
    p_season_id: input.seasonId,
    p_team_ids: input.teamIds,
    p_reason: input.reason.trim(),
  });
  if (error) throw new Error(error.message);
}
