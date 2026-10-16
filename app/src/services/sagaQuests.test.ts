import { describe, expect, it } from 'vitest';
import { rivalQuestQualifies, type RematchEvent } from './sagaService';

// Fixed Monday 2026-10-12 10:00 local — all fixtures derived from it so the
// weekly windows hold in any runner timezone.
const MON = new Date(2026, 9, 12, 10, 0, 0).getTime();
const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString();
const ME = 'me-uuid';
const RIVAL_A = 'rival-a';
const RIVAL_B = 'rival-b';

function ev(over: Partial<RematchEvent> & { created_at: string }): RematchEvent {
  return { challenger_id: ME, opponent_id: RIVAL_A, type: 'REMATCH', ...over };
}

describe('rivalQuestQualifies (weekly Blood-Debt, new opponent each week)', () => {
  it('counts a first rematch with no history', () => {
    expect(rivalQuestQualifies([ev({ created_at: iso(MON + DAY) })], ME, MON + 2 * DAY)).toBe(true);
  });

  it('rejects farming the same opponent two weeks in a row', () => {
    const events = [
      ev({ created_at: iso(MON - DAY) }), // previous week vs A
      ev({ created_at: iso(MON + DAY) }), // this week vs A again
    ];
    expect(rivalQuestQualifies(events, ME, MON + 2 * DAY)).toBe(false);
  });

  it('accepts a different opponent than last week', () => {
    const events = [
      ev({ created_at: iso(MON - DAY) }),
      ev({ opponent_id: RIVAL_B, created_at: iso(MON + DAY) }),
    ];
    expect(rivalQuestQualifies(events, ME, MON + 2 * DAY)).toBe(true);
  });

  it('counts rematches received, not only issued', () => {
    const events = [
      ev({ challenger_id: RIVAL_B, opponent_id: ME, created_at: iso(MON + DAY) }),
    ];
    expect(rivalQuestQualifies(events, ME, MON + 2 * DAY)).toBe(true);
  });

  it('ignores external (label-only) rematches with no member opponent', () => {
    const events = [ev({ opponent_id: null, created_at: iso(MON + DAY) })];
    expect(rivalQuestQualifies(events, ME, MON + 2 * DAY)).toBe(false);
  });

  it('ignores non-REMATCH battles', () => {
    const events = [ev({ type: 'FRIENDLY', created_at: iso(MON + DAY) })];
    expect(rivalQuestQualifies(events, ME, MON + 2 * DAY)).toBe(false);
  });

  it('only the previous week blocks — older history is forgiven', () => {
    const events = [
      ev({ created_at: iso(MON - 20 * DAY) }), // three weeks ago vs A
      ev({ created_at: iso(MON + DAY) }), // this week vs A
    ];
    expect(rivalQuestQualifies(events, ME, MON + 2 * DAY)).toBe(true);
  });

  it('previous-week boundary is inclusive at Monday 00:00', () => {
    const mondayMidnight = new Date(2026, 9, 12, 0, 0, 0).getTime();
    const prevMonday = mondayMidnight - 7 * DAY;
    const events = [
      ev({ created_at: iso(prevMonday) }), // exactly previous Monday start
      ev({ created_at: iso(MON + DAY) }), // this week, same opponent
    ];
    expect(rivalQuestQualifies(events, ME, MON + 2 * DAY)).toBe(false);
  });
});
