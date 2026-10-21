import { describe, expect, it } from 'vitest';
import type { LeagueDuel, LeagueLineupEntry, LeagueLineupWithPlayers, LeagueSubstitution } from '../../types/league4v4';
import {
  buildLineupEntries,
  canRequestSubstitution,
  canStartDuel,
  eligibleSubstitutes,
  initialLineupSelections,
  lineupLockReason,
  opponentLineupVisible,
  validateLineup,
} from './lineup';

const ROSTER = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

function entries(starters: string[], subs: string[]): LeagueLineupEntry[] {
  return [
    ...starters.map((player_id, index) => ({ player_id, role: 'STARTER' as const, slot: (index + 1) as 1 | 2 | 3 | 4 })),
    ...subs.map((player_id, index) => ({ player_id, role: 'SUB' as const, slot: (index + 1) as 1 | 2 | 3 | 4 })),
  ];
}

function duel(overrides: Partial<LeagueDuel> = {}): LeagueDuel {
  return {
    id: 'd1',
    fixture_id: 'f1',
    matchday_id: 'm1',
    slot: 1,
    home_team_id: 'home',
    away_team_id: 'away',
    home_player_id: 'p1',
    away_player_id: 'p5',
    status: 'SCHEDULED',
    started_at: null,
    deadline: '2030-01-01T00:00:00Z',
    home_score: null,
    away_score: null,
    winner_team_id: null,
    confirmed_at: null,
    resolved_by: null,
    resolution_note: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function substitution(inPlayerId: string, teamId = 'home'): LeagueSubstitution {
  return {
    id: `s-${inPlayerId}`,
    duel_id: 'd1',
    fixture_id: 'f1',
    team_id: teamId,
    out_player_id: 'p1',
    in_player_id: inPlayerId,
    requested_by: 'p1',
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('validateLineup', () => {
  it('accepts 4 starters and 2-4 substitutes from the squad', () => {
    expect(validateLineup(entries(ROSTER.slice(0, 4), ROSTER.slice(4, 6)), ROSTER)).toBeNull();
    expect(validateLineup(entries(ROSTER.slice(0, 4), ROSTER.slice(4, 8)), ROSTER)).toBeNull();
  });

  it('rejects incomplete squads and unknown players', () => {
    expect(validateLineup(entries(ROSTER.slice(0, 4), ROSTER.slice(4, 5)), ROSTER)).toBe('players');
    expect(validateLineup(entries(ROSTER.slice(0, 4), ['p5', 'stranger']), ROSTER)).toBe('not-member');
  });

  it('rejects the wrong starter count', () => {
    expect(validateLineup(entries(ROSTER.slice(0, 3), ROSTER.slice(3, 6)), ROSTER)).toBe('starters');
  });

  it('rejects more than four substitutes', () => {
    const fiveSubs = entries(ROSTER.slice(0, 4), ROSTER.slice(4, 8));
    fiveSubs.push({ player_id: 'p1', role: 'SUB', slot: 1 });
    expect(validateLineup(fiveSubs, ROSTER)).toBe('players');
  });

  it('rejects duplicate players', () => {
    const duplicatePlayer = entries(ROSTER.slice(0, 4), ROSTER.slice(4, 6));
    duplicatePlayer.push({ player_id: 'p1', role: 'SUB', slot: 3 });
    expect(validateLineup(duplicatePlayer, ROSTER)).toBe('duplicate-player');
  });

  it('rejects duplicate starter slots', () => {
    const duplicateSlot = entries(ROSTER.slice(0, 4), ROSTER.slice(4, 6));
    duplicateSlot[1] = { player_id: 'p2', role: 'STARTER', slot: 1 };
    expect(validateLineup(duplicateSlot, ROSTER)).toBe('duplicate-slot');
  });
});

describe('buildLineupEntries', () => {
  it('skips empty slots while preserving slot numbers', () => {
    expect(buildLineupEntries(['p1', null, 'p3', 'p4'], ['p5', 'p6'])).toEqual([
      { player_id: 'p1', role: 'STARTER', slot: 1 },
      { player_id: 'p3', role: 'STARTER', slot: 3 },
      { player_id: 'p4', role: 'STARTER', slot: 4 },
      { player_id: 'p5', role: 'SUB', slot: 1 },
      { player_id: 'p6', role: 'SUB', slot: 2 },
    ]);
  });
});

describe('initialLineupSelections', () => {
  it('maps a saved lineup back into starter and bench slots', () => {
    const saved = {
      id: 'l1',
      fixture_id: 'f1',
      team_id: 'home',
      submitted_by: 'p1',
      submitted_at: '2026-01-01T00:00:00Z',
      version: 2,
      status: 'SUBMITTED',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      players: [
        { id: 'x1', lineup_id: 'l1', player_id: 'p4', role: 'STARTER', slot: 4, created_at: '' },
        { id: 'x2', lineup_id: 'l1', player_id: 'p1', role: 'STARTER', slot: 1, created_at: '' },
        { id: 'x3', lineup_id: 'l1', player_id: 'p6', role: 'SUB', slot: 2, created_at: '' },
        { id: 'x4', lineup_id: 'l1', player_id: 'p5', role: 'SUB', slot: 1, created_at: '' },
        { id: 'x5', lineup_id: 'l1', player_id: 'p2', role: 'STARTER', slot: 2, created_at: '' },
        { id: 'x6', lineup_id: 'l1', player_id: 'p3', role: 'STARTER', slot: 3, created_at: '' },
      ],
    } as unknown as LeagueLineupWithPlayers;
    expect(initialLineupSelections(ROSTER, saved)).toEqual({
      starters: ['p1', 'p2', 'p3', 'p4'],
      subs: ['p5', 'p6'],
    });
  });

  it('prefills the first four starters and two substitutes when empty', () => {
    expect(initialLineupSelections(ROSTER)).toEqual({
      starters: ['p1', 'p2', 'p3', 'p4'],
      subs: ['p5', 'p6'],
    });
    expect(initialLineupSelections(['p1', 'p2'])).toEqual({
      starters: ['p1', 'p2', null, null],
      subs: [null, null],
    });
  });
});

describe('lineup visibility', () => {
  it('hides lineups until the server reveals them', () => {
    expect(opponentLineupVisible('SCHEDULED')).toBe(false);
    expect(opponentLineupVisible('LINEUPS_PENDING')).toBe(false);
    expect(opponentLineupVisible('LINEUPS_REVEALED')).toBe(true);
    expect(opponentLineupVisible('IN_PROGRESS')).toBe(true);
    expect(opponentLineupVisible('COMPLETED')).toBe(true);
    expect(opponentLineupVisible('FORFEITED')).toBe(true);
    expect(opponentLineupVisible('CANCELLED')).toBe(false);
  });
});

describe('lineup lock rules', () => {
  const deadline = '2030-01-01T00:00:00Z';
  const now = new Date('2026-01-01T00:00:00Z').getTime();

  it('allows captain edits only while the fixture is open', () => {
    expect(lineupLockReason({ seasonStatus: 'ACTIVE', fixtureStatus: 'SCHEDULED', deadline, now })).toBeNull();
    expect(lineupLockReason({ seasonStatus: 'ACTIVE', fixtureStatus: 'LINEUPS_PENDING', deadline, now })).toBeNull();
  });

  it('locks outside the active season, after reveal or after the deadline', () => {
    expect(lineupLockReason({ seasonStatus: 'REGISTRATION', fixtureStatus: 'SCHEDULED', deadline, now })).toBe('SEASON');
    expect(lineupLockReason({ seasonStatus: 'ACTIVE', fixtureStatus: 'LINEUPS_REVEALED', deadline, now })).toBe('FIXTURE');
    expect(lineupLockReason({ seasonStatus: 'ACTIVE', fixtureStatus: 'SCHEDULED', deadline: '2020-01-01T00:00:00Z', now })).toBe('DEADLINE');
    expect(lineupLockReason({ seasonStatus: 'ACTIVE', fixtureStatus: 'SCHEDULED', deadline, lineupStatus: 'REVEALED', now })).toBe('REVEALED');
  });
});

describe('duel actions', () => {
  const now = new Date('2026-01-01T00:00:00Z').getTime();

  it('lets only assigned players start a scheduled duel before the deadline', () => {
    expect(canStartDuel(duel(), 'p1', now)).toBe(true);
    expect(canStartDuel(duel(), 'p5', now)).toBe(true);
    expect(canStartDuel(duel(), 'p2', now)).toBe(false);
    expect(canStartDuel(duel({ status: 'STARTED' }), 'p1', now)).toBe(false);
    expect(canStartDuel(duel({ deadline: '2020-01-01T00:00:00Z' }), 'p1', now)).toBe(false);
  });

  it('lets the affected captain substitute only before start and report', () => {
    expect(canRequestSubstitution({ duel: duel(), teamId: 'home', isCaptain: true, now })).toBe(true);
    expect(canRequestSubstitution({ duel: duel(), teamId: 'home', isCaptain: false, now })).toBe(false);
    expect(canRequestSubstitution({ duel: duel({ started_at: '2026-01-01T00:00:00Z' }), teamId: 'home', isCaptain: true, now })).toBe(false);
    expect(canRequestSubstitution({ duel: duel({ status: 'AWAITING_RESULTS' }), teamId: 'home', isCaptain: true, now })).toBe(false);
    expect(canRequestSubstitution({ duel: duel(), teamId: 'third', isCaptain: true, now })).toBe(false);
  });

  it('offers only bench players not already used in this fixture', () => {
    const duels = [duel(), duel({ id: 'd2', slot: 2, home_player_id: 'p2', away_player_id: 'p6' })];
    expect(
      eligibleSubstitutes({
        benchPlayerIds: ['p7', 'p8', 'p1'],
        duels,
        substitutions: [substitution('p7')],
        teamId: 'home',
        outPlayerId: 'p2',
      }),
    ).toEqual(['p8']);
  });
});
