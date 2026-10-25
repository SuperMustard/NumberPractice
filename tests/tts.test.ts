import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tts, clampRate, normalizeLang, pickVoice, voicesForLang } from '../src/speech/tts';

const voice = (lang: string, name = lang): SpeechSynthesisVoice =>
  ({ lang, name, voiceURI: `uri:${name}`, localService: true, default: false }) as SpeechSynthesisVoice;

describe('clampRate', () => {
  it.each<[number, number]>([
    [1, 1],
    [0.84, 0.8],
    [0.5, 0.7],
    [2, 1.3],
    [NaN, 1],
  ])('%f → %f', (input, expected) => {
    expect(clampRate(input)).toBe(expected);
  });
});

describe('normalizeLang', () => {
  it('handles underscores and case', () => {
    expect(normalizeLang('fr_CA')).toBe('fr-ca');
    expect(normalizeLang('EN-us')).toBe('en-us');
  });
});

describe('voicesForLang', () => {
  const frFR = voice('fr-FR', 'Thomas');
  const frCA = voice('fr-CA', 'Sylvie');
  const frCA2 = voice('fr_CA', 'Amélie');
  const enUS = voice('en-US', 'Aria');
  const enGB = voice('en-GB', 'Libby');
  const enCA = voice('en-CA', 'Clara');
  const de = voice('de-DE', 'Katja');
  const all = [frFR, de, enGB, frCA, enUS, frCA2, enCA];

  it('puts fr-CA first, then other French, and drops other languages', () => {
    const r = voicesForLang(all, 'fr-CA');
    expect(r.voices).toEqual([frCA, frCA2, frFR]);
    expect(r.hasPreferredRegion).toBe(true);
  });

  it('flags a missing Canadian French voice', () => {
    const r = voicesForLang([frFR, enUS], 'fr-CA');
    expect(r.voices).toEqual([frFR]);
    expect(r.hasPreferredRegion).toBe(false);
  });

  it('orders English as en-CA, en-US, then the rest', () => {
    expect(voicesForLang(all, 'en').voices).toEqual([enCA, enUS, enGB]);
  });

  it('returns nothing when no voice matches', () => {
    expect(voicesForLang([de], 'fr-CA')).toEqual({ voices: [], hasPreferredRegion: false });
  });

  it('pickVoice honours the saved voice, else falls back to the best', () => {
    expect(pickVoice(all, 'fr-CA', frFR.voiceURI)).toBe(frFR);
    expect(pickVoice(all, 'fr-CA', 'uri:gone')).toBe(frCA);
    expect(pickVoice(all, 'fr-CA', enUS.voiceURI)).toBe(frCA); // wrong language
    expect(pickVoice(all, 'fr-CA', null)).toBe(frCA);
    expect(pickVoice([de], 'fr-CA', null)).toBeNull();
  });
});

// --- Playback with a fake speechSynthesis ---

class FakeUtterance {
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(public text: string) {}
}

class FakeSynth {
  voices: SpeechSynthesisVoice[] = [];
  spoken: FakeUtterance[] = [];
  cancelCalls = 0;
  private listeners = new Set<() => void>();

  getVoices = () => this.voices;
  speak = (u: SpeechSynthesisUtterance) => {
    this.spoken.push(u as unknown as FakeUtterance);
  };
  cancel = () => {
    this.cancelCalls++;
  };
  resume = () => {};
  addEventListener = (_type: string, cb: () => void) => {
    this.listeners.add(cb);
  };
  removeEventListener = (_type: string, cb: () => void) => {
    this.listeners.delete(cb);
  };
  emitVoicesChanged(voices: SpeechSynthesisVoice[]) {
    this.voices = voices;
    this.listeners.forEach((cb) => cb());
  }
  get listenerCount() {
    return this.listeners.size;
  }
}

function setup() {
  const synth = new FakeSynth();
  let clock = 0;
  const tts = new Tts(
    synth as unknown as SpeechSynthesis,
    (text) => new FakeUtterance(text) as unknown as SpeechSynthesisUtterance,
    () => clock,
  );
  return { synth, tts, setClock: (t: number) => (clock = t) };
}

describe('Tts.speak', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('configures the utterance and resolves on end', async () => {
    const { synth, tts, setClock } = setup();
    const v = voice('fr-CA', 'Sylvie');
    const p = tts.speak('dix sept', { voice: v, lang: 'fr-CA', rate: 0.9 });

    const u = synth.spoken[0];
    expect(u).toMatchObject({ text: 'dix sept', lang: 'fr-CA', voice: v, rate: 0.9 });

    setClock(1234);
    u.onend!();
    await expect(p).resolves.toEqual({ status: 'ended', at: 1234 });
  });

  it('falls back to the lang tag when no voice is given', () => {
    const { synth, tts } = setup();
    tts.speak('x', { voice: null, lang: 'fr-CA', rate: 1 });
    expect(synth.spoken[0]).toMatchObject({ lang: 'fr-CA', voice: null });
  });

  it('cancels before speaking and interrupts the previous utterance', async () => {
    const { synth, tts } = setup();
    const first = tts.speak('un', { voice: null, lang: 'fr-CA', rate: 1 });
    const second = tts.speak('deux', { voice: null, lang: 'fr-CA', rate: 1 });

    expect(synth.cancelCalls).toBe(2);
    await expect(first).resolves.toMatchObject({ status: 'interrupted' });

    // a late event from the first utterance must not affect anything
    synth.spoken[0].onend!();
    synth.spoken[1].onend!();
    await expect(second).resolves.toMatchObject({ status: 'ended' });
  });

  it('maps browser errors', async () => {
    const { synth, tts } = setup();
    const a = tts.speak('a', { voice: null, lang: 'en', rate: 1 });
    synth.spoken[0].onerror!({ error: 'canceled' });
    await expect(a).resolves.toMatchObject({ status: 'interrupted' });

    const b = tts.speak('b', { voice: null, lang: 'en', rate: 1 });
    synth.spoken[1].onerror!({ error: 'synthesis-failed' });
    await expect(b).resolves.toMatchObject({ status: 'error' });
  });

  it('times out when onend never fires', async () => {
    const { tts } = setup();
    const p = tts.speak('quatre vingt dix sept', { voice: null, lang: 'fr-CA', rate: 1 });
    vi.advanceTimersByTime(60_000);
    await expect(p).resolves.toMatchObject({ status: 'timeout' });
  });

  it('cancel() interrupts the current utterance', async () => {
    const { tts } = setup();
    const p = tts.speak('x', { voice: null, lang: 'en', rate: 1 });
    tts.cancel();
    await expect(p).resolves.toMatchObject({ status: 'interrupted' });
  });
});

describe('Tts.loadVoices', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves immediately when voices are ready', async () => {
    const { synth, tts } = setup();
    synth.voices = [voice('fr-CA')];
    await expect(tts.loadVoices()).resolves.toHaveLength(1);
  });

  it('waits for voiceschanged and cleans up its listener', async () => {
    const { synth, tts } = setup();
    const p = tts.loadVoices();
    synth.emitVoicesChanged([voice('fr-CA'), voice('en-US')]);
    await expect(p).resolves.toHaveLength(2);
    expect(synth.listenerCount).toBe(0);
  });

  it('gives up after the timeout', async () => {
    const { synth, tts } = setup();
    const p = tts.loadVoices(1000);
    vi.advanceTimersByTime(1000);
    await expect(p).resolves.toEqual([]);
    expect(synth.listenerCount).toBe(0);
  });
});
