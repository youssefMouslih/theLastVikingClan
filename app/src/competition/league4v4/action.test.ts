import { describe, expect, it } from 'vitest';
import { leagueNextAction, type LeagueActionInput } from './action';

const NOW = new Date('2026-10-20T12:00:00Z').getTime();
const FUTURE = new Date('2026-10-21T12:00:00Z').toISOString();
const PAST = new Date('2026-10-19T12:00:00Z').toISOString();

const base: LeagueActionInput = {
  fixtureStatus: 'LINEUPS_PENDING',
  matchdayStatus: 'OPEN',
  deadline: FUTURE,
  myTeamId: 'team-a',
  myPlayerId: 'me',
  isCaptain: true,
  lineups: [],
  duels: [],
  reports: [],
  nowMs: NOW,
};

describe('leagueNextAction', () => {
  it('asks a captain to submit a missing or draft lineup', () => {
    expect(leagueNextAction(base)).toBe('SUBMIT_LINEUP');
    expect(leagueNextAction({ ...base, lineups: [{ team_id: 'team-a', status: 'DRAFT' }] })).toBe('SUBMIT_LINEUP');
    expect(leagueNextAction({ ...base, lineups: [{ team_id: 'team-a', status: 'SUBMITTED' }] })).toBeNull();
  });

  it('does not ask non-captains, closed matchdays or past deadlines to submit', () => {
    expect(leagueNextAction({ ...base, isCaptain: false })).toBeNull();
    expect(leagueNextAction({ ...base, matchdayStatus: 'CLOSED' })).toBeNull();
    expect(leagueNextAction({ ...base, deadline: PAST })).toBeNull();
  });

  it('asks assigned players to start a scheduled duel', () => {
    expect(leagueNextAction({
      ...base,
      fixtureStatus: 'LINEUPS_REVEALED',
      duels: [{ id: 'd1', status: 'SCHEDULED', home_player_id: 'me', away_player_id: 'them' }],
    })).toBe('START_DUEL');
    expect(leagueNextAction({
      ...base,
      fixtureStatus: 'LINEUPS_REVEALED',
      deadline: PAST,
      duels: [{ id: 'd1', status: 'SCHEDULED', home_player_id: 'me', away_player_id: 'them' }],
    })).toBeNull();
  });

  it('asks for a result once a duel has started and I have not reported', () => {
    expect(leagueNextAction({
      ...base,
      fixtureStatus: 'IN_PROGRESS',
      duels: [{ id: 'd1', status: 'STARTED', home_player_id: 'me', away_player_id: 'them' }],
    })).toBe('SUBMIT_RESULT');
    expect(leagueNextAction({
      ...base,
      fixtureStatus: 'IN_PROGRESS',
      duels: [{ id: 'd1', status: 'STARTED', home_player_id: 'me', away_player_id: 'them' }],
      reports: [{ duel_id: 'd1', player_id: 'me', status: 'SUBMITTED' }],
    })).toBeNull();
  });

  it('asks me to confirm an opponent report when I have not reported', () => {
    expect(leagueNextAction({
      ...base,
      fixtureStatus: 'IN_PROGRESS',
      duels: [{ id: 'd1', status: 'AWAITING_RESULTS', home_player_id: 'me', away_player_id: 'them' }],
      reports: [{ duel_id: 'd1', player_id: 'them', status: 'SUBMITTED' }],
    })).toBe('CONFIRM_RESULT');
    expect(leagueNextAction({
      ...base,
      fixtureStatus: 'IN_PROGRESS',
      duels: [{ id: 'd1', status: 'AWAITING_RESULTS', home_player_id: 'me', away_player_id: 'them' }],
      reports: [{ duel_id: 'd1', player_id: 'me', status: 'SUBMITTED' }],
    })).toBeNull();
  });

  it('ignores duels assigned to other players and final fixtures', () => {
    expect(leagueNextAction({
      ...base,
      fixtureStatus: 'LINEUPS_REVEALED',
      duels: [{ id: 'd1', status: 'SCHEDULED', home_player_id: 'other', away_player_id: 'them' }],
    })).toBeNull();
    expect(leagueNextAction({ ...base, fixtureStatus: 'COMPLETED' })).toBeNull();
    expect(leagueNextAction({
      ...base,
      fixtureStatus: 'FORFEITED',
      duels: [{ id: 'd1', status: 'SCHEDULED', home_player_id: 'me', away_player_id: 'them' }],
    })).toBeNull();
  });
});
