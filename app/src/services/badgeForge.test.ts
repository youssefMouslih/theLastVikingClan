import { describe, expect, it } from 'vitest';
import {
  BADGE_FAMILIES,
  LEVEL_MOTIFS,
  BadgeQueue,
  badgeFamilyFor,
  badgeFileName,
  buildBadgePrompt,
  defaultConcurrency,
  hashSeed,
  levelFamily,
  mulberry32,
} from './badgeForge';

// Known achievement types awarded across the app (honourService, matchService
// First Blood, statisticsService streaks). Every one needs a badge family.
const KNOWN_TYPES = [
  'LEAGUE_CHAMPION',
  'CUP_CHAMPION',
  'TOURNAMENT_CHAMPION',
  'SEASON_MVP',
  'SPECIAL',
  'FIRST_BLOOD',
  'STREAK_5',
  'STREAK_10',
];

describe('badge families', () => {
  it('covers every achievement type awarded by the app', () => {
    for (const t of KNOWN_TYPES) expect(BADGE_FAMILIES[t], t).toBeDefined();
  });
  it('falls back gracefully for unknown types', () => {
    expect(badgeFamilyFor('NOPE').motif).toBe('stone');
    expect(badgeFamilyFor('NOPE').type).toBe('NOPE');
  });
  it('defines one motif per saga level', () => {
    expect(LEVEL_MOTIFS).toHaveLength(8);
    expect(levelFamily(0).type).toBe('SAGA_LVL0');
    expect(levelFamily(99).type).toBe('SAGA_LVL7');
  });
  it('keeps a shared family language (gold accent base)', () => {
    for (const f of Object.values(BADGE_FAMILIES)) {
      expect(f.metal).toHaveLength(3);
      expect(f.rune.length).toBeGreaterThan(0);
    }
  });
});

describe('prompt builder', () => {
  it('carries clan identity and bans model-rendered text', () => {
    const { prompt, negative } = buildBadgePrompt(BADGE_FAMILIES.LEAGUE_CHAMPION);
    expect(prompt).toContain('#eab308');
    expect(prompt).toContain('shield');
    expect(negative).toMatch(/text/i);
    expect(negative).toMatch(/watermark/i);
  });
});

describe('pure helpers', () => {
  it('hashes seeds deterministically', () => {
    expect(hashSeed('a')).toBe(hashSeed('a'));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('generates unique filenames', () => {
    const names = new Set(
      Array.from({ length: 500 }, (_, i) => badgeFileName('LEAGUE_CHAMPION', '12345678-aaaa-bbbb-cccc-dddddddddddd', 1000 + i, () => 0.5)),
    );
    expect(names.size).toBe(500);
    const [first] = names;
    expect(first).toMatch(/^league-champion-12345678-[0-9a-z]+-[0-9a-z]{6}\.png$/);
  });
  it('throttles concurrency to hardware', () => {
    const c = defaultConcurrency();
    expect(c).toBeGreaterThanOrEqual(1);
    expect(c).toBeLessThanOrEqual(4);
  });
});

describe('BadgeQueue', () => {
  it('processes in order with concurrency 1 and retries failures', async () => {
    const q = new BadgeQueue(1);
    const order: number[] = [];
    let flaky = 0;
    await Promise.all([
      q.run(async () => { order.push(1); }),
      q.run(async () => {
        flaky++;
        if (flaky < 3) throw new Error('flaky');
        order.push(2);
      }, 3),
      q.run(async () => { order.push(3); }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });
  it('surfaces errors after retries are spent', async () => {
    const q = new BadgeQueue(2);
    await expect(q.run(async () => { throw new Error('nope'); }, 1)).rejects.toThrow('nope');
  });
});
