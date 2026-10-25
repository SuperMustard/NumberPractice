import { describe, expect, it } from 'vitest';
import { enCardinal } from '../src/numbers/en';

describe('enCardinal', () => {
  it.each<[number, string]>([
    // DESIGN.md §14
    [21, 'twenty-one'],
    [101, 'one hundred one'],
    // extra
    [0, 'zero'],
    [13, 'thirteen'],
    [40, 'forty'],
    [99, 'ninety-nine'],
    [100, 'one hundred'],
    [123, 'one hundred twenty-three'],
    [1000, 'one thousand'],
    [1042, 'one thousand forty-two'],
    [20005, 'twenty thousand five'],
    [999999, 'nine hundred ninety-nine thousand nine hundred ninety-nine'],
    [1000000, 'one million'],
    [3450000, 'three million four hundred fifty thousand'],
  ])('%i → %s', (n, expected) => {
    expect(enCardinal(n)).toBe(expected);
  });

  it.each([-1, 2.5, 1_000_000_000])('rejects %s', (n) => {
    expect(() => enCardinal(n)).toThrow(RangeError);
  });
});
