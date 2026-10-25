import { describe, expect, it } from 'vitest';
import { generateCardinal } from '../src/generators/cardinal';
import { generateQuestion, tierCount } from '../src/generators';
import { seededRng } from '../src/random';
import { deriveTts } from '../src/speech/tts-text';
import type { PracticeLang, QuestionType, TimeFormat } from '../src/types';

describe('generateCardinal', () => {
  const rng = seededRng(3);
  const ranges: Record<number, [number, number]> = {
    1: [0, 20],
    2: [21, 69],
    3: [70, 99],
    4: [100, 999],
    5: [1000, 999_999],
    6: [1_000_000, 999_999_999],
  };

  it.each([1, 2, 3, 4, 5, 6])('tier %i stays in range', (tier) => {
    const [min, max] = ranges[tier];
    for (let i = 0; i < 300; i++) {
      const n = Number(generateCardinal('fr-CA', tier, rng).answer);
      expect(n).toBeGreaterThanOrEqual(min);
      expect(n).toBeLessThanOrEqual(max);
    }
  });

  it('tier 7 mixes every range from tier 1 to 6', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) {
      const n = Number(generateCardinal('fr-CA', 7, rng).answer);
      const tier = Object.entries(ranges).find(([, [min, max]]) => n >= min && n <= max)![0];
      seen.add(Number(tier));
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('tier 6 has at most 3 significant digits', () => {
    for (let i = 0; i < 300; i++) {
      const digits = generateCardinal('en', 6, rng).answer.replace(/0+$/, '');
      expect(digits.length).toBeLessThanOrEqual(3);
    }
  });
});

describe('tierCount', () => {
  it.each<[PracticeLang, QuestionType, TimeFormat, number]>([
    ['fr-CA', 'cardinal', '24h', 7],
    ['fr-CA', 'year', '24h', 4],
    ['fr-CA', 'phone', '24h', 4],
    ['fr-CA', 'time', '24h', 2],
    ['fr-CA', 'time', '12h', 3],
    ['en', 'time', '24h', 3], // English always uses 12h
  ])('%s %s %s → %i', (lang, type, format, expected) => {
    expect(tierCount(lang, type, format)).toBe(expected);
  });
});

describe('generateQuestion', () => {
  const rng = seededRng(99);
  const langs: PracticeLang[] = ['fr-CA', 'en'];
  const types: QuestionType[] = ['cardinal', 'year', 'phone', 'time'];
  const formats: TimeFormat[] = ['12h', '24h'];

  it('produces a complete question for every lang/type/tier/format', () => {
    for (const lang of langs) {
      for (const type of types) {
        for (const timeFormat of formats) {
          const count = tierCount(lang, type, timeFormat);
          for (let tier = 1; tier <= count; tier++) {
            for (let i = 0; i < 20; i++) {
              const q = generateQuestion({ lang, type, tier, timeFormat }, rng);
              expect(q).toMatchObject({ lang, type, tier });
              expect(q.id).toBeTruthy();
              expect(q.display).toBeTruthy();
              expect(q.tts).toBe(deriveTts(q.display));
              expect(q.answer).toMatch(type === 'time' ? /^\d\d:\d\d$/ : /^\d+$/);
            }
          }
        }
      }
    }
  });

  it('records the effective time format on time questions only', () => {
    expect(generateQuestion({ lang: 'en', type: 'time', tier: 1, timeFormat: '24h' }, rng).timeFormat).toBe('12h');
    expect(generateQuestion({ lang: 'fr-CA', type: 'time', tier: 1, timeFormat: '24h' }, rng).timeFormat).toBe('24h');
    expect(generateQuestion({ lang: 'fr-CA', type: 'year', tier: 1, timeFormat: '24h' }, rng).timeFormat).toBeUndefined();
  });

  it('rejects tiers out of range', () => {
    expect(() => generateQuestion({ lang: 'fr-CA', type: 'time', tier: 3, timeFormat: '24h' }, rng)).toThrow(RangeError);
    expect(() => generateQuestion({ lang: 'fr-CA', type: 'cardinal', tier: 0, timeFormat: '24h' }, rng)).toThrow(RangeError);
  });

  it('is reproducible with the same seed', () => {
    const params = { lang: 'fr-CA', type: 'phone', tier: 3, timeFormat: '24h' } as const;
    expect(generateQuestion(params, seededRng(5))).toEqual(generateQuestion(params, seededRng(5)));
  });
});

describe('deriveTts', () => {
  it('replaces hyphens with spaces', () => {
    expect(deriveTts('quatre-vingt-dix-sept')).toBe('quatre vingt dix sept');
    expect(deriveTts("deux heures de l'après-midi")).toBe("deux heures de l'après midi");
  });
  it('keeps commas for phone pauses', () => {
    expect(deriveTts('cinq un quatre, zéro un, soixante-douze')).toBe('cinq un quatre, zéro un, soixante douze');
  });
});
