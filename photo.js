import { clamp, rgbToHsl, rgbToHex, hexToRgb } from '../util.js';

const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** k-means по пикселям [[r,g,b],…]; детерминированная инициализация по квантилям яркости */
export function kmeans(pixels, k = 5, iters = 8) {
  if (!pixels.length) return [];
  const sorted = [...pixels].sort((a, b) => lum(a) - lum(b));
  const kk = Math.min(k, pixels.length);
  let centers = Array.from({ length: kk }, (_, i) => sorted[Math.floor(((i + 0.5) * sorted.length) / kk)].slice());
  const counts = new Array(kk).fill(0);
  for (let it = 0; it < iters; it++) {
    const sums = centers.map(() => [0, 0, 0]);
    counts.fill(0);
    for (const p of pixels) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < kk; i++) {
        const d = (p[0] - centers[i][0]) ** 2 + (p[1] - centers[i][1]) ** 2 + (p[2] - centers[i][2]) ** 2;
        if (d < bd) { bd = d; bi = i; }
      }
      sums[bi][0] += p[0]; sums[bi][1] += p[1]; sums[bi][2] += p[2]; counts[bi]++;
    }
    centers = centers.map((c, i) => (counts[i] ? sums[i].map((v) => v / counts[i]) : c));
  }
  return centers
    .map((c, i) => ({ rgb: c, weight: counts[i] / pixels.length }))
    .filter((c) => c.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

/** Числовые признаки кадра: свет, насыщенность, тёплость, контраст, палитра */
export function statsFromPixels(pixels) {
  const n = pixels.length || 1;
  let L = 0, S = 0, W = 0;
  const lums = [];
  for (const p of pixels) {
    const l = lum(p);
    lums.push(l);
    L += l;
    S += rgbToHsl(p[0], p[1], p[2])[1];
    W += (p[0] - p[2]) / 255;
  }
  const mean = L / n;
  const variance = lums.reduce((s, l) => s + (l - mean) ** 2, 0) / n;
  return {
    lightness: +mean.toFixed(3),
    saturation: +(S / n).toFixed(3),
    warmth: +clamp(W / n, -1, 1).toFixed(3),
    contrast: +Math.sqrt(variance).toFixed(3),
    palette: kmeans(pixels, 5).map((c) => ({ hex: rgbToHex(...c.rgb), weight: +c.weight.toFixed(3) })),
  };
}

/** Склейка статистик нескольких фото в одну «погоду» дня */
export function aggregatePhotos(list) {
  if (!list.length) return { count: 0, lightness: 0.5, saturation: 0.35, warmth: 0, contrast: 0.2, palette: [] };
  const avg = (key) => list.reduce((s, x) => s + x[key], 0) / list.length;
  const items = list
    .flatMap((s) => s.palette.map((c) => ({ rgb: hexToRgb(c.hex), w: c.weight / list.length })))
    .sort((a, b) => b.w - a.w);
  const merged = [];
  for (const it of items) {
    const m = merged.find((x) => dist(x.rgb, it.rgb) < 48);
    if (m) {
      m.rgb = m.rgb.map((v, i) => (v * m.w + it.rgb[i] * it.w) / (m.w + it.w));
      m.w += it.w;
    } else merged.push({ rgb: it.rgb.slice(), w: it.w });
  }
  return {
    count: list.length,
    lightness: +avg('lightness').toFixed(3),
    saturation: +avg('saturation').toFixed(3),
    warmth: +avg('warmth').toFixed(3),
    contrast: +avg('contrast').toFixed(3),
    palette: merged
      .sort((a, b) => b.w - a.w)
      .slice(0, 5)
      .map((m) => ({ hex: rgbToHex(...m.rgb), weight: +m.w.toFixed(3) })),
  };
}

/* ======================================================================
   Обработка загруженного фото.
   Основной путь — sharp (быстро, поддерживает WebP). Если sharp не загрузился
   (например, Windows ARM + новый Node), включается запасной режим на чистом JS:
   jpeg-js + pngjs (только JPEG и PNG). Метаданные (в т.ч. геолокация) в обоих режимах удаляются.
   ====================================================================== */
let sharpMod; // undefined — ещё не пробовали, null — недоступен
async function getSharp() {
  if (sharpMod !== undefined) return sharpMod;
  try {
    sharpMod = (await import('sharp')).default;
  } catch {
    console.warn('[photo] sharp недоступен — включён запасной режим (jpeg-js/pngjs, только JPEG и PNG)');
    sharpMod = null;
  }
  return sharpMod;
}
const loadCjs = async (name) => {
  const m = await import(name);
  return m.default || m;
};

/** Ориентация из EXIF (1 — норма). Нужна, чтобы фото с телефона не оказались повёрнутыми набок. */
export function readExifOrientation(buf) {
  try {
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return 1;
    let off = 2;
    while (off + 4 < buf.length && buf[off] === 0xff) {
      const marker = buf[off + 1];
      const len = buf.readUInt16BE(off + 2);
      if (marker === 0xe1 && buf.toString('latin1', off + 4, off + 10) === 'Exif\0\0') {
        const t = off + 10;
        const le = buf.toString('latin1', t, t + 2) === 'II';
        const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
        const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
        const ifd = t + u32(t + 4);
        const n = u16(ifd);
        for (let i = 0; i < n; i++) {
          const e = ifd + 2 + i * 12;
          if (u16(e) === 0x0112) return u16(e + 8);
        }
        return 1;
      }
      if (marker === 0xda) break;
      off += 2 + len;
    }
  } catch {
    /* повреждённые метаданные — считаем, что поворота нет */
  }
  return 1;
}

/** Поворот RGBA-картинки для ориентаций 3 (180°), 6 (90° по часовой), 8 (90° против) */
export function orientRGBA(img, orientation) {
  const { width: w, height: h, data } = img;
  if (![3, 6, 8].includes(orientation)) return img;
  const sideways = orientation !== 3;
  const out = new Uint8Array(w * h * 4);
  const nw = sideways ? h : w;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx, ny;
      if (orientation === 3) { nx = w - 1 - x; ny = h - 1 - y; }
      else if (orientation === 6) { nx = h - 1 - y; ny = x; }
      else { nx = y; ny = w - 1 - x; }
      const s = (y * w + x) * 4, d = (ny * nw + nx) * 4;
      out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3];
    }
  }
  return { width: sideways ? h : w, height: sideways ? w : h, data: out };
}

/** Уменьшение усреднением блоков (целый коэффициент), чтобы большие фото не раздували хранилище */
export function shrinkRGBA(img, maxSide) {
  const { width: w, height: h, data } = img;
  const k = Math.max(1, Math.ceil(Math.max(w, h) / maxSide));
  if (k === 1) return img;
  const nw = Math.floor(w / k), nh = Math.floor(h / k);
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < k; dy++) {
        for (let dx = 0; dx < k; dx++) {
          const i = ((y * k + dy) * w + (x * k + dx)) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2];
        }
      }
      const n = k * k, o = (y * nw + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { width: nw, height: nh, data: out };
}

/** Сетка не более ~48×48 пикселей для статистики цвета */
export function pixelsFromRGBA(img, grid = 48) {
  const step = Math.max(1, Math.floor(Math.max(img.width, img.height) / grid));
  const px = [];
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      const i = (y * img.width + x) * 4;
      px.push([img.data[i], img.data[i + 1], img.data[i + 2]]);
    }
  }
  return px;
}

async function processWithSharp(sharp, buffer) {
  const out = await sharp(buffer)
    .rotate()
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer({ resolveWithObject: true });
  const small = await sharp(out.data).resize(48, 48, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = small.info.channels;
  const pixels = [];
  for (let i = 0; i + 2 < small.data.length; i += ch) pixels.push([small.data[i], small.data[i + 1], small.data[i + 2]]);
  return { buffer: out.data, width: out.info.width, height: out.info.height, stats: statsFromPixels(pixels) };
}

async function processWithJs(buffer) {
  const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
  if (!isJpg && !isPng) {
    const err = new Error('Этот формат фото сейчас не поддерживается, загрузите JPEG или PNG');
    err.userFacing = true;
    throw err;
  }
  const jpeg = await loadCjs('jpeg-js');
  let img;
  if (isJpg) {
    const d = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 1024 });
    img = orientRGBA({ width: d.width, height: d.height, data: d.data }, readExifOrientation(buffer));
  } else {
    const { PNG } = await loadCjs('pngjs');
    const d = PNG.sync.read(buffer);
    const data = new Uint8Array(d.data);
    for (let i = 0; i < data.length; i += 4) { // прозрачность → белый фон
      const a = data[i + 3] / 255;
      data[i] = data[i] * a + 255 * (1 - a); data[i + 1] = data[i + 1] * a + 255 * (1 - a); data[i + 2] = data[i + 2] * a + 255 * (1 - a); data[i + 3] = 255;
    }
    img = { width: d.width, height: d.height, data };
  }
  img = shrinkRGBA(img, 1600);
  const out = jpeg.encode({ data: Buffer.from(img.data), width: img.width, height: img.height }, 86).data;
  return { buffer: out, width: img.width, height: img.height, stats: statsFromPixels(pixelsFromRGBA(img)) };
}

export async function processPhoto(buffer) {
  const sharp = await getSharp();
  return sharp ? processWithSharp(sharp, buffer) : processWithJs(buffer);
}
