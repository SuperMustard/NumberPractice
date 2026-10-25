import { afterEach, describe, expect, it } from 'vitest';
import { DICTIONARIES, setUiLang, t } from '../src/i18n';

afterEach(() => setUiLang('en'));

describe('dictionaries', () => {
  const enKeys = Object.keys(DICTIONARIES.en).sort();

  it.each(['fr', 'zh'] as const)('%s has exactly the same keys as en', (lang) => {
    expect(Object.keys(DICTIONARIES[lang]).sort()).toEqual(enKeys);
  });

  it.each(['en', 'fr', 'zh'] as const)('%s uses the same {params} as en', (lang) => {
    const params = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of enKeys) {
      expect(params(DICTIONARIES[lang][key]), key).toEqual(params(DICTIONARIES.en[key]));
    }
  });

  it('has no empty strings', () => {
    for (const dict of Object.values(DICTIONARIES)) {
      for (const [key, value] of Object.entries(dict)) expect(value.trim(), key).not.toBe('');
    }
  });
});

describe('t', () => {
  it('uses the current language', () => {
    setUiLang('zh');
    expect(t('practice.replay')).toBe('重听');
    setUiLang('fr');
    expect(t('practice.replay')).toBe('Réécouter');
  });

  it('fills params and leaves unknown ones', () => {
    expect(t('score', { correct: 3, total: 5 })).toBe('This session: 3 / 5');
    expect(t('practice.replays', {})).toBe('Replays: {n}');
  });

  it('falls back to the key when missing everywhere', () => {
    expect(t('does.not.exist')).toBe('does.not.exist');
  });
});
