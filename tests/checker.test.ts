import { describe, expect, it } from 'vitest';
import { checkAnswer, isBlank, normalizeInput, parseTime } from '../src/checker';

describe('cardinal / year — DESIGN.md §14', () => {
  it.each(['1 984', '1984', '1 984', '1 984', '1,984', '1.984'])('"%s" is 1984', (input) => {
    expect(checkAnswer({ type: 'year', answer: '1984' }, input).correct).toBe(true);
  });

  it('accepts big numbers with separators', () => {
    expect(checkAnswer({ type: 'cardinal', answer: '3450000' }, '3 450 000').correct).toBe(true);
    expect(checkAnswer({ type: 'cardinal', answer: '3450000' }, '3,450,000').correct).toBe(true);
  });

  it('ignores leading zeros but keeps a lone 0', () => {
    expect(normalizeInput('cardinal', '020', '20')).toBe('20');
    expect(normalizeInput('cardinal', '0', '0')).toBe('0');
  });

  it('rejects wrong numbers and non-digits', () => {
    expect(checkAnswer({ type: 'cardinal', answer: '80' }, '81').correct).toBe(false);
    expect(checkAnswer({ type: 'cardinal', answer: '80' }, '8o').correct).toBe(false);
  });
});

describe('phone — DESIGN.md §14 and §17', () => {
  it('keeps only digits', () => {
    expect(normalizeInput('phone', '(514) 555-0172', '5145550172')).toBe('5145550172');
    expect(checkAnswer({ type: 'phone', answer: '5145550172' }, '514.555.0172').correct).toBe(true);
  });

  it('makes the leading 1 optional', () => {
    expect(checkAnswer({ type: 'phone', answer: '18005550172' }, '800 555-0172').correct).toBe(true);
    expect(checkAnswer({ type: 'phone', answer: '18005550172' }, '1-800-555-0172').correct).toBe(true);
    expect(checkAnswer({ type: 'phone', answer: '5145550172' }, '1 514 555-0172').correct).toBe(true);
  });

  it('does not strip a 1 from a 7-digit answer', () => {
    expect(checkAnswer({ type: 'phone', answer: '5550172' }, '15550172').correct).toBe(false);
  });
});

describe('parseTime — DESIGN.md §14 and §17', () => {
  it.each(['14:15', '14h15', '14 h 15', '14H15', '1415', '14.15', '2:15 pm', '2:15 P.M.', '2:15pm', '2.15 p.m', ' 14:15 '])(
    '"%s" → 14:15',
    (input) => {
      expect(parseTime(input)).toBe('14:15');
    },
  );

  it.each<[string, string]>([
    ['2:15', '02:15'],
    ['9:05', '09:05'],
    ['9h', '09:00'],
    ['9 h', '09:00'],
    ['9', '09:00'],
    ['14', '14:00'],
    ['915', '09:15'],
    ['0:15', '00:15'],
    ['24:00', '00:00'],
    ['12 pm', '12:00'],
    ['12 am', '00:00'],
    ['12:30 a.m.', '00:30'],
    ['11 PM', '23:00'],
    ['7 am', '07:00'],
  ])('"%s" → %s', (input, expected) => {
    expect(parseTime(input)).toBe(expected);
  });

  it.each(['', 'abc', '25:00', '24:30', '14:60', '13 pm', '0 am', '12345', '1:5', '14:15:00'])('"%s" → null', (input) => {
    expect(parseTime(input)).toBeNull();
  });

  it('"2:15" is wrong when the answer is 14:15', () => {
    expect(checkAnswer({ type: 'time', answer: '14:15' }, '2:15').correct).toBe(false);
    expect(checkAnswer({ type: 'time', answer: '14:15' }, '2:15 pm').correct).toBe(true);
    expect(checkAnswer({ type: 'time', answer: '14:15' }, '14:15').correct).toBe(true);
  });
});

describe('diff', () => {
  it('compares position by position when lengths match', () => {
    const r = checkAnswer({ type: 'phone', answer: '5145550172' }, '514 555-0173');
    expect(r.correct).toBe(false);
    expect(r.diff).toHaveLength(10);
    expect(r.diff!.filter((c) => !c.ok)).toEqual([{ actual: '3', expected: '2', ok: false }]);
  });

  it('is null when lengths differ', () => {
    expect(checkAnswer({ type: 'cardinal', answer: '1984' }, '198').diff).toBeNull();
  });

  it('is null when a time cannot be parsed', () => {
    const r = checkAnswer({ type: 'time', answer: '14:15' }, 'quatorze');
    expect(r.normalized).toBeNull();
    expect(r.diff).toBeNull();
  });

  it('aligns times in HH:MM form', () => {
    const r = checkAnswer({ type: 'time', answer: '14:15' }, '14h45');
    expect(r.diff!.map((c) => c.ok)).toEqual([true, true, true, false, true]);
  });

  it('is all ok when correct', () => {
    expect(checkAnswer({ type: 'year', answer: '1984' }, '1 984').diff!.every((c) => c.ok)).toBe(true);
  });
});

describe('isBlank', () => {
  it.each(['', '   ', ' ', '\t'])('%j is blank', (s) => {
    expect(isBlank(s)).toBe(true);
  });
  it('"0" is not blank', () => {
    expect(isBlank('0')).toBe(false);
  });
});
