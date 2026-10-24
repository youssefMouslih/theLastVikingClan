import { describe, expect, it } from 'vitest';
import { notificationPath } from './notificationLinks';

describe('notificationPath', () => {
  it('keeps existing deep links', () => {
    expect(notificationPath('match', 'm1')).toBe('/matches/m1');
    expect(notificationPath('competition', 'c1')).toBe('/competitions/c1');
    expect(notificationPath('battle', null)).toBe('/battles?tab=incoming');
    expect(notificationPath('tryout', null)).toBe('/admin?tab=tryouts');
  });

  it('routes tryout notifications to the right role-specific task', () => {
    expect(notificationPath('tryout', 'r1', 'TRYOUT_REQUEST', 'New tryout request'))
      .toBe('/admin?tab=tryouts&request=r1');
    expect(notificationPath('tryout', 'r1', 'TRYOUT_REQUEST', 'Tester task'))
      .toBe('/home#tester-task-r1');
  });

  it('routes other actionable requests to their tabs and records', () => {
    expect(notificationPath('gift', 'g1', 'COMPETITION_INVITATION', 'Glory requested'))
      .toBe('/saga?tab=gifts&gift=g1');
    expect(notificationPath('squad', 's1', 'COMPETITION_INVITATION', 'Squad request'))
      .toBe('/battles?tab=commands&squad=s1');
    expect(notificationPath('battle', 'b1', 'RESULT_SUBMITTED')).toBe('/battles?tab=incoming');
    expect(notificationPath(null, null, 'ANNOUNCEMENT')).toBe('/home');
  });

  it('links every league entity to a useful screen', () => {
    expect(notificationPath('league_fixture', 'f1')).toBe('/4vs4/match/f1');
    expect(notificationPath('league_duel', 'd1')).toBe('/4vs4/duel/d1');
    expect(notificationPath('league_team', 't1')).toBe('/4vs4/teams/t1');
    expect(notificationPath('league_matchday', 'md1')).toBe('/4vs4/fixtures');
    expect(notificationPath('league_season', 's1')).toBe('/4vs4');
  });

  it('falls back to the league area when an id is missing', () => {
    expect(notificationPath('league_fixture', null)).toBe('/4vs4');
    expect(notificationPath('league_duel', null)).toBe('/4vs4');
    expect(notificationPath('league_team', null)).toBe('/4vs4/teams');
    expect(notificationPath('match', null)).toBeNull();
    expect(notificationPath('unknown', 'x')).toBeNull();
  });
});
