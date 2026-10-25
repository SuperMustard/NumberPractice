import type { Question } from '../types';

/** Thousands separators: narrow no-break space in French, comma in English. */
export function groupDigits(digits: string, sep: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/**
 * Positions (0-based) before which a visual gap goes when comparing digit by digit,
 * matching formatAnswer's grouping: 514|555|0172, 3|450|000.
 */
export function groupBreaks(type: Question['type'], length: number): Set<number> {
  const breaks = new Set<number>();
  if (type === 'phone') {
    const at: Record<number, number[]> = { 7: [3], 10: [3, 6], 11: [1, 4, 7] };
    for (const i of at[length] ?? []) breaks.add(i);
  } else if (type === 'cardinal' && length >= 4) {
    for (let i = length - 3; i > 0; i -= 3) breaks.add(i);
  }
  return breaks;
}

/** Human-friendly form of the canonical answer, e.g. 5145550172 → 514 555-0172. */
export function formatAnswer(q: Pick<Question, 'type' | 'answer' | 'lang'>): string {
  const a = q.answer;
  switch (q.type) {
    case 'cardinal':
      return groupDigits(a, q.lang === 'fr-CA' ? ' ' : ',');
    case 'year':
    case 'time':
      return a;
    case 'phone':
      if (a.length === 7) return `${a.slice(0, 3)}-${a.slice(3)}`;
      if (a.length === 10) return `${a.slice(0, 3)} ${a.slice(3, 6)}-${a.slice(6)}`;
      if (a.length === 11) return `${a[0]} ${a.slice(1, 4)} ${a.slice(4, 7)}-${a.slice(7)}`;
      return a;
  }
}
