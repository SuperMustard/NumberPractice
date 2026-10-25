import { t } from '../i18n';
import type { PracticeLang, QuestionType } from '../types';

/** Practice languages are named in their own language, never translated. */
export const PRACTICE_LANG_NAMES: Record<PracticeLang, string> = { 'fr-CA': 'Français (Canada)', en: 'English' };

/** Shorter form for the selector, which is only half the width of a phone screen. */
export const PRACTICE_LANG_SHORT: Record<PracticeLang, string> = { 'fr-CA': 'Français (CA)', en: 'English' };

/** "3 · 70–99". A practice-language-specific description (tier.phone.3.en) wins over the generic one. */
export function tierLabel(lang: PracticeLang, type: QuestionType, n: number): string {
  const base = `tier.${type}.${n}`;
  const specific = `${base}.${lang}`;
  const desc = t(specific) !== specific ? t(specific) : t(base);
  return t('tier.option', { n, desc });
}
