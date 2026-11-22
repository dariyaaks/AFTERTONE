import { db, parseJson } from './db.js';
import { config } from './config.js';
import { signMedia } from './auth.js';

export function loadPhotos(dayId) {
  return db.prepare('SELECT * FROM photos WHERE day_id = ? ORDER BY position').all(dayId);
}

const mediaQuery = (token) => (token ? `?m=${token}` : '');

function reactionData(dayId, viewer) {
  const counts = Object.fromEntries(db.prepare('SELECT kind, COUNT(*) c FROM reactions WHERE day_id = ? GROUP BY kind').all(dayId).map((r) => [r.kind, r.c]));
  const mine = viewer ? db.prepare('SELECT kind FROM reactions WHERE day_id = ? AND user_id = ?').get(dayId, viewer.id)?.kind || null : null;
  return { counts, mine };
}

/** Полный вид дня. Токен медиа выдаётся только владельцу приватного дня. */
export function dayDto(row, { viewer = null } = {}) {
  const isOwner = !!viewer && viewer.id === row.user_id;
  const token = isOwner && row.visibility === 'private' ? signMedia(row.id) : null;
  const q = mediaQuery(token);
  const music = parseJson(row.music, {});
  const scene = parseJson(row.scene, {});
  const author = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(row.user_id);

  // адрес музыки для плеера: свой файл → превью через прокси (CORS) → нет
  if (scene.audio?.music) {
    scene.audio.music.src = music.upload ? `/api/days/${row.id}/audio${q}` : music.previewUrl ? `/api/music/preview?url=${encodeURIComponent(music.previewUrl)}` : null;
  }
  const photos = loadPhotos(row.id).map((p) => {
    const stats = parseJson(p.stats, {});
    return { id: p.id, url: `/api/days/${row.id}/photos/${p.id}${q}`, width: p.width, height: p.height, palette: stats.palette || [] };
  });
  const rx = reactionData(row.id, viewer);
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    text: row.text,
    format: row.format,
    visibility: row.visibility,
    commentsEnabled: !!row.comments_enabled,
    shareUrl: row.visibility === 'public' ? `${config.publicUrl}/d/${row.slug}` : null,
    slug: row.visibility === 'public' || isOwner ? row.slug : undefined,
    folder: isOwner ? row.folder : undefined,
    createdAt: row.created_at,
    analysis: parseJson(row.analysis, {}),
    scene,
    passport: parseJson(row.passport, []),
    music: { ...music, upload: music.upload ? { mime: music.upload.mime } : null },
    photos,
    author: { username: author.username, displayName: author.display_name, profileUrl: `${config.publicUrl}/u/${author.username}` },
    reactions: rx.counts,
    myReaction: rx.mine,
    commentsCount: db.prepare('SELECT COUNT(*) c FROM comments WHERE day_id = ?').get(row.id).c,
    isOwner,
  };
}

/** Лёгкая карточка для архива, календаря и профиля */
export function dayCard(row, { viewer = null } = {}) {
  const isOwner = !!viewer && viewer.id === row.user_id;
  const q = mediaQuery(isOwner && row.visibility === 'private' ? signMedia(row.id) : null);
  const scene = parseJson(row.scene, {});
  const music = parseJson(row.music, {});
  const cover = db.prepare('SELECT id FROM photos WHERE day_id = ? ORDER BY position LIMIT 1').get(row.id);
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    text: row.text.slice(0, 140),
    song: [music.artist, music.title].filter(Boolean).join(' — '),
    visibility: row.visibility,
    style: scene.style,
    styleLabel: scene.styleLabel,
    moodLabel: scene.mood?.label,
    valence: scene.mood?.valence,
    energy: scene.mood?.energy,
    gradient: scene.palette?.gradient,
    accent: scene.palette?.accent,
    cover: cover ? `/api/days/${row.id}/photos/${cover.id}${q}` : null,
    slug: row.visibility === 'public' ? row.slug : undefined,
  };
}
