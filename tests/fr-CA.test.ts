import { describe, expect, it } from 'vitest';
import { frCardinal } from '../src/numbers/fr-CA';

describe('frCardinal — DESIGN.md §14', () => {
  it.each<[number, string]>([
    [0, 'zéro'],
    [16, 'seize'],
    [17, 'dix-sept'],
    [21, 'vingt et un'],
    [22, 'vingt-deux'],
    [61, 'soixante et un'],
    [70, 'soixante-dix'],
    [71, 'soixante et onze'],
    [77, 'soixante-dix-sept'],
    [80, 'quatre-vingts'],
    [81, 'quatre-vingt-un'],
    [91, 'quatre-vingt-onze'],
    [99, 'quatre-vingt-dix-neuf'],
    [100, 'cent'],
    [101, 'cent un'],
    [200, 'deux cents'],
    [201, 'deux cent un'],
    [280, 'deux cent quatre-vingts'],
    [1000, 'mille'],
    [2000, 'deux mille'],
    [80000, 'quatre-vingt mille'],
    [200000, 'deux cent mille'],
    [1000000, 'un million'],
    [3450000, 'trois millions quatre cent cinquante mille'],
    [80000000, 'quatre-vingts millions'],
    [200000000, 'deux cents millions'],
  ])('%i → %s', (n, expected) => {
    expect(frCardinal(n)).toBe(expected);
  });
});

describe('frCardinal — extra cases', () => {
  it.each<[number, string]>([
    [1, 'un'],
    [10, 'dix'],
    [31, 'trente et un'],
    [41, 'quarante et un'],
    [51, 'cinquante et un'],
    [72, 'soixante-douze'],
    [79, 'soixante-dix-neuf'],
    [90, 'quatre-vingt-dix'],
    [180, 'cent quatre-vingts'],
    [999, 'neuf cent quatre-vingt-dix-neuf'],
    [1001, 'mille un'],
    [1100, 'mille cent'],
    [1984, 'mille neuf cent quatre-vingt-quatre'],
    [21000, 'vingt et un mille'],
    [280000, 'deux cent quatre-vingt mille'],
    [2000000, 'deux millions'],
    [1080000, 'un million quatre-vingt mille'],
    [999999999, 'neuf cent quatre-vingt-dix-neuf millions neuf cent quatre-vingt-dix-neuf mille neuf cent quatre-vingt-dix-neuf'],
  ])('%i → %s', (n, expected) => {
    expect(frCardinal(n)).toBe(expected);
  });

  it.each([-1, 1.5, 1_000_000_000, NaN])('rejects %s', (n) => {
    expect(() => frCardinal(n)).toThrow(RangeError);
  });
});
