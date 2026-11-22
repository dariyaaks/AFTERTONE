import { Router } from 'express';
import { db } from '../db.js';
import { optionalAuth, requireAuth } from '../auth.js';
import { dayDto, dayCard } from '../dto.js';
import { ah, clamp, rateLimit } from '../util.js';

const router = Router();
const REACTIONS = ['warm', 'cozy', 'chills', 'nostalgic', 'spark']; // тепло · уют · мурашки · ностальгия · искра

const publicDay = (slug) => db.prepare("SELECT * FROM days WHERE slug = ? AND visibility = 'public'").get(String(slug));
const notFound = (res) => res.status(404).json({ error: 'Не найдено' });

/* ---------- профиль и публичные дни ---------- */
router.get('/u/:username', optionalAuth, (req, res) => {
  const u = db.prepare('SELECT id, username, display_name, bio, created_at FROM users WHERE username = ?').get(String(req.params.username));
  if (!u) return notFound(res);
  const limit = clamp(parseInt(req.query.limit) || 30, 1, 100);
  const offset = Math.max(0, parseInt(req.query.offset) || 0);
  const rows = db.prepare("SELECT * FROM days WHERE user_id = ? AND visibility = 'public' ORDER BY date DESC, id DESC LIMIT ? OFFSET ?").all(u.id, limit, offset);
  const total = db.prepare("SELECT COUNT(*) c FROM days WHERE user_id = ? AND visibility = 'public'").get(u.id).c;
  res.json({
    profile: { username: u.username, displayName: u.display_name, bio: u.bio, joinedAt: u.created_at, publicDays: total },
    items: rows.map((r) => dayCard(r, { viewer: req.user })),
    total,
  });
});

router.get('/public/:slug', optionalAuth, (req, res) => {
  const row = publicDay(req.params.slug);
  if (!row) return notFound(res);
  res.json({ day: dayDto(row, { viewer: req.user }) });
});

/* ---------- реакции-настроения (одна на человека; повторный выбор снимает) ---------- */
router.put('/public/:slug/reaction', requireAuth, (req, res) => {
  const row = publicDay(req.params.slug);
  if (!row) return notFound(res);
  const kind = req.body?.kind;
  if (!REACTIONS.includes(kind)) return res.status(400).json({ error: `kind: ${REACTIONS.join(', ')}` });
  const cur = db.prepare('SELECT kind FROM reactions WHERE day_id = ? AND user_id = ?').get(row.id, req.user.id);
  if (cur?.kind === kind) db.prepare('DELETE FROM reactions WHERE day_id = ? AND user_id = ?').run(row.id, req.user.id);
  else db.prepare('INSERT INTO reactions (day_id, user_id, kind) VALUES (?,?,?) ON CONFLICT(day_id, user_id) DO UPDATE SET kind = excluded.kind').run(row.id, req.user.id, kind);
  const counts = Object.fromEntries(db.prepare('SELECT kind, COUNT(*) c FROM reactions WHERE day_id = ? GROUP BY kind').all(row.id).map((r) => [r.kind, r.c]));
  res.json({ reactions: counts, myReaction: cur?.kind === kind ? null : kind });
});

/* ---------- комментарии ---------- */
const commentDto = (c, viewer, dayOwnerId) => ({
  id: c.id, body: c.body, createdAt: c.created_at,
  author: { username: c.username, displayName: c.display_name },
  canDelete: !!viewer && (viewer.id === c.user_id || viewer.id === dayOwnerId),
});

router.get('/public/:slug/comments', optionalAuth, (req, res) => {
  const row = publicDay(req.params.slug);
  if (!row) return notFound(res);
  const limit = clamp(parseInt(req.query.limit) || 30, 1, 100);
  const before = parseInt(req.query.before) || Number.MAX_SAFE_INTEGER;
  const rows = db.prepare(
    `SELECT c.*, u.username, u.display_name FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.day_id = ? AND c.id < ? ORDER BY c.id DESC LIMIT ?`,
  ).all(row.id, before, limit);
  res.json({ enabled: !!row.comments_enabled, items: rows.map((c) => commentDto(c, req.user, row.user_id)), nextBefore: rows.length === limit ? rows[rows.length - 1].id : null });
});

router.post('/public/:slug/comments', requireAuth, rateLimit({ max: 6, windowMs: 60_000, key: (r) => 'cm' + r.user.id }), ah(async (req, res) => {
  const row = publicDay(req.params.slug);
  if (!row) return notFound(res);
  if (!row.comments_enabled) return res.status(403).json({ error: 'Автор отключил комментарии' });
  const body = typeof req.body?.body === 'string' ? req.body.body.replace(/\s+/g, ' ').trim() : '';
  if (!body || body.length > 500) return res.status(400).json({ error: 'Комментарий: от 1 до 500 символов' });
  const info = db.prepare('INSERT INTO comments (day_id, user_id, body) VALUES (?,?,?)').run(row.id, req.user.id, body);
  const c = db.prepare('SELECT c.*, u.username, u.display_name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?').get(info.lastInsertRowid);
  res.status(201).json({ comment: commentDto(c, req.user, row.user_id) });
}));

// удалить может автор комментария или владелец дня
router.delete('/comments/:id', requireAuth, (req, res) => {
  const c = db.prepare('SELECT c.id, c.user_id, d.user_id AS owner FROM comments c JOIN days d ON d.id = c.day_id WHERE c.id = ?').get(Number(req.params.id));
  if (!c) return notFound(res);
  if (c.user_id !== req.user.id && c.owner !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
  db.prepare('DELETE FROM comments WHERE id = ?').run(c.id);
  res.status(204).end();
});

export default router;
