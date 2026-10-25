import { cardinalWords } from '../numbers';
import { type Rng, randInt } from '../random';
import type { PracticeLang, QuestionBody } from '../types';

// DESIGN.md §5.1
const RANGES: Record<number, [number, number]> = {
  1: [0, 20],
  2: [21, 69],
  3: [70, 99],
  4: [100, 999],
  5: [1000, 999_999],
};

export const CARDINAL_TIERS = 7;

/** Tier 7 draws each question from a random tier 1–6, so every range is equally likely. */
const MIXED_TIER = 7;

/** Tier 6: 1 000 000–999 000 000 with 2–3 significant digits, e.g. 3 450 000. */
function roundMillions(rng: Rng): number {
  const digits = randInt(rng, 2, 3);
  const magnitude = randInt(rng, 6, 8); // 10^6 … 10^8
  const mantissa = randInt(rng, 10 ** (digits - 1), 10 ** digits - 1);
  return mantissa * 10 ** (magnitude - digits + 1);
}

export function generateCardinal(lang: PracticeLang, tier: number, rng: Rng): QuestionBody {
  if (tier === MIXED_TIER) return generateCardinal(lang, randInt(rng, 1, MIXED_TIER - 1), rng);
  const n = tier === 6 ? roundMillions(rng) : randInt(rng, ...RANGES[tier]);
  return { answer: String(n), display: cardinalWords(lang, n) };
}
