import type { UiLang } from '../types';
import en from './en.json';
import fr from './fr.json';
import zh from './zh.json';

// DESIGN.md §12. Every UI string goes through t(); `display` (the practice-language reading) never does.

type Dict = Record<string, string>;

export const DICTIONARIES: Record<UiLang, Dict> = { en, fr, zh };

let current: UiLang = 'en';

export function setUiLang(lang: UiLang): void {
  current = lang;
}

export function getUiLang(): UiLang {
  return current;
}

/** Look up `key` in the current language (falling back to English, then the key) and fill {params}. */
export function t(key: string, params?: Record<string, string | number>): string {
  const s = DICTIONARIES[current][key] ?? DICTIONARIES.en[key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}
