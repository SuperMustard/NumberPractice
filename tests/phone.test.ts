import { describe, expect, it } from 'vitest';
import {
  QC_AREA_CODES,
  enPhone,
  frPhone,
  generatePhone,
  phoneAnswer,
  randomPhoneParts,
  type PhoneParts,
} from '../src/generators/phone';
import { seededRng } from '../src/random';

const sample: PhoneParts = { area: '514', exchange: '555', line: '0172' };
const tollFree: PhoneParts = { area: '800', exchange: '555', line: '0172' };

describe('phoneAnswer', () => {
  it('tier 1 is the 7-digit local number', () => {
    expect(phoneAnswer(1, sample)).toBe('5550172');
  });
  it('tiers 2–3 are 10 digits without the leading 1', () => {
    expect(phoneAnswer(2, sample)).toBe('5145550172');
    expect(phoneAnswer(3, sample)).toBe('5145550172');
  });
  it('tier 4 keeps the 1 of 1 800', () => {
    expect(phoneAnswer(4, tollFree)).toBe('18005550172');
  });
});

describe('frPhone', () => {
  it.each<[number, PhoneParts, string]>([
    [1, sample, 'cinq cinq cinq, zéro un sept deux'],
    [2, sample, 'cinq un quatre, cinq cinq cinq, zéro un sept deux'],
    [3, sample, 'cinq un quatre, cinq cinq cinq, zéro un, soixante-douze'],
    [3, { area: '418', exchange: '692', line: '8100' }, 'quatre un huit, six neuf deux, quatre-vingt-un, zéro zéro'],
    [4, tollFree, 'un huit cents, cinq cinq cinq, zéro un sept deux'],
  ])('tier %i %o', (tier, parts, expected) => {
    expect(frPhone(tier, parts)).toBe(expected);
  });
});

describe('enPhone', () => {
  it('reads digits with the chosen zero word', () => {
    expect(enPhone(2, sample, 'oh')).toBe('five one four, five five five, oh one seven two');
    expect(enPhone(2, sample, 'zero')).toBe('five one four, five five five, zero one seven two');
  });
  it('tier 3 reads like tier 2', () => {
    expect(enPhone(3, sample, 'oh')).toBe(enPhone(2, sample, 'oh'));
  });
  it('tier 4 says one eight hundred', () => {
    expect(enPhone(4, tollFree, 'oh')).toBe('one eight hundred, five five five, oh one seven two');
  });
  it('tier 1 omits the area code', () => {
    expect(enPhone(1, sample, 'zero')).toBe('five five five, zero one seven two');
  });
});

describe('random phone numbers', () => {
  const rng = seededRng(7);

  it('use a Quebec area code and a valid NANP exchange', () => {
    for (let i = 0; i < 500; i++) {
      const p = randomPhoneParts(2, rng);
      expect(QC_AREA_CODES).toContain(p.area);
      expect(p.exchange).toMatch(/^[2-9]\d\d$/);
      expect(p.exchange.slice(1)).not.toBe('11');
      expect(p.line).toMatch(/^\d{4}$/);
    }
  });

  it('answer lengths match the tier', () => {
    const lengths: Record<number, number> = { 1: 7, 2: 10, 3: 10, 4: 11 };
    for (const tier of [1, 2, 3, 4]) {
      for (const lang of ['fr-CA', 'en'] as const) {
        expect(generatePhone(lang, tier, rng).answer).toHaveLength(lengths[tier]);
      }
    }
  });

  it('tier 1 is read a bit slower', () => {
    expect(generatePhone('fr-CA', 1, rng).rateFactor).toBe(0.9);
    expect(generatePhone('fr-CA', 2, rng).rateFactor).toBeUndefined();
  });
});
