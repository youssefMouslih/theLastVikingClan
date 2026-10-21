import { supabase } from '../lib/supabase';
import type { LeaguePlayerStatsRow, LeagueTeamStatsRow } from '../types/league4v4';

export async function getLeaguePlayerStats(seasonId: string): Promise<LeaguePlayerStatsRow[]> {
  const { data, error } = await supabase.rpc('league_player_stats', { p_season_id: seasonId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as LeaguePlayerStatsRow[]).map((row) => ({
    ...row,
    win_rate: row.win_rate == null ? null : Number(row.win_rate),
  }));
}

export async function getLeagueTeamStats(seasonId: string): Promise<LeagueTeamStatsRow[]> {
  const { data, error } = await supabase.rpc('league_team_stats', { p_season_id: seasonId });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeagueTeamStatsRow[];
}
