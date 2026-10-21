import { describe, expect, it } from 'vitest';
import {
  formatDiff,
  moveTeam,
  resolveTiebreakOrder,
  validTiebreakReason,
  validatePenaltyInput,
} from './standings';

describe('validatePenaltyInput', () => {
  it('accepts a valid deduction or bonus', () => {
    expect(validatePenaltyInput({ teamId: 't1', points: -3, reason: 'Late lineup' })).toBeNull();
    expect(validatePenaltyInput({ teamId: 't1', points: 2, reason: 'Admin correction' })).toBeNull();
  });

  it('requires a squad', () => {
    expect(validatePenaltyInput({ teamId: '', points: -3, reason: 'Late lineup' })).toBe('team');
  });

  it('requires nonzero whole points inside -100..100', () => {
    expect(validatePenaltyInput({ teamId: 't1', points: 0, reason: 'Late lineup' })).toBe('points');
    expect(validatePenaltyInput({ teamId: 't1', points: -101, reason: 'Late lineup' })).toBe('points');
    expect(validatePenaltyInput({ teamId: 't1', points: 1.5, reason: 'Late lineup' })).toBe('points');
  });

  it('requires a 3-1000 character reason', () => {
    expect(validatePenaltyInput({ teamId: 't1', points: -3, reason: '  ab  ' })).toBe('reason');
    expect(validatePenaltyInput({ teamId: 't1', points: -3, reason: 'x'.repeat(1001) })).toBe('reason');
  });
});

describe('validTiebreakReason', () => {
  it('checks the trimmed reason length', () => {
    expect(validTiebreakReason('  abc  ')).toBe(true);
    expect(validTiebreakReason(' ab ')).toBe(false);
    expect(validTiebreakReason('')).toBe(false);
  });
});

describe('moveTeam', () => {
  const ids = ['a', 'b', 'c'];

  it('swaps adjacent squads', () => {
    expect(moveTeam(ids, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveTeam(ids, 2, -1)).toEqual(['a', 'c', 'b']);
  });

  it('keeps the order when the move is out of bounds', () => {
    expect(moveTeam(ids, 0, -1)).toBe(ids);
    expect(moveTeam(ids, 2, 1)).toBe(ids);
  });
});

describe('resolveTiebreakOrder', () => {
  it('keeps saved approved squads first, then appends new ones', () => {
    expect(resolveTiebreakOrder(['c', 'a', 'gone'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
  });

  it('drops duplicates and returns all approved squads', () => {
    const result = resolveTiebreakOrder(['a', 'a'], ['a', 'b']);
    expect(result).toEqual(['a', 'b']);
    expect(result).toHaveLength(2);
  });

  it('falls back to approved order when the saved order is empty', () => {
    expect(resolveTiebreakOrder([], ['b', 'a'])).toEqual(['b', 'a']);
  });
});

describe('formatDiff', () => {
  it('adds a plus for positive values', () => {
    expect(formatDiff(3)).toBe('+3');
    expect(formatDiff(0)).toBe('0');
    expect(formatDiff(-2)).toBe('-2');
  });
});
