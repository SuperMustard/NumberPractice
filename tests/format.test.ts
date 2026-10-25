import { describe, expect, it } from 'vitest';
import { formatAnswer, groupBreaks, groupDigits } from '../src/ui/format';

describe('groupBreaks', () => {
  it.each<[Parameters<typeof groupBreaks>[0], number, number[]]>([
    ['phone', 7, [3]],
    ['phone', 10, [3, 6]],
    ['phone', 11, [1, 4, 7]],
    ['phone', 9, []],
    ['cardinal', 3, []],
    ['cardinal', 4, [1]],
    ['cardinal', 7, [1, 4]],
    ['cardinal', 9, [3, 6]],
    ['year', 4, []],
    ['time', 5, []],
  ])('%s of length %i → %o', (type, length, expected) => {
    expect([...groupBreaks(type, length)].sort((a, b) => a - b)).toEqual(expected);
  });
});

describe('groupDigits', () => {
  it.each<[string, string]>([
    ['0', '0'],
    ['999', '999'],
    ['1000', '1,000'],
    ['3450000', '3,450,000'],
  ])('%s → %s', (input, expected) => {
    expect(groupDigits(input, ',')).toBe(expected);
  });
});

describe('formatAnswer', () => {
  it('groups cardinals by practice language', () => {
    expect(formatAnswer({ type: 'cardinal', answer: '3450000', lang: 'fr-CA' })).toBe('3 450 000');
    expect(formatAnswer({ type: 'cardinal', answer: '3450000', lang: 'en' })).toBe('3,450,000');
  });

  it('leaves years and times alone', () => {
    expect(formatAnswer({ type: 'year', answer: '1984', lang: 'en' })).toBe('1984');
    expect(formatAnswer({ type: 'time', answer: '14:15', lang: 'fr-CA' })).toBe('14:15');
  });

  it.each<[string, string]>([
    ['5550172', '555-0172'],
    ['5145550172', '514 555-0172'],
    ['18005550172', '1 800 555-0172'],
  ])('phone %s → %s', (answer, expected) => {
    expect(formatAnswer({ type: 'phone', answer, lang: 'fr-CA' })).toBe(expected);
  });
});
