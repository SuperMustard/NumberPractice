import { describe, expect, it } from 'vitest';
import { enTime12, frTime12, frTime24, generateTime } from '../src/generators/time';
import { seededRng } from '../src/random';

const hm = (s: string): [number, number] => s.split(':').map(Number) as [number, number];

describe('frTime24 — DESIGN.md §14', () => {
  it.each([
    ['14:00', 'quatorze heures'],
    ['09:05', 'neuf heures cinq'],
    ['21:00', 'vingt et une heures'],
    ['01:30', 'une heure trente'],
    ['00:15', 'zéro heure quinze'],
    // extra
    ['00:00', 'zéro heure'],
    ['10:21', 'dix heures vingt et une'],
    ['23:59', 'vingt-trois heures cinquante-neuf'],
    ['14:45', 'quatorze heures quarante-cinq'],
  ])('%s → %s', (t, expected) => {
    expect(frTime24(...hm(t))).toBe(expected);
  });
});

describe('frTime24 colloquial', () => {
  it.each([
    ['17:15', 'dix-sept heures et quart'],
    ['17:30', 'dix-sept heures et demie'],
    ['14:45', 'quinze heures moins le quart'],
    ['17:50', 'dix-huit heures moins dix'],
    ['20:35', 'vingt et une heures moins vingt-cinq'],
    ['00:40', 'une heure moins vingt'],
    // only minutes with a colloquial form change; the rest stay numbers
    ['15:10', 'quinze heures dix'],
    ['15:20', 'quinze heures vingt'],
    ['15:37', 'quinze heures trente-sept'],
    ['15:58', 'quinze heures cinquante-huit'],
    ['21:21', 'vingt et une heures vingt et une'],
    // midi / minuit
    ['12:00', 'midi'],
    ['00:00', 'minuit'],
    ['12:15', 'midi et quart'],
    ['12:30', 'midi et demi'],
    ['00:30', 'minuit et demi'],
    ['11:45', 'midi moins le quart'],
    ['23:50', 'minuit moins dix'],
    ['00:07', 'minuit sept'],
    ['13:00', 'treize heures'],
  ])('%s → %s', (t, expected) => {
    expect(frTime24(...hm(t), true)).toBe(expected);
  });
});

describe('frTime12 — DESIGN.md §14', () => {
  it.each<[string, number, string]>([
    ['14:00', 1, "deux heures de l'après-midi"],
    ['12:00', 1, 'midi'],
    ['00:00', 1, 'minuit'],
    ['19:05', 2, 'sept heures cinq du soir'],
    ['14:37', 2, "deux heures trente-sept de l'après-midi"],
    ['12:37', 2, 'midi trente-sept'],
    ['01:15', 3, 'une heure et quart du matin'],
    ['02:30', 3, 'deux heures et demie du matin'],
    ['12:30', 3, 'midi et demi'],
    ['14:45', 3, "trois heures moins le quart de l'après-midi"],
    ['11:45', 3, 'midi moins le quart'],
    ['17:50', 3, 'six heures moins dix du soir'],
    ['23:40', 3, 'minuit moins vingt'],
    // extra
    ['00:30', 3, 'minuit et demi'],
    ['12:55', 3, "une heure moins cinq de l'après-midi"],
    ['00:35', 3, 'une heure moins vingt-cinq du matin'],
    ['08:10', 3, 'huit heures dix du matin'],
    ['13:00', 1, "une heure de l'après-midi"],
    ['18:00', 1, 'six heures du soir'],
    ['00:07', 2, 'minuit sept'],
    // colloquial never turns arbitrary minutes into "moins": 3:10 is not "quatre heures moins cinquante"
    ['03:10', 3, 'trois heures dix du matin'],
    ['03:20', 3, 'trois heures vingt du matin'],
    ['03:25', 3, 'trois heures vingt-cinq du matin'],
    ['03:37', 3, 'trois heures trente-sept du matin'],
    ['03:58', 3, 'trois heures cinquante-huit du matin'],
    ['03:50', 3, 'quatre heures moins dix du matin'],
  ])('%s (tier %i) → %s', (t, tier, expected) => {
    expect(frTime12(...hm(t), tier === 3)).toBe(expected);
  });
});

describe('enTime12 — DESIGN.md §14 and §17', () => {
  it.each<[string, number, string]>([
    ['14:15', 3, 'quarter past two in the afternoon'],
    ['14:40', 3, 'twenty to three in the afternoon'],
    ['12:00', 1, 'noon'],
    // extra
    ['00:00', 1, 'midnight'],
    ['14:00', 1, 'two p.m.'],
    ['09:00', 1, 'nine a.m.'],
    ['09:05', 2, 'nine oh five a.m.'],
    ['14:37', 2, 'two thirty-seven p.m.'],
    ['12:37', 2, 'twelve thirty-seven p.m.'],
    ['00:37', 2, 'twelve thirty-seven a.m.'],
    ['14:30', 3, 'half past two in the afternoon'],
    ['19:10', 3, 'ten past seven in the evening'],
    ['07:45', 3, 'quarter to eight in the morning'],
    ['11:45', 3, 'quarter to noon'],
    ['23:50', 3, 'ten to midnight'],
    ['00:30', 3, 'half past midnight'],
    ['12:15', 3, 'quarter past twelve in the afternoon'],
    ['14:05', 3, 'five past two in the afternoon'],
    ['14:37', 3, 'two thirty-seven p.m.'],
    ['14:58', 3, 'two fifty-eight p.m.'],
  ])('%s (tier %i) → %s', (t, tier, expected) => {
    expect(enTime12(...hm(t), tier === 3)).toBe(expected);
  });
});

describe('generateTime', () => {
  const rng = seededRng(42);

  it('tier 1 is always on the hour', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTime('fr-CA', 1, '24h', false, rng).answer).toMatch(/^([01]\d|2[0-3]):00$/);
    }
  });

  it('tier 2 uses five-minute steps', () => {
    for (let i = 0; i < 200; i++) {
      const m = Number(generateTime('en', 2, '12h', true, rng).answer.slice(3));
      expect(m % 5).toBe(0);
      expect(m).toBeGreaterThan(0);
    }
  });

  it('tier 3 is any minute, never on the hour', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTime('fr-CA', 3, '12h', false, rng).answer).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      expect(generateTime('fr-CA', 3, '24h', true, rng).answer.endsWith(':00')).toBe(false);
    }
  });

  it('the answer is the real time even when the spoken hour moves on', () => {
    for (let i = 0; i < 50; i++) {
      const q = generateTime('fr-CA', 2, '24h', true, rng);
      expect(q.display).toBe(frTime24(...hm(q.answer), true));
    }
  });
});
