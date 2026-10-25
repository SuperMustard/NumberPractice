import { formatHHMM } from './generators/time';
import type { QuestionType } from './types';

// DESIGN.md §7 and §17.

const UNICODE_SPACES = /[   ]/g;

export function isBlank(input: string): boolean {
  return input.replace(UNICODE_SPACES, ' ').trim() === '';
}

/** cardinal / year: drop spaces (incl. NBSP / narrow NBSP), commas and periods. */
function normalizeNumber(input: string): string {
  const s = input.replace(UNICODE_SPACES, '').replace(/[\s,.]/g, '');
  // "020" means 20; keep a lone "0"
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s;
}

/**
 * Phone: digits only. The leading 1 is optional on input — it is added or dropped
 * to match the answer, so "800 555-0172" counts for 18005550172 and
 * "1 514 555-0172" counts for 5145550172.
 */
function normalizePhone(input: string, answer: string): string {
  const digits = input.replace(/\D/g, '');
  if (answer.length === 11 && answer[0] === '1' && digits.length === 10) return `1${digits}`;
  if (answer.length === 10 && digits.length === 11 && digits[0] === '1') return digits.slice(1);
  return digits;
}

const AM_PM = /\s*([ap])\.?\s*m\.?$/;

/**
 * Time → "HH:MM" (24h), or null if it can't be parsed.
 * Accepts 14:15, 14h15, 14 h 15, 14.15, 1415, 915, 9h, 14, 24:00, and an am/pm suffix
 * (am, a.m., PM, p.m.). Without am/pm the hour is read as 24h: "2:15" is 02:15.
 */
export function parseTime(input: string): string | null {
  let s = input.replace(UNICODE_SPACES, ' ').trim().toLowerCase();

  let meridiem: 'a' | 'p' | null = null;
  const mer = AM_PM.exec(s);
  if (mer) {
    meridiem = mer[1] as 'a' | 'p';
    s = s.slice(0, mer.index).trim();
  }

  let h: number;
  let m: number;
  let match: RegExpExecArray | null;
  if ((match = /^(\d{1,2})\s*[:h.]\s*(\d{2})$/.exec(s))) {
    h = Number(match[1]);
    m = Number(match[2]);
  } else if ((match = /^(\d{1,2})\s*h?$/.exec(s))) {
    h = Number(match[1]);
    m = 0;
  } else if ((match = /^(\d{1,2})(\d{2})$/.exec(s))) {
    h = Number(match[1]);
    m = Number(match[2]);
  } else {
    return null;
  }

  if (m > 59) return null;

  if (meridiem) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (meridiem === 'p' ? 12 : 0);
  } else if (h === 24 && m === 0) {
    h = 0;
  } else if (h > 23) {
    return null;
  }

  return formatHHMM(h, m);
}

/** Normalized input in the same shape as the answer; null if it can't be parsed. */
export function normalizeInput(type: QuestionType, input: string, answer: string): string | null {
  switch (type) {
    case 'cardinal':
    case 'year':
      return normalizeNumber(input);
    case 'phone':
      return normalizePhone(input, answer);
    case 'time':
      return parseTime(input);
  }
}

export interface DiffChar {
  /** Character the user typed (normalized) */
  actual: string;
  expected: string;
  ok: boolean;
}

export interface CheckResult {
  correct: boolean;
  normalized: string | null;
  /**
   * Position-by-position comparison when the normalized input and the answer have
   * the same length; null means show the two side by side instead.
   */
  diff: DiffChar[] | null;
}

export function checkAnswer(q: { type: QuestionType; answer: string }, input: string): CheckResult {
  const normalized = normalizeInput(q.type, input, q.answer);
  const correct = normalized === q.answer;
  const diff =
    normalized !== null && normalized.length === q.answer.length
      ? [...q.answer].map((expected, i) => ({ actual: normalized[i], expected, ok: normalized[i] === expected }))
      : null;
  return { correct, normalized, diff };
}
