// Integer → French words, Quebec usage, traditional spelling (DESIGN.md §6).
// Hyphens only between tens and units; soixante-dix / quatre-vingt-dix (no septante/nonante).

const UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf',
];

const TENS: Record<number, string> = {
  2: 'vingt',
  3: 'trente',
  4: 'quarante',
  5: 'cinquante',
  6: 'soixante',
};

export const FR_MAX = 999_999_999;

/**
 * 1–99. `plural` controls the s on a final quatre-vingt(s): true at the end of
 * a number or before million(s), false before mille.
 */
function below100(n: number, plural: boolean): string {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t <= 6) {
    if (u === 0) return TENS[t];
    if (u === 1) return `${TENS[t]} et un`;
    return `${TENS[t]}-${UNITS[u]}`;
  }
  if (t === 7) {
    if (u === 1) return 'soixante et onze';
    return `soixante-${UNITS[10 + u]}`;
  }
  if (t === 8) {
    if (u === 0) return plural ? 'quatre-vingts' : 'quatre-vingt';
    return `quatre-vingt-${UNITS[u]}`;
  }
  return `quatre-vingt-${UNITS[10 + u]}`;
}

/** 1–999. Same `plural` rule applies to a final multiplied cent(s). */
function below1000(n: number, plural: boolean): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h === 0) return below100(r, plural);
  const hundred = h === 1 ? 'cent' : `${UNITS[h]} cent${r === 0 && plural ? 's' : ''}`;
  return r === 0 ? hundred : `${hundred} ${below100(r, plural)}`;
}

export function frCardinal(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > FR_MAX) {
    throw new RangeError(`frCardinal: unsupported number ${n}`);
  }
  if (n === 0) return UNITS[0];

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor(n / 1000) % 1000;
  const rest = n % 1000;
  const parts: string[] = [];

  if (millions) {
    parts.push(millions === 1 ? 'un million' : `${below1000(millions, true)} millions`);
  }
  if (thousands) {
    // mille is invariable and never preceded by "un"
    parts.push(thousands === 1 ? 'mille' : `${below1000(thousands, false)} mille`);
  }
  if (rest) {
    parts.push(below1000(rest, true));
  }
  return parts.join(' ');
}
