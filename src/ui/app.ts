import { tierCount } from '../generators';
import { getUiLang, setUiLang, t } from '../i18n';
import {
  PRACTICE_LANGS,
  QUESTION_TYPES,
  type Settings,
  TIME_FORMATS,
  UI_LANGS,
  browserStorage,
  loadSettings,
  normalizeTier,
  saveSettings,
} from '../settings';
import type { Tts } from '../speech/tts';
import type { UiLang } from '../types';
import { Practice } from './practice';

// DESIGN.md §13: header, selection, practice card, session score.

/** Language names are shown in their own language, never translated. */
const UI_LANG_NAMES: Record<UiLang, string> = { fr: 'Français', en: 'English', zh: '中文' };
const PRACTICE_LANG_NAMES: Record<string, string> = { 'fr-CA': 'Français (Canada)', en: 'English' };

function setOptions(select: HTMLSelectElement, options: { value: string; label: string }[], value: string) {
  select.replaceChildren(
    ...options.map((o) => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      return opt;
    }),
  );
  select.value = value;
}

function field(): { wrap: HTMLLabelElement; label: HTMLSpanElement; select: HTMLSelectElement } {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const label = document.createElement('span');
  const select = document.createElement('select');
  wrap.append(label, select);
  return { wrap, label, select };
}

export function mountApp(root: HTMLElement, tts: Tts | null): void {
  const storage = browserStorage();
  let settings = loadSettings(storage, navigator.language);
  setUiLang(settings.uiLang);

  const practice = new Practice({ tts, getSettings: () => settings });

  // Header
  const header = document.createElement('header');
  header.className = 'topbar';
  const title = document.createElement('h1');
  const uiLangSelect = document.createElement('select');
  uiLangSelect.className = 'ui-lang';
  header.append(title, uiLangSelect);

  // Selection
  const selection = document.createElement('section');
  selection.className = 'selection';
  const langField = field();
  const typeField = field();
  const tierField = field();
  const formatField = field();
  const formatNotice = document.createElement('p');
  formatNotice.className = 'note selection-note';
  selection.append(langField.wrap, typeField.wrap, tierField.wrap, formatField.wrap, formatNotice);

  root.replaceChildren(header, selection, practice.el, practice.scoreEl);

  function render(): void {
    document.documentElement.lang = getUiLang();
    document.title = t('app.title');
    title.textContent = t('app.title');

    uiLangSelect.setAttribute('aria-label', t('uiLang.label'));
    setOptions(uiLangSelect, UI_LANGS.map((l) => ({ value: l, label: UI_LANG_NAMES[l] })), settings.uiLang);

    langField.label.textContent = t('select.practiceLang');
    setOptions(
      langField.select,
      PRACTICE_LANGS.map((l) => ({ value: l, label: PRACTICE_LANG_NAMES[l] })),
      settings.practiceLang,
    );

    typeField.label.textContent = t('select.type');
    setOptions(typeField.select, QUESTION_TYPES.map((ty) => ({ value: ty, label: t(`type.${ty}`) })), settings.type);

    tierField.label.textContent = t('select.tier');
    const count = tierCount(settings.practiceLang, settings.type, settings.timeFormat);
    const tiers = Array.from({ length: count }, (_, i) => {
      const n = i + 1;
      const base = `tier.${settings.type}.${n}`;
      const specific = `${base}.${settings.practiceLang}`;
      const desc = t(specific) !== specific ? t(specific) : t(base);
      return { value: String(n), label: t('tier.option', { n, desc }) };
    });
    setOptions(tierField.select, tiers, String(settings.tier));

    const isTime = settings.type === 'time';
    formatField.wrap.hidden = !isTime;
    formatField.label.textContent = t('select.timeFormat');
    setOptions(
      formatField.select,
      TIME_FORMATS.map((f) => ({ value: f, label: t(`timeFormat.${f}`) })),
      settings.timeFormat,
    );
    formatNotice.hidden = !(isTime && settings.practiceLang === 'en' && settings.timeFormat === '24h');
    formatNotice.textContent = t('notice.en12hOnly');

    practice.render();
  }

  function update(patch: Partial<Settings>): void {
    settings = normalizeTier({ ...settings, ...patch });
    saveSettings(settings, storage);
  }

  uiLangSelect.addEventListener('change', () => {
    update({ uiLang: uiLangSelect.value as UiLang });
    setUiLang(settings.uiLang);
    render();
  });

  const onPracticeChange = (patch: () => Partial<Settings>) => () => {
    update(patch());
    render();
    practice.settingsChanged();
  };
  langField.select.addEventListener(
    'change',
    onPracticeChange(() => ({ practiceLang: langField.select.value as Settings['practiceLang'] })),
  );
  typeField.select.addEventListener(
    'change',
    onPracticeChange(() => ({ type: typeField.select.value as Settings['type'] })),
  );
  tierField.select.addEventListener(
    'change',
    onPracticeChange(() => ({ tier: Number(tierField.select.value) })),
  );
  formatField.select.addEventListener(
    'change',
    onPracticeChange(() => ({ timeFormat: formatField.select.value as Settings['timeFormat'] })),
  );

  render();
}
