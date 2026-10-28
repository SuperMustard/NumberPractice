import { describe, expect, it } from 'vitest';
import { generateCardinal } from '../src/generators/cardinal';
import { generateQuestion, tierCount } from '../src/generators';
import { seededRng } from '../src/random';
import { deriveTts } from '../src/speech/tts-text';
import type { TimeStyleSetting } from '../src/settings';
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

  it('tier 6 has at most 3 significant digits', () => {
    for (let i = 0; i < 300; i++) {
      const digits = generateCardinal('en', 6, rng).answer.replace(/0+$/, '');
      expect(digits.length).toBeLessThanOrEqual(3);
    }
  });
});

describe('tierCount', () => {
  it.each<[QuestionType, number]>([
    ['cardinal', 6],
    ['year', 4],
    ['phone', 4],
    ['time', 3],
  ])('%s → %i', (type, expected) => {
    expect(tierCount(type)).toBe(expected);
  });
});

describe('generateQuestion', () => {
  const rng = seededRng(99);
  const langs: PracticeLang[] = ['fr-CA', 'en'];
  const types: QuestionType[] = ['cardinal', 'year', 'phone', 'time'];
  const formats: TimeFormat[] = ['12h', '24h'];
  const styles: TimeStyleSetting[] = ['digits', 'colloquial', 'mixed'];

  it('produces a complete question for every lang/type/tier/format/style', () => {
    for (const lang of langs) {
      for (const type of types) {
        for (const timeFormat of formats) {
          for (const timeStyle of styles) {
            for (let tier = 1; tier <= tierCount(type); tier++) {
              for (let i = 0; i < 10; i++) {
                const q = generateQuestion({ lang, type, tier, timeFormat, timeStyle }, rng);
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
    }
  });

  const base = { tier: 1, timeFormat: '24h', timeStyle: 'digits' } as const;

  it('records the effective time format and style on time questions only', () => {
    expect(generateQuestion({ ...base, lang: 'en', type: 'time' }, rng).timeFormat).toBe('12h');
    expect(generateQuestion({ ...base, lang: 'fr-CA', type: 'time' }, rng)).toMatchObject({
      timeFormat: '24h',
      timeStyle: 'digits',
    });
    const year = generateQuestion({ ...base, lang: 'fr-CA', type: 'year' }, rng);
    expect(year.timeFormat).toBeUndefined();
    expect(year.timeStyle).toBeUndefined();
  });

  it('mixed style resolves to both styles, never to "mixed"', () => {
    const seen = new Set<string | undefined>();
    for (let i = 0; i < 100; i++) {
      seen.add(generateQuestion({ ...base, lang: 'fr-CA', type: 'time', timeStyle: 'mixed' }, rng).timeStyle);
    }
    expect([...seen].sort()).toEqual(['colloquial', 'digits']);
  });

  it('rejects tiers out of range', () => {
    expect(() => generateQuestion({ ...base, lang: 'fr-CA', type: 'time', tier: 4 }, rng)).toThrow(RangeError);
    expect(() => generateQuestion({ ...base, lang: 'fr-CA', type: 'cardinal', tier: 0 }, rng)).toThrow(RangeError);
  });

  it('is reproducible with the same seed', () => {
    const params = { ...base, lang: 'fr-CA', type: 'phone', tier: 3 } as const;
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
