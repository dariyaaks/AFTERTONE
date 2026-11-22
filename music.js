import { Router } from 'express';
import { Readable } from 'node:stream';
import { requireAuth } from '../auth.js';
import { ah, rateLimit } from '../util.js';

const router = Router();
const cache = new Map(); // q -> { at, items }

/** Поиск песни по названию. Берём официальные 30-секундные превью (iTunes Search API, ключ не нужен). */
router.get('/search', requireAuth, rateLimit({ max: 40, windowMs: 60_000, key: (r) => 'm' + r.user.id }), ah(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q.length < 2) return res.status(400).json({ error: 'Введите хотя бы 2 символа' });
  const hit = cache.get(q.toLowerCase());
  if (hit && Date.now() - hit.at < 10 * 60_000) return res.json({ items: hit.items });

  const url = `https://itunes.apple.com/search?${new URLSearchParams({ term: q, media: 'music', entity: 'song', limit: '8' })}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r?.ok) return res.status(502).json({ error: 'Музыкальный поиск сейчас недоступен. Можно вставить ссылку или указать песню вручную.' });
  const data = await r.json();
  const items = (data.results || []).map((t) => ({
    id: t.trackId, title: t.trackName, artist: t.artistName, genre: t.primaryGenreName,
    year: t.releaseDate ? new Date(t.releaseDate).getUTCFullYear() : null,
    previewUrl: t.previewUrl || null, artwork: t.artworkUrl100 || null, url: t.trackViewUrl || null, source: 'search',
  }));
  cache.set(q.toLowerCase(), { at: Date.now(), items });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  res.json({ items });
}));

/**
 * Прокси для официальных превью: нужен, чтобы плеер мог пропустить звук через Web Audio
 * (приглушение музыки на важной реплике) — без CORS-заголовков браузер «глушит» чужой звук.
 * Разрешены только хосты Apple, редиректы запрещены.
 */
const ALLOWED = /(^|\.)(itunes\.apple\.com|mzstatic\.com)$/i;
router.get('/preview', rateLimit({ max: 120, windowMs: 60_000 }), ah(async (req, res) => {
  let u;
  try {
    u = new URL(String(req.query.url || ''));
  } catch {
    return res.status(400).json({ error: 'Неверный адрес' });
  }
  if (u.protocol !== 'https:' || !ALLOWED.test(u.hostname)) return res.status(400).json({ error: 'Источник не разрешён' });

  const r = await fetch(u, { redirect: 'error', headers: req.headers.range ? { range: req.headers.range } : {}, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!r || !r.body || r.status >= 400) return res.status(502).json({ error: 'Превью недоступно' });
  res.status(r.status);
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const v = r.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  const stream = Readable.fromWeb(r.body);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}));

export default router;
