import { PRACTICE_LANGS, QUESTION_TYPES, TIME_FORMATS, type StorageLike } from './settings';
import type { PracticeLang, Question, QuestionType, TimeFormat, TimeStyle } from './types';

// DESIGN.md §11 and §17. Only submitted questions are recorded; revealed ones never reach here.

export const STATS_KEY = 'nd.stats.v1';
export const MAX_MISTAKES = 200;

export interface Bucket {
  answered: number;
  correct: number;
  /** Correct without any replay */
  correctNoReplay: number;
  totalReplays: number;
  /** Sum of response times, over `timedCount` questions only */
  totalResponseMs: number;
  /** Questions that have a response time (first playback ended before submit) */
  timedCount: number;
}

export interface Mistake {
  lang: PracticeLang;
  type: QuestionType;
  tier: number;
  timeFormat?: TimeFormat;
  timeStyle?: TimeStyle;
  answer: string;
  input: string;
  ts: number;
}

export interface Stats {
  buckets: Record<string, Bucket>;
  /** Oldest first, at most MAX_MISTAKES */
  mistakes: Mistake[];
}

export interface AnswerInput {
  question: Pick<Question, 'lang' | 'type' | 'tier' | 'answer' | 'timeFormat' | 'timeStyle'>;
  input: string;
  correct: boolean;
  replays: number;
  responseMs: number | null;
}

export interface BucketId {
  lang: PracticeLang;
  type: QuestionType;
  tier: number;
  timeFormat?: TimeFormat;
  timeStyle?: TimeStyle;
}

const TIME_STYLES: readonly TimeStyle[] = ['digits', 'colloquial'];

export function emptyStats(): Stats {
  return { buckets: {}, mistakes: [] };
}

function emptyBucket(): Bucket {
  return { answered: 0, correct: 0, correctNoReplay: 0, totalReplays: 0, totalResponseMs: 0, timedCount: 0 };
}

/** `fr-CA:cardinal:3`, or `fr-CA:time:12h:colloquial:2` for time questions. */
export function bucketKey(id: BucketId): string {
  return id.type === 'time'
    ? `${id.lang}:time:${id.timeFormat ?? '24h'}:${id.timeStyle ?? 'digits'}:${id.tier}`
    : `${id.lang}:${id.type}:${id.tier}`;
}

/**
 * Time tiers before the style option: 1 on the hour, 2 any minute, 3 (12h only) colloquial five-minute steps.
 * Now: 1 on the hour, 2 five-minute steps, 3 any minute, with the style kept separately.
 */
function migrateLegacyTimeTier(tier: number): { tier: number; timeStyle: TimeStyle } {
  if (tier === 2) return { tier: 3, timeStyle: 'digits' };
  if (tier === 3) return { tier: 2, timeStyle: 'colloquial' };
  return { tier, timeStyle: 'digits' };
}

export function parseBucketKey(key: string): BucketId | null {
  const parts = key.split(':');
  const lang = parts[0] as PracticeLang;
  const type = parts[1] as QuestionType;
  if (!PRACTICE_LANGS.includes(lang) || !QUESTION_TYPES.includes(type)) return null;
  if (type === 'time') {
    const timeFormat = parts[2] as TimeFormat;
    const timeStyle = parts[3] as TimeStyle;
    const tier = Number(parts[4]);
    if (parts.length !== 5 || !TIME_FORMATS.includes(timeFormat) || !TIME_STYLES.includes(timeStyle)) return null;
    if (!Number.isInteger(tier)) return null;
    return { lang, type, timeFormat, timeStyle, tier };
  }
  const tier = Number(parts[2]);
  if (parts.length !== 3 || !Number.isInteger(tier)) return null;
  return { lang, type, tier };
}

/** Pure: returns a new Stats with the answer added. */
export function recordAnswer(stats: Stats, a: AnswerInput, now: number): Stats {
  const q = a.question;
  const key = bucketKey(q);
  const b = { ...(stats.buckets[key] ?? emptyBucket()) };
  b.answered++;
  b.totalReplays += a.replays;
  if (a.correct) {
    b.correct++;
    if (a.replays === 0) b.correctNoReplay++;
  }
  if (a.responseMs !== null && a.responseMs >= 0) {
    b.totalResponseMs += a.responseMs;
    b.timedCount++;
  }

  let mistakes = stats.mistakes;
  if (!a.correct) {
    const m: Mistake = { lang: q.lang, type: q.type, tier: q.tier, answer: q.answer, input: a.input, ts: now };
    if (q.type === 'time' && q.timeFormat) m.timeFormat = q.timeFormat;
    if (q.type === 'time' && q.timeStyle) m.timeStyle = q.timeStyle;
    mistakes = [...mistakes, m].slice(-MAX_MISTAKES);
  }

  return { buckets: { ...stats.buckets, [key]: b }, mistakes };
}

export interface BucketSummary {
  answered: number;
  /** 0–1 */
  accuracy: number;
  /** Correct without replay, over all answered; 0–1 */
  firstListenRate: number;
  avgReplays: number;
  /** null when no question had a response time */
  avgResponseMs: number | null;
}

export function summarize(b: Bucket): BucketSummary {
  const n = b.answered || 1;
  return {
    answered: b.answered,
    accuracy: b.correct / n,
    firstListenRate: b.correctNoReplay / n,
    avgReplays: b.totalReplays / n,
    avgResponseMs: b.timedCount ? b.totalResponseMs / b.timedCount : null,
  };
}

// --- Validation & storage ---

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function parseBucket(raw: unknown): Bucket | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const fields = ['answered', 'correct', 'correctNoReplay', 'totalReplays', 'totalResponseMs', 'timedCount'] as const;
  if (!fields.every((f) => isCount(r[f]))) return null;
  return Object.fromEntries(fields.map((f) => [f, r[f]])) as unknown as Bucket;
}

function parseMistake(raw: unknown): Mistake | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (
    !PRACTICE_LANGS.includes(r.lang as PracticeLang) ||
    !QUESTION_TYPES.includes(r.type as QuestionType) ||
    !isCount(r.tier) ||
    typeof r.answer !== 'string' ||
    typeof r.input !== 'string' ||
    !isCount(r.ts)
  ) {
    return null;
  }
  const m: Mistake = {
    lang: r.lang as PracticeLang,
    type: r.type as QuestionType,
    tier: r.tier,
    answer: r.answer,
    input: r.input,
    ts: r.ts,
  };
  if (TIME_FORMATS.includes(r.timeFormat as TimeFormat)) m.timeFormat = r.timeFormat as TimeFormat;
  if (TIME_STYLES.includes(r.timeStyle as TimeStyle)) m.timeStyle = r.timeStyle as TimeStyle;
  else if (m.type === 'time') Object.assign(m, migrateLegacyTimeTier(m.tier));
  return m;
}

/** `fr-CA:time:12h:3` (before the style option) → `fr-CA:time:12h:colloquial:2`; null if not such a key. */
function migrateLegacyKey(key: string): string | null {
  const [lang, type, timeFormat, tier, ...rest] = key.split(':');
  if (type !== 'time' || rest.length) return null;
  const id = parseBucketKey(`${lang}:time:${timeFormat}:digits:${tier}`);
  return id && bucketKey({ ...id, ...migrateLegacyTimeTier(id.tier) });
}

/** Drop anything malformed rather than throwing away all stats. */
export function parseStats(raw: unknown): Stats {
  const stats = emptyStats();
  if (!raw || typeof raw !== 'object') return stats;
  const r = raw as Record<string, unknown>;

  if (r.buckets && typeof r.buckets === 'object') {
    for (const [raw, value] of Object.entries(r.buckets)) {
      const b = parseBucket(value);
      const key = parseBucketKey(raw) ? raw : migrateLegacyKey(raw);
      if (b && key) stats.buckets[key] = b;
    }
  }
  if (Array.isArray(r.mistakes)) {
    stats.mistakes = r.mistakes
      .map(parseMistake)
      .filter((m): m is Mistake => m !== null)
      .slice(-MAX_MISTAKES);
  }
  return stats;
}

export function loadStats(storage: StorageLike | null): Stats {
  try {
    const raw = storage?.getItem(STATS_KEY);
    return parseStats(raw ? JSON.parse(raw) : null);
  } catch {
    return emptyStats();
  }
}

export function saveStats(stats: Stats, storage: StorageLike | null): void {
  try {
    storage?.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // storage blocked or full: stats just won't persist
  }
}
