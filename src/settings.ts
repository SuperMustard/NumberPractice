import { tierCount } from './generators';
import { RATE_DEFAULT, clampRate } from './speech/tts';
import type { PracticeLang, QuestionType, TimeFormat, UiLang } from './types';

// DESIGN.md §10

export const SETTINGS_KEY = 'nd.settings.v1';

export type ReplayLimit = 'unlimited' | 1 | 0;

export interface Settings {
  practiceLang: PracticeLang;
  uiLang: UiLang;
  type: QuestionType;
  tier: number;
  rate: number;
  /** Chosen voice per practice language; missing = automatic */
  voiceURIs: Partial<Record<PracticeLang, string>>;
  timeFormat: TimeFormat;
  replayLimit: ReplayLimit;
}

export const PRACTICE_LANGS: readonly PracticeLang[] = ['fr-CA', 'en'];
export const UI_LANGS: readonly UiLang[] = ['fr', 'en', 'zh'];
export const QUESTION_TYPES: readonly QuestionType[] = ['cardinal', 'year', 'phone', 'time'];
export const TIME_FORMATS: readonly TimeFormat[] = ['24h', '12h'];
export const REPLAY_LIMITS: readonly ReplayLimit[] = ['unlimited', 1, 0];

export function detectUiLang(navLang: string | undefined): UiLang {
  const l = (navLang ?? '').toLowerCase();
  if (l.startsWith('fr')) return 'fr';
  if (l.startsWith('zh')) return 'zh';
  return 'en';
}

export function defaultSettings(navLang?: string): Settings {
  return {
    practiceLang: 'fr-CA',
    uiLang: detectUiLang(navLang),
    type: 'cardinal',
    tier: 1,
    rate: RATE_DEFAULT,
    voiceURIs: {},
    timeFormat: '24h',
    replayLimit: 'unlimited',
  };
}

/** Reset tier to 1 when it doesn't exist for the current lang / type / time format. */
export function normalizeTier(s: Settings): Settings {
  const max = tierCount(s.practiceLang, s.type, s.timeFormat);
  return Number.isInteger(s.tier) && s.tier >= 1 && s.tier <= max ? s : { ...s, tier: 1 };
}

function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function parseVoiceURIs(raw: unknown): Settings['voiceURIs'] {
  const out: Settings['voiceURIs'] = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const lang of PRACTICE_LANGS) {
    const uri = (raw as Record<string, unknown>)[lang];
    if (typeof uri === 'string') out[lang] = uri;
  }
  return out;
}

/** Validate whatever came out of storage field by field; anything invalid falls back to the default. */
export function parseSettings(raw: unknown, navLang?: string): Settings {
  const d = defaultSettings(navLang);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  return normalizeTier({
    practiceLang: oneOf(r.practiceLang, PRACTICE_LANGS, d.practiceLang),
    uiLang: oneOf(r.uiLang, UI_LANGS, d.uiLang),
    type: oneOf(r.type, QUESTION_TYPES, d.type),
    tier: typeof r.tier === 'number' ? r.tier : d.tier,
    rate: typeof r.rate === 'number' ? clampRate(r.rate) : d.rate,
    voiceURIs: parseVoiceURIs(r.voiceURIs),
    timeFormat: oneOf(r.timeFormat, TIME_FORMATS, d.timeFormat),
    replayLimit: oneOf(r.replayLimit, REPLAY_LIMITS, d.replayLimit),
  });
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** localStorage, or null where it's blocked (private mode, sandboxed iframes). */
export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(storage: StorageLike | null, navLang?: string): Settings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    return parseSettings(raw ? JSON.parse(raw) : null, navLang);
  } catch {
    return defaultSettings(navLang);
  }
}

export function saveSettings(s: Settings, storage: StorageLike | null): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // quota exceeded or storage blocked: settings just won't persist
  }
}
