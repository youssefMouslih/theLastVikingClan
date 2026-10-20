import { supabase } from '../lib/supabase';
import { listLeagueTeamRefs } from './leagueTeamService';
import type {
  LeagueBye,
  LeagueFixture,
  LeagueFixtureWithContext,
  LeagueMatchday,
  LeagueMatchdayWithFixtures,
  LeagueSchedule,
  LeagueTeamRef,
} from '../types/league4v4';

export async function listLeagueMatchdays(seasonId: string): Promise<LeagueMatchday[]> {
  const { data, error } = await supabase
    .from('league_matchdays')
    .select('*')
    .eq('season_id', seasonId)
    .order('number', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeagueMatchday[];
}

export async function listLeagueFixtures(seasonId: string): Promise<LeagueFixture[]> {
  const { data, error } = await supabase
    .from('league_fixtures')
    .select('*')
    .eq('season_id', seasonId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeagueFixture[];
}

export async function listLeagueByes(seasonId: string): Promise<LeagueBye[]> {
  const { data, error } = await supabase
    .from('league_byes')
    .select('*')
    .eq('season_id', seasonId);
  if (error) throw new Error(error.message);
  return (data ?? []) as LeagueBye[];
}

export async function getLeagueSchedule(seasonId: string): Promise<LeagueSchedule> {
  const [matchdays, fixtures, byes, teamRefs] = await Promise.all([
    listLeagueMatchdays(seasonId),
    listLeagueFixtures(seasonId),
    listLeagueByes(seasonId),
    listLeagueTeamRefs(seasonId),
  ]);
  const teams = Object.fromEntries(teamRefs.map((team) => [team.id, team])) as Record<string, LeagueTeamRef>;
  const matchdayById = new Map(matchdays.map((matchday) => [matchday.id, matchday]));

  const fixtureContexts: LeagueFixtureWithContext[] = fixtures.map((fixture) => {
    const matchday = matchdayById.get(fixture.matchday_id);
    return {
      ...fixture,
      home: teams[fixture.home_team_id] ?? null,
      away: teams[fixture.away_team_id] ?? null,
      matchday: matchday
        ? {
            id: matchday.id,
            number: matchday.number,
            opens_at: matchday.opens_at,
            deadline: matchday.deadline,
            status: matchday.status,
          }
        : null,
    };
  });

  const matchdayContexts: LeagueMatchdayWithFixtures[] = matchdays.map((matchday) => ({
    ...matchday,
    fixtures: fixtureContexts
      .filter((fixture) => fixture.matchday_id === matchday.id)
      .sort((a, b) => (a.home?.name ?? '').localeCompare(b.home?.name ?? '')),
    byes: byes
      .filter((bye) => bye.matchday_id === matchday.id)
      .map((bye) => teams[bye.team_id])
      .filter((team): team is LeagueTeamRef => !!team),
  }));

  return { season_id: seasonId, matchdays: matchdayContexts, fixtures: fixtureContexts, teams };
}

export function findNextLeagueFixture(
  schedule: LeagueSchedule,
  teamId?: string,
): LeagueFixtureWithContext | null {
  const now = Date.now();
  const finalStatuses = new Set(['COMPLETED', 'FORFEITED', 'CANCELLED']);
  return (
    schedule.fixtures
      .filter((fixture) => {
        if (finalStatuses.has(fixture.status)) return false;
        if (teamId && fixture.home_team_id !== teamId && fixture.away_team_id !== teamId) return false;
        return !!fixture.matchday && new Date(fixture.matchday.deadline).getTime() >= now;
      })
      .sort((a, b) => {
        const aOpens = a.matchday ? new Date(a.matchday.opens_at).getTime() : 0;
        const bOpens = b.matchday ? new Date(b.matchday.opens_at).getTime() : 0;
        return aOpens - bOpens;
      })[0] ?? null
  );
}
