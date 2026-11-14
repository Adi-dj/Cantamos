import express from 'express';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { db, seed, hashPin, checkPin, orderedSongs, getSong, unlockedIds, currentSongId } from './db.js';
import { MODERN_SUGGESTIONS } from './seedSongs.js';

seed();
const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------- auth helpers ----------
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((c) => {
    const i = c.indexOf('=');
    return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }));
}
function startSession(res, userId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`);
}
function auth(req, res, next) {
  const sid = parseCookies(req).sid;
  const user = sid && db.prepare(`SELECT u.id, u.username, u.display_name, u.is_admin FROM sessions s
    JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(sid);
  if (!user) return res.status(401).json({ error: 'יש להתחבר' });
  req.user = { id: user.id, username: user.username, displayName: user.display_name, isAdmin: !!user.is_admin };
  next();
}
function adminOnly(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'רק מנהל המערכת יכול לבצע פעולה זו' });
  next();
}
const USERNAME_RE = /^[\p{L}\p{N}_.-]+( [\p{L}\p{N}_.-]+)*$/u; // מותרים רווחים בודדים ("עדי טמיר")
const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ');

app.post('/api/auth/register', (req, res) => {
  const username = cleanName(req.body.username);
  const pin = String(req.body.pin || '');
  if (!USERNAME_RE.test(username) || username.length < 2 || username.length > 24) return res.status(400).json({ error: 'שם משתמש: 2–24 תווים, אותיות, ספרות ורווחים' });
  if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: 'קוד אישי: 4–8 ספרות' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: 'שם המשתמש כבר תפוס' });
  const r = db.prepare('INSERT INTO users (username, display_name, pin_hash) VALUES (?, ?, ?)').run(username, username, hashPin(pin));
  startSession(res, Number(r.lastInsertRowid));
  res.json({ ok: true });
});

app.post('/api/auth/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(cleanName(req.body.username));
  if (!u || !checkPin(String(req.body.pin || ''), u.pin_hash)) return res.status(401).json({ error: 'שם משתמש או קוד שגויים' });
  startSession(res, u.id);
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  const sid = parseCookies(req).sid;
  if (sid) db.prepare('DELETE FROM sessions WHERE token = ?').run(sid);
  res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json(req.user));

// ---------- family state & songs ----------
function stateFor(user) {
  const unlocked = unlockedIds();
  const unlockedSet = new Set(unlocked.map((u) => u.song_id));
  const current = currentSongId();
  const mine = db.prepare(`SELECT song_id, activity, MAX(score * 100.0 / max_score) AS best, COUNT(*) AS n
    FROM activity_log WHERE user_id = ? GROUP BY song_id, activity`).all(user.id);
  const songs = orderedSongs().map((s) => {
    const acts = mine.filter((m) => m.song_id === s.id);
    const quiz = acts.find((a) => a.activity === 'quiz');
    return {
      id: s.id, title: s.title, artist: s.artist, level: s.level, stage: s.stage, origin: s.origin, source: s.source,
      unlocked: unlockedSet.has(s.id), current: s.id === current,
      activitiesDone: acts.filter((a) => a.activity !== 'quiz').map((a) => a.activity),
      bestQuiz: quiz ? Math.round(quiz.best) : null,
    };
  });
  return { currentSongId: current, songs };
}

app.get('/api/state', auth, (req, res) => res.json(stateFor(req.user)));

app.get('/api/songs/:id', auth, (req, res) => {
  const song = getSong(Number(req.params.id));
  if (!song) return res.status(404).json({ error: 'השיר לא נמצא' });
  const isUnlocked = db.prepare('SELECT 1 FROM unlocked WHERE song_id = ?').get(song.id);
  if (!isUnlocked && !req.user.isAdmin) return res.status(403).json({ error: 'השיר עוד לא נפתח למשפחה' });
  const history = db.prepare(`SELECT activity, score, max_score, created_at FROM activity_log
    WHERE user_id = ? AND song_id = ? ORDER BY created_at DESC LIMIT 50`).all(req.user.id, song.id);
  res.json({ song, history, unlocked: !!isUnlocked, current: currentSongId() === song.id });
});

// ---------- progress ----------
const ACTIVITIES = new Set(['listen', 'flashcards', 'match', 'fill', 'order', 'listening', 'conjugation', 'speak', 'quiz']);
app.post('/api/progress', auth, (req, res) => {
  const { songId, activity } = req.body;
  const score = Math.max(0, Math.round(Number(req.body.score)));
  const max = Math.max(1, Math.round(Number(req.body.max)));
  if (!ACTIVITIES.has(activity) || !getSong(Number(songId)) || score > max) return res.status(400).json({ error: 'נתונים לא תקינים' });
  db.prepare('INSERT INTO activity_log (user_id, song_id, activity, score, max_score) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, Number(songId), activity, score, max);
  res.json({ ok: true });
});

// XP: כל תשובה נכונה = 10 נק׳, מבחן = כפול
app.get('/api/family', auth, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, is_admin, created_at FROM users ORDER BY id').all();
  const order = orderedSongs();
  const unlockedSet = new Set(unlockedIds().map((u) => u.song_id));
  const songs = order.filter((s) => unlockedSet.has(s.id)).map((s) => ({ id: s.id, title: s.title, level: s.level }));
  const best = db.prepare(`SELECT user_id, song_id, MAX(score * 100.0 / max_score) AS best FROM activity_log
    WHERE activity = 'quiz' GROUP BY user_id, song_id`).all();
  const xp = db.prepare(`SELECT user_id, SUM(CASE WHEN activity = 'quiz' THEN score * 20 ELSE score * 10 END) AS xp,
    COUNT(*) AS sessions, MAX(created_at) AS last FROM activity_log GROUP BY user_id`).all();
  const acts = db.prepare('SELECT user_id, song_id, COUNT(DISTINCT activity) AS n FROM activity_log WHERE activity <> \'quiz\' GROUP BY user_id, song_id').all();
  const weekly = db.prepare(`SELECT user_id, date(created_at, 'weekday 0', '-6 days') AS week,
    SUM(CASE WHEN activity = 'quiz' THEN score * 20 ELSE score * 10 END) AS xp
    FROM activity_log WHERE created_at >= date('now', '-84 days') GROUP BY user_id, week ORDER BY week`).all();
  res.json({
    songs,
    users: users.map((u) => {
      const x = xp.find((r) => r.user_id === u.id);
      return {
        id: u.id, name: u.display_name, isAdmin: !!u.is_admin, joined: u.created_at,
        xp: x?.xp || 0, sessions: x?.sessions || 0, lastActive: x?.last || null,
        quiz: Object.fromEntries(best.filter((b) => b.user_id === u.id).map((b) => [b.song_id, Math.round(b.best)])),
        activities: Object.fromEntries(acts.filter((a) => a.user_id === u.id).map((a) => [a.song_id, a.n])),
        weekly: weekly.filter((w) => w.user_id === u.id).map((w) => ({ week: w.week, xp: w.xp })),
      };
    }),
  });
});

// ---------- admin ----------
app.post('/api/admin/advance', auth, adminOnly, (req, res) => {
  const unlockedSet = new Set(unlockedIds().map((u) => u.song_id));
  let target;
  if (req.body.songId) {
    target = getSong(Number(req.body.songId));
    if (!target) return res.status(404).json({ error: 'השיר לא נמצא' });
    if (unlockedSet.has(target.id)) {
      // שיר שכבר נפתח – הופך שוב לשיר המשפחתי הנוכחי
      db.prepare('DELETE FROM unlocked WHERE song_id = ?').run(target.id);
      db.prepare('INSERT INTO unlocked (song_id) VALUES (?)').run(target.id);
      return res.json({ ok: true, currentSongId: target.id });
    }
  } else {
    target = orderedSongs().find((s) => !unlockedSet.has(s.id));
    if (!target) return res.status(400).json({ error: 'כל השירים כבר נפתחו – הוסיפו שיר חדש באזור הניהול' });
  }
  db.prepare('INSERT INTO unlocked (song_id) VALUES (?)').run(target.id);
  res.json({ ok: true, currentSongId: target.id });
});

function validateSong(d) {
  const errs = [];
  if (!d.title?.trim()) errs.push('חסר שם שיר');
  if (!Array.isArray(d.lines) || d.lines.length < 2) errs.push('נדרשות לפחות 2 שורות');
  else if (d.lines.some((l) => !l.es?.trim() || !l.he?.trim())) errs.push('לכל שורה צריך ספרדית ותרגום');
  if (!Array.isArray(d.vocab) || d.vocab.length < 4) errs.push('נדרשות לפחות 4 מילים באוצר המילים');
  if (!(Number(d.level) > 0)) errs.push('רמה לא תקינה');
  return errs;
}
function cleanSong(d) {
  return {
    title: d.title.trim(), artist: (d.artist || '').trim(), origin: (d.origin || '').trim(),
    level: Number(d.level), stage: (d.stage || `שלב ${d.level}`).trim(),
    spotifyUrl: (d.spotifyUrl || '').trim(), spotifySearch: (d.spotifySearch || `${d.title} ${d.artist || ''}`).trim(),
    culture: (d.culture || '').trim(),
    grammar: d.grammar?.title ? { title: d.grammar.title, explanation: d.grammar.explanation || '', examples: d.grammar.examples || [] } : null,
    lines: d.lines.map((l) => ({ es: l.es.trim(), he: l.he.trim(), t: Number.isFinite(l.t) ? l.t : null })),
    vocab: d.vocab.map((w) => ({ es: w.es.trim(), he: w.he.trim(), type: w.type || 'other', ...(w.note ? { note: w.note } : {}) })),
    verbs: (d.verbs || []).filter((x) => x.inf && x.forms),
    variant: d.variant || '',
  };
}

app.post('/api/admin/songs', auth, adminOnly, (req, res) => {
  const errs = validateSong(req.body);
  if (errs.length) return res.status(400).json({ error: errs.join(' · ') });
  const s = cleanSong(req.body);
  const r = db.prepare('INSERT INTO songs (slug, level, source, data) VALUES (?, ?, ?, ?)')
    .run(`custom-${Date.now()}`, s.level, 'admin', JSON.stringify(s));
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});

app.put('/api/admin/songs/:id', auth, adminOnly, (req, res) => {
  const old = getSong(Number(req.params.id));
  if (!old) return res.status(404).json({ error: 'השיר לא נמצא' });
  const merged = { ...old, ...req.body };
  const errs = validateSong(merged);
  if (errs.length) return res.status(400).json({ error: errs.join(' · ') });
  const s = { ...cleanSong(merged), slug: old.slug };
  db.prepare('UPDATE songs SET level = ?, data = ? WHERE id = ?').run(s.level, JSON.stringify(s), old.id);
  res.json({ ok: true });
});

app.delete('/api/admin/songs/:id', auth, adminOnly, (req, res) => {
  const song = getSong(Number(req.params.id));
  if (!song) return res.status(404).json({ error: 'השיר לא נמצא' });
  if (song.source === 'seed') return res.status(400).json({ error: 'אי אפשר למחוק שיר מתוכנית הבסיס' });
  db.prepare('DELETE FROM songs WHERE id = ?').run(song.id);
  if (!db.prepare('SELECT 1 FROM unlocked').get()) {
    const first = orderedSongs()[0];
    if (first) db.prepare('INSERT INTO unlocked (song_id) VALUES (?)').run(first.id);
  }
  res.json({ ok: true });
});

app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  res.json(db.prepare('SELECT id, username, is_admin, created_at FROM users ORDER BY id').all());
});
app.delete('/api/admin/users/:id', auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'אי אפשר למחוק את מנהל המערכת' });
  db.prepare('DELETE FROM users WHERE id = ? AND is_admin = 0').run(id);
  res.json({ ok: true });
});
app.post('/api/admin/users/:id/pin', auth, adminOnly, (req, res) => {
  const pin = String(req.body.pin || '');
  if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: 'קוד אישי: 4–8 ספרות' });
  db.prepare('UPDATE users SET pin_hash = ? WHERE id = ? AND is_admin = 0').run(hashPin(pin), Number(req.params.id));
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});
app.get('/api/admin/suggestions', auth, adminOnly, (req, res) => res.json(MODERN_SUGGESTIONS));

// ---------- static client ----------
const dist = new URL('../dist/', import.meta.url).pathname;
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(dist + 'index.html'));
}

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`🎶 Cantamos פועל על http://localhost:${PORT}`));
