import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTextLexicon, validTitle } from '../src/engine/text.js';
import { normalizeMusic, profileMusic, estimateBpm } from '../src/engine/music.js';
import { aggregatePhotos, statsFromPixels } from '../src/engine/photo.js';
import { composeDay } from '../src/engine/style.js';
import { wordCount } from '../src/util.js';

const px = (rgb, n = 60, j = 25) => Array.from({ length: n }, (_, i) => rgb.map((v) => Math.max(0, Math.min(255, v + ((i * 37) % j) - j / 2))));
const photos = (...groups) => aggregatePhotos(groups.map((g) => statsFromPixels(g.flat())));

const DAYS = [
  { key: 'park', text: 'Гуляли по парку, всё в жёлтых листьях, было холодно, но мы пили какао и долго разговаривали', music: { artist: 'Frank Sinatra', title: 'Fly Me to the Moon', genre: 'Vocal Jazz', year: 1964 }, photos: photos([px([220, 150, 60]), px([180, 110, 40], 40)], [px([200, 130, 50]), px([120, 80, 40], 30)]), expect: 'impressionist' },
  { key: 'office', text: 'Срочная сдача проекта, ночь в офисе, в наушниках электронная музыка', music: { artist: 'Kavinsky', title: 'Nightcall', genre: 'Electronic', year: 2010, bpm: 91, mode: 'minor' }, photos: photos([px([40, 60, 90], 50), px([200, 210, 220], 12), px([20, 25, 35], 30)]), expect: 'constructivist' },
  { key: 'rain', text: 'Весь день шёл дождь, было одиноко и грустно, лежал под пледом и вспоминал детство.', music: { artist: 'Einaudi', title: 'Nuvole Bianche', genre: 'Classical', year: 2004, bpm: 62, mode: 'minor' }, photos: photos([px([110, 120, 130], 60), px([150, 150, 150], 30)]), expect: 'minimal' },
  { key: 'snow', text: 'Первый снег! Гоняли на санках с друзьями, хохотали до слёз, потом пили чай. Лучший день зимы!', music: { artist: 'Pharrell', title: 'Happy', genre: 'Pop', year: 2013, bpm: 160, mode: 'major' }, photos: photos([px([230, 240, 250], 60), px([220, 60, 60], 20), px([60, 110, 200], 20)], [px([240, 245, 250], 60), px([250, 200, 60], 15)]), expect: 'constructivist' },
];

const compose = (d) => composeDay({ analysis: analyzeTextLexicon(d.text), photos: d.photos, music: profileMusic(normalizeMusic(d.music)), user: { age: 20, interests: [] }, seed: 7 });

test('названия дней: 3–7 слов', () => {
  for (const d of DAYS) assert.ok((n => n >= 3 && n <= 7)(wordCount(analyzeTextLexicon(d.text).title)), d.key);
  assert.equal(analyzeTextLexicon(DAYS[0].text).title, 'Осенний парк и какао');
  assert.equal(analyzeTextLexicon(DAYS[1].text).title, 'Ночь в офисе перед сдачей');
  assert.equal(validTitle('Слишком короткое'), null);
});

test('настроение не сводится к «грустно = синий»: приём зависит от энергии, света и музыки', () => {
  for (const d of DAYS) assert.equal(compose(d).scene.style, d.expect, d.key);
  const styles = new Set(DAYS.map((d) => compose(d).scene.style));
  assert.ok(styles.size >= 3, 'в ленте минимум 3 разных приёма');
});

test('сцена: валидные цвета, тайминг, коллаж в границах холста', () => {
  for (const d of DAYS) {
    const { scene, passport } = compose(d);
    for (const c of [scene.palette.bg, scene.palette.text, scene.palette.accent, scene.palette.highlight]) assert.match(c, /^#[0-9a-f]{6}$/);
    const sum = scene.timeline.reduce((s, t) => s + t.duration, 0);
    assert.ok(Math.abs(sum - scene.motion.durationSeconds) < 0.2);
    assert.ok(scene.motion.durationSeconds >= 15 && scene.motion.durationSeconds <= 60);
    for (const r of scene.collage.items) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.01 && r.y + r.h <= 1.01, `${d.key} collage`);
    assert.ok(passport.length >= 5);
    assert.ok(scene.audio.ducking.duckGain < 0.5 && scene.audio.quote.startAt + scene.audio.quote.durationSec < scene.motion.durationSeconds);
  }
});

test('музыка влияет на ритм: медленная и быстрая песни дают разный монтаж', () => {
  const base = { analysis: analyzeTextLexicon('Обычный день у моря'), photos: DAYS[0].photos, user: {}, seed: 1 };
  const slow = composeDay({ ...base, music: profileMusic(normalizeMusic({ bpm: 60 })) }).scene.motion.cutSeconds;
  const fast = composeDay({ ...base, music: profileMusic(normalizeMusic({ bpm: 150 })) }).scene.motion.cutSeconds;
  assert.ok(slow > fast);
});

test('профиль песни честно различает измеренный темп и оценку по жанру', () => {
  assert.equal(profileMusic(normalizeMusic({ bpm: 128 })).bpmSource, 'measured');
  assert.equal(profileMusic(normalizeMusic({ genre: 'Electronic' })).bpmSource, 'genre-estimate');
  assert.equal(profileMusic(normalizeMusic({})).bpmSource, 'default');
  assert.equal(normalizeMusic({ url: 'javascript:alert(1)' }).url, null);
});

test('estimateBpm находит темп синтетического клика', () => {
  const sr = 8000, bpm = 100, len = sr * 20, s = new Float32Array(len);
  const step = Math.round((60 / bpm) * sr);
  for (let i = 0; i < len; i += step) for (let j = 0; j < 80 && i + j < len; j++) s[i + j] = 1 - j / 80;
  const est = estimateBpm(s, sr);
  assert.ok(Math.abs(est - bpm) <= 3, `получили ${est}`);
});

test('ключевая фраза берётся дословно из записи', () => {
  const t = 'Весь день работал. Но вечером она сказала, что гордится мной! Потом мы пили чай.';
  const a = analyzeTextLexicon(t);
  assert.ok(t.includes(a.keyQuote));
});

test('ностальгичный день с винтажной музыкой уходит в «плёнку»', () => {
  const p = photos([px([90, 59, 36], 60), px([168, 121, 74], 40), px([58, 37, 23], 30)]);
  const a = analyzeTextLexicon('Приехали к бабушке, пахло пирогами, листали старые фотографии и вспоминали детство. Всё как раньше.');
  const { scene } = composeDay({ analysis: a, photos: p, music: profileMusic(normalizeMusic({ genre: 'Jazz', year: 1958 })), user: {}, seed: 3 });
  assert.equal(scene.style, 'film');
  assert.equal(a.title, 'День у бабушки и пироги');
});

/* ---------- запасной режим обработки фото (без sharp) ---------- */
import { readExifOrientation, orientRGBA, shrinkRGBA, pixelsFromRGBA } from '../src/engine/photo.js';

test('EXIF: читается ориентация из заголовка JPEG', () => {
  const exif = Buffer.from([
    0xff, 0xd8, 0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // APP1 «Exif»
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF little-endian, IFD0 через 8 байт
    0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // 1 тег: ориентация = 6
  ]);
  assert.equal(readExifOrientation(exif), 6);
  assert.equal(readExifOrientation(Buffer.from([0xff, 0xd8, 0xff, 0xda])), 1);
  assert.equal(readExifOrientation(Buffer.from([1, 2, 3])), 1);
});

test('поворот RGBA: 90° по часовой меняет размеры и переносит пиксели', () => {
  // 3×2: у каждого пикселя уникальное значение R
  const data = new Uint8Array(3 * 2 * 4);
  for (let i = 0; i < 6; i++) { data[i * 4] = i * 10; data[i * 4 + 3] = 255; }
  const r = orientRGBA({ width: 3, height: 2, data }, 6);
  assert.deepEqual([r.width, r.height], [2, 3]);
  // верхний левый (0) уходит в верхний правый; верхний правый (20) — в нижний правый
  assert.equal(r.data[(0 * 2 + 1) * 4], 0);
  assert.equal(r.data[(2 * 2 + 1) * 4], 20);
  assert.equal(orientRGBA({ width: 3, height: 2, data }, 1).width, 3);
});

test('уменьшение и выборка пикселей для статистики цвета', () => {
  const w = 400, h = 200, data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = 220; data[i * 4 + 1] = 140; data[i * 4 + 2] = 60; data[i * 4 + 3] = 255; }
  const small = shrinkRGBA({ width: w, height: h, data }, 100);
  assert.ok(Math.max(small.width, small.height) <= 100);
  const px = pixelsFromRGBA(small);
  assert.ok(px.length > 0 && px.length <= 60 * 60);
  const st = statsFromPixels(px);
  assert.ok(st.warmth > 0.4, 'оранжевые пиксели дают тёплые тона');
});
