export type PracticeLang = 'fr-CA' | 'en';
export type UiLang = 'fr' | 'en' | 'zh';
export type QuestionType = 'cardinal' | 'year' | 'phone' | 'time';
export type TimeFormat = '12h' | '24h';

export interface Question {
  id: string;
  lang: PracticeLang;
  type: QuestionType;
  tier: number;
  /** cardinal/year/phone: digits only; time: "HH:MM" (24h) */
  answer: string;
  /** Written form in the practice language, shown on reveal */
  display: string;
  /** Text actually sent to TTS, derived from display */
  tts: string;
  /** Multiplier applied to the user's speech rate for this question */
  rateFactor?: number;
  /** Effective time format, set for time questions only */
  timeFormat?: TimeFormat;
}

/** What a single generator produces; the dispatcher fills in the rest of Question. */
export interface QuestionBody {
  answer: string;
  display: string;
  rateFactor?: number;
}
