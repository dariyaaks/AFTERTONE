import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
export const db = new DatabaseSync(path.join(config.dataDir, 'diary.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  age INTEGER NOT NULL,
  interests TEXT NOT NULL DEFAULT '[]',
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  analysis TEXT NOT NULL,
  scene TEXT NOT NULL,
  passport TEXT NOT NULL,
  music TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'video',
  visibility TEXT NOT NULL DEFAULT 'private',
  comments_enabled INTEGER NOT NULL DEFAULT 1,
  slug TEXT NOT NULL UNIQUE,
  folder TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_days_user_date ON days(user_id, date);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  filename TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  stats TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reactions (
  day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  PRIMARY KEY (day_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

/** Транзакция: всё или ничего */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

try { db.exec('ALTER TABLE users ADD COLUMN email TEXT'); } catch { /* колонка уже есть */ }
try { db.exec('ALTER TABLE users ADD COLUMN prefs TEXT'); } catch { /* уже есть */ }
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE)');

export const parseJson = (s, fallback = null) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};
