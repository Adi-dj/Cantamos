import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import crypto from 'node:crypto';
import { SEED_SONGS } from './seedSongs.js';

const DB_PATH = process.env.DB_PATH || new URL('../data/cantamos.db', import.meta.url).pathname;
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE,
    level REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'seed',
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS unlocked (
    song_id INTEGER PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
    unlocked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    activity TEXT NOT NULL,
    score INTEGER NOT NULL,
    max_score INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
`);

// ---------- PIN hashing ----------
export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}
export function checkPin(pin, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(pin), salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

// ---------- seed ----------
export function seed() {
  const insert = db.prepare('INSERT OR IGNORE INTO songs (slug, level, source, data) VALUES (?, ?, ?, ?)');
  for (const s of SEED_SONGS) insert.run(s.slug, s.level, 'seed', JSON.stringify(s));

  const unlockedCount = db.prepare('SELECT COUNT(*) AS c FROM unlocked').get().c;
  if (unlockedCount === 0) {
    const first = orderedSongs()[0];
    if (first) db.prepare('INSERT INTO unlocked (song_id) VALUES (?)').run(first.id);
  }

  // מנהל המערכת: שם משתמש קבוע מתוך משתני הסביבה
  const adminName = (process.env.ADMIN_USERNAME || 'admin').trim();
  const adminPass = process.env.ADMIN_PASSWORD || '1234';
  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(adminName);
  if (!existing) {
    db.prepare('INSERT INTO users (username, display_name, pin_hash, is_admin) VALUES (?, ?, ?, 1)')
      .run(adminName, adminName, hashPin(adminPass));
  } else {
    // הסיסמה ב-ADMIN_PASSWORD תמיד גוברת, וההרשאה מובטחת
    db.prepare('UPDATE users SET is_admin = 1, pin_hash = ? WHERE id = ?').run(hashPin(adminPass), existing.id);
  }
  // רק המשתמש המוגדר הוא מנהל
  db.prepare('UPDATE users SET is_admin = 0 WHERE username <> ? COLLATE NOCASE').run(adminName);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn(`⚠️  ADMIN_PASSWORD לא הוגדר – הסיסמה של "${adminName}" היא 1234. הגדירו משתנה סביבה לפני שימוש אמיתי.`);
  }
}

// ---------- songs ----------
export function orderedSongs() {
  return db.prepare('SELECT id, slug, level, source, data, created_at FROM songs ORDER BY level, id').all()
    .map((r) => ({ ...JSON.parse(r.data), id: r.id, level: r.level, source: r.source }));
}
export function getSong(id) {
  const r = db.prepare('SELECT * FROM songs WHERE id = ?').get(id);
  return r ? { ...JSON.parse(r.data), id: r.id, level: r.level, source: r.source } : null;
}
export function unlockedIds() {
  return db.prepare('SELECT song_id, unlocked_at FROM unlocked ORDER BY unlocked_at, rowid').all();
}
export function currentSongId() {
  const rows = db.prepare('SELECT song_id FROM unlocked ORDER BY unlocked_at DESC, rowid DESC LIMIT 1').all();
  return rows[0]?.song_id ?? null;
}
