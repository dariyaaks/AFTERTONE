import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { db, parseJson, tx } from '../db.js';
import { config } from '../config.js';
import { requireAuth, optionalAuth, verifyMedia } from '../auth.js';
import { dayDto, dayCard } from '../dto.js';
import { analyzeText, analyzeTextLexicon, validTitle } from '../engine/text.js';
import { processPhoto, aggregatePhotos } from '../engine/photo.js';
import { normalizeMusic, profileMusic } from '../engine/music.js';
import { composeDay, defaultPhotoStats, STYLES } from '../engine/style.js';
import { ah, clamp, hashStr, isIsoDate, todayIso, randomSlug, safeFolderName, plural, rateLimit } from '../util.js';

const router = Router();

/* ---------- загрузка файлов (в память: фото перекодируются, EXIF удаляется) ---------- */
const IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AUDIO = new Set(['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 9 },
  fileFilter(_req, file, cb) {
    const ok = (file.fieldname === 'photos' && IMAGES.has(file.mimetype)) || (file.fieldname === 'audio' && AUDIO.has(file.mimetype));
    if (ok) return cb(null, true);
    const err = new Error(`Неподдерживаемый файл: ${file.originalname}`);
    err.status = 400;
    cb(err);
  },
});
const uploadFields = upload.fields([{ name: 'photos', maxCount: 8 }, { name: 'audio', maxCount: 1 }]);

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const userCtx = (u) => ({ age: u.age, interests: parseJson(u.interests, []) });
const dayDir = (row) => path.join(config.dataDir, 'users', String(row.user_id), row.folder);

/** Песню можно передать JSON-строкой в поле music или плоскими полями musicTitle, musicArtist, … */
function musicFromBody(b) {
  let m = {};
  if (typeof b.music === 'string') m = parseJson(b.music, {}) || {};
  else if (b.music && typeof b.music === 'object') m = b.music;
  const pick = (k, alt) => m[k] ?? b[alt];
  return {
    title: pick('title', 'musicTitle'), artist: pick('artist', 'musicArtist'), genre: pick('genre', 'musicGenre'),
    year: pick('year', 'musicYear'), url: pick('url', 'musicUrl'), previewUrl: pick('previewUrl', 'musicPreviewUrl'),
    bpm: pick('bpm', 'musicBpm'), mode: pick('mode', 'musicMode'), source: m.source || b.musicSource,
  };
}

/* ======================================================================
   Живой предпросмотр: пока человек печатает, фронтенд подкрашивает экран
   ====================================================================== */
router.post('/preview', requireAuth, rateLimit({ max: 90, windowMs: 60_000, key: (r) => 'p' + r.user.id }), (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 5000) : '';
  if (text.trim().length < 3) return bad(res, 'Слишком короткий текст');
  const analysis = analyzeTextLexicon(text);
  const music = profileMusic(normalizeMusic(musicFromBody(req.body)));
  const { scene } = composeDay({ analysis, photos: defaultPhotoStats(analysis), music, user: userCtx(req.user), seed: hashStr(text) });
  res.json({
    analysis: { valence: analysis.valence, energy: analysis.energy, season: analysis.season, timeOfDay: analysis.timeOfDay, weather: analysis.weather, keywords: analysis.keywords, title: analysis.title },
    mood: scene.mood, style: scene.style, styleLabel: scene.styleLabel, theme: scene.theme,
    palette: scene.palette, particles: scene.particles, shader: scene.shader,
  });
});

/* ======================================================================
   Создание дня
   ====================================================================== */
router.post('/', requireAuth, rateLimit({ max: 20, windowMs: 60_000, key: (r) => 'c' + r.user.id }), uploadFields, ah(async (req, res) => {
  const b = req.body || {};
  const user = req.user;
  const text = typeof b.text === 'string' ? b.text.trim() : '';
  if (text.length < 5 || text.length > 5000) return bad(res, 'Текст записи: от 5 до 5000 символов');
  const files = req.files?.photos || [];
  if (!files.length) return bad(res, 'Добавьте хотя бы одно фото');
  const date = b.date ? b.date : todayIso();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (!isIsoDate(date) || date > tomorrow) return bad(res, 'Неверная дата (формат ГГГГ-ММ-ДД)');
  if (b.style && b.style !== 'auto' && !STYLES[b.style]) return bad(res, 'Неизвестный художественный приём');

  // 1. анализ текста (ИИ можно отключить: ai=false — текст тогда не уходит во внешний сервис)
  const analysis = await analyzeText(text, { useAI: b.ai !== 'false' });
  if (typeof b.keyQuote === 'string' && b.keyQuote.trim() && text.includes(b.keyQuote.trim())) analysis.keyQuote = b.keyQuote.trim().slice(0, 140);
  if (typeof b.weather === 'string' && ['rain', 'snow', 'wind', 'sun', 'fog', 'cold', 'hot'].includes(b.weather)) analysis.weather = [...new Set([...(analysis.weather || []), b.weather])];

  // 2. фото
  let processed;
  try {
    processed = [];
    for (const f of files) processed.push(await processPhoto(f.buffer));
  } catch (e) {
    return bad(res, e.userFacing ? e.message : 'Не удалось прочитать одно из фото');
  }
  const photos = aggregatePhotos(processed.map((p) => p.stats));

  // 3. музыка
  const audio = req.files?.audio?.[0] || null;
  const ext = audio ? path.extname(audio.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6) || '.mp3' : null;
  const music = normalizeMusic(musicFromBody(b), { uploaded: audio ? { filename: `song${ext}`, mime: audio.mimetype } : null });

  // 4. сцена и паспорт настроения
  const { scene, passport } = composeDay({ analysis, photos, music: profileMusic(music), user: userCtx(user), style: b.style || 'auto', format: b.format, seed: hashStr(text + date) });
  const title = validTitle(b.title) || analysis.title;

  // 5. папка дня: название по смыслу записи, внутри текст, фото, песня и готовое воспоминание
  const userDir = path.join(config.dataDir, 'users', String(user.id));
  fs.mkdirSync(userDir, { recursive: true });
  let folder = safeFolderName(`${date} ${title}`);
  if (fs.existsSync(path.join(userDir, folder))) folder += `-${randomSlug(4)}`;
  const dir = path.join(userDir, folder);
  fs.mkdirSync(dir);
  try {
    const names = processed.map((p, i) => {
      const n = `photo-${String(i + 1).padStart(2, '0')}.jpg`;
      fs.writeFileSync(path.join(dir, n), p.buffer);
      return n;
    });
    if (audio) fs.writeFileSync(path.join(dir, `song${ext}`), audio.buffer);
    fs.writeFileSync(path.join(dir, 'text.txt'), text);
    fs.writeFileSync(path.join(dir, 'memory.json'), JSON.stringify({ title, date, analysis, music, scene, passport, voice: scene.audio.voice }, null, 2));

    const id = tx(() => {
      const info = db.prepare(
        'INSERT INTO days (user_id, date, title, text, analysis, scene, passport, music, format, slug, folder) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      ).run(user.id, date, title, text, JSON.stringify(analysis), JSON.stringify(scene), JSON.stringify(passport), JSON.stringify(music), scene.format, randomSlug(10), folder);
      processed.forEach((p, i) =>
        db.prepare('INSERT INTO photos (day_id, position, filename, width, height, stats) VALUES (?,?,?,?,?,?)').run(info.lastInsertRowid, i, names[i], p.width, p.height, JSON.stringify(p.stats)),
      );
      return Number(info.lastInsertRowid);
    });
    res.status(201).json({ day: dayDto(db.prepare('SELECT * FROM days WHERE id = ?').get(id), { viewer: user }) });
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}));

/* ======================================================================
   Архив, календарь, «в этот день»
   ====================================================================== */
router.get('/', requireAuth, (req, res) => {
  const limit = clamp(parseInt(req.query.limit) || 30, 1, 100);
  const offset = Math.max(0, parseInt(req.query.offset) || 0);
  const where = ['user_id = ?'];
  const params = [req.user.id];
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    const like = `%${req.query.q.trim().replace(/[%_\\]/g, '\\$&')}%`;
    where.push("(title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\')");
    params.push(like, like);
  }
  if (STYLES[req.query.style]) { where.push("json_extract(scene, '$.style') = ?"); params.push(req.query.style); }
  if (isIsoDate(req.query.from)) { where.push('date >= ?'); params.push(req.query.from); }
  if (isIsoDate(req.query.to)) { where.push('date <= ?'); params.push(req.query.to); }
  const sql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c FROM days WHERE ${sql}`).get(...params).c;
  const rows = db.prepare(`SELECT * FROM days WHERE ${sql} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json({ total, items: rows.map((r) => dayCard(r, { viewer: req.user })) });
});

router.get('/calendar', requireAuth, (req, res) => {
  const year = /^\d{4}$/.test(req.query.year) ? req.query.year : todayIso().slice(0, 4);
  const rows = db.prepare(
    `SELECT id, date, title, json_extract(scene,'$.palette.accent') accent, json_extract(scene,'$.mood.valence') valence,
            json_extract(scene,'$.mood.energy') energy, json_extract(scene,'$.styleLabel') styleLabel
     FROM days WHERE user_id = ? AND substr(date,1,4) = ? ORDER BY date, id`,
  ).all(req.user.id, year);
  const byDate = new Map(rows.map((r) => [r.date, r])); // при нескольких записях за дату показываем последнюю
  res.json({ year: Number(year), days: [...byDate.values()] });
});

function shiftMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) - n;
  const ty = Math.floor(total / 12), tm = total % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

// ?asOf=ГГГГ-ММ-ДД позволяет «перемотать время» на демо
router.get('/on-this-day', requireAuth, (req, res) => {
  const asOf = isIsoDate(req.query.asOf) ? req.query.asOf : todayIso();
  const targets = new Map();
  for (const n of [1, 3, 6]) targets.set(shiftMonths(asOf, n), { months: n });
  for (let k = 1; k <= 10; k++) targets.set(shiftMonths(asOf, 12 * k), { months: 12 * k });
  const dates = [...targets.keys()];
  const rows = db.prepare(`SELECT * FROM days WHERE user_id = ? AND date IN (${dates.map(() => '?').join(',')}) ORDER BY date DESC, id DESC`).all(req.user.id, ...dates);
  const seen = new Set();
  const items = [];
  for (const r of rows) {
    if (seen.has(r.date)) continue;
    seen.add(r.date);
    const { months } = targets.get(r.date);
    const label = months >= 12 ? `${months / 12} ${plural(months / 12, ['год', 'года', 'лет'])} назад` : `${months} ${plural(months, ['месяц', 'месяца', 'месяцев'])} назад`;
    items.push({ monthsAgo: months, label, day: dayCard(r, { viewer: req.user }) });
  }
  items.sort((a, b) => a.monthsAgo - b.monthsAgo);
  res.json({ asOf, items });
});

/* ======================================================================
   Один день (владелец)
   ====================================================================== */
const ownDay = (req, res) => {
  const row = db.prepare('SELECT * FROM days WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!row) res.status(404).json({ error: 'День не найден' });
  return row;
};

router.get('/:id', requireAuth, (req, res) => {
  const row = ownDay(req, res);
  if (row) res.json({ day: dayDto(row, { viewer: req.user }) });
});

router.patch('/:id', requireAuth, (req, res) => {
  const row = ownDay(req, res);
  if (!row) return;
  const b = req.body || {};
  const upd = {};
  if (b.title !== undefined) {
    const t = validTitle(b.title);
    if (!t) return bad(res, 'Название: от 3 до 7 слов');
    upd.title = t;
  }
  if (b.commentsEnabled !== undefined) upd.comments_enabled = b.commentsEnabled ? 1 : 0;
  if (b.visibility !== undefined) {
    if (!['private', 'public'].includes(b.visibility)) return bad(res, 'visibility: private или public');
    if (b.visibility === 'public') {
      if (req.user.age < 18 && !config.minorPublicSharing) return bad(res, 'Публикация дней доступна с 18 лет', 403);
      if (parseJson(row.music, {}).upload && b.ownsRights !== true) return bad(res, 'Загруженную песню нельзя публиковать без подтверждения прав. Используйте ссылку на сервис или превью.');
    }
    upd.visibility = b.visibility;
  }
  if (Object.keys(upd).length) {
    const cols = Object.keys(upd);
    db.prepare(`UPDATE days SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => upd[c]), row.id);
  }
  res.json({ day: dayDto(db.prepare('SELECT * FROM days WHERE id = ?').get(row.id), { viewer: req.user }) });
});

// Пересобрать воспоминание другим приёмом/форматом из уже сохранённых данных
router.post('/:id/regenerate', requireAuth, (req, res) => {
  const row = ownDay(req, res);
  if (!row) return;
  const { style = 'auto', format } = req.body || {};
  if (style !== 'auto' && !STYLES[style]) return bad(res, 'Неизвестный художественный приём');
  const photos = aggregatePhotos(db.prepare('SELECT stats FROM photos WHERE day_id = ? ORDER BY position').all(row.id).map((p) => parseJson(p.stats)));
  const { scene, passport } = composeDay({
    analysis: parseJson(row.analysis), photos, music: profileMusic(parseJson(row.music, {})),
    user: userCtx(req.user), style, format: format || row.format, seed: hashStr(row.text + row.date),
  });
  db.prepare('UPDATE days SET scene = ?, passport = ?, format = ? WHERE id = ?').run(JSON.stringify(scene), JSON.stringify(passport), scene.format, row.id);
  res.json({ day: dayDto(db.prepare('SELECT * FROM days WHERE id = ?').get(row.id), { viewer: req.user }) });
});

router.delete('/:id', requireAuth, (req, res) => {
  const row = ownDay(req, res);
  if (!row) return;
  db.prepare('DELETE FROM days WHERE id = ?').run(row.id);
  const dir = dayDir(row);
  if (dir.startsWith(path.join(config.dataDir, 'users'))) fs.rmSync(dir, { recursive: true, force: true });
  res.status(204).end();
});

/* ======================================================================
   Медиа: фото и своя песня. Приватное — по короткому токену ?m= или владельцу.
   ====================================================================== */
const canView = (row, req) => row.visibility === 'public' || (req.user && req.user.id === row.user_id) || verifyMedia(String(req.query.m || ''), row.id);

router.get('/:id/photos/:photoId', optionalAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM days WHERE id = ?').get(Number(req.params.id));
  const photo = row && db.prepare('SELECT filename FROM photos WHERE id = ? AND day_id = ?').get(Number(req.params.photoId), row.id);
  if (!row || !photo || !canView(row, req)) return bad(res, 'Не найдено', 404);
  res.sendFile(photo.filename, { root: dayDir(row), dotfiles: 'deny', headers: { 'Cache-Control': row.visibility === 'public' ? 'public, max-age=3600' : 'private, max-age=3600' } });
});

router.get('/:id/audio', optionalAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM days WHERE id = ?').get(Number(req.params.id));
  const music = row && parseJson(row.music, {});
  if (!row || !music.upload?.filename || !canView(row, req)) return bad(res, 'Не найдено', 404);
  res.sendFile(music.upload.filename, { root: dayDir(row), dotfiles: 'deny' });
});

export default router;
