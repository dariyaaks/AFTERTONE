import { clamp, wordCount } from '../util.js';
import { analyzeTextLLM } from './llm.js';

/* ---------- словари (регулярные фрагменты, начало слова проверяется автоматически) ---------- */
const POS = ['счастл', 'счасть', 'радост', 'радов', 'весел', 'тепл', 'уютн', 'уют', 'смех', 'смея', 'смеял', 'хохота', 'улыб', 'любл', 'любим', 'обним', 'вкусн', 'красив', 'прекрасн', 'чудесн', 'здорово', 'кайф', 'нежн', 'благодар', 'горд', 'вдохнов', 'восторг', 'отличн', 'классн', 'супер', 'лучш', 'нравил', 'солнечн'];
const NEG = ['груст', 'плох', 'тяжел', 'устал', 'одинок', 'плак', 'слезы', 'слезам', 'тоск', 'скуч', 'тревож', 'страшн', 'обидн', 'болел', 'болит', 'ссор', 'потерял', 'разочар', 'пустот', 'раздраж', 'злост', 'злил', 'бесит', 'провал', 'ужасн', 'кошмар', 'стресс', 'нервнич', 'паник', 'выгор'];
const STRESS = ['дедлайн', 'срочн', 'сдач', 'сдавал', 'аврал', 'горит', 'экзамен'];
const HIGH = ['бежал', 'бегал', 'успева', 'успел', 'быстр', 'танц', 'вечеринк', 'концерт', 'драйв', 'шумн', 'гонк', 'спешил', 'спешк', 'суета', 'кричал', 'адреналин', 'мчал', 'прыга', 'запар', 'санк', 'хохота', 'гоняли'];
const LOW = ['спокойн', 'медленн', 'тихо', 'тихий', 'тихая', 'тишин', 'неспешн', 'долго разговар', 'лежал', 'отдыха', 'уют', 'какао', 'плед', 'дожд', 'закат', 'гуляли', 'гулял', 'чай(?![а-я])', 'чаем', 'кофе', 'книг', 'созерц', 'умиротвор', 'размеренн', 'расслаб', 'задумчив', 'молча', 'вспомина'];
const REFLECT = ['помн', 'вспомин', 'вспомн', 'детств', 'раньше', 'ностальг', 'старый', 'старая', 'давно', 'когда-то', 'прошл'];

const SEASONS = {
  autumn: ['осен', 'листь', 'листв', 'желт', 'золот', 'хмур'],
  winter: ['зим', 'снег', 'снеж', 'мороз', 'метел', 'новогодн', 'рождеств', 'санк'],
  spring: ['весн', 'подснежн', 'оттепел', 'сирен', 'тюльпан'],
  summer: ['лето', 'летн', 'летом', 'жара', 'жарк', 'пляж', 'купал', 'отпуск', 'каникул', 'загорал'],
};
const TIMES = {
  night: ['ноч', 'полночь', 'за полночь', 'поздно'],
  evening: ['вечер', 'закат', 'сумерк'],
  morning: ['утр', 'рассвет', 'проснул'],
  day: ['днем', 'обед', 'полдень', 'после обеда'],
};
const WEATHER = {
  rain: ['дожд', 'ливн', 'лужи', 'ливень'],
  snow: ['снег', 'снеж', 'метел'],
  fog: ['туман'],
  wind: ['ветер', 'ветрен', 'ветр'],
  sun: ['солнечн', 'солнце', 'солнышк'],
  cold: ['холодн', 'мороз', 'озяб', 'замерз'],
  hot: ['жарк', 'жара', 'духот'],
};
const PLACES = [
  { re: ['парк'], noun: 'парк', loc: 'в парке', g: 'm' },
  { re: ['пруд'], noun: 'пруд', loc: 'у пруда', g: 'm' },
  { re: ['офис'], noun: 'офис', loc: 'в офисе', g: 'm' },
  { re: ['море', 'моря', 'морю', 'морск', 'пляж'], noun: 'берег моря', loc: 'у моря', g: 'm' },
  { re: ['лес(?![а-я])', 'лесу', 'лесн'], noun: 'лес', loc: 'в лесу', g: 'm' },
  { re: ['озер'], noun: 'берег озера', loc: 'у озера', g: 'm' },
  { re: ['набережн'], noun: 'набережная', loc: 'на набережной', g: 'f' },
  { re: ['горах', 'горы(?![а-я])', 'горн'], noun: 'горы', loc: 'в горах', g: 'pl' },
  { re: ['кафе', 'кофейн', 'ресторан'], noun: 'кафе', loc: 'в кафе', g: 'n' },
  { re: ['универ', 'вуз(?![а-я])', 'аудитор', 'лекци'], noun: 'университет', loc: 'в университете', g: 'm' },
  { re: ['поезд', 'вокзал'], noun: 'поезд', loc: 'в поезде', g: 'm' },
  { re: ['кинотеатр', 'в кино(?![а-я])'], noun: 'кинотеатр', loc: 'в кино', g: 'm' },
  { re: ['город'], noun: 'город', loc: 'в городе', g: 'm' },
  { re: ['бабушк'], noun: 'дом бабушки', loc: 'у бабушки', g: 'm' },
  { re: ['дом(?![а-я])', 'дома(?![а-я])', 'домой'], noun: 'дом', loc: 'дома', g: 'm' },
];
const ITEMS = [
  { re: ['какао'], word: 'какао' },
  { re: ['кофе'], word: 'кофе' },
  { re: ['чай(?![а-я])', 'чаем', 'чаю'], word: 'чай' },
  { re: ['пицц'], word: 'пицца' },
  { re: ['мороженое', 'мороженн'], word: 'мороженое' },
  { re: ['шоколад'], word: 'шоколад' },
  { re: ['торт(?![а-я])'], word: 'торт' },
  { re: ['блин(?![а-я])', 'блины'], word: 'блины' },
  { re: ['пирог', 'пирожк'], word: 'пироги' },
];
const PEOPLE = {
  partner: ['девушк', 'парн', 'любим', 'жена', 'женой', 'муж(?![а-я])', 'мужем', 'вдвоем'],
  friends: ['друз', 'подруг'],
  family: ['семь', 'мам(?![а-я])', 'мамой', 'пап(?![а-я])', 'папой', 'бабушк', 'дедушк', 'сестр', 'брат(?![а-я])', 'брата'],
  colleagues: ['коллег', 'команд'],
  alone: ['один(?![а-я])', 'одна(?![а-я])', 'одинок'],
};

const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');
const rx = (stems) => new RegExp(`(?<![а-яa-z])(?:${stems.join('|')})`, 'g');
const count = (text, stems) => (text.match(rx(stems)) || []).length;
const best = (text, table) => {
  let top = null, topN = 0;
  for (const [k, stems] of Object.entries(table)) {
    const n = count(text, stems);
    if (n > topN) { top = k; topN = n; }
  }
  return top;
};

/* ---------- заголовок дня (3–7 слов, один тон) ---------- */
const TIME_NOUN = { morning: 'Утро', day: 'День', evening: 'Вечер', night: 'Ночь' };
const SEASON_ADJ = {
  autumn: { m: 'Осенний', n: 'Осеннее', f: 'Осенняя', pl: 'Осенние' },
  winter: { m: 'Зимний', n: 'Зимнее', f: 'Зимняя', pl: 'Зимние' },
  spring: { m: 'Весенний', n: 'Весеннее', f: 'Весенняя', pl: 'Весенние' },
  summer: { m: 'Летний', n: 'Летнее', f: 'Летняя', pl: 'Летние' },
};

function moodSuffix(a) {
  if (a.energy > 0.62) return 'в быстром ритме';
  if (a.valence > 0.2 && a.energy < 0.5) return 'в тёплом свете';
  if (a.valence < -0.2) return 'в тихих тонах';
  return 'без спешки';
}

export function validTitle(t) {
  if (typeof t !== 'string') return null;
  const clean = t.replace(/["«»“”„.]+/g, '').replace(/\s+/g, ' ').trim();
  const n = wordCount(clean);
  if (n < 3 || n > 7 || clean.length > 60) return null;
  return clean[0].toUpperCase() + clean.slice(1);
}

export function heuristicTitle(a) {
  const { place, item, season, timeOfDay } = a;
  const withItem = (s) => (item ? `${s} и ${item}` : s);
  let t;
  if (a.deadline && place) t = `${TIME_NOUN[timeOfDay || 'day']} ${place.loc} перед сдачей`;
  else if (a.deadline) t = `${TIME_NOUN[timeOfDay || 'day']} перед сдачей`;
  else if (season && place) t = withItem(`${SEASON_ADJ[season][place.g]} ${place.noun}`);
  else if (timeOfDay && place) t = withItem(`${TIME_NOUN[timeOfDay]} ${place.loc}`);
  else if (place) t = withItem(`День ${place.loc}`);
  else if (season) t = withItem(`${SEASON_ADJ[season].m} день`);
  else if (timeOfDay) t = `${TIME_NOUN[timeOfDay]} ${moodSuffix(a)}`;
  else t = `День ${moodSuffix(a)}`;
  if (wordCount(t) < 3) t += ` ${moodSuffix(a)}`;
  return validTitle(t) || 'День в своём ритме';
}

/* ---------- ключевая фраза для «киношного» момента ---------- */
function pickKeyQuote(raw, normText) {
  const sentences = raw.split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  if (!sentences.length) return null;
  let bestS = null, bestScore = -1;
  for (const s of sentences) {
    const n = norm(s);
    const words = wordCount(s);
    if (words < 3 || words > 22) continue;
    const score =
      count(n, POS) + count(n, NEG) * 1.2 + count(n, REFLECT) * 0.6 + (s.match(/!/g) || []).length * 0.8 +
      (words >= 5 && words <= 14 ? 0.5 : 0);
    if (score > bestScore) { bestScore = score; bestS = s; }
  }
  return (bestS || sentences[0]).replace(/[.!?…]+$/, '').slice(0, 140);
}

/* ---------- основной анализ по словарю ---------- */
export function analyzeTextLexicon(raw) {
  const text = String(raw || '').trim();
  const n = norm(text);
  const pos = count(n, POS);
  const stress = count(n, STRESS);
  const neg = count(n, NEG) + stress * 0.5;
  const high = count(n, HIGH) + stress;
  const low = count(n, LOW);
  const excl = (text.match(/!/g) || []).length;

  const valence = clamp((1.5 * (pos - neg)) / (pos + neg + 2), -1, 1);
  const sentences = text.split(/[.!?…]+/).filter((s) => s.trim());
  const avgLen = sentences.length ? wordCount(text) / sentences.length : 10;
  const energy = clamp(0.5 + 0.12 * (high - low) + 0.03 * excl + (avgLen < 7 ? 0.05 : 0), 0.05, 0.98);
  const reflective = clamp(count(n, REFLECT) / 3);

  const place = PLACES.find((p) => count(n, p.re) > 0) || null;
  const itemHit = ITEMS.find((i) => count(n, i.re) > 0);
  const weather = Object.entries(WEATHER).filter(([, st]) => count(n, st) > 0).map(([k]) => k);
  const keywords = [place?.noun, itemHit?.word, ...weather.map((w) => ({ rain: 'дождь', snow: 'снег', fog: 'туман', wind: 'ветер', sun: 'солнце', cold: 'холод', hot: 'жара' }[w]))]
    .filter(Boolean)
    .slice(0, 6);

  const a = {
    source: 'lexicon',
    valence: +valence.toFixed(2),
    energy: +energy.toFixed(2),
    reflective: +reflective.toFixed(2),
    season: best(n, SEASONS),
    timeOfDay: best(n, TIMES),
    weather,
    place,
    item: itemHit?.word || null,
    people: best(n, PEOPLE),
    deadline: stress > 0,
    keywords,
    keyQuote: pickKeyQuote(text, n),
    wordCount: wordCount(text),
    signals: { positive: pos, negative: +neg.toFixed(1), high, low },
  };
  a.title = heuristicTitle(a);
  return a;
}

/* ---------- полный анализ: словарь + (опционально) языковая модель ---------- */
export async function analyzeText(raw, { useAI = true } = {}) {
  const base = analyzeTextLexicon(raw);
  if (!useAI) return base;
  const ai = await analyzeTextLLM(raw);
  if (!ai) return base;

  const merged = { ...base, source: 'llm' };
  if (ai.valence != null) merged.valence = ai.valence;
  if (ai.energy != null) merged.energy = ai.energy;
  if (ai.season) merged.season = ai.season;
  if (ai.timeOfDay) merged.timeOfDay = ai.timeOfDay;
  if (ai.weather?.length) merged.weather = [...new Set([...base.weather, ...ai.weather])];
  if (ai.people) merged.people = ai.people;
  if (ai.keywords?.length) merged.keywords = ai.keywords.slice(0, 6);
  // цитата должна дословно присутствовать в записи
  if (ai.keyQuote && norm(raw).includes(norm(ai.keyQuote))) merged.keyQuote = ai.keyQuote;
  const t = validTitle(ai.title);
  merged.title = t || base.title;
  return merged;
}
