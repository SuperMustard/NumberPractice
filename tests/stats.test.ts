import { describe, expect, it } from 'vitest';
import {
  type AnswerInput,
  MAX_MISTAKES,
  STATS_KEY,
  bucketKey,
  emptyStats,
  loadStats,
  parseBucketKey,
  parseStats,
  recordAnswer,
  saveStats,
  summarize,
} from '../src/stats';

type AnswerOverrides = Partial<Omit<AnswerInput, 'question'>> & { question?: Partial<AnswerInput['question']> };

const answer = (over: AnswerOverrides = {}): AnswerInput => ({
  input: '20',
  correct: true,
  replays: 0,
  responseMs: 1000,
  ...over,
  question: { lang: 'fr-CA', type: 'cardinal', tier: 1, answer: '20', ...over.question },
});

describe('bucketKey', () => {
  it('uses lang:type:tier', () => {
    expect(bucketKey({ lang: 'fr-CA', type: 'cardinal', tier: 3 })).toBe('fr-CA:cardinal:3');
  });
  it('adds the time format and style for time questions', () => {
    expect(bucketKey({ lang: 'en', type: 'time', tier: 1, timeFormat: '12h', timeStyle: 'colloquial' })).toBe(
      'en:time:12h:colloquial:1',
    );
  });
  it.each(['fr-CA:cardinal:3', 'en:time:12h:digits:1', 'fr-CA:time:24h:colloquial:2', 'fr-CA:phone:4'])('%s round-trips', (key) => {
    expect(bucketKey(parseBucketKey(key)!)).toBe(key);
  });
  it.each(['de:cardinal:1', 'fr-CA:price:1', 'fr-CA:time:1', 'fr-CA:time:9h:1', 'fr-CA:time:12h:1', 'fr-CA:time:12h:mixed:1', 'fr-CA:year:x', 'fr-CA:year:1:2'])(
    'rejects %s',
    (key) => {
      expect(parseBucketKey(key)).toBeNull();
    },
  );
});

describe('recordAnswer', () => {
  it('counts a first-listen correct answer', () => {
    const s = recordAnswer(emptyStats(), answer(), 1);
    expect(s.buckets['fr-CA:cardinal:1']).toEqual({
      answered: 1,
      correct: 1,
      correctNoReplay: 1,
      totalReplays: 0,
      totalResponseMs: 1000,
      timedCount: 1,
    });
    expect(s.mistakes).toEqual([]);
  });

  it('counts replays and wrong answers, and logs the mistake', () => {
    let s = recordAnswer(emptyStats(), answer({ replays: 2 }), 1);
    s = recordAnswer(s, answer({ correct: false, input: '12', replays: 1 }), 2);
    expect(s.buckets['fr-CA:cardinal:1']).toMatchObject({
      answered: 2,
      correct: 1,
      correctNoReplay: 0,
      totalReplays: 3,
    });
    expect(s.mistakes).toEqual([{ lang: 'fr-CA', type: 'cardinal', tier: 1, answer: '20', input: '12', ts: 2 }]);
  });

  it('skips missing response times without skewing the average', () => {
    let s = recordAnswer(emptyStats(), answer({ responseMs: 2000 }), 1);
    s = recordAnswer(s, answer({ responseMs: null }), 2);
    const sum = summarize(s.buckets['fr-CA:cardinal:1']);
    expect(sum.answered).toBe(2);
    expect(sum.avgResponseMs).toBe(2000);
  });

  it('keeps time formats and styles apart', () => {
    const time = { type: 'time', answer: '14:00' } as const;
    let s = recordAnswer(emptyStats(), answer({ question: { ...time, timeFormat: '12h', timeStyle: 'digits' } }), 1);
    s = recordAnswer(s, answer({ question: { ...time, timeFormat: '24h', timeStyle: 'digits' } }), 2);
    s = recordAnswer(s, answer({ question: { ...time, timeFormat: '24h', timeStyle: 'colloquial' }, correct: false }), 3);
    expect(Object.keys(s.buckets).sort()).toEqual([
      'fr-CA:time:12h:digits:1',
      'fr-CA:time:24h:colloquial:1',
      'fr-CA:time:24h:digits:1',
    ]);
    expect(s.mistakes[0]).toMatchObject({ timeFormat: '24h', timeStyle: 'colloquial' });
  });

  it(`keeps only the newest ${MAX_MISTAKES} mistakes`, () => {
    let s = emptyStats();
    for (let i = 0; i < MAX_MISTAKES + 5; i++) s = recordAnswer(s, answer({ correct: false }), i);
    expect(s.mistakes).toHaveLength(MAX_MISTAKES);
    expect(s.mistakes[0].ts).toBe(5);
    expect(s.mistakes.at(-1)!.ts).toBe(MAX_MISTAKES + 4);
  });

  it('does not mutate its input', () => {
    const before = emptyStats();
    recordAnswer(before, answer({ correct: false }), 1);
    expect(before).toEqual(emptyStats());
  });
});

describe('summarize', () => {
  it('computes rates and averages', () => {
    expect(
      summarize({ answered: 4, correct: 3, correctNoReplay: 2, totalReplays: 6, totalResponseMs: 3000, timedCount: 2 }),
    ).toEqual({ answered: 4, accuracy: 0.75, firstListenRate: 0.5, avgReplays: 1.5, avgResponseMs: 1500 });
  });
});

describe('parseStats', () => {
  it('drops malformed buckets and mistakes but keeps the rest', () => {
    const good = { answered: 1, correct: 1, correctNoReplay: 1, totalReplays: 0, totalResponseMs: 5, timedCount: 1 };
    const s = parseStats({
      buckets: { 'fr-CA:cardinal:1': good, 'bad:key': good, 'en:year:2': { answered: 'x' } },
      mistakes: [
        { lang: 'en', type: 'year', tier: 2, answer: '1984', input: '1948', ts: 9 },
        { lang: 'xx', type: 'year', tier: 2, answer: '1', input: '2', ts: 9 },
        null,
      ],
    });
    expect(s.buckets).toEqual({ 'fr-CA:cardinal:1': good });
    expect(s.mistakes).toHaveLength(1);
  });

  it('migrates time stats saved before the style option', () => {
    const b = (n: number) => ({ answered: n, correct: n, correctNoReplay: 0, totalReplays: 0, totalResponseMs: 0, timedCount: 0 });
    const s = parseStats({
      buckets: { 'fr-CA:time:12h:1': b(1), 'fr-CA:time:12h:2': b(2), 'fr-CA:time:12h:3': b(3), 'fr-CA:time:24h:2': b(4) },
      mistakes: [
        { lang: 'fr-CA', type: 'time', tier: 3, timeFormat: '12h', answer: '14:45', input: '14:15', ts: 1 },
        { lang: 'fr-CA', type: 'time', tier: 2, timeFormat: '24h', answer: '14:37', input: '14:47', ts: 2 },
      ],
    });
    expect(s.buckets).toEqual({
      'fr-CA:time:12h:digits:1': b(1),
      'fr-CA:time:12h:digits:3': b(2),
      'fr-CA:time:12h:colloquial:2': b(3),
      'fr-CA:time:24h:digits:3': b(4),
    });
    expect(s.mistakes.map((m) => [m.tier, m.timeStyle])).toEqual([
      [2, 'colloquial'],
      [3, 'digits'],
    ]);
  });

  it('handles junk', () => {
    expect(parseStats(null)).toEqual(emptyStats());
    expect(parseStats([1, 2])).toEqual(emptyStats());
  });
});

describe('load / save', () => {
  it('round-trips through storage', () => {
    const data: Record<string, string> = {};
    const storage = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
    const s = recordAnswer(emptyStats(), answer({ correct: false }), 42);
    saveStats(s, storage);
    expect(data[STATS_KEY]).toBeDefined();
    expect(loadStats(storage)).toEqual(s);
  });

  it('falls back to empty stats on corrupt data', () => {
    expect(loadStats({ getItem: () => '{nope', setItem: () => {} })).toEqual(emptyStats());
    expect(loadStats(null)).toEqual(emptyStats());
  });
});
