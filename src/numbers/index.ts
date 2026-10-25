import type { PracticeLang } from '../types';
import { enCardinal } from './en';
import { frCardinal } from './fr-CA';

export function cardinalWords(lang: PracticeLang, n: number): string {
  return lang === 'fr-CA' ? frCardinal(n) : enCardinal(n);
}
