import { supabase } from '../lib/supabase';
import { loadLeagueProfiles } from './leagueTeamService';
import type {
  LeagueDispute,
  LeagueDisputeWithOpener,
  LeagueDuel,
  LeagueDuelReport,
  LeagueDuelReportWithPlayer,
  LeagueDuelWithPlayers,
  LeagueFixture,
  LeagueFixtureDetail,
  LeagueLineup,
  LeagueLineupEntry,
  LeagueLineupPlayer,
  LeagueLineupWithPlayers,
  LeagueMatchday,
  LeagueResultInput,
  LeagueSeason,
  LeagueSubstitution,
  LeagueSubstitutionWithPlayers,
  LeagueTeamRef,
} from '../types/league4v4';

export async function getLeagueFixtureDetail(fixtureId: string): Promise<LeagueFixtureDetail | null> {
  const fixtureResult = await supabase.from('league_fixtures').select('*').eq('id', fixtureId).maybeSingle();
  if (fixtureResult.error) throw new Error(fixtureResult.error.message);
  const fixture = fixtureResult.data as LeagueFixture | null;
  if (!fixture) return null;

  const [homeResult, awayResult, matchdayResult, seasonResult] = await Promise.all([
    supabase.from('league_teams').select('id,name,status,logo_path').eq('id', fixture.home_team_id).maybeSingle(),
    supabase.from('league_teams').select('id,name,status,logo_path').eq('id', fixture.away_team_id).maybeSingle(),
    supabase.from('league_matchdays').select('*').eq('id', fixture.matchday_id).maybeSingle(),
    supabase
      .from('league_seasons')
      .select('id,name,status,roster_min,roster_max')
      .eq('id', fixture.season_id)
      .maybeSingle(),
  ]);
  if (homeResult.error) throw new Error(homeResult.error.message);
  if (awayResult.error) throw new Error(awayResult.error.message);
  if (matchdayResult.error) throw new Error(matchdayResult.error.message);
  if (seasonResult.error) throw new Error(seasonResult.error.message);

  return {
    ...fixture,
    home: (homeResult.data as LeagueTeamRef | null) ?? null,
    away: (awayResult.data as LeagueTeamRef | null) ?? null,
    matchday: (matchdayResult.data as LeagueMatchday | null) ?? null,
    season: (seasonResult.data as Pick<LeagueSeason, 'id' | 'name' | 'status' | 'roster_min' | 'roster_max'> | null) ?? null,
  };
}

export async function getLeagueDuelFixtureId(duelId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('league_duels')
    .select('fixture_id')
    .eq('id', duelId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { fixture_id: string } | null)?.fixture_id ?? null;
}

export async function listLeagueLineups(fixtureId: string): Promise<LeagueLineupWithPlayers[]> {
  const lineupResult = await supabase
    .from('league_lineups')
    .select('*')
    .eq('fixture_id', fixtureId)
    .order('created_at', { ascending: true });
  if (lineupResult.error) throw new Error(lineupResult.error.message);
  const lineups = (lineupResult.data ?? []) as LeagueLineup[];
  if (lineups.length === 0) return [];

  const playerResult = await supabase
    .from('league_lineup_players')
    .select('*')
    .in('lineup_id', lineups.map((lineup) => lineup.id));
  if (playerResult.error) throw new Error(playerResult.error.message);
  const lineupPlayers = (playerResult.data ?? []) as LeagueLineupPlayer[];
  const profiles = await loadLeagueProfiles(lineupPlayers.map((entry) => entry.player_id));

  return lineups.map((lineup) => ({
    ...lineup,
    players: lineupPlayers
      .filter((entry) => entry.lineup_id === lineup.id)
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === 'STARTER' ? -1 : 1;
        return a.slot - b.slot;
      })
      .map((entry) => ({ ...entry, player: profiles.get(entry.player_id) ?? null })),
  }));
}

export async function listLeagueDuels(fixtureId: string): Promise<LeagueDuelWithPlayers[]> {
  const duelResult = await supabase
    .from('league_duels')
    .select('*')
    .eq('fixture_id', fixtureId)
    .order('slot', { ascending: true });
  if (duelResult.error) throw new Error(duelResult.error.message);
  const duels = (duelResult.data ?? []) as LeagueDuel[];
  if (duels.length === 0) return [];

  const profiles = await loadLeagueProfiles([
    ...duels.map((duel) => duel.home_player_id),
    ...duels.map((duel) => duel.away_player_id),
  ]);
  return duels.map((duel) => ({
    ...duel,
    home_player: profiles.get(duel.home_player_id) ?? null,
    away_player: profiles.get(duel.away_player_id) ?? null,
  }));
}

export async function listLeagueSubstitutions(fixtureId: string): Promise<LeagueSubstitutionWithPlayers[]> {
  const result = await supabase
    .from('league_substitutions')
    .select('*')
    .eq('fixture_id', fixtureId)
    .order('created_at', { ascending: true });
  if (result.error) throw new Error(result.error.message);
  const substitutions = (result.data ?? []) as LeagueSubstitution[];
  if (substitutions.length === 0) return [];

  const profiles = await loadLeagueProfiles([
    ...substitutions.map((substitution) => substitution.out_player_id),
    ...substitutions.map((substitution) => substitution.in_player_id),
  ]);
  return substitutions.map((substitution) => ({
    ...substitution,
    out_player: profiles.get(substitution.out_player_id) ?? null,
    in_player: profiles.get(substitution.in_player_id) ?? null,
  }));
}

export async function listLeagueDuelReports(duelIds: string[]): Promise<LeagueDuelReportWithPlayer[]> {
  if (duelIds.length === 0) return [];
  const result = await supabase
    .from('league_duel_reports')
    .select('*')
    .in('duel_id', duelIds)
    .order('submitted_at', { ascending: true });
  if (result.error) throw new Error(result.error.message);
  const reports = (result.data ?? []) as LeagueDuelReport[];
  if (reports.length === 0) return [];

  const profiles = await loadLeagueProfiles(reports.map((report) => report.player_id));
  return reports.map((report) => ({
    ...report,
    player: profiles.get(report.player_id) ?? null,
  }));
}

export async function getLeagueMatchActionSnapshot(fixtureId: string) {
  const [lineups, duels] = await Promise.all([
    listLeagueLineups(fixtureId),
    listLeagueDuels(fixtureId),
  ]);
  const reports = await listLeagueDuelReports(duels.map((duel) => duel.id));
  return { lineups, duels, reports };
}

export async function listLeagueFixtureDisputes(duelIds: string[]): Promise<LeagueDisputeWithOpener[]> {
  if (duelIds.length === 0) return [];
  const result = await supabase
    .from('league_disputes')
    .select('*')
    .in('duel_id', duelIds)
    .order('created_at', { ascending: false });
  if (result.error) throw new Error(result.error.message);
  const disputes = (result.data ?? []) as LeagueDispute[];
  if (disputes.length === 0) return [];
  const profiles = await loadLeagueProfiles(disputes.map((dispute) => dispute.opened_by));
  return disputes.map((dispute) => ({
    ...dispute,
    opened_by_player: profiles.get(dispute.opened_by) ?? null,
  }));
}

export async function submitLeagueDuelResult(duelId: string, input: LeagueResultInput): Promise<void> {
  const { error } = await supabase.rpc('league_submit_duel_result', {
    p_duel_id: duelId,
    p_score_for: input.score_for,
    p_score_against: input.score_against,
    p_decided_by: input.decided_by,
    p_evidence_path: input.evidence_path,
    p_note: input.note?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function confirmLeagueDuelResult(duelId: string): Promise<void> {
  const { error } = await supabase.rpc('league_confirm_duel_result', { p_duel_id: duelId });
  if (error) throw new Error(error.message);
}

export async function disputeLeagueDuel(duelId: string, reason: string, evidencePath?: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('league_dispute_duel', {
    p_duel_id: duelId,
    p_reason: reason.trim(),
    p_evidence_path: evidencePath ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function submitLeagueLineup(fixtureId: string, players: LeagueLineupEntry[]): Promise<void> {
  const { error } = await supabase.rpc('league_submit_lineup', {
    p_fixture_id: fixtureId,
    p_players: players,
  });
  if (error) throw new Error(error.message);
}

export async function startLeagueDuel(duelId: string): Promise<void> {
  const { error } = await supabase.rpc('league_start_duel', { p_duel_id: duelId });
  if (error) throw new Error(error.message);
}

export async function substituteLeaguePlayer(
  duelId: string,
  outPlayerId: string,
  inPlayerId: string,
): Promise<void> {
  const { error } = await supabase.rpc('league_substitute_player', {
    p_duel_id: duelId,
    p_out_player_id: outPlayerId,
    p_in_player_id: inPlayerId,
  });
  if (error) throw new Error(error.message);
}
