import { t } from '../i18n';
import { REPLAY_LIMITS, type ReplayLimit, type Settings } from '../settings';
import { deriveTts } from '../speech/tts-text';
import { RATE_MAX, RATE_MIN, RATE_STEP, type Tts, clampRate, pickVoice, voicesForLang } from '../speech/tts';
import type { PracticeLang } from '../types';

// DESIGN.md §9–10: rate, voice (with preview) and replay limit.

/** Preview sentence, always in the practice language (never translated). */
const PREVIEW_TEXT: Record<PracticeLang, string> = {
  'fr-CA': 'Bonjour! Quatre-vingt-dix-sept, mille neuf cent quatre-vingt-quatre.',
  en: 'Hello! Ninety-seven, nineteen eighty-four.',
};

const TEMPLATE = `
  <form method="dialog" class="dialog-body">
    <div class="dialog-head">
      <h2></h2>
      <button type="submit" class="btn btn-icon" data-role="close">✕</button>
    </div>
    <label class="field">
      <span data-role="rate-label"></span>
      <div class="rate-row">
        <input type="range" data-role="rate" />
        <output data-role="rate-value"></output>
      </div>
    </label>
    <label class="field">
      <span data-role="voice-label"></span>
      <select data-role="voice"></select>
    </label>
    <p class="note" data-role="voice-note"></p>
    <button type="button" class="btn" data-role="preview"></button>
    <label class="field">
      <span data-role="replay-label"></span>
      <select data-role="replay"></select>
    </label>
  </form>
`;

export interface SettingsPanelDeps {
  tts: Tts | null;
  getSettings: () => Settings;
  update: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

export class SettingsPanel {
  readonly dialog: HTMLDialogElement;

  private readonly $title: HTMLElement;
  private readonly $close: HTMLButtonElement;
  private readonly $rateLabel: HTMLElement;
  private readonly $rate: HTMLInputElement;
  private readonly $rateValue: HTMLOutputElement;
  private readonly $voiceLabel: HTMLElement;
  private readonly $voice: HTMLSelectElement;
  private readonly $voiceNote: HTMLElement;
  private readonly $preview: HTMLButtonElement;
  private readonly $replayLabel: HTMLElement;
  private readonly $replay: HTMLSelectElement;

  constructor(private readonly deps: SettingsPanelDeps) {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'settings-dialog';
    this.dialog.innerHTML = TEMPLATE;

    const q = <T extends Element>(role: string) => this.dialog.querySelector<T>(`[data-role="${role}"]`)!;
    this.$title = this.dialog.querySelector('h2')!;
    this.$close = q('close');
    this.$rateLabel = q('rate-label');
    this.$rate = q('rate');
    this.$rateValue = q('rate-value');
    this.$voiceLabel = q('voice-label');
    this.$voice = q('voice');
    this.$voiceNote = q('voice-note');
    this.$preview = q('preview');
    this.$replayLabel = q('replay-label');
    this.$replay = q('replay');

    this.$rate.min = String(RATE_MIN);
    this.$rate.max = String(RATE_MAX);
    this.$rate.step = String(RATE_STEP);

    this.$rate.addEventListener('input', () => {
      deps.update({ rate: clampRate(Number(this.$rate.value)) });
      this.render();
    });
    this.$voice.addEventListener('change', () => {
      const s = deps.getSettings();
      const voiceURIs = { ...s.voiceURIs };
      if (this.$voice.value) voiceURIs[s.practiceLang] = this.$voice.value;
      else delete voiceURIs[s.practiceLang];
      deps.update({ voiceURIs });
      this.preview();
    });
    this.$preview.addEventListener('click', () => this.preview());
    this.$replay.addEventListener('change', () => {
      const v = this.$replay.value;
      deps.update({ replayLimit: (v === 'unlimited' ? v : Number(v)) as ReplayLimit });
    });

    // Click on the backdrop (outside the form) closes the dialog.
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.dialog.close();
    });
    this.dialog.addEventListener('close', () => {
      deps.tts?.cancel();
      deps.onClose();
    });
    deps.tts?.onVoicesChanged(() => {
      if (this.dialog.open) this.render();
    });
  }

  open(): void {
    this.render();
    this.dialog.showModal();
  }

  render(): void {
    const s = this.deps.getSettings();
    const lang = s.practiceLang;

    this.$title.textContent = t('settings.title');
    this.$close.setAttribute('aria-label', t('dialog.close'));
    this.$close.title = t('dialog.close');

    this.$rateLabel.textContent = t('settings.rate');
    this.$rate.value = String(s.rate);
    this.$rateValue.textContent = `${s.rate.toFixed(1)}×`;

    this.$voiceLabel.textContent = t('settings.voice', { lang: t(`lang.${lang}`) });
    const all = this.deps.tts?.getVoices() ?? [];
    const { voices } = voicesForLang(all, lang);
    const best = voices[0];
    const options: [string, string][] = [
      ['', best ? t('settings.voiceAuto', { voice: voiceLabel(best) }) : t('settings.voiceAutoNone')],
      ...voices.map((v): [string, string] => [v.voiceURI, voiceLabel(v)]),
    ];
    this.$voice.replaceChildren(
      ...options.map(([value, label]) => {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = label;
        return o;
      }),
    );
    const saved = s.voiceURIs[lang];
    this.$voice.value = saved && voices.some((v) => v.voiceURI === saved) ? saved : '';
    this.$voice.disabled = !this.deps.tts;
    this.$voiceNote.textContent = t('settings.voiceNote');

    this.$preview.textContent = t('settings.preview');
    this.$preview.disabled = !this.deps.tts;

    this.$replayLabel.textContent = t('settings.replayLimit');
    this.$replay.replaceChildren(
      ...REPLAY_LIMITS.map((limit) => {
        const o = document.createElement('option');
        o.value = String(limit);
        o.textContent = t(`settings.replay.${limit}`);
        return o;
      }),
    );
    this.$replay.value = String(s.replayLimit);
  }

  private preview(): void {
    const { tts } = this.deps;
    if (!tts) return;
    const s = this.deps.getSettings();
    const voice = pickVoice(tts.getVoices(), s.practiceLang, s.voiceURIs[s.practiceLang] ?? null);
    void tts.speak(deriveTts(PREVIEW_TEXT[s.practiceLang]), { voice, lang: s.practiceLang, rate: s.rate });
  }
}

function voiceLabel(v: SpeechSynthesisVoice): string {
  return `${v.name} (${v.lang})`;
}
