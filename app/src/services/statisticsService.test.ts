import { describe, expect, it } from 'vitest';
import { buildCareerBreakdown, buildCareerYears } from './statisticsService';

describe('buildCareerBreakdown', () => {
  it('splits league, cup and friendly results while the overall record includes every match', () => {
    const breakdown = buildCareerBreakdown([
      { kind: 'match', mine: 3, theirs: 1, compType: 'LEAGUE' },
      { kind: 'match', mine: 0, theirs: 0, compType: 'LEAGUE' },
      { kind: 'match', mine: 1, theirs: 2, compType: 'CUP' },
      { kind: 'battle', mine: 2, theirs: 2 },
      { kind: 'match', mine: 4, theirs: 0, compType: 'TOURNAMENT' },
    ]);

    expect(breakdown.all).toEqual({
      played: 5,
      wins: 2,
      draws: 2,
      losses: 1,
      goals_for: 10,
      goals_against: 5,
      clean_sheets: 2,
      winRate: 40,
    });
    expect(breakdown.league).toEqual({
      played: 2,
      wins: 1,
      draws: 1,
      losses: 0,
      goals_for: 3,
      goals_against: 1,
      clean_sheets: 1,
      winRate: 50,
    });
    expect(breakdown.cup).toEqual({
      played: 1,
      wins: 0,
      draws: 0,
      losses: 1,
      goals_for: 1,
      goals_against: 2,
      clean_sheets: 0,
      winRate: 0,
    });
    expect(breakdown.friendly).toEqual({
      played: 1,
      wins: 0,
      draws: 1,
      losses: 0,
      goals_for: 2,
      goals_against: 2,
      clean_sheets: 0,
      winRate: 0,
    });
  });
});

describe('buildCareerYears', () => {
  it('groups results by year newest first and ignores undated results', () => {
    const years = buildCareerYears([
      { kind: 'match', mine: 2, theirs: 1, compType: 'LEAGUE', year: 2026 },
      { kind: 'battle', mine: 1, theirs: 1, year: 2026 },
      { kind: 'match', mine: 0, theirs: 3, compType: 'CUP', year: 2025 },
      { kind: 'match', mine: 4, theirs: 0, compType: 'LEAGUE' },
    ]);

    expect(years.map((item) => item.year)).toEqual([2026, 2025]);
    expect(years[0].breakdown.all).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0, goals_for: 3 });
    expect(years[0].breakdown.league).toMatchObject({ played: 1, wins: 1 });
    expect(years[0].breakdown.friendly).toMatchObject({ played: 1, draws: 1 });
    expect(years[1].breakdown.all).toMatchObject({ played: 1, wins: 0, draws: 0, losses: 1 });
    expect(years[1].breakdown.cup).toMatchObject({ played: 1, losses: 1 });
  });
});
