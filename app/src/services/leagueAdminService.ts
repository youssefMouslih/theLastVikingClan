import { supabase } from '../lib/supabase';
import type { LeagueCreateSeasonInput, LeagueSeasonSettings, LeagueSeasonStatus } from '../types/league4v4';

export async function createLeagueSeason(input: LeagueCreateSeasonInput): Promise<string> {
  const { data, error } = await supabase.rpc('league_create_season', {
    p_name: input.name.trim(),
    p_description: input.description?.trim() || null,
    p_registration_opens_at: input.registration_opens_at ?? null,
    p_registration_closes_at: input.registration_closes_at ?? null,
    p_starts_at: input.starts_at ?? null,
    p_matchday_days: input.matchday_days ?? 7,
    p_min_teams: input.min_teams ?? 4,
    p_max_teams: input.max_teams ?? 8,
    p_roster_min: input.roster_min ?? 6,
    p_roster_max: input.roster_max ?? 8,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function updateLeagueSeason(seasonId: string, input: LeagueSeasonSettings): Promise<void> {
  const { error } = await supabase.rpc('league_update_season', {
    p_season_id: seasonId,
    p_name: input.name.trim(),
    p_description: input.description?.trim() || null,
    p_registration_opens_at: input.registration_opens_at,
    p_registration_closes_at: input.registration_closes_at,
    p_starts_at: input.starts_at,
    p_matchday_days: input.matchday_days,
    p_min_teams: input.min_teams,
    p_max_teams: input.max_teams,
    p_roster_min: input.roster_min,
    p_roster_max: input.roster_max,
  });
  if (error) throw new Error(error.message);
}

export async function setLeagueSeasonStatus(
  seasonId: string,
  status: LeagueSeasonStatus,
  reason?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('league_set_season_status', {
    p_season_id: seasonId,
    p_status: status,
    p_reason: reason?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function approveLeagueTeam(teamId: string, approve: boolean, note?: string | null): Promise<void> {
  const { error } = await supabase.rpc('league_approve_team', {
    p_team_id: teamId,
    p_approve: approve,
    p_note: note?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function generateLeagueFixtures(seasonId: string, reset = false): Promise<void> {
  const { error } = await supabase.rpc('league_generate_fixtures', {
    p_season_id: seasonId,
    p_reset: reset,
  });
  if (error) throw new Error(error.message);
}
