import { clamp, lerp, round, hexToHsl, hsl, lerpHue, mulberry32 } from '../util.js';

/* ======================================================================
   ПОСТОЯННЫЕ элементы — одинаковы в каждом дне, делают ленту цельной
   ====================================================================== */
export const DIARY_CONSTANTS = {
  aspect: '4:5',
  grid: { columns: 12, margin: 0.06 },
  datePlacement: 'top-left',
  titlePlacement: 'bottom-left',
  signaturePlacement: 'bottom-right',
  photoFrame: { style: 'inset', radius: 4, border: 0 },
  fonts: { display: 'Cormorant Garamond', body: 'Inter', handwriting: 'Caveat', mono: 'JetBrains Mono' },
};

export const STYLES = {
  impressionist: { label: 'Импрессионизм · Моне', short: 'Моне' },
  constructivist: { label: 'Абстракция · Кандинский', short: 'Кандинский' },
  film: { label: 'Плёнка · ретро-фото', short: 'Плёнка' },
  minimal: { label: 'Минимализм · японская графика', short: 'Минимализм' },
};

const INTEREST_BIAS = {
  impressionist: ['живопис', 'искусств', 'арт', 'природ', 'рисован', 'музе'],
  constructivist: ['технолог', 'программ', 'игр', 'дизайн', 'спорт', 'электрон', 'it'],
  film: ['кино', 'фото', 'винтаж', 'ретро', 'театр'],
  minimal: ['минимал', 'япони', 'аниме', 'книг', 'медитац', 'йог'],
};

/** Какие форматы показать первыми (мягкая подсказка, а не ограничение) */
export function recommendFormats(user = {}) {
  const interests = (user.interests || []).map((s) => String(s).toLowerCase());
  const order = (user.age || 30) <= 24 ? ['video', 'collage', 'slideshow'] : ['slideshow', 'video', 'collage'];
  if (interests.some((i) => i.includes('фото') || i.includes('дизайн'))) return ['collage', ...order.filter((f) => f !== 'collage')];
  return order;
}

/* ======================================================================
   1. Единый вектор настроения: текст + фото + музыка
   ====================================================================== */
export function computeMood({ text, photos, music }) {
  const contrastN = clamp(photos.contrast * 2.5);
  const photoValence = clamp((photos.lightness - 0.45) * 1.4 + photos.warmth * 0.35, -1, 1);
  const parts = [[text.valence, 0.55], [photoValence, 0.2]];
  if (music.mode) parts.push([music.mode === 'major' ? 0.6 : -0.6, 0.25]);
  const wsum = parts.reduce((s, [, w]) => s + w, 0);
  const valence = clamp(parts.reduce((s, [v, w]) => s + v * w, 0) / wsum, -1, 1);

  const energy = clamp(0.5 * text.energy + 0.35 * music.energy + 0.15 * contrastN);
  const air = clamp(0.9 - 0.65 * energy + 0.15 * (1 - contrastN), 0.05, 1);
  const tension = clamp(0.45 * energy + 0.35 * (1 - (valence + 1) / 2) + 0.2 * contrastN);
  const eraScore = { vintage: 0.45, classic: 0.3, modern: 0.05 }[music.era] ?? 0;
  const nostalgia = clamp(eraScore + (text.reflective || 0) * 0.35 + clamp(photos.warmth, 0, 1) * 0.15);

  let label;
  const calm = energy < 0.45;
  if (valence > 0.25) label = calm ? 'тёплый и неспешный' : 'яркий и живой';
  else if (valence < -0.25) label = calm ? 'задумчивый и приглушённый' : 'напряжённый и сосредоточенный';
  else label = calm ? 'тихий и ровный' : 'собранный и быстрый';

  return {
    valence: round(valence), energy: round(energy), air: round(air), tension: round(tension),
    nostalgia: round(nostalgia), label,
  };
}

/* ======================================================================
   2. Выбор художественного приёма по правилам (не «грустно = синий»)
   ====================================================================== */
export function chooseStyle({ mood, photos, music, user = {}, forced = 'auto' }) {
  const contrastN = clamp(photos.contrast * 2.5);
  const satN = clamp(photos.saturation * 1.5);
  const quiet = 1 - mood.energy;
  const scores = {
    impressionist: 0.45 * mood.air + 0.25 * (1 - mood.tension) + 0.15 * photos.lightness + 0.15 * satN,
    constructivist: 0.4 * mood.tension + 0.4 * mood.energy + 0.2 * contrastN + 0.15 * clamp((mood.energy - 0.6) / 0.4),
    film: 0.5 * mood.nostalgia + 0.2 * quiet + 0.2 * clamp(photos.warmth + 0.3) + 0.1 * (1 - photos.lightness),
    minimal: 0.35 * quiet + 0.3 * (1 - satN) + 0.2 * (photos.count <= 2 ? 1 : 0.2) + 0.15 * mood.air,
  };
  const interests = (user.interests || []).map((s) => String(s).toLowerCase());
  for (const [k, words] of Object.entries(INTEREST_BIAS)) {
    if (interests.some((i) => words.some((w) => i.includes(w)))) scores[k] += 0.06;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const chosen = STYLES[forced] ? forced : ranked[0][0];
  const runnerUp = ranked.find(([k]) => k !== chosen)[0];
  return { chosen, runnerUp, forced: !!STYLES[forced], scores: Object.fromEntries(ranked.map(([k, v]) => [k, round(v)])) };
}

/* ======================================================================
   3. Палитра: берётся из фото, затем «обрабатывается» приёмом
   ====================================================================== */
function keyColors(palette) {
  const list = palette.length ? palette : [{ hex: '#8c7b6b' }];
  const chroma = list.filter((c) => { const [, s, l] = hexToHsl(c.hex); return s >= 0.18 && l > 0.15 && l < 0.9; });
  const first = chroma[0] || list[0];
  const second = chroma.find((c) => c !== first) || list.find((c) => c !== first) || first;
  return [hexToHsl(first.hex), hexToHsl(second.hex)];
}

export function pickTheme(style, mood, text, photos) {
  if (text.timeOfDay === 'night') return 'dark';
  if (style === 'constructivist') return mood.energy > 0.6 ? 'dark' : 'light';
  if (style === 'film') return photos.lightness < 0.4 ? 'dark' : 'light';
  if (style === 'minimal') return photos.lightness < 0.35 ? 'dark' : 'light';
  return 'light';
}

export function buildPalette(style, { photos, mood, theme }) {
  const [[h0, s0], [h1]] = keyColors(photos.palette);
  const dark = theme === 'dark';
  const out = (p) => ({ ...p, gradient: p.gradient });
  switch (style) {
    case 'impressionist': {
      const h = lerpHue(h0, 40, photos.warmth > 0 ? 0.25 : 0);
      const s = clamp(s0 * 0.8 + 0.1, 0.35, 0.65);
      const hi = hsl(lerpHue(h, 50, 0.6), 0.85, dark ? 0.72 : 0.78);
      return out(dark
        ? { bg: hsl(h, 0.28, 0.13), surface: hsl(h, 0.26, 0.19), text: hsl(h, 0.3, 0.9), accent: hsl(h, s, 0.62), accent2: hsl(h1, 0.5, 0.6), highlight: hi, shadow: hsl(h, 0.3, 0.06), gradient: [hsl(h, 0.35, 0.2), hsl(h1, 0.4, 0.3), hi] }
        : { bg: hsl(h, 0.4, 0.93), surface: hsl(h, 0.35, 0.88), text: hsl(h, 0.35, 0.18), accent: hsl(h, s, 0.52), accent2: hsl(h1, 0.5, 0.6), highlight: hi, shadow: hsl(h, 0.3, 0.3), gradient: [hsl(h, 0.5, 0.82), hsl(h1, 0.45, 0.78), hi] });
    }
    case 'constructivist': {
      const s = clamp(s0 * 1.1 + 0.25, 0.6, 0.9);
      const hc = (h0 + 180) % 360, hy = (h0 + 90) % 360;
      const a = hsl(h0, s, 0.5), b = hsl(hc, s, 0.55), c = hsl(hy, s, 0.6);
      return out(dark
        ? { bg: hsl(h0, 0.35, 0.09), surface: hsl(h0, 0.3, 0.14), text: hsl(h0, 0.1, 0.94), accent: a, accent2: b, highlight: c, shadow: '#000000', gradient: [hsl(h0, 0.4, 0.12), a, b] }
        : { bg: hsl(h0, 0.08, 0.94), surface: '#ffffff', text: hsl(h0, 0.3, 0.1), accent: a, accent2: b, highlight: c, shadow: hsl(h0, 0.2, 0.2), gradient: [a, b, c] });
    }
    case 'film': {
      const h = lerpHue(h0, 34, 0.5);
      const s = clamp(s0 * 0.6, 0.22, 0.5);
      const leak = hsl(40, 0.75, 0.72);
      return out(dark
        ? { bg: hsl(h, 0.25, 0.12), surface: hsl(h, 0.22, 0.17), text: hsl(h, 0.3, 0.88), accent: hsl(h, s, 0.58), accent2: hsl(lerpHue(h1, 200, 0.3), 0.25, 0.5), highlight: leak, shadow: hsl(h, 0.25, 0.05), gradient: [hsl(h, 0.28, 0.14), hsl(h, s, 0.4), leak] }
        : { bg: hsl(h, 0.22, 0.9), surface: hsl(h, 0.2, 0.85), text: hsl(h, 0.3, 0.18), accent: hsl(h, s, 0.45), accent2: hsl(lerpHue(h1, 200, 0.3), 0.25, 0.45), highlight: leak, shadow: hsl(h, 0.25, 0.25), gradient: [hsl(h, 0.3, 0.8), hsl(h, s, 0.6), leak] });
    }
    default: {
      // minimal: почти монохром и один акцент
      const s = clamp(s0 * 0.35, 0.06, 0.22);
      const accent = hsl(h0, clamp(s0 * 0.8, 0.3, 0.6), 0.5);
      return out(dark
        ? { bg: hsl(h0, 0.1, 0.08), surface: hsl(h0, 0.08, 0.12), text: hsl(h0, 0.06, 0.92), accent, accent2: hsl(h0, 0.06, 0.55), highlight: accent, shadow: '#000000', gradient: [hsl(h0, s, 0.1), hsl(h0, s, 0.16), accent] }
        : { bg: hsl(h0, 0.1, 0.96), surface: '#ffffff', text: hsl(h0, 0.1, 0.14), accent, accent2: hsl(h0, 0.06, 0.45), highlight: accent, shadow: hsl(h0, 0.1, 0.3), gradient: [hsl(h0, s, 0.95), hsl(h0, s, 0.9), accent] });
    }
  }
}

/* ======================================================================
   4. Ритм, движение, фильтры, шейдер, частицы
   ====================================================================== */
const STYLE_MOTION = {
  impressionist: { beats: 8, transition: 'brush-dissolve', grain: 0.15, vignette: 0.25, kenBurns: 0.1, shader: 'watercolor-flow' },
  constructivist: { beats: 2, transition: 'geometric-wipe', grain: 0.06, vignette: 0.1, kenBurns: 0.06, shader: 'geometric-field' },
  film: { beats: 4, transition: 'dip-burn', grain: 0.5, vignette: 0.45, kenBurns: 0.08, shader: 'film-leak' },
  minimal: { beats: 8, transition: 'slow-fade', grain: 0.04, vignette: 0, kenBurns: 0.04, shader: 'paper-ink' },
};

export function buildMotion(style, mood, music, n) {
  const m = STYLE_MOTION[style];
  const beats = m.beats;
  const cut = clamp((60 / music.bpm) * beats, 1.2, 10);
  const total = n ? clamp(n * cut, 15, 45) : 15;
  const segments = Math.max(n || 1, Math.round(total / cut));
  return {
    bpm: music.bpm, beatsPerCut: beats, cutSeconds: round(cut, 1),
    durationSeconds: round(total, 1), segments, transition: m.transition,
    grain: round(m.grain * (0.8 + 0.4 * (1 - mood.air)), 2), vignette: m.vignette,
    kenBurns: round(m.kenBurns * (0.7 + 0.6 * mood.energy), 3), shaderPreset: m.shader,
  };
}

export function buildFilters(style, mood) {
  const f = {
    impressionist: { saturate: round(1.05 + 0.12 * mood.air), contrast: 0.94, brightness: 1.04, sepia: 0.08, grayscale: 0, blurPx: round(0.4 + 0.6 * mood.air, 1) },
    constructivist: { saturate: round(1.1 + 0.25 * mood.tension), contrast: round(1.1 + 0.2 * mood.tension), brightness: 0.96, sepia: 0, grayscale: 0, blurPx: 0 },
    film: { saturate: 0.85, contrast: 1.05, brightness: 0.98, sepia: 0.25, grayscale: 0, blurPx: 0.3 },
    minimal: { saturate: 0.7, contrast: 0.96, brightness: 1.06, sepia: 0, grayscale: 0.25, blurPx: 0 },
  }[style];
  return { ...f, css: `saturate(${f.saturate}) contrast(${f.contrast}) brightness(${f.brightness}) sepia(${f.sepia}) grayscale(${f.grayscale}) blur(${f.blurPx}px)` };
}

export function buildParticles(style, text, mood) {
  const w = text.weather || [];
  let type = 'none';
  if (w.includes('rain')) type = 'rain';
  else if (w.includes('snow') || text.season === 'winter') type = 'snow';
  else if (text.season === 'autumn') type = 'leaves';
  else if (text.timeOfDay === 'night' && (text.season === 'summer' || mood.valence > 0.2)) type = 'fireflies';
  else if (style === 'film') type = 'dust';
  else if (style === 'constructivist') type = 'shards';
  return { type, density: round(lerp(0.2, 0.8, mood.energy)), speed: round(lerp(0.3, 1.2, mood.energy)) };
}

export function buildTimeline(n, motion, rng) {
  const count = n || 1;
  const seg = motion.durationSeconds / motion.segments;
  const out = [];
  for (let i = 0; i < motion.segments; i++) {
    const zoomIn = i % 2 === 0;
    const k = motion.kenBurns;
    out.push({
      index: i % count,
      start: round(i * seg, 2),
      duration: round(seg, 2),
      transition: motion.transition,
      kenBurns: {
        fromScale: zoomIn ? 1 : round(1 + k, 3), toScale: zoomIn ? round(1 + k, 3) : 1,
        fromX: round((rng() - 0.5) * k * 2, 3), toX: round((rng() - 0.5) * k * 2, 3),
        fromY: round((rng() - 0.5) * k * 2, 3), toY: round((rng() - 0.5) * k * 2, 3),
      },
    });
  }
  return out;
}

/* ---------- коллаж: координаты в долях холста 4:5 ---------- */
function splitRect(rect, n, vertical) {
  if (n <= 1) return [rect];
  const left = Math.ceil(n / 2), ratio = 0.618 * (left / (n - left || 1)) > 1 ? 0.618 : left / n;
  const r = clamp(ratio, 0.3, 0.7);
  const [a, b] = vertical
    ? [{ x: rect.x, y: rect.y, w: rect.w * r, h: rect.h }, { x: rect.x + rect.w * r, y: rect.y, w: rect.w * (1 - r), h: rect.h }]
    : [{ x: rect.x, y: rect.y, w: rect.w, h: rect.h * r }, { x: rect.x, y: rect.y + rect.h * r, w: rect.w, h: rect.h * (1 - r) }];
  return [...splitRect(a, left, !vertical), ...splitRect(b, n - left, !vertical)];
}

export function buildCollage(style, n, rng) {
  const count = Math.max(1, Math.min(n, 8));
  const pad = 0.06;
  const items = [];
  if (style === 'constructivist') {
    const gap = 0.012;
    splitRect({ x: pad, y: pad, w: 1 - 2 * pad, h: 0.8 }, count, true).forEach((r, i) =>
      items.push({ index: i, x: round(r.x + gap), y: round(r.y + gap), w: round(r.w - 2 * gap), h: round(r.h - 2 * gap), rotate: 0, z: i }));
  } else if (style === 'minimal') {
    items.push({ index: 0, x: 0.1, y: 0.1, w: 0.62, h: 0.62 * 1.25 * 0.8, rotate: 0, z: 0 });
    for (let i = 1; i < count; i++) items.push({ index: i, x: round(0.58 + (i % 2) * 0.12), y: round(0.58 + (i - 1) * 0.1), w: 0.24, h: 0.2, rotate: 0, z: i });
  } else {
    // film / impressionist: сдвинутая сетка с лёгким поворотом (полароиды / мазки)
    const cols = count <= 2 ? 1 : 2, rows = Math.ceil(count / cols);
    const cw = (1 - 2 * pad) / cols, ch = 0.8 / rows;
    const tilt = style === 'film' ? 7 : 2.5;
    for (let i = 0; i < count; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const w = cw * (0.82 + rng() * 0.1), h = ch * (0.82 + rng() * 0.1);
      items.push({ index: i, x: round(pad + c * cw + (cw - w) / 2 + (rng() - 0.5) * 0.03), y: round(pad + r * ch + (ch - h) / 2 + (rng() - 0.5) * 0.03), w: round(w), h: round(h), rotate: round((rng() - 0.5) * 2 * tilt, 1), z: i });
    }
  }
  return { canvas: '4:5', items };
}

/* ======================================================================
   5. Звук: киношное приглушение музыки, озвучка, аватар
   ====================================================================== */
export function pickVoice(mood) {
  if (mood.energy < 0.42 && mood.valence >= -0.2) return { id: 'warm-soft', label: 'тихий и тёплый', rate: 0.88, pitch: 0.95, reverb: 0.25 };
  if (mood.energy < 0.5 && mood.valence < -0.2) return { id: 'low-gentle', label: 'приглушённый и ровный', rate: 0.82, pitch: 0.85, reverb: 0.3 };
  if (mood.energy > 0.65 && mood.valence > 0) return { id: 'bright-fast', label: 'живой и быстрый', rate: 1.12, pitch: 1.1, reverb: 0.05 };
  if (mood.energy > 0.65) return { id: 'crisp-focused', label: 'собранный и чёткий', rate: 1.05, pitch: 0.95, reverb: 0.05 };
  return { id: 'neutral', label: 'ровный', rate: 1, pitch: 1, reverb: 0.1 };
}

export function buildAudio({ analysis, music, mood, motion, style }) {
  const q = analysis.keyQuote;
  const words = q ? q.split(/\s+/).length : 0;
  const quoteDur = q ? clamp(words * 0.45 + 0.8, 2, 8) : 0;
  const start = q ? round(Math.min(motion.durationSeconds * 0.45, motion.durationSeconds - quoteDur - 1), 1) : null;
  return {
    music: { previewUrl: music.previewUrl, baseGain: 0.9, bpm: music.bpm },
    quote: q ? { text: q, startAt: Math.max(0, start), durationSec: round(quoteDur, 1) } : null,
    // параметры Web Audio: музыка → lowpass → gain
    ducking: q ? { duckGain: round(lerp(0.18, 0.4, mood.energy)), lowpassHz: Math.round(lerp(900, 2200, mood.energy)), attackMs: 150, releaseMs: Math.round(lerp(900, 500, mood.energy)) } : null,
    cinematic: q ? { letterbox: { ratio: 2.39, inMs: 400, outMs: 600 }, zoomTo: 1.06, vignetteTo: round(Math.min(0.7, STYLE_MOTION[style].vignette + 0.2)), reveal: 'word-by-word' } : null,
    voice: { ...pickVoice(mood), lang: 'ru-RU', engine: 'speechSynthesis', note: 'синтезированный голос; копирование голосов реальных людей не используется' },
  };
}

export function buildAvatar({ mood, palette, text, music, particles }) {
  const props = [];
  if (['какао', 'чай', 'кофе'].includes(text.item)) props.push('mug');
  if ((text.weather || []).includes('rain')) props.push('umbrella');
  if (music.energy > 0.7) props.push('headphones');
  return {
    expression: {
      mouthCurve: mood.valence,
      browAngle: round(clamp(-mood.valence * 0.6 + mood.tension * 0.3, -1, 1)),
      eyeOpenness: round(0.55 + 0.4 * mood.energy),
      blush: mood.valence > 0.3 && mood.energy < 0.5,
    },
    aura: { color: palette.accent, intensity: round(0.3 + 0.6 * mood.energy), radius: round(lerp(0.9, 1.4, mood.air)) },
    breathPerMin: Math.round(lerp(10, 22, mood.energy)),
    outfit: { autumn: 'scarf', winter: 'scarf', summer: 'light-tee', spring: 'jacket' }[text.season] || 'hoodie',
    props,
    weather: particles.type,
    label: mood.label,
  };
}

/* ======================================================================
   6. Паспорт настроения — объяснимая логика («почему день выглядит так»)
   ====================================================================== */
function colorName(hex) {
  const [h, s, l] = hexToHsl(hex);
  if (s < 0.12) return l > 0.8 ? 'белый' : l < 0.22 ? 'чёрный' : 'серый';
  if (h < 15 || h >= 345) return 'красный';
  if (h < 40) return l < 0.6 ? 'охристый' : 'оранжевый';
  if (h < 65) return 'жёлтый';
  if (h < 170) return 'зелёный';
  if (h < 200) return 'бирюзовый';
  if (h < 255) return 'синий';
  if (h < 290) return 'фиолетовый';
  return 'розовый';
}

const STYLE_WHY = (style, m) => ({
  impressionist: 'День спокойный и светлый: мягкие мазки и рассеянный свет передают неспешность, а не детали.',
  constructivist: m.valence > 0.2
    ? 'Высокая энергия при светлом настроении: яркие цветовые пятна и динамичная композиция (как у Кандинского) передают радостный драйв.'
    : 'Высокий ритм и напряжение: жёсткая сетка, контрастные пятна и геометрия (как у Кандинского) передают собранность и скорость.',
  film: 'В дне много памяти и тепла: плёночное зерно, выцветшие тона и световые засветы работают как «старая фотография».',
  minimal: 'Тихий день с малым числом деталей: много пустоты и один акцент (японская минималистичная графика) оставляют воздух.',
}[style]);

export function buildPassport({ analysis, photos, music, mood, style, choice, motion, audio, palette }) {
  const items = [];
  const L = { v: mood.valence > 0.3 ? 'светлая' : mood.valence < -0.3 ? 'приглушённая' : 'ровная', e: mood.energy > 0.65 ? 'высокая' : mood.energy < 0.35 ? 'низкая' : 'средняя' };

  if (music.hasData) {
    const modeTxt = music.mode ? (music.mode === 'major' ? ', мажор' : ', минор') : '';
    const srcTxt = { measured: 'измерено', 'genre-estimate': 'оценка по жанру', default: 'значение по умолчанию' }[music.bpmSource];
    items.push({
      factor: 'music', title: 'Музыка',
      observation: `${[music.artist, music.title].filter(Boolean).join(' — ') || 'Песня'}: ${music.bpm} BPM (${srcTxt})${modeTxt}`,
      effect: `Кадры меняются каждые ${motion.cutSeconds} с (на каждый ${motion.beatsPerCut}-й удар)`,
      why: music.tempoClass === 'slow' ? 'Медленный темп оставляет паузы и воздух между кадрами.' : music.tempoClass === 'fast' ? 'Быстрый темп даёт резкий ритм монтажа.' : 'Умеренный темп — плавный монтаж без спешки.',
    });
  } else {
    items.push({ factor: 'music', title: 'Музыка', observation: 'Данных о песне нет', effect: 'Использован нейтральный темп 96 BPM', why: 'Добавьте исполнителя и название — ритм монтажа подстроится под песню.' });
  }

  items.push({
    factor: 'text', title: 'Запись',
    observation: `Атмосфера ${L.v}, энергия ${L.e}${analysis.keywords?.length ? `; образы: ${analysis.keywords.join(', ')}` : ''}`,
    effect: `Частицы: ${buildParticlesLabel(analysis)}; воздуха в композиции: ${Math.round(mood.air * 100)}%`,
    why: 'Слова о времени года, погоде, месте и темпе дня определяют фактуру и движение.',
  });

  if (photos.count) {
    const top = photos.palette.slice(0, 3).map((c) => colorName(c.hex));
    items.push({
      factor: 'photo', title: 'Фото',
      observation: `Доминирующие цвета: ${[...new Set(top)].join(', ')}; свет ${photos.lightness > 0.6 ? 'светлый' : photos.lightness < 0.35 ? 'тёмный' : 'средний'}, тона ${photos.warmth > 0.12 ? 'тёплые' : photos.warmth < -0.12 ? 'холодные' : 'нейтральные'}`,
      effect: `Палитра сцены собрана из цветов фото (акцент ${palette.accent})`,
      why: 'Цвета берутся из ваших кадров, а приём обработки меняет только насыщенность, свет и контраст.',
    });
  }

  items.push({
    factor: 'style', title: `Приём: ${STYLES[style].short}`,
    observation: choice.forced ? 'Выбран вручную' : `Счёт приёмов: ${Object.entries(choice.scores).map(([k, v]) => `${STYLES[k].short} ${v}`).join(', ')}`,
    effect: `Переход «${motion.transition}», зерно ${motion.grain}, шейдер «${motion.shaderPreset}»`,
    why: STYLE_WHY(style, mood),
  });

  if (audio.quote) {
    items.push({
      factor: 'sound', title: 'Киношный момент',
      observation: `Ключевая фраза: «${audio.quote.text}»`,
      effect: `На ${audio.quote.startAt}-й секунде музыка уходит до ${Math.round(audio.ducking.duckGain * 100)}% громкости, срезаются верха (${audio.ducking.lowpassHz} Гц), появляются чёрные полосы и медленный наезд`,
      why: 'Как в кино: саундтрек уступает место важной реплике, чтобы она прозвучала выразительнее.',
    });
  }

  items.push({ factor: 'voice', title: 'Озвучка', observation: `Голос: ${audio.voice.label}`, effect: `Скорость ${audio.voice.rate}, высота ${audio.voice.pitch}`, why: 'Спокойному дню — тихий тёплый голос, насыщенному — живой и быстрый.' });
  return items;
}

function buildParticlesLabel(a) {
  const w = a.weather || [];
  if (w.includes('rain')) return 'дождь';
  if (w.includes('snow') || a.season === 'winter') return 'снег';
  if (a.season === 'autumn') return 'листья';
  return 'по умолчанию для приёма';
}

/* ======================================================================
   7. Сборка сцены дня
   ====================================================================== */
const DEFAULT_PALETTES = {
  autumn: ['#c98a3a', '#8a5a2b', '#e3b76b'], winter: ['#9fb4c8', '#e8eef4', '#5d7690'],
  spring: ['#9cc28a', '#f2d3e0', '#e9e4a8'], summer: ['#e6b85c', '#5aa7c7', '#f4e3b2'], none: ['#a89a8a', '#7a6f66', '#d8cfc4'],
};
/** Нейтральные признаки «фото» для живого предпросмотра, пока снимков ещё нет */
export function defaultPhotoStats(analysis) {
  const pal = DEFAULT_PALETTES[analysis.season || 'none'];
  const night = analysis.timeOfDay === 'night';
  return { count: 0, lightness: night ? 0.25 : 0.55, saturation: 0.35, warmth: analysis.season === 'winter' ? -0.2 : 0.15, contrast: night ? 0.28 : 0.2, palette: pal.map((hex, i) => ({ hex, weight: [0.5, 0.3, 0.2][i] })) };
}

export function composeDay({ analysis, photos, music, user = {}, style = 'auto', format, seed = 1 }) {
  const mood = computeMood({ text: analysis, photos, music });
  const choice = chooseStyle({ mood, photos, music, user, forced: style });
  const chosen = choice.chosen;
  const theme = pickTheme(chosen, mood, analysis, photos);
  const palette = buildPalette(chosen, { photos, mood, theme });
  const rng = mulberry32(seed);
  const motion = buildMotion(chosen, mood, music, photos.count);
  const particles = buildParticles(chosen, analysis, mood);
  const audio = buildAudio({ analysis, music, mood, motion, style: chosen });
  const fmt = ['slideshow', 'collage', 'video'].includes(format) ? format : recommendFormats(user)[0];

  const scene = {
    version: 1,
    style: chosen, styleForced: choice.forced, styleLabel: STYLES[chosen].label, runnerUp: choice.runnerUp, styleScores: choice.scores,
    format: fmt, theme, mood, palette,
    constants: DIARY_CONSTANTS,
    typography: {
      weight: Math.round(lerp(300, 600, mood.energy) / 50) * 50,
      tracking: round(lerp(0.04, -0.01, mood.energy), 3),
      titleCase: chosen === 'constructivist' ? 'upper' : 'sentence',
      signatureStyle: { impressionist: 'handwritten', film: 'handwritten', constructivist: 'mono', minimal: 'none' }[chosen],
    },
    motion,
    filters: buildFilters(chosen, mood),
    shader: { preset: motion.shaderPreset, speed: round(music.bpm / 120), intensity: round(0.3 + 0.5 * mood.energy), brush: chosen === 'impressionist' ? round(0.3 + 0.5 * mood.air) : 0, colors: palette.gradient, audioReactive: true },
    particles,
    timeline: buildTimeline(photos.count, motion, rng),
    collage: buildCollage(chosen, photos.count, rng),
    audio,
    avatar: buildAvatar({ mood, palette, text: analysis, music, particles }),
    disclaimer: 'Это описание атмосферы записи, а не медицинская или психологическая оценка.',
  };
  const passport = buildPassport({ analysis, photos, music, mood, style: chosen, choice, motion, audio, palette });
  return { scene, passport };
}
