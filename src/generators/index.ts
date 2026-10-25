import type { Rng } from '../random';
import { deriveTts } from '../speech/tts-text';
import type { PracticeLang, Question, QuestionBody, QuestionType, TimeFormat } from '../types';
import { CARDINAL_TIERS, generateCardinal } from './cardinal';
import { PHONE_TIERS, generatePhone } from './phone';
import { effectiveTimeFormat, generateTime, timeTierCount } from './time';
import { YEAR_TIERS, generateYear } from './year';

export { effectiveTimeFormat } from './time';

export interface GenerateParams {
  lang: PracticeLang;
  type: QuestionType;
  tier: number;
  timeFormat: TimeFormat;
}

export function tierCount(lang: PracticeLang, type: QuestionType, timeFormat: TimeFormat): number {
  switch (type) {
    case 'cardinal':
      return CARDINAL_TIERS;
    case 'year':
      return YEAR_TIERS;
    case 'phone':
      return PHONE_TIERS;
    case 'time':
      return timeTierCount(lang, timeFormat);
  }
}

function makeId(rng: Rng): string {
  return Math.floor(rng() * 2 ** 32).toString(36);
}

export function generateQuestion(params: GenerateParams, rng: Rng = Math.random): Question {
  const { lang, type, tier } = params;
  const count = tierCount(lang, type, params.timeFormat);
  if (!Number.isInteger(tier) || tier < 1 || tier > count) {
    throw new RangeError(`No tier ${tier} for ${lang}/${type} (1–${count})`);
  }

  const timeFormat = effectiveTimeFormat(lang, params.timeFormat);
  let body: QuestionBody;
  switch (type) {
    case 'cardinal':
      body = generateCardinal(lang, tier, rng);
      break;
    case 'year':
      body = generateYear(lang, tier, rng);
      break;
    case 'phone':
      body = generatePhone(lang, tier, rng);
      break;
    case 'time':
      body = generateTime(lang, tier, timeFormat, rng);
      break;
  }

  return {
    id: makeId(rng),
    lang,
    type,
    tier,
    ...body,
    tts: deriveTts(body.display),
    ...(type === 'time' && { timeFormat }),
  };
}
