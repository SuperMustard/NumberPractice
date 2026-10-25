import { enBelow100 } from '../numbers/en';
import { frCardinal } from '../numbers/fr-CA';
import { type Rng, pick, randInt } from '../random';
import type { PracticeLang, QuestionBody, TimeFormat } from '../types';

// DESIGN.md §5.4 and §17.

const FIVE_MINUTE_STEPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/** English has no 24h mode; asking for it falls back to 12h. */
export function effectiveTimeFormat(lang: PracticeLang, format: TimeFormat): TimeFormat {
  return lang === 'en' ? '12h' : format;
}

export function timeTierCount(lang: PracticeLang, format: TimeFormat): number {
  return effectiveTimeFormat(lang, format) === '24h' ? 2 : 3;
}

export function formatHHMM(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// --- French ---

/** heure and minute are feminine: un → une (une heure, vingt et une heures, neuf heures une). */
function fem(words: string): string {
  return words.replace(/(^| )un$/, '$1une');
}

export function frTime24(h: number, m: number): string {
  const hour = `${fem(frCardinal(h))} ${h <= 1 ? 'heure' : 'heures'}`;
  return m === 0 ? hour : `${hour} ${fem(frCardinal(m))}`;
}

function frHour12(spoken: number): string {
  if (spoken === 0) return 'minuit';
  if (spoken === 12) return 'midi';
  const h = spoken % 12;
  return h === 1 ? 'une heure' : `${frCardinal(h)} heures`;
}

/** Suffix is chosen by the hour actually spoken (11:45 → midi moins le quart). */
function frSuffix12(spoken: number): string {
  if (spoken === 0 || spoken === 12) return '';
  if (spoken < 12) return 'du matin';
  if (spoken < 18) return "de l'après-midi";
  return 'du soir';
}

/** 12h French. `colloquial` (tier 3) uses et quart / et demie / moins le quart / moins dix. */
export function frTime12(h: number, m: number, colloquial = false): string {
  let spoken = h;
  let minutes = m === 0 ? '' : fem(frCardinal(m));

  if (colloquial && m !== 0) {
    if (m >= 35) {
      spoken = (h + 1) % 24;
      minutes = m === 45 ? 'moins le quart' : `moins ${frCardinal(60 - m)}`;
    } else if (m === 15) {
      minutes = 'et quart';
    } else if (m === 30) {
      // demi after the masculine midi / minuit, demie after (feminine) heure(s)
      minutes = spoken % 12 === 0 ? 'et demi' : 'et demie';
    }
  }

  return [frHour12(spoken), minutes, frSuffix12(spoken)].filter(Boolean).join(' ');
}

// --- English ---

function enAmPm(h: number): string {
  return h < 12 ? 'a.m.' : 'p.m.';
}

function enHour12(h: number): string {
  return enBelow100(h % 12 || 12);
}

function enSuffix(spoken: number): string {
  if (spoken < 12) return 'in the morning';
  if (spoken < 18) return 'in the afternoon';
  return 'in the evening';
}

/** Tier 3: quarter past two, half past two, twenty to three, quarter to noon, half past midnight. */
function enColloquial(h: number, m: number): string {
  const to = m > 30;
  const spoken = to ? (h + 1) % 24 : h;
  const amount = m === 15 || m === 45 ? 'quarter' : m === 30 ? 'half' : enBelow100(to ? 60 - m : m);

  let hour: string;
  let suffix: string;
  if (spoken === 0) {
    hour = 'midnight';
    suffix = '';
  } else if (spoken === 12) {
    hour = to ? 'noon' : 'twelve';
    suffix = to ? '' : 'in the afternoon';
  } else {
    hour = enHour12(spoken);
    suffix = enSuffix(spoken);
  }
  return [amount, to ? 'to' : 'past', hour, suffix].filter(Boolean).join(' ');
}

/** 12h English. Only 12:00 / 00:00 are noon / midnight; with minutes it is "twelve fifteen p.m.". */
export function enTime12(h: number, m: number, colloquial = false): string {
  if (m === 0) {
    if (h === 0) return 'midnight';
    if (h === 12) return 'noon';
    return `${enHour12(h)} ${enAmPm(h)}`;
  }
  if (colloquial) return enColloquial(h, m);
  const minutes = m < 10 ? `oh ${enBelow100(m)}` : enBelow100(m);
  return `${enHour12(h)} ${minutes} ${enAmPm(h)}`;
}

// --- Generator ---

export function generateTime(
  lang: PracticeLang,
  tier: number,
  format: TimeFormat,
  rng: Rng,
): QuestionBody {
  const h = randInt(rng, 0, 23);
  const m = tier === 1 ? 0 : tier === 2 ? randInt(rng, 1, 59) : pick(rng, FIVE_MINUTE_STEPS);
  const colloquial = tier === 3;

  let display: string;
  if (lang === 'en') display = enTime12(h, m, colloquial);
  else if (format === '24h') display = frTime24(h, m);
  else display = frTime12(h, m, colloquial);

  return { answer: formatHHMM(h, m), display };
}
