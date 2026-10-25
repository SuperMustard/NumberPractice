// Integer → English words (DESIGN.md §6): no "and", hyphens for 21–99.

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];

const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export const EN_MAX = 999_999_999;

/** 1–99 */
export function enBelow100(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? TENS[t] : `${TENS[t]}-${ONES[u]}`;
}

/** 1–999 */
function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h === 0) return enBelow100(r);
  const hundred = `${ONES[h]} hundred`;
  return r === 0 ? hundred : `${hundred} ${enBelow100(r)}`;
}

export function enCardinal(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > EN_MAX) {
    throw new RangeError(`enCardinal: unsupported number ${n}`);
  }
  if (n === 0) return ONES[0];

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor(n / 1000) % 1000;
  const rest = n % 1000;
  const parts: string[] = [];

  if (millions) parts.push(`${below1000(millions)} million`);
  if (thousands) parts.push(`${below1000(thousands)} thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(' ');
}
