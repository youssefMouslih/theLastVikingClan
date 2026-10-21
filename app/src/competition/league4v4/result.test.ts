import { describe, expect, it } from 'vitest';
import type { LeagueDuel, LeagueDuelReport } from '../../types/league4v4';
import {
  canConfirmOpponentResult,
  canEditOwnReport,
  canOpenDuelDispute,
  canReportDuelResult,
  isOpenDisputeStatus,
  normalizedReportScore,
  reportsMirror,
  validateResultInput,
} from './result';

function duel(overrides: Partial<LeagueDuel> = {}): LeagueDuel {
  return {
    id: 'd1',
    fixture_id: 'f1',
    matchday_id: 'm1',
    slot: 1,
    home_team_id: 'home',
    away_team_id: 'away',
    home_player_id: 'p1',
    away_player_id: 'p2',
    status: 'STARTED',
    started_at: '2026-01-01T00:00:00Z',
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

function report(overrides: Partial<LeagueDuelReport> = {}): LeagueDuelReport {
  return {
    id: 'r1',
    duel_id: 'd1',
    player_id: 'p1',
    team_id: 'home',
    side: 'HOME',
    score_for: 3,
    score_against: 1,
    decided_by: 'REGULATION',
    evidence_path: 'league/s/f/d/p1-1.png',
    note: null,
    status: 'SUBMITTED',
    submitted_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const validInput = {
  score_for: 3,
  score_against: 1,
  decided_by: 'REGULATION' as const,
  note: 'gg',
};

describe('validateResultInput', () => {
  it('accepts decisive scores with evidence', () => {
    expect(validateResultInput(validInput, true)).toBeNull();
  });

  it('requires whole scores inside 0-99', () => {
    expect(validateResultInput({ ...validInput, score_for: -1 }, true)).toBe('scores');
    expect(validateResultInput({ ...validInput, score_against: 100 }, true)).toBe('scores');
    expect(validateResultInput({ ...validInput, score_for: 2.5 }, true)).toBe('scores');
  });

  it('rejects draws and invalid deciders', () => {
    expect(validateResultInput({ ...validInput, score_against: 3 }, true)).toBe('decisive');
    expect(validateResultInput({ ...validInput, decided_by: 'COIN_TOSS' as never }, true)).toBe('decided-by');
  });

  it('requires evidence and a short note', () => {
    expect(validateResultInput(validInput, false)).toBe('evidence');
    expect(validateResultInput({ ...validInput, note: 'x'.repeat(1001) }, true)).toBe('note');
  });
});

describe('result permissions', () => {
  it('lets only assigned players report during a live duel', () => {
    expect(canReportDuelResult(duel(), 'p1')).toBe(true);
    expect(canReportDuelResult(duel({ status: 'AWAITING_RESULTS' }), 'p2')).toBe(true);
    expect(canReportDuelResult(duel(), 'p3')).toBe(false);
    expect(canReportDuelResult(duel({ status: 'SCHEDULED' }), 'p1')).toBe(false);
    expect(canReportDuelResult(duel({ status: 'CONFIRMED' }), 'p1')).toBe(false);
  });

  it('allows editing only an unconfirmed own report', () => {
    expect(canEditOwnReport(duel(), null, 'p1', false)).toBe(true);
    expect(canEditOwnReport(duel(), report(), 'p1', false)).toBe(true);
    expect(canEditOwnReport(duel(), report({ status: 'CONFIRMED' }), 'p1', false)).toBe(false);
    expect(canEditOwnReport(duel(), report(), 'p1', true)).toBe(false);
  });

  it('allows confirming an opponent report only before own submission', () => {
    const opponent = report({ id: 'r2', player_id: 'p2', team_id: 'away', side: 'AWAY' });
    expect(canConfirmOpponentResult({ duel: duel({ status: 'AWAITING_RESULTS' }), playerId: 'p1', myReport: null, opponentReport: opponent, hasOpenDispute: false })).toBe(true);
    expect(canConfirmOpponentResult({ duel: duel({ status: 'AWAITING_RESULTS' }), playerId: 'p1', myReport: report(), opponentReport: opponent, hasOpenDispute: false })).toBe(false);
    expect(canConfirmOpponentResult({ duel: duel(), playerId: 'p1', myReport: null, opponentReport: opponent, hasOpenDispute: false })).toBe(false);
    expect(canConfirmOpponentResult({ duel: duel({ status: 'AWAITING_RESULTS' }), playerId: 'p1', myReport: null, opponentReport: opponent, hasOpenDispute: true })).toBe(false);
    expect(canConfirmOpponentResult({ duel: duel({ status: 'AWAITING_RESULTS' }), playerId: 'p3', myReport: null, opponentReport: opponent, hasOpenDispute: false })).toBe(false);
  });

  it('lets assigned players and captains dispute a live duel once', () => {
    expect(canOpenDuelDispute({ duel: duel(), playerId: 'p1', isCaptain: false, hasOpenDispute: false })).toBe(true);
    expect(canOpenDuelDispute({ duel: duel(), playerId: 'p3', isCaptain: true, hasOpenDispute: false })).toBe(true);
    expect(canOpenDuelDispute({ duel: duel(), playerId: 'p3', isCaptain: false, hasOpenDispute: false })).toBe(false);
    expect(canOpenDuelDispute({ duel: duel(), playerId: 'p1', isCaptain: false, hasOpenDispute: true })).toBe(false);
    expect(canOpenDuelDispute({ duel: duel({ status: 'DISPUTED' }), playerId: 'p1', isCaptain: false, hasOpenDispute: false })).toBe(false);
  });
});

describe('report comparison', () => {
  it('mirrors scores and the decider, ignoring the note', () => {
    const mirror = report({ id: 'r2', player_id: 'p2', team_id: 'away', side: 'AWAY', score_for: 1, score_against: 3, note: 'different' });
    expect(reportsMirror(report(), mirror)).toBe(true);
    expect(reportsMirror(report(), { ...mirror, score_against: 2 })).toBe(false);
    expect(reportsMirror(report(), { ...mirror, decided_by: 'PENALTIES' })).toBe(false);
  });

  it('normalizes home and away reports to one score line', () => {
    expect(normalizedReportScore(report())).toEqual({ home_score: 3, away_score: 1 });
    expect(normalizedReportScore(report({ side: 'AWAY', score_for: 1, score_against: 3 }))).toEqual({ home_score: 3, away_score: 1 });
  });

  it('treats only open and under-review disputes as active', () => {
    expect(isOpenDisputeStatus('OPEN')).toBe(true);
    expect(isOpenDisputeStatus('UNDER_REVIEW')).toBe(true);
    expect(isOpenDisputeStatus('RESOLVED')).toBe(false);
    expect(isOpenDisputeStatus('REJECTED')).toBe(false);
  });
});
