import { getUiLang, t } from '../i18n';
import { PRACTICE_LANGS, QUESTION_TYPES, TIME_FORMATS } from '../settings';
import { type BucketId, type Stats, parseBucketKey, summarize } from '../stats';
import { PRACTICE_LANG_NAMES, tierLabel } from './labels';

// DESIGN.md §11: per type / tier accuracy, first-listen rate, replays, response time; clear.

const TEMPLATE = `
  <div class="dialog-body">
    <div class="dialog-head">
      <h2></h2>
      <button type="button" class="btn btn-icon" data-role="close">✕</button>
    </div>
    <div data-role="content"></div>
    <p class="note" data-role="legend"></p>
    <p class="note" data-role="mistakes"></p>
    <button type="button" class="btn btn-danger" data-role="clear"></button>
  </div>
`;

/** Display order: practice language, type, time format, tier. */
function sortKey(id: BucketId): number[] {
  return [
    PRACTICE_LANGS.indexOf(id.lang),
    QUESTION_TYPES.indexOf(id.type),
    id.timeFormat ? TIME_FORMATS.indexOf(id.timeFormat) : 0,
    id.tier,
  ];
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export interface StatsPanelDeps {
  getStats: () => Stats;
  clear: () => void;
  onClose: () => void;
}

export class StatsPanel {
  readonly dialog: HTMLDialogElement;

  private readonly $title: HTMLElement;
  private readonly $close: HTMLButtonElement;
  private readonly $content: HTMLElement;
  private readonly $legend: HTMLElement;
  private readonly $mistakes: HTMLElement;
  private readonly $clear: HTMLButtonElement;

  /** Clearing takes two clicks; the second must come within a few seconds. */
  private confirmTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: StatsPanelDeps) {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'stats-dialog';
    this.dialog.innerHTML = TEMPLATE;

    const q = <T extends Element>(role: string) => this.dialog.querySelector<T>(`[data-role="${role}"]`)!;
    this.$title = this.dialog.querySelector('h2')!;
    this.$close = q('close');
    this.$content = q('content');
    this.$legend = q('legend');
    this.$mistakes = q('mistakes');
    this.$clear = q('clear');

    this.$close.addEventListener('click', () => this.dialog.close());
    this.$clear.addEventListener('click', () => this.onClear());
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.dialog.close();
    });
    this.dialog.addEventListener('close', () => {
      this.resetConfirm();
      deps.onClose();
    });
  }

  open(): void {
    this.render();
    this.dialog.showModal();
  }

  render(): void {
    const stats = this.deps.getStats();
    this.$title.textContent = t('stats.title');
    this.$close.setAttribute('aria-label', t('dialog.close'));
    this.$close.title = t('dialog.close');

    const entries = Object.entries(stats.buckets)
      .map(([key, bucket]) => ({ id: parseBucketKey(key), bucket }))
      .filter((e): e is { id: BucketId; bucket: (typeof e)['bucket'] } => e.id !== null && e.bucket.answered > 0)
      .sort((a, b) => compare(sortKey(a.id), sortKey(b.id)));

    const hasData = entries.length > 0;
    this.$legend.hidden = !hasData;
    this.$legend.textContent = t('stats.legend');
    this.$mistakes.hidden = stats.mistakes.length === 0;
    this.$mistakes.textContent = t('stats.mistakes', { n: stats.mistakes.length });
    this.$clear.hidden = !hasData && stats.mistakes.length === 0;
    this.$clear.textContent = this.confirmTimer ? t('stats.clearConfirm') : t('stats.clear');

    if (!hasData) {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = t('stats.empty');
      this.$content.replaceChildren(p);
      return;
    }

    // One table per practice language + type (+ time format and style).
    const groups = new Map<string, typeof entries>();
    for (const e of entries) {
      const g = `${e.id.lang}|${e.id.type}|${e.id.timeFormat ?? ''}|${e.id.timeStyle ?? ''}`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(e);
    }

    const sections = [...groups.values()].map((rows) => {
      const { lang, type, timeFormat, timeStyle } = rows[0].id;
      const section = document.createElement('section');
      section.className = 'stats-group';
      const h = document.createElement('h3');
      h.textContent = [
        PRACTICE_LANG_NAMES[lang],
        t(`type.${type}`),
        timeFormat ? t(`timeFormat.${timeFormat}`) : '',
        timeStyle ? t(`timeStyle.${timeStyle}`) : '',
      ]
        .filter(Boolean)
        .join(' · ');
      section.append(h, this.table(rows));
      return section;
    });
    this.$content.replaceChildren(...sections);
  }

  private table(rows: { id: BucketId; bucket: Stats['buckets'][string] }[]): HTMLElement {
    const locale = getUiLang();
    const pct = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
    const dec = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.className = 'stats-table';

    const head = table.createTHead().insertRow();
    for (const col of ['level', 'answered', 'accuracy', 'firstListen', 'replays', 'time']) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = t(`stats.col.${col}`);
      head.append(th);
    }

    const body = table.createTBody();
    for (const { id, bucket } of rows) {
      const s = summarize(bucket);
      const tr = body.insertRow();
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = tierLabel(id.lang, id.type, id.tier);
      tr.append(th);
      const cells = [
        String(s.answered),
        pct.format(s.accuracy),
        pct.format(s.firstListenRate),
        dec.format(s.avgReplays),
        s.avgResponseMs === null ? t('stats.none') : t('stats.seconds', { s: dec.format(s.avgResponseMs / 1000) }),
      ];
      for (const text of cells) tr.insertCell().textContent = text;
    }

    wrap.append(table);
    return wrap;
  }

  private onClear(): void {
    if (this.confirmTimer) {
      this.resetConfirm();
      this.deps.clear();
    } else {
      this.confirmTimer = setTimeout(() => {
        this.confirmTimer = null;
        this.render();
      }, 4000);
    }
    this.render();
  }

  private resetConfirm(): void {
    if (this.confirmTimer) clearTimeout(this.confirmTimer);
    this.confirmTimer = null;
  }
}
