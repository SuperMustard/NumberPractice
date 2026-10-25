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
  ])('%s → %s', (t, expected) => {
    expect(frTime24(...hm(t))).toBe(expected);
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
  ])('%s (tier %i) → %s', (t, tier, expected) => {
    expect(enTime12(...hm(t), tier === 3)).toBe(expected);
  });
});

describe('generateTime', () => {
  const rng = seededRng(42);

  it('tier 1 is always on the hour', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTime('fr-CA', 1, '24h', rng).answer).toMatch(/^([01]\d|2[0-3]):00$/);
    }
  });

  it('tier 2 never lands on the hour', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTime('fr-CA', 2, '12h', rng).answer).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      expect(generateTime('fr-CA', 2, '12h', rng).answer.endsWith(':00')).toBe(false);
    }
  });

  it('tier 3 uses five-minute steps', () => {
    for (let i = 0; i < 200; i++) {
      const m = Number(generateTime('en', 3, '12h', rng).answer.slice(3));
      expect(m % 5).toBe(0);
      expect(m).toBeGreaterThan(0);
    }
  });
});
