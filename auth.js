import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, parseJson } from '../db.js';
import { signToken, requireAuth, userDto } from '../auth.js';
import { ah, rateLimit, randomSlug } from '../util.js';

const router = Router();
const limiter = rateLimit({ max: 15, windowMs: 60_000 });

const cleanInterests = (arr) =>
  Array.isArray(arr) ? [...new Set(arr.filter((s) => typeof s === 'string').map((s) => s.trim().slice(0, 30)).filter(Boolean))].slice(0, 12) : [];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

router.post('/register', limiter, ah(async (req, res) => {
  const { email, password, age, interests, displayName } = req.body || {};
  let { username } = req.body || {};
  if (typeof email !== 'string' || !EMAIL.test(email.trim()) || email.length > 120) return res.status(400).json({ error: 'Проверь адрес почты' });
  if (typeof password !== 'string' || password.length < 6 || password.length > 100) return res.status(400).json({ error: 'Пароль: минимум 6 символов' });
  const a = Number(age);
  if (!Number.isInteger(a) || a < 8 || a > 110) return res.status(400).json({ error: 'Укажи возраст числом' });
  const mail = email.trim().toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE').get(mail)) return res.status(409).json({ error: 'Эта почта уже зарегистрирована' });
  // публичный ник (для ссылок на профиль) не раскрывает почту: свой или случайный
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,24}$/.test(username)) username = 'u' + randomSlug(8).toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) username = 'u' + randomSlug(8).toLowerCase();

  const hash = await bcrypt.hash(password, 10);
  const name = (typeof displayName === 'string' && displayName.trim().slice(0, 40)) || 'Без имени';
  const info = db.prepare('INSERT INTO users (username, email, password_hash, age, interests, display_name) VALUES (?, ?, ?, ?, ?, ?)').run(username, mail, hash, a, JSON.stringify(cleanInterests(interests)), name);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user: userDto(user, { self: true }) });
}));

router.post('/login', limiter, ah(async (req, res) => {
  const { email, username, password } = req.body || {};
  const id = typeof email === 'string' ? email.trim() : typeof username === 'string' ? username : '';
  const user = id ? db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE OR username = ?').get(id, id) : null;
  const ok = user && typeof password === 'string' && (await bcrypt.compare(password, user.password_hash));
  if (!ok) return res.status(401).json({ error: 'Неверная почта или пароль' });
  res.json({ token: signToken(user), user: userDto(user, { self: true }) });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: userDto(req.user, { self: true }) }));

// возраст после регистрации не меняется: от него зависит доступ к публикации
router.patch('/me', requireAuth, (req, res) => {
  const { displayName, bio, interests } = req.body || {};
  const u = req.user;
  db.prepare('UPDATE users SET display_name = ?, bio = ?, interests = ? WHERE id = ?').run(
    typeof displayName === 'string' && displayName.trim() ? displayName.trim().slice(0, 40) : u.display_name,
    typeof bio === 'string' ? bio.slice(0, 200) : u.bio,
    JSON.stringify(interests === undefined ? parseJson(u.interests, []) : cleanInterests(interests)),
    u.id,
  );
  res.json({ user: userDto(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id), { self: true }) });
});

// Настройки дневника: компаньон, папки-коллекции и их содержимое (аватар остаётся в браузере)
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
router.get('/prefs', requireAuth, (req, res) => res.json({ prefs: parseJson(req.user.prefs, {}) }));
router.put('/prefs', requireAuth, (req, res) => {
  const b = req.body || {};
  const p = obj(b.profile);
  const prefs = {
    profile: {
      name: String(p.name ?? '').slice(0, 40), about: String(p.about ?? '').slice(0, 200),
      companion: String(p.companion ?? '').slice(0, 20), companionName: String(p.companionName ?? '').slice(0, 20),
      interests: Array.isArray(p.interests) ? p.interests.map((i) => String(i).slice(0, 30)).slice(0, 12) : [],
    },
    folders: Array.isArray(b.folders) ? b.folders.slice(0, 50).map((f) => ({ id: String(f?.id ?? '').slice(0, 60), name: String(f?.name ?? '').slice(0, 60) })).filter((f) => f.id) : [],
    map: Object.fromEntries(Object.entries(obj(b.map)).slice(0, 2000).map(([k, v]) => [String(k).slice(0, 20), String(v).slice(0, 60)])),
  };
  db.prepare('UPDATE users SET prefs = ? WHERE id = ?').run(JSON.stringify(prefs), req.user.id);
  res.json({ prefs });
});

export default router;
