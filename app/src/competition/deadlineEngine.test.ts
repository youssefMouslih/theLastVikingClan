import { describe, expect, it } from 'vitest';
import { isPastDeadline, matchShouldBeOverdue, registrationState } from './deadlineEngine';

describe('deadlineEngine (§21, §34-35, §99)', () => {
  const NOW = new Date('2026-10-06T12:00:00Z').getTime();
  const past = new Date('2026-10-05T23:59:00Z').toISOString();
  const future = new Date('2026-10-07T23:59:00Z').toISOString();

  it('detects past deadlines (server time authoritative)', () => {
    expect(isPastDeadline(past, NOW)).toBe(true);
    expect(isPastDeadline(future, NOW)).toBe(false);
    expect(isPastDeadline(null, NOW)).toBe(false);
  });

  it('marks SCHEDULED/RESULT_SUBMITTED past deadline as overdue', () => {
    expect(matchShouldBeOverdue('SCHEDULED', past, NOW)).toBe(true);
    expect(matchShouldBeOverdue('RESULT_SUBMITTED', past, NOW)).toBe(true);
    expect(matchShouldBeOverdue('CONFIRMED', past, NOW)).toBe(false);
    expect(matchShouldBeOverdue('SCHEDULED', future, NOW)).toBe(false);
  });

  it('registration states: NOT_OPEN / OPEN / FULL / CLOSED', () => {
    expect(registrationState(NOW, future, future, 0, 8)).toBe('NOT_OPEN');
    expect(registrationState(NOW, past, future, 3, 8)).toBe('OPEN');
    expect(registrationState(NOW, past, future, 8, 8)).toBe('FULL');
    expect(registrationState(NOW, past, past, 3, 8)).toBe('CLOSED');
  });
});
