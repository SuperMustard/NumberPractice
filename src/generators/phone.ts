import { enCardinal } from '../numbers/en';
import { frCardinal } from '../numbers/fr-CA';
import { type Rng, pick, randInt } from '../random';
import type { PracticeLang, QuestionBody } from '../types';

// DESIGN.md §5.3 and §17.
// ⚠️ Tier 3 pair reading and tier 4 "un huit cents" still need checking against
// real Quebec usage; all reading rules live in the small functions below.

export const QC_AREA_CODES = ['514', '438', '450', '579', '418', '581', '819', '873'] as const;

export const PHONE_TIERS = 4;

export interface PhoneParts {
  /** Area code, or "800" for tier 4 */
  area: string;
  exchange: string;
  line: string;
}

/** NANP exchange: first digit 2–9, and not an N11 service code (411, 911…). */
function randomExchange(rng: Rng): string {
  for (;;) {
    const d = [randInt(rng, 2, 9), randInt(rng, 0, 9), randInt(rng, 0, 9)];
    if (!(d[1] === 1 && d[2] === 1)) return d.join('');
  }
}

function randomLine(rng: Rng): string {
  return String(randInt(rng, 0, 9999)).padStart(4, '0');
}

export function randomPhoneParts(tier: number, rng: Rng): PhoneParts {
  const area = tier === 4 ? '800' : pick(rng, QC_AREA_CODES);
  return { area, exchange: randomExchange(rng), line: randomLine(rng) };
}

export function phoneAnswer(tier: number, p: PhoneParts): string {
  if (tier === 1) return p.exchange + p.line;
  if (tier === 4) return `1${p.area}${p.exchange}${p.line}`;
  return p.area + p.exchange + p.line;
}

// --- French readings ---

function frDigits(s: string): string {
  return [...s].map((d) => frCardinal(Number(d))).join(' ');
}

/** Two-digit group: "72" → soixante-douze; leading zero → digit by digit ("01" → zéro un). */
function frPair(s: string): string {
  return s[0] === '0' ? frDigits(s) : frCardinal(Number(s));
}

export function frPhone(tier: number, p: PhoneParts): string {
  switch (tier) {
    case 1:
      return [frDigits(p.exchange), frDigits(p.line)].join(', ');
    case 2:
      return [frDigits(p.area), frDigits(p.exchange), frDigits(p.line)].join(', ');
    case 3:
      return [
        frDigits(p.area),
        frDigits(p.exchange),
        frPair(p.line.slice(0, 2)),
        frPair(p.line.slice(2)),
      ].join(', ');
    default:
      return ['un huit cents', frDigits(p.exchange), frDigits(p.line)].join(', ');
  }
}

// --- English readings ---

export type EnZero = 'zero' | 'oh';

function enDigits(s: string, zero: EnZero): string {
  return [...s].map((d) => (d === '0' ? zero : enCardinal(Number(d)))).join(' ');
}

/** English reads every tier digit by digit (tier 3 = tier 2, see §17). */
export function enPhone(tier: number, p: PhoneParts, zero: EnZero): string {
  switch (tier) {
    case 1:
      return [enDigits(p.exchange, zero), enDigits(p.line, zero)].join(', ');
    case 4:
      return ['one eight hundred', enDigits(p.exchange, zero), enDigits(p.line, zero)].join(', ');
    default:
      return [enDigits(p.area, zero), enDigits(p.exchange, zero), enDigits(p.line, zero)].join(', ');
  }
}

export function generatePhone(lang: PracticeLang, tier: number, rng: Rng): QuestionBody {
  const parts = randomPhoneParts(tier, rng);
  const display =
    lang === 'fr-CA' ? frPhone(tier, parts) : enPhone(tier, parts, pick(rng, ['zero', 'oh'] as const));
  return {
    answer: phoneAnswer(tier, parts),
    display,
    ...(tier === 1 && { rateFactor: 0.9 }),
  };
}
