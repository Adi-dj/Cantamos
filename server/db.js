// שכבת הנתונים: PostgreSQL.
// בענן (Vercel) – Neon דרך DATABASE_URL. במחשב המקומי – PGlite (Postgres מוטמע בקובץ), בלי התקנה.
import crypto from 'node:crypto';
import { SEED_SONGS } from './seedSongs.js';

let queryFn;
async function connect() {
  if (process.env.DATABASE_URL) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    queryFn = (text, params = []) => sql.query(text, params);
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = process.env.DB_PATH || new URL('../data/pglite', import.meta.url).pathname;
    const pg = new PGlite(dir);
    queryFn = async (text, params = []) => (await pg.query(text, params)).rows;
  }
}

export const q = (text, params) => queryFn(text, params);
export const one = async (text, params) => (await q(text, params))[0] ?? null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_username_ci ON users (lower(username))`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS songs (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE,
    level REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'seed',
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS unlocked (
    song_id INTEGER PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
    seq SERIAL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    activity TEXT NOT NULL,
    score INTEGER NOT NULL,
    max_score INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS activity_user_song ON activity_log (user_id, song_id)`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`,
];

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
export const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ');

// ---------- init (פעם אחת לכל הפעלה של השרת) ----------
let readyPromise;
export function ready() {
  if (!readyPromise) readyPromise = init().catch((e) => { readyPromise = null; throw e; });
  return readyPromise;
}
async function init() {
  await connect();
  for (const s of SCHEMA) await q(s);

  await syncSeedSongs();
  // תמיד יש שיר משפחתי פתוח (גם במסד חדש, וגם אם השיר הנוכחי הוסר מהתוכנית)
  if (!(await one('SELECT 1 AS x FROM unlocked LIMIT 1'))) {
    const first = (await orderedSongs())[0];
    if (first) await q('INSERT INTO unlocked (song_id) VALUES ($1) ON CONFLICT DO NOTHING', [first.id]);
  }

  // מנהל המערכת: שם משתמש קבוע מתוך משתני הסביבה
  const adminName = cleanName(process.env.ADMIN_USERNAME || 'עדי טמיר');
  const adminPass = process.env.ADMIN_PASSWORD || '1234';
  const existing = await one('SELECT id FROM users WHERE lower(username) = lower($1)', [adminName]);
  if (!existing) {
    await q('INSERT INTO users (username, display_name, pin_hash, is_admin) VALUES ($1, $1, $2, TRUE) ON CONFLICT DO NOTHING', [adminName, hashPin(adminPass)]);
  } else {
    await q('UPDATE users SET is_admin = TRUE, pin_hash = $1 WHERE id = $2', [hashPin(adminPass), existing.id]);
  }
  await q('UPDATE users SET is_admin = FALSE WHERE lower(username) <> lower($1) AND is_admin', [adminName]);
  if (!process.env.ADMIN_PASSWORD) console.warn(`⚠️  ADMIN_PASSWORD לא הוגדר – הקוד של "${adminName}" הוא 1234.`);
}

// ---------- סנכרון תוכנית השירים ----------
// רץ רק כשרשימת השירים בקוד השתנתה. שירי בסיס שהמנהל ערך (source = 'seed-edited') לא נדרסים.
// שירי בסיס שהוסרו מהקוד נמחקים. קישור הספוטיפיי וזמני הסנכרון נשמרים לשורות שלא השתנו.
async function syncSeedSongs() {
  const version = crypto.createHash('sha1').update(JSON.stringify(SEED_SONGS)).digest('hex');
  if ((await one("SELECT value FROM meta WHERE key = 'seed_version'"))?.value === version) return;
  const existing = await q("SELECT id, slug, source, data FROM songs WHERE source IN ('seed', 'seed-edited')");
  for (const s of SEED_SONGS) {
    const ex = existing.find((e) => e.slug === s.slug);
    if (!ex) {
      await q('INSERT INTO songs (slug, level, source, data) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (slug) DO NOTHING',
        [s.slug, s.level, 'seed', JSON.stringify(s)]);
    } else if (ex.source === 'seed') {
      const old = ex.data;
      const lines = s.lines.map((l, i) => ({ ...l, t: old.lines?.[i]?.es === l.es ? old.lines[i].t ?? null : null }));
      const merged = { ...s, lines, spotifyUrl: old.spotifyUrl || '' };
      await q('UPDATE songs SET level = $1, data = $2::jsonb WHERE id = $3', [s.level, JSON.stringify(merged), ex.id]);
    }
  }
  const slugs = new Set(SEED_SONGS.map((s) => s.slug));
  for (const ex of existing) if (ex.source === 'seed' && !slugs.has(ex.slug)) await q('DELETE FROM songs WHERE id = $1', [ex.id]);
  await q("INSERT INTO meta (key, value) VALUES ('seed_version', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [version]);
}

// ---------- songs ----------
const toSong = (r) => ({ ...r.data, id: r.id, level: r.level, source: r.source });
export async function orderedSongs() {
  return (await q('SELECT id, level, source, data FROM songs ORDER BY level, id')).map(toSong);
}
export async function getSong(id) {
  if (!Number.isInteger(id)) return null;
  const r = await one('SELECT id, level, source, data FROM songs WHERE id = $1', [id]);
  return r ? toSong(r) : null;
}
export async function unlockedIds() {
  return (await q('SELECT song_id FROM unlocked ORDER BY seq')).map((r) => r.song_id);
}
export async function currentSongId() {
  return (await one('SELECT song_id FROM unlocked ORDER BY seq DESC LIMIT 1'))?.song_id ?? null;
}
