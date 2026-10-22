import { supabase } from '../lib/supabase';
import { loadLeagueProfiles } from './leagueTeamService';
import type {
  LeagueCreateSeasonInput,
  LeagueDispute,
  LeagueDisputeResolutionInput,
  LeagueDisputeWithContext,
  LeagueDuel,
  LeagueDuelReport,
  LeagueDuelReportWithPlayer,
  LeagueDuelWithPlayers,
  LeagueFixture,
  LeagueSeason,
  LeagueSeasonSettings,
  LeagueSeasonStatus,
  LeagueTeamRef,
} from '../types/league4v4';

export async function createLeagueSeason(input: LeagueCreateSeasonInput): Promise<string> {
  const { data: existingDraft, error: draftError } = await supabase
    .from('league_seasons')
    .select('id')
    .eq('status', 'DRAFT')
    .limit(1)
    .maybeSingle();
  if (draftError) throw new Error(draftError.message);
  if (existingDraft) throw new Error('A draft season already exists. Resume it from the admin panel.');
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

export async function cancelLeagueSeason(seasonId: string, reason?: string | null): Promise<void> {
  const { error } = await supabase.rpc('league_cancel_season', {
    p_season_id: seasonId,
    p_reason: reason?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function setLeagueSeasonRules(seasonId: string, rules: string): Promise<void> {
  const { error } = await supabase.rpc('league_set_season_rules', {
    p_season_id: seasonId,
    p_rules: rules.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function setLeagueWinnerBadge(seasonId: string, badgePath: string): Promise<void> {
  const { error } = await supabase.rpc('league_set_winner_badge', {
    p_season_id: seasonId,
    p_badge_path: badgePath,
  });
  if (error) throw new Error(error.message);
}

export async function awardLeagueWinnerBadge(seasonId: string): Promise<number> {
  const { data, error } = await supabase.rpc('league_award_winner_badge', {
    p_season_id: seasonId,
  });
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}

export async function listOpenLeagueDisputes(): Promise<LeagueDisputeWithContext[]> {
  const disputesResult = await supabase
    .from('league_disputes')
    .select('*')
    .in('status', ['OPEN', 'UNDER_REVIEW'])
    .order('created_at', { ascending: true });
  if (disputesResult.error) throw new Error(disputesResult.error.message);
  const disputes = (disputesResult.data ?? []) as LeagueDispute[];
  if (disputes.length === 0) return [];

  const duelIds = [...new Set(disputes.map((dispute) => dispute.duel_id))];
  const duelsResult = await supabase.from('league_duels').select('*').in('id', duelIds);
  if (duelsResult.error) throw new Error(duelsResult.error.message);
  const duels = (duelsResult.data ?? []) as LeagueDuel[];

  const fixtureIds = [...new Set(duels.map((duel) => duel.fixture_id))];
  const seasonIdsFromDuels = new Set<string>();
  const [fixturesResult, reportsResult] = await Promise.all([
    supabase.from('league_fixtures').select('*').in('id', fixtureIds),
    supabase.from('league_duel_reports').select('*').in('duel_id', duelIds),
  ]);
  if (fixturesResult.error) throw new Error(fixturesResult.error.message);
  if (reportsResult.error) throw new Error(reportsResult.error.message);
  const fixtures = (fixturesResult.data ?? []) as LeagueFixture[];
  const reports = (reportsResult.data ?? []) as LeagueDuelReport[];
  fixtures.forEach((fixture) => seasonIdsFromDuels.add(fixture.season_id));

  const teamIds = [...new Set(duels.flatMap((duel) => [duel.home_team_id, duel.away_team_id]))];
  const [seasonsResult, teamsResult] = await Promise.all([
    supabase
      .from('league_seasons')
      .select('id,name,status')
      .in('id', [...seasonIdsFromDuels]),
    supabase.from('league_teams').select('id,name,status,logo_path').in('id', teamIds),
  ]);
  if (seasonsResult.error) throw new Error(seasonsResult.error.message);
  if (teamsResult.error) throw new Error(teamsResult.error.message);
  const seasons = (seasonsResult.data ?? []) as Pick<LeagueSeason, 'id' | 'name' | 'status'>[];
  const teams = (teamsResult.data ?? []) as LeagueTeamRef[];

  const profiles = await loadLeagueProfiles([
    ...duels.flatMap((duel) => [duel.home_player_id, duel.away_player_id]),
    ...reports.map((report) => report.player_id),
    ...disputes.map((dispute) => dispute.opened_by),
  ]);

  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const seasonById = new Map(seasons.map((season) => [season.id, season]));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const reportsByDuel = new Map<string, LeagueDuelReportWithPlayer[]>();
  for (const report of reports) {
    const enriched = { ...report, player: profiles.get(report.player_id) ?? null };
    const list = reportsByDuel.get(report.duel_id) ?? [];
    list.push(enriched);
    reportsByDuel.set(report.duel_id, list);
  }

  const duelById = new Map<string, LeagueDuelWithPlayers>(
    duels.map((duel) => [
      duel.id,
      {
        ...duel,
        home_player: profiles.get(duel.home_player_id) ?? null,
        away_player: profiles.get(duel.away_player_id) ?? null,
      },
    ]),
  );

  return disputes.map((dispute) => {
    const duel = duelById.get(dispute.duel_id) ?? null;
    const fixture = duel ? fixtureById.get(duel.fixture_id) ?? null : null;
    return {
      ...dispute,
      opened_by_player: profiles.get(dispute.opened_by) ?? null,
      duel,
      fixture,
      season: fixture ? seasonById.get(fixture.season_id) ?? null : null,
      home: duel ? teamById.get(duel.home_team_id) ?? null : null,
      away: duel ? teamById.get(duel.away_team_id) ?? null : null,
      reports: reportsByDuel.get(dispute.duel_id) ?? [],
    };
  });
}

export async function resolveLeagueDispute(
  disputeId: string,
  input: LeagueDisputeResolutionInput,
): Promise<void> {
  const { error } = await supabase.rpc('league_resolve_dispute', {
    p_dispute_id: disputeId,
    p_winner_team_id: input.winner_team_id,
    p_home_score: input.forfeit ? null : input.home_score,
    p_away_score: input.forfeit ? null : input.away_score,
    p_resolution: input.resolution.trim(),
    p_forfeit: input.forfeit ?? false,
  });
  if (error) throw new Error(error.message);
}
