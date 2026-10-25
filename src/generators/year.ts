import { enBelow100, enCardinal } from '../numbers/en';
import { frCardinal } from '../numbers/fr-CA';
import { type Rng, chance, pick, randInt } from '../random';
import type { PracticeLang, QuestionBody } from '../types';

// DESIGN.md §5.2
const RANGES: Record<number, [number, number]> = {
  1: [2000, 2030],
  2: [1900, 1999],
  3: [1000, 1899],
  4: [1100, 2030],
};

export const YEAR_TIERS = 4;

/**
 * French year. `colloquial` (1100–1999 only) gives "dix-neuf cent quatre-vingt-quatre";
 * otherwise the standard cardinal "mille neuf cent quatre-vingt-quatre".
 */
export function frYear(year: number, colloquial = false): string {
  if (!colloquial || year < 1100 || year > 1999) return frCardinal(year);
  const hundreds = Math.floor(year / 100);
  const rest = year % 100;
  const head = `${frCardinal(hundreds)} cent${rest === 0 ? 's' : ''}`;
  return rest === 0 ? head : `${head} ${frCardinal(rest)}`;
}

/** All acceptable English readings of a year; the generator picks one. */
export function enYearReadings(year: number): string[] {
  const hi = Math.floor(year / 100);
  const lo = year % 100;
  if (year >= 1100 && year <= 1999) {
    if (lo === 0) return [`${enBelow100(hi)} hundred`];
    if (lo < 10) return [`${enBelow100(hi)} oh ${enBelow100(lo)}`];
    return [`${enBelow100(hi)} ${enBelow100(lo)}`];
  }
  if (year >= 2010 && year <= 2099) {
    return [`twenty ${enBelow100(lo)}`, enCardinal(year)];
  }
  return [enCardinal(year)];
}

export function generateYear(lang: PracticeLang, tier: number, rng: Rng): QuestionBody {
  const year = randInt(rng, ...RANGES[tier]);
  const display =
    lang === 'fr-CA'
      ? frYear(year, tier === 4 && year < 2000 && chance(rng, 0.5))
      : pick(rng, enYearReadings(year));
  return { answer: String(year), display };
}
