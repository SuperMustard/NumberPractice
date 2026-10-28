import { tierCount } from '../generators';
import { CARDINAL_TIERS } from '../generators/cardinal';
import { getUiLang, setUiLang, t } from '../i18n';
import {
  PRACTICE_LANGS,
  QUESTION_TYPES,
  type Settings,
  TIME_FORMATS,
  TIME_STYLES,
  UI_LANGS,
  browserStorage,
  cleanCardinalTiers,
  loadSettings,
  normalizeTier,
  saveSettings,
} from '../settings';
import type { Tts } from '../speech/tts';
import type { UiLang } from '../types';
import { emptyStats, loadStats, recordAnswer, saveStats } from '../stats';
import { PRACTICE_LANG_SHORT, tierDesc, tierLabel } from './labels';
import { Practice } from './practice';
import { SettingsPanel } from './settings-panel';
import { StatsPanel } from './stats-panel';

// DESIGN.md §13: header, selection, practice card, session score.

/** Language names are shown in their own language, never translated. */
const UI_LANG_NAMES: Record<UiLang, string> = { fr: 'Français', en: 'English', zh: '中文' };

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

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICON_SETTINGS = svg(
  '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>' +
    '<circle cx="9" cy="6" r="2" style="fill:var(--surface)"/><circle cx="15" cy="12" r="2" style="fill:var(--surface)"/><circle cx="7" cy="18" r="2" style="fill:var(--surface)"/>',
);
const ICON_STATS = svg(
  '<line x1="6" y1="20" x2="6" y2="13"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="18" y1="20" x2="18" y2="10"/>',
);

/** Header button: icon always, text label hidden on narrow screens (kept as aria-label). */
function iconButton(icon: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn-small btn-tool';
  b.innerHTML = `${icon}<span class="btn-label"></span>`;
  return b;
}

function setButtonLabel(b: HTMLButtonElement, label: string): void {
  b.querySelector('.btn-label')!.textContent = label;
  b.setAttribute('aria-label', label);
  b.title = label;
}

function field(): { wrap: HTMLLabelElement; label: HTMLSpanElement; select: HTMLSelectElement } {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const label = document.createElement('span');
  const select = document.createElement('select');
  wrap.append(label, select);
  return { wrap, label, select };
}

/** Cardinal ranges are combinable, so they get one checkbox chip each instead of a select. */
function tierChips(): {
  wrap: HTMLFieldSetElement;
  legend: HTMLLegendElement;
  boxes: HTMLInputElement[];
  names: HTMLSpanElement[];
  allBtn: HTMLButtonElement;
} {
  const wrap = document.createElement('fieldset');
  wrap.className = 'field field-chips';
  const legend = document.createElement('legend');
  const chips = document.createElement('div');
  chips.className = 'chips';
  const boxes: HTMLInputElement[] = [];
  const names: HTMLSpanElement[] = [];
  for (let n = 1; n <= CARDINAL_TIERS; n++) {
    const chip = document.createElement('label');
    chip.className = 'chip';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = String(n);
    const name = document.createElement('span');
    chip.append(box, name);
    chips.append(chip);
    boxes.push(box);
    names.push(name);
  }
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'chip chip-all';
  chips.append(allBtn);
  wrap.append(legend, chips);
  return { wrap, legend, boxes, names, allBtn };
}

export function mountApp(root: HTMLElement, tts: Tts | null): void {
  const storage = browserStorage();
  let settings = loadSettings(storage, navigator.language);
  setUiLang(settings.uiLang);

  let stats = loadStats(storage);

  const practice = new Practice({
    tts,
    getSettings: () => settings,
    onAnswered: (record) => {
      stats = recordAnswer(stats, record, Date.now());
      saveStats(stats, storage);
    },
  });

  // Header
  const header = document.createElement('header');
  header.className = 'topbar';
  const title = document.createElement('h1');
  const uiLangSelect = document.createElement('select');
  uiLangSelect.className = 'ui-lang';
  const settingsBtn = iconButton(ICON_SETTINGS);
  const statsBtn = iconButton(ICON_STATS);
  const tools = document.createElement('div');
  tools.className = 'topbar-tools';
  tools.append(uiLangSelect, settingsBtn, statsBtn);
  header.append(title, tools);

  const settingsPanel = new SettingsPanel({
    tts,
    getSettings: () => settings,
    update: (patch) => {
      update(patch);
      practice.optionsChanged();
    },
    onClose: () => practice.focus(),
  });
  settingsBtn.addEventListener('click', () => settingsPanel.open());

  const statsPanel = new StatsPanel({
    getStats: () => stats,
    clear: () => {
      stats = emptyStats();
      saveStats(stats, storage);
    },
    onClose: () => practice.focus(),
  });
  statsBtn.addEventListener('click', () => statsPanel.open());

  // Selection
  const selection = document.createElement('section');
  selection.className = 'selection';
  const langField = field();
  const typeField = field();
  const tierField = field();
  tierField.wrap.classList.add('field-tier');
  const cardinalTiers = tierChips();
  const formatField = field();
  const styleField = field();
  const formatNotice = document.createElement('p');
  formatNotice.className = 'note selection-note';
  selection.append(
    langField.wrap,
    typeField.wrap,
    tierField.wrap,
    cardinalTiers.wrap,
    formatField.wrap,
    styleField.wrap,
    formatNotice,
  );

  root.replaceChildren(header, selection, practice.el, practice.scoreEl, settingsPanel.dialog, statsPanel.dialog);

  function render(): void {
    document.documentElement.lang = getUiLang();
    document.title = t('app.title');
    title.textContent = t('app.title');

    setButtonLabel(settingsBtn, t('settings.open'));
    setButtonLabel(statsBtn, t('stats.open'));
    uiLangSelect.setAttribute('aria-label', t('uiLang.label'));
    setOptions(uiLangSelect, UI_LANGS.map((l) => ({ value: l, label: UI_LANG_NAMES[l] })), settings.uiLang);

    langField.label.textContent = t('select.practiceLang');
    setOptions(
      langField.select,
      PRACTICE_LANGS.map((l) => ({ value: l, label: PRACTICE_LANG_SHORT[l] })),
      settings.practiceLang,
    );

    typeField.label.textContent = t('select.type');
    setOptions(typeField.select, QUESTION_TYPES.map((ty) => ({ value: ty, label: t(`type.${ty}`) })), settings.type);

    const isCardinal = settings.type === 'cardinal';
    tierField.wrap.hidden = isCardinal;
    cardinalTiers.wrap.hidden = !isCardinal;

    cardinalTiers.legend.textContent = t('select.tier');
    const selected = settings.cardinalTiers;
    cardinalTiers.boxes.forEach((box, i) => {
      box.checked = selected.includes(i + 1);
      // At least one range must stay selected.
      box.disabled = box.checked && selected.length === 1;
      cardinalTiers.names[i].textContent = tierDesc(settings.practiceLang, 'cardinal', i + 1);
    });
    cardinalTiers.allBtn.textContent = t('select.allTiers');
    cardinalTiers.allBtn.disabled = selected.length === CARDINAL_TIERS;

    tierField.label.textContent = t('select.tier');
    const count = tierCount(settings.type);
    const tiers = Array.from({ length: count }, (_, i) => ({
      value: String(i + 1),
      label: tierLabel(settings.practiceLang, settings.type, i + 1),
    }));
    setOptions(tierField.select, tiers, String(settings.tier));

    const isTime = settings.type === 'time';
    formatField.wrap.hidden = !isTime;
    styleField.wrap.hidden = !isTime;
    formatField.label.textContent = t('select.timeFormat');
    setOptions(
      formatField.select,
      TIME_FORMATS.map((f) => ({ value: f, label: t(`timeFormat.${f}`) })),
      settings.timeFormat,
    );
    styleField.label.textContent = t('select.timeStyle');
    setOptions(
      styleField.select,
      TIME_STYLES.map((st) => ({ value: st, label: t(`timeStyle.${st}`) })),
      settings.timeStyle,
    );
    formatNotice.hidden = !(isTime && settings.practiceLang === 'en' && settings.timeFormat === '24h');
    formatNotice.textContent = t('notice.en12hOnly');

    practice.render();
    if (settingsPanel.dialog.open) settingsPanel.render();
    if (statsPanel.dialog.open) statsPanel.render();
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
  for (const box of cardinalTiers.boxes) {
    box.addEventListener(
      'change',
      onPracticeChange(() => ({
        cardinalTiers: cleanCardinalTiers(cardinalTiers.boxes.filter((b) => b.checked).map((b) => Number(b.value))),
      })),
    );
  }
  cardinalTiers.allBtn.addEventListener(
    'click',
    onPracticeChange(() => ({ cardinalTiers: Array.from({ length: CARDINAL_TIERS }, (_, i) => i + 1) })),
  );
  formatField.select.addEventListener(
    'change',
    onPracticeChange(() => ({ timeFormat: formatField.select.value as Settings['timeFormat'] })),
  );
  styleField.select.addEventListener(
    'change',
    onPracticeChange(() => ({ timeStyle: styleField.select.value as Settings['timeStyle'] })),
  );

  render();
}
