import type { PracticeLang } from '../types';

// DESIGN.md §9: wrapper around window.speechSynthesis.

export const RATE_MIN = 0.7;
export const RATE_MAX = 1.3;
export const RATE_STEP = 0.1;
export const RATE_DEFAULT = 1.0;

/** Clamp a user rate setting to 0.7–1.3 in 0.1 steps. */
export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return RATE_DEFAULT;
  const r = Math.round(rate * 10) / 10;
  return Math.min(RATE_MAX, Math.max(RATE_MIN, r));
}

// --- Voice selection (pure) ---

/** "fr_CA" (Android) / "FR-ca" → "fr-ca" */
export function normalizeLang(lang: string): string {
  return lang.replace(/_/g, '-').toLowerCase();
}

/** Regions in order of preference; any other region of the base language comes after. */
const PREFERRED_REGIONS: Record<PracticeLang, { base: string; regions: string[] }> = {
  'fr-CA': { base: 'fr', regions: ['fr-ca'] },
  en: { base: 'en', regions: ['en-ca', 'en-us'] },
};

export interface VoiceCandidates {
  /** Voices usable for the practice language, best first */
  voices: SpeechSynthesisVoice[];
  /** Whether a voice for the first-choice region (fr-CA / en-CA) exists */
  hasPreferredRegion: boolean;
}

export function voicesForLang(all: readonly SpeechSynthesisVoice[], lang: PracticeLang): VoiceCandidates {
  const { base, regions } = PREFERRED_REGIONS[lang];
  const rank = (v: SpeechSynthesisVoice): number => {
    const l = normalizeLang(v.lang);
    const i = regions.indexOf(l);
    if (i >= 0) return i;
    if (l === base || l.startsWith(`${base}-`)) return regions.length;
    return -1;
  };
  const voices = all
    .map((v, i) => ({ v, r: rank(v), i }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.v);
  return { voices, hasPreferredRegion: voices.length > 0 && rank(voices[0]) === 0 };
}

/** The saved voice if it still exists and fits the language, otherwise the best candidate. */
export function pickVoice(
  all: readonly SpeechSynthesisVoice[],
  lang: PracticeLang,
  preferredURI: string | null,
): SpeechSynthesisVoice | null {
  const { voices } = voicesForLang(all, lang);
  return voices.find((v) => v.voiceURI === preferredURI) ?? voices[0] ?? null;
}

// --- Playback ---

export type SpeakStatus =
  | 'ended' // onend fired
  | 'interrupted' // cancelled, or replaced by another speak()
  | 'error' // synthesis failed
  | 'timeout'; // onend never came (a known Chrome issue); speech may still be playing

export interface SpeakResult {
  status: SpeakStatus;
  /** performance.now() when the result was settled */
  at: number;
}

export interface SpeakOptions {
  /** null lets the browser choose a voice for `lang` */
  voice: SpeechSynthesisVoice | null;
  lang: string;
  rate: number;
}

type SynthLike = Pick<
  SpeechSynthesis,
  'getVoices' | 'speak' | 'cancel' | 'resume' | 'addEventListener' | 'removeEventListener'
>;

/** Generous upper bound on how long an utterance can take before we stop waiting for onend. */
function watchdogMs(text: string, rate: number): number {
  return 3000 + (text.length * 150) / rate;
}

export class Tts {
  private current: {
    utterance: SpeechSynthesisUtterance;
    finish: (status: SpeakStatus) => void;
  } | null = null;

  constructor(
    private readonly synth: SynthLike,
    private readonly makeUtterance: (text: string) => SpeechSynthesisUtterance = (text) =>
      new SpeechSynthesisUtterance(text),
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** null when the browser has no Web Speech synthesis. */
  static create(): Tts | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    return new Tts(window.speechSynthesis);
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.synth.getVoices();
  }

  /**
   * Voices load asynchronously in most browsers. Resolves as soon as some are
   * available, or with whatever is there (possibly none) after `timeoutMs`.
   */
  loadVoices(timeoutMs = 3000): Promise<SpeechSynthesisVoice[]> {
    const voices = this.synth.getVoices();
    if (voices.length) return Promise.resolve(voices);
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.synth.removeEventListener('voiceschanged', done);
        resolve(this.synth.getVoices());
      };
      const timer = setTimeout(done, timeoutMs);
      this.synth.addEventListener('voiceschanged', done);
    });
  }

  /** Voices can change later (e.g. an online voice pack arrives). Returns an unsubscribe function. */
  onVoicesChanged(callback: () => void): () => void {
    this.synth.addEventListener('voiceschanged', callback);
    return () => this.synth.removeEventListener('voiceschanged', callback);
  }

  /** Cancels anything playing, then speaks `text`. Never rejects. */
  speak(text: string, { voice, lang, rate }: SpeakOptions): Promise<SpeakResult> {
    this.cancel();

    const utterance = this.makeUtterance(text);
    utterance.lang = voice?.lang ?? lang;
    if (voice) utterance.voice = voice;
    utterance.rate = rate;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (status: SpeakStatus) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.current === entry) this.current = null;
        resolve({ status, at: this.now() });
      };
      // Holding the utterance until settled matters: Chrome may garbage-collect it and skip onend.
      const entry = { utterance, finish };

      utterance.onend = () => finish('ended');
      utterance.onerror = (e) =>
        finish(e.error === 'interrupted' || e.error === 'canceled' ? 'interrupted' : 'error');
      const timer = setTimeout(() => finish('timeout'), watchdogMs(text, rate));

      this.current = entry;

      // Chrome can get stuck in a paused state; resume() is a no-op otherwise.
      this.synth.resume();
      this.synth.speak(utterance);
    });
  }

  cancel(): void {
    const playing = this.current;
    this.current = null;
    playing?.finish('interrupted');
    this.synth.cancel();
  }
}
