import { type CheckResult, checkAnswer, isBlank } from '../checker';
import { generateQuestion } from '../generators';
import { t } from '../i18n';
import { type Settings, pickTier } from '../settings';
import { type Tts, pickVoice, voicesForLang } from '../speech/tts';
import type { Question } from '../types';
import { formatAnswer, groupBreaks } from './format';

// DESIGN.md §8: start → speak → type → Enter submit → feedback → Enter next → speak …

export interface AnsweredRecord {
  question: Question;
  input: string;
  correct: boolean;
  replays: number;
  /** First complete playback end → submit; null if it never ended before submit */
  responseMs: number | null;
}

export interface PracticeDeps {
  tts: Tts | null;
  getSettings: () => Settings;
  /** Called for submitted questions only; revealed ones are never reported. */
  onAnswered?: (record: AnsweredRecord) => void;
}

type Phase = 'idle' | 'asking' | 'answered' | 'revealed';
type VoiceStatus = 'ok' | 'noRegion' | 'noVoice' | 'noTts';

const TEMPLATE = `
  <p class="notice" role="status" hidden></p>
  <div class="start-view">
    <button type="button" class="btn btn-primary btn-start" data-action="start"></button>
    <p class="hint"></p>
  </div>
  <div class="quiz-view" hidden>
    <input class="answer-input" type="text" autocomplete="off" autocorrect="off"
      autocapitalize="off" spellcheck="false" enterkeyhint="go" />
    <div class="feedback" aria-live="polite"></div>
    <div class="actions">
      <button type="button" class="btn" data-action="replay"><span></span> <kbd>↑</kbd></button>
      <button type="button" class="btn" data-action="reveal"><span></span> <kbd>Esc</kbd></button>
      <button type="button" class="btn btn-primary" data-action="primary"><span></span> <kbd>Enter</kbd></button>
    </div>
    <p class="replay-count"></p>
  </div>
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class Practice {
  readonly el: HTMLElement;
  readonly scoreEl: HTMLElement;

  private phase: Phase = 'idle';
  private q: Question | null = null;
  private replays = 0;
  private firstEndAt: number | null = null;
  private result: CheckResult | null = null;
  private score = { correct: 0, total: 0 };

  private voice: SpeechSynthesisVoice | null = null;
  private voicesLoaded = false;
  private voiceStatus: VoiceStatus;

  private readonly $notice: HTMLElement;
  private readonly $startView: HTMLElement;
  private readonly $startBtn: HTMLButtonElement;
  private readonly $hint: HTMLElement;
  private readonly $quizView: HTMLElement;
  private readonly $input: HTMLInputElement;
  private readonly $feedback: HTMLElement;
  private readonly $replay: HTMLButtonElement;
  private readonly $reveal: HTMLButtonElement;
  private readonly $primary: HTMLButtonElement;
  private readonly $replayCount: HTMLElement;

  constructor(private readonly deps: PracticeDeps) {
    this.el = el('section', 'card practice');
    this.el.innerHTML = TEMPLATE;
    this.scoreEl = el('p', 'session-score');

    const q = <T extends Element>(sel: string) => this.el.querySelector<T>(sel)!;
    this.$notice = q('.notice');
    this.$startView = q('.start-view');
    this.$startBtn = q('[data-action="start"]');
    this.$hint = q('.hint');
    this.$quizView = q('.quiz-view');
    this.$input = q('.answer-input');
    this.$feedback = q('.feedback');
    this.$replay = q('[data-action="replay"]');
    this.$reveal = q('[data-action="reveal"]');
    this.$primary = q('[data-action="primary"]');
    this.$replayCount = q('.replay-count');

    this.$startBtn.addEventListener('click', () => this.next());
    this.$replay.addEventListener('click', () => this.replay());
    this.$reveal.addEventListener('click', () => this.reveal());
    this.$primary.addEventListener('click', () => this.primary());
    document.addEventListener('keydown', this.onKey);

    this.voiceStatus = deps.tts ? 'ok' : 'noTts';
    if (deps.tts) {
      void deps.tts.loadVoices().then(() => {
        this.voicesLoaded = true;
        this.refreshVoice();
      });
      deps.tts.onVoicesChanged(() => this.refreshVoice());
    }

    this.render();
  }

  /** Practice language / type / tier / format changed: re-pick the voice and move to a fresh question. */
  settingsChanged(): void {
    this.refreshVoice();
    if (this.phase === 'idle') this.render();
    else this.next();
  }

  /** Rate / voice / replay limit changed: keep the current question. */
  optionsChanged(): void {
    this.refreshVoice();
    this.render();
  }

  /** Put the keyboard back on the answer box (e.g. after closing a dialog). */
  focus(): void {
    if (this.phase === 'idle') this.$startBtn.focus();
    else this.$input.focus();
  }

  // --- Actions ---

  private next(): void {
    const s = this.deps.getSettings();
    this.q = generateQuestion({
      lang: s.practiceLang,
      type: s.type,
      tier: pickTier(s),
      timeFormat: s.timeFormat,
    });
    this.phase = 'asking';
    this.replays = 0;
    this.firstEndAt = null;
    this.result = null;
    this.$input.value = '';
    this.render();
    this.$input.focus();
    // Must stay synchronous inside the click / keydown handler: browsers only allow speech after a user gesture.
    this.play();
  }

  private play(): void {
    const { tts } = this.deps;
    const q = this.q;
    if (!tts || !q) return;
    const s = this.deps.getSettings();
    void tts
      .speak(q.tts, { voice: this.voice, lang: q.lang, rate: s.rate * (q.rateFactor ?? 1) })
      .then((r) => {
        if (r.status === 'ended' && this.q === q && this.firstEndAt === null) this.firstEndAt = r.at;
      });
  }

  private canReplay(): boolean {
    if (this.phase !== 'asking') return true; // after answering, replays are free and uncounted
    const limit = this.deps.getSettings().replayLimit;
    return limit === 'unlimited' || this.replays < limit;
  }

  private replay(): void {
    if (!this.q || !this.canReplay()) return;
    if (this.phase === 'asking') this.replays++;
    this.play();
    this.render();
    this.$input.focus();
  }

  private reveal(): void {
    if (this.phase !== 'asking') return;
    this.phase = 'revealed';
    this.render();
    this.$input.focus();
  }

  private submit(): void {
    const q = this.q;
    if (this.phase !== 'asking' || !q) return;
    const input = this.$input.value;
    if (isBlank(input)) {
      this.$input.focus();
      return;
    }
    const submittedAt = performance.now();
    this.result = checkAnswer(q, input);
    this.phase = 'answered';
    this.score.total++;
    if (this.result.correct) this.score.correct++;

    this.deps.onAnswered?.({
      question: q,
      input,
      correct: this.result.correct,
      replays: this.replays,
      responseMs: this.firstEndAt === null ? null : Math.round(submittedAt - this.firstEndAt),
    });
    this.render();
    this.$input.focus();
  }

  private primary(): void {
    if (this.phase === 'asking') this.submit();
    else this.next();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.isComposing || e.keyCode === 229) return; // IME (e.g. Chinese input) is composing
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return; // e.g. Esc closes the settings dialog, not reveal
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (tag === 'INPUT' && target !== this.$input) return;
    if (tag === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return; // native click handles it

    if (this.phase === 'idle') {
      if (e.key === 'Enter' && !this.$startBtn.disabled) {
        e.preventDefault();
        this.next();
      }
      return;
    }
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        this.primary();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.replay();
        break;
      case 'Escape':
        e.preventDefault();
        this.reveal();
        break;
    }
  };

  // --- Voice ---

  private refreshVoice(): void {
    const { tts } = this.deps;
    if (!tts) return;
    const s = this.deps.getSettings();
    const all = tts.getVoices();
    const { voices, hasPreferredRegion } = voicesForLang(all, s.practiceLang);
    this.voice = pickVoice(all, s.practiceLang, s.voiceURIs[s.practiceLang] ?? null);
    if (!this.voicesLoaded) this.voiceStatus = 'ok';
    else if (voices.length === 0) this.voiceStatus = 'noVoice';
    else if (s.practiceLang === 'fr-CA' && !hasPreferredRegion) this.voiceStatus = 'noRegion';
    else this.voiceStatus = 'ok';
    this.render();
  }

  // --- Rendering ---

  render(): void {
    const s = this.deps.getSettings();

    const notice = this.noticeText(s);
    this.$notice.hidden = !notice;
    this.$notice.textContent = notice;

    this.$startView.hidden = this.phase !== 'idle';
    this.$quizView.hidden = this.phase === 'idle';
    this.$startBtn.textContent = t('practice.start');
    this.$startBtn.disabled = this.voiceStatus === 'noTts';
    this.$hint.textContent = t('practice.startHint');

    this.scoreEl.textContent = this.score.total ? t('score', this.score) : '';

    const q = this.q;
    if (!q) return;

    const input = this.$input;
    input.inputMode = q.type === 'time' ? 'text' : 'numeric';
    input.placeholder = t(`practice.placeholder.${q.type}`);
    input.setAttribute('aria-label', t('practice.inputLabel'));
    input.readOnly = this.phase !== 'asking';
    input.classList.toggle('is-correct', this.phase === 'answered' && !!this.result?.correct);
    input.classList.toggle('is-incorrect', this.phase === 'answered' && !this.result?.correct);

    this.$replay.querySelector('span')!.textContent = t('practice.replay');
    this.$replay.disabled = !this.canReplay();
    this.$reveal.querySelector('span')!.textContent = t('practice.reveal');
    this.$reveal.disabled = this.phase !== 'asking';
    this.$primary.querySelector('span')!.textContent =
      this.phase === 'asking' ? t('practice.submit') : t('practice.next');

    const limit = s.replayLimit;
    this.$replayCount.textContent =
      limit !== 'unlimited'
        ? t('practice.replaysLimited', { n: this.replays, max: limit })
        : this.replays > 0
          ? t('practice.replays', { n: this.replays })
          : '';

    this.renderFeedback(q);
  }

  private noticeText(s: Settings): string {
    switch (this.voiceStatus) {
      case 'noTts':
        return t('notice.noTts');
      case 'noVoice':
        return t('notice.noVoice', { lang: t(`lang.${s.practiceLang}`) });
      case 'noRegion':
        return t('notice.noFrCa', { voice: this.voice ? `${this.voice.name} (${this.voice.lang})` : '' });
      default:
        return '';
    }
  }

  private renderFeedback(q: Question): void {
    const fb = this.$feedback;
    fb.replaceChildren();
    fb.className = 'feedback';
    if (this.phase === 'asking' || this.phase === 'idle') return;

    const answer = el('p', 'answer-big', formatAnswer(q));
    const display = el('p', 'display', q.display);
    display.lang = q.lang;

    if (this.phase === 'revealed') {
      fb.classList.add('is-revealed');
      fb.append(el('p', 'result-heading', t('feedback.revealed')), answer, display);
      fb.append(el('p', 'note', t('feedback.notCounted')));
      return;
    }

    const r = this.result!;
    fb.classList.add(r.correct ? 'is-correct' : 'is-incorrect');
    fb.append(el('p', 'result-heading', r.correct ? t('feedback.correct') : t('feedback.incorrect')));

    if (r.correct) {
      fb.append(answer, display);
      return;
    }

    fb.append(this.renderComparison(q, r), display);
  }

  /** Wrong answer: per-character highlight when lengths match, otherwise the two side by side. */
  private renderComparison(q: Question, r: CheckResult): HTMLElement {
    const grid = el('dl', 'compare');
    const row = (label: string, content: HTMLElement) => {
      grid.append(el('dt', '', label));
      const dd = el('dd');
      dd.append(content);
      grid.append(dd);
    };

    if (r.diff) {
      const yours = el('span', 'diff');
      const expected = el('span', 'diff');
      const breaks = groupBreaks(q.type, r.diff.length);
      r.diff.forEach((c, i) => {
        const gap = breaks.has(i) ? ' gap' : '';
        yours.append(el('span', `ch${c.ok ? '' : ' bad'}${gap}`, c.actual));
        expected.append(el('span', `ch${c.ok ? '' : ' fix'}${gap}`, c.expected));
      });
      row(t('feedback.yours'), yours);
      row(t('feedback.expected'), expected);
    } else {
      row(t('feedback.yours'), el('span', 'diff', r.normalized ?? this.$input.value.trim()));
      row(t('feedback.expected'), el('span', 'diff', formatAnswer(q)));
      if (q.type === 'time' && r.normalized === null) {
        const note = el('p', 'note', t('feedback.unparsed'));
        const wrap = el('div');
        wrap.append(grid, note);
        return wrap;
      }
    }
    return grid;
  }
}
