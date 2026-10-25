import { describe, expect, it } from 'vitest';
import { enYearReadings, frYear, generateYear } from '../src/generators/year';
import { seededRng } from '../src/random';

describe('frYear — DESIGN.md §14', () => {
  it.each<[number, string, string | null]>([
    [1984, 'mille neuf cent quatre-vingt-quatre', 'dix-neuf cent quatre-vingt-quatre'],
    [1789, 'mille sept cent quatre-vingt-neuf', 'dix-sept cent quatre-vingt-neuf'],
    [1900, 'mille neuf cents', 'dix-neuf cents'],
    [1100, 'mille cent', 'onze cents'],
    [1980, 'mille neuf cent quatre-vingts', 'dix-neuf cent quatre-vingts'],
    [2000, 'deux mille', null],
    [2024, 'deux mille vingt-quatre', null],
  ])('%i', (year, standard, colloquial) => {
    expect(frYear(year)).toBe(standard);
    // colloquial only exists for 1100–1999; outside that range it falls back to standard
    expect(frYear(year, true)).toBe(colloquial ?? standard);
  });
});

describe('enYearReadings — DESIGN.md §14', () => {
  it.each<[number, string[]]>([
    [1984, ['nineteen eighty-four']],
    [1900, ['nineteen hundred']],
    [1905, ['nineteen oh five']],
    [2005, ['two thousand five']],
    [1042, ['one thousand forty-two']],
    [2000, ['two thousand']],
    [2010, ['twenty ten', 'two thousand ten']],
    [2024, ['twenty twenty-four', 'two thousand twenty-four']],
  ])('%i', (year, readings) => {
    expect(enYearReadings(year)).toEqual(readings);
  });
});

describe('generateYear', () => {
  const rng = seededRng(1);
  const ranges: Record<number, [number, number]> = {
    1: [2000, 2030],
    2: [1900, 1999],
    3: [1000, 1899],
    4: [1100, 2030],
  };

  it.each([1, 2, 3, 4])('tier %i stays in range', (tier) => {
    const [min, max] = ranges[tier];
    for (let i = 0; i < 200; i++) {
      const y = Number(generateYear('fr-CA', tier, rng).answer);
      expect(y).toBeGreaterThanOrEqual(min);
      expect(y).toBeLessThanOrEqual(max);
    }
  });

  it('tier 4 mixes colloquial and standard readings before 2000', () => {
    const displays = Array.from({ length: 300 }, () => generateYear('fr-CA', 4, rng))
      .filter((q) => Number(q.answer) < 2000)
      .map((q) => q.display);
    expect(displays.some((d) => d.startsWith('mille'))).toBe(true);
    expect(displays.some((d) => !d.startsWith('mille'))).toBe(true);
  });

  it('tiers 2–3 never use the colloquial reading', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateYear('fr-CA', 2, rng).display).toMatch(/^mille /);
    }
  });
});
