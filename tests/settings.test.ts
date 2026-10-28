import { describe, expect, it } from 'vitest';
import {
  SETTINGS_KEY,
  defaultSettings,
  detectUiLang,
  loadSettings,
  normalizeTier,
  parseSettings,
  pickTier,
  saveSettings,
} from '../src/settings';
import { seededRng } from '../src/random';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe('detectUiLang', () => {
  it.each<[string | undefined, string]>([
    ['fr-CA', 'fr'],
    ['fr', 'fr'],
    ['zh-CN', 'zh'],
    ['zh-Hant-TW', 'zh'],
    ['en-US', 'en'],
    ['de-DE', 'en'],
    [undefined, 'en'],
  ])('%s → %s', (nav, expected) => {
    expect(detectUiLang(nav)).toBe(expected);
  });
});

describe('defaultSettings', () => {
  it('matches DESIGN.md §10', () => {
    expect(defaultSettings('zh-CN')).toEqual({
      practiceLang: 'fr-CA',
      uiLang: 'zh',
      type: 'cardinal',
      tier: 1,
      cardinalTiers: [1],
      rate: 1,
      voiceURIs: {},
      timeFormat: '24h',
      timeStyle: 'digits',
      replayLimit: 'unlimited',
    });
  });
});

describe('parseSettings', () => {
  it('keeps valid values', () => {
    const s = {
      practiceLang: 'en',
      uiLang: 'fr',
      type: 'time',
      tier: 3,
      cardinalTiers: [2, 5],
      rate: 1.2,
      voiceURIs: { 'fr-CA': 'x', en: 'y' },
      timeFormat: '12h',
      timeStyle: 'mixed',
      replayLimit: 1,
    };
    expect(parseSettings(s)).toEqual(s);
  });

  it('replaces invalid fields with defaults', () => {
    const s = parseSettings({ practiceLang: 'fr-FR', type: 'price', rate: 5, replayLimit: 2, voiceURIs: { 'fr-CA': 3, en: 'ok', de: 'x' } }, 'en');
    expect(s.practiceLang).toBe('fr-CA');
    expect(s.type).toBe('cardinal');
    expect(s.rate).toBe(1.3);
    expect(s.replayLimit).toBe('unlimited');
    expect(s.voiceURIs).toEqual({ en: 'ok' });
  });

  it('resets a tier that does not exist', () => {
    expect(parseSettings({ type: 'time', timeStyle: 'digits', tier: 4 }).tier).toBe(1);
    expect(parseSettings({ type: 'year', tier: 4 }).tier).toBe(4);
    expect(parseSettings({ type: 'cardinal', tier: 7 }).tier).toBe(1);
    expect(parseSettings({ tier: 2.5 }).tier).toBe(1);
  });

  it('cleans cardinal tiers', () => {
    expect(parseSettings({ cardinalTiers: [5, 2, 2, 9, 0, 1.5, '3'] }).cardinalTiers).toEqual([2, 5]);
    expect(parseSettings({ cardinalTiers: [] }).cardinalTiers).toEqual([1]);
    expect(parseSettings({ cardinalTiers: 'all' }).cardinalTiers).toEqual([1]);
  });

  it('migrates the single cardinal tier saved before multi-select', () => {
    expect(parseSettings({ type: 'cardinal', tier: 4 }).cardinalTiers).toEqual([4]);
    expect(parseSettings({ type: 'cardinal', tier: 7 }).cardinalTiers).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseSettings({ type: 'cardinal', tier: 7 }).tier).toBe(1);
    expect(parseSettings({ type: 'year', tier: 4 }).cardinalTiers).toEqual([1]);
    expect(parseSettings({ type: 'cardinal', tier: 4, cardinalTiers: [6] }).cardinalTiers).toEqual([6]);
  });

  it('migrates time settings saved before the style option', () => {
    expect(parseSettings({ type: 'time', timeFormat: '12h', tier: 3 })).toMatchObject({ tier: 2, timeStyle: 'colloquial' });
    expect(parseSettings({ type: 'time', timeFormat: '24h', tier: 2 })).toMatchObject({ tier: 3, timeStyle: 'digits' });
    expect(parseSettings({ type: 'time', tier: 1 })).toMatchObject({ tier: 1, timeStyle: 'digits' });
    expect(parseSettings({ type: 'time', tier: 2, timeStyle: 'digits' }).tier).toBe(2);
  });

  it('handles junk', () => {
    expect(parseSettings(null, 'fr')).toEqual(defaultSettings('fr'));
    expect(parseSettings('nope', 'fr')).toEqual(defaultSettings('fr'));
  });
});

describe('normalizeTier', () => {
  it('resets when switching to a type or format with fewer tiers', () => {
    const s = { ...defaultSettings(), type: 'phone' as const, tier: 4 };
    expect(normalizeTier({ ...s, type: 'year' }).tier).toBe(4);
    expect(normalizeTier({ ...s, type: 'time' }).tier).toBe(1);
    expect(normalizeTier({ ...s, type: 'time', timeFormat: '24h', tier: 3 }).tier).toBe(3);
  });
});

describe('pickTier', () => {
  it('draws every selected cardinal tier and nothing else', () => {
    const s = { ...defaultSettings(), type: 'cardinal' as const, tier: 1, cardinalTiers: [2, 4, 6] };
    const rng = seededRng(1);
    const seen = new Set(Array.from({ length: 200 }, () => pickTier(s, rng)));
    expect([...seen].sort()).toEqual([2, 4, 6]);
  });

  it('uses the single tier for other types', () => {
    const s = { ...defaultSettings(), type: 'year' as const, tier: 3, cardinalTiers: [2, 4] };
    expect(pickTier(s, seededRng(1))).toBe(3);
  });
});

describe('load / save', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const s = { ...defaultSettings('en'), type: 'phone' as const, tier: 2 };
    saveSettings(s, storage);
    expect(JSON.parse(storage.data[SETTINGS_KEY])).toEqual(s);
    expect(loadSettings(storage, 'en')).toEqual(s);
  });

  it('falls back to defaults on corrupt JSON or missing storage', () => {
    expect(loadSettings(memoryStorage({ [SETTINGS_KEY]: '{oops' }), 'fr')).toEqual(defaultSettings('fr'));
    expect(loadSettings(null, 'fr')).toEqual(defaultSettings('fr'));
  });

  it('survives a throwing storage', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadSettings(throwing, 'en')).toEqual(defaultSettings('en'));
    expect(() => saveSettings(defaultSettings(), throwing)).not.toThrow();
  });
});
