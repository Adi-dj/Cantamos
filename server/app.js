// אפליקציית ה-API (Express). משמשת גם את השרת המקומי (server/index.js) וגם את Vercel (api/index.js).
import express from 'express';
import crypto from 'node:crypto';
import { q, one, ready, hashPin, checkPin, cleanName, orderedSongs, getSong, unlockedIds, currentSongId } from './db.js';
import { MODERN_SUGGESTIONS } from './seedSongs.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

// Express 4 לא תופס שגיאות של פונקציות async – העטיפה הזו מעבירה אותן הלאה
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app.use('/api', h(async (req, res, next) => { await ready(); next(); }));

// ---------- auth helpers ----------
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((c) => {
    const i = c.indexOf('=');
    return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }));
}
async function startSession(req, res, userId) {
  const token = crypto.randomBytes(24).toString('hex');
  await q('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, userId]);
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}${secure}`);
}
const auth = h(async (req, res, next) => {
  const sid = parseCookies(req).sid;
  const user = sid && await one(`SELECT u.id, u.username, u.display_name, u.is_admin FROM sessions s
    JOIN users u ON u.id = s.user_id WHERE s.token = $1`, [sid]);
  if (!user) return res.status(401).json({ error: 'יש להתחבר' });
  req.user = { id: user.id, username: user.username, displayName: user.display_name, isAdmin: !!user.is_admin };
  next();
});
function adminOnly(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'רק מנהל המערכת יכול לבצע פעולה זו' });
  next();
}
const USERNAME_RE = /^[\p{L}\p{N}_.-]+( [\p{L}\p{N}_.-]+)*$/u; // מותרים רווחים בודדים ("עדי טמיר")
const findUser = (name) => one('SELECT * FROM users WHERE lower(username) = lower($1)', [name]);

app.post('/api/auth/register', h(async (req, res) => {
  const username = cleanName(req.body.username);
  const pin = String(req.body.pin || '');
  if (!USERNAME_RE.test(username) || username.length < 2 || username.length > 24) return res.status(400).json({ error: 'שם משתמש: 2–24 תווים, אותיות, ספרות ורווחים' });
  if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: 'קוד אישי: 4–8 ספרות' });
  if (await findUser(username)) return res.status(409).json({ error: 'שם המשתמש כבר תפוס' });
  const r = await one('INSERT INTO users (username, display_name, pin_hash) VALUES ($1, $1, $2) RETURNING id', [username, hashPin(pin)]);
  await startSession(req, res, r.id);
  res.json({ ok: true });
}));

app.post('/api/auth/login', h(async (req, res) => {
  const u = await findUser(cleanName(req.body.username));
  if (!u || !checkPin(String(req.body.pin || ''), u.pin_hash)) return res.status(401).json({ error: 'שם משתמש או קוד שגויים' });
  await startSession(req, res, u.id);
  res.json({ ok: true });
}));

app.post('/api/auth/logout', h(async (req, res) => {
  const sid = parseCookies(req).sid;
  if (sid) await q('DELETE FROM sessions WHERE token = $1', [sid]);
  res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0');
  res.json({ ok: true });
}));

app.get('/api/me', auth, (req, res) => res.json(req.user));

// ---------- family state & songs ----------
app.get('/api/state', auth, h(async (req, res) => {
  const [songsAll, unlocked, current, mine] = await Promise.all([
    orderedSongs(), unlockedIds(), currentSongId(),
    q(`SELECT song_id, activity, MAX(score * 100.0 / max_score)::float8 AS best FROM activity_log
       WHERE user_id = $1 GROUP BY song_id, activity`, [req.user.id]),
  ]);
  const unlockedSet = new Set(unlocked);
  const songs = songsAll.map((s) => {
    const acts = mine.filter((m) => m.song_id === s.id);
    const quiz = acts.find((a) => a.activity === 'quiz');
    return {
      id: s.id, title: s.title, artist: s.artist, level: s.level, stage: s.stage, origin: s.origin, source: s.source,
      unlocked: unlockedSet.has(s.id), current: s.id === current,
      activitiesDone: acts.filter((a) => a.activity !== 'quiz').map((a) => a.activity),
      bestQuiz: quiz ? Math.round(quiz.best) : null,
    };
  });
  res.json({ currentSongId: current, songs });
}));

app.get('/api/songs/:id', auth, h(async (req, res) => {
  const song = await getSong(Number(req.params.id));
  if (!song) return res.status(404).json({ error: 'השיר לא נמצא' });
  const isUnlocked = !!(await one('SELECT 1 AS x FROM unlocked WHERE song_id = $1', [song.id]));
  if (!isUnlocked && !req.user.isAdmin) return res.status(403).json({ error: 'השיר עוד לא נפתח למשפחה' });
  const history = await q(`SELECT activity, score, max_score, created_at FROM activity_log
    WHERE user_id = $1 AND song_id = $2 ORDER BY created_at DESC LIMIT 50`, [req.user.id, song.id]);
  res.json({ song, history, unlocked: isUnlocked, current: (await currentSongId()) === song.id });
}));

// ---------- progress ----------
const ACTIVITIES = new Set(['listen', 'flashcards', 'match', 'fill', 'order', 'listening', 'conjugation', 'speak', 'quiz']);
app.post('/api/progress', auth, h(async (req, res) => {
  const { songId, activity } = req.body;
  const score = Math.max(0, Math.round(Number(req.body.score)));
  const max = Math.max(1, Math.round(Number(req.body.max)));
  if (!ACTIVITIES.has(activity) || !Number.isFinite(score) || score > max || !(await getSong(Number(songId)))) return res.status(400).json({ error: 'נתונים לא תקינים' });
  await q('INSERT INTO activity_log (user_id, song_id, activity, score, max_score) VALUES ($1, $2, $3, $4, $5)',
    [req.user.id, Number(songId), activity, score, max]);
  res.json({ ok: true });
}));

// XP: כל תשובה נכונה = 10 נק׳, במבחן = 20
const XP = `SUM(CASE WHEN activity = 'quiz' THEN score * 20 ELSE score * 10 END)::int`;
app.get('/api/family', auth, h(async (req, res) => {
  const [users, order, unlocked, best, xp, acts, weekly] = await Promise.all([
    q('SELECT id, display_name, is_admin, created_at FROM users ORDER BY id'),
    orderedSongs(),
    unlockedIds(),
    q(`SELECT user_id, song_id, MAX(score * 100.0 / max_score)::float8 AS best FROM activity_log
       WHERE activity = 'quiz' GROUP BY user_id, song_id`),
    q(`SELECT user_id, ${XP} AS xp, COUNT(*)::int AS sessions, MAX(created_at) AS last FROM activity_log GROUP BY user_id`),
    q(`SELECT user_id, song_id, COUNT(DISTINCT activity)::int AS n FROM activity_log WHERE activity <> 'quiz' GROUP BY user_id, song_id`),
    q(`SELECT user_id, to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week, ${XP} AS xp
       FROM activity_log WHERE created_at >= now() - interval '84 days' GROUP BY user_id, week ORDER BY week`),
  ]);
  const unlockedSet = new Set(unlocked);
  const songs = order.filter((s) => unlockedSet.has(s.id)).map((s) => ({ id: s.id, title: s.title, level: s.level }));
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
}));

// ---------- admin ----------
app.post('/api/admin/advance', auth, adminOnly, h(async (req, res) => {
  const unlockedSet = new Set(await unlockedIds());
  let target;
  if (req.body.songId) {
    target = await getSong(Number(req.body.songId));
    if (!target) return res.status(404).json({ error: 'השיר לא נמצא' });
    // שיר שכבר נפתח – הופך שוב לשיר המשפחתי הנוכחי
    if (unlockedSet.has(target.id)) await q('DELETE FROM unlocked WHERE song_id = $1', [target.id]);
  } else {
    target = (await orderedSongs()).find((s) => !unlockedSet.has(s.id));
    if (!target) return res.status(400).json({ error: 'כל השירים כבר נפתחו – הוסיפו שיר חדש באזור הניהול' });
  }
  await q('INSERT INTO unlocked (song_id) VALUES ($1) ON CONFLICT DO NOTHING', [target.id]);
  res.json({ ok: true, currentSongId: target.id });
}));

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

app.post('/api/admin/songs', auth, adminOnly, h(async (req, res) => {
  const errs = validateSong(req.body);
  if (errs.length) return res.status(400).json({ error: errs.join(' · ') });
  const s = cleanSong(req.body);
  const r = await one('INSERT INTO songs (slug, level, source, data) VALUES ($1, $2, $3, $4::jsonb) RETURNING id',
    [`custom-${Date.now()}`, s.level, 'admin', JSON.stringify(s)]);
  res.json({ ok: true, id: r.id });
}));

app.put('/api/admin/songs/:id', auth, adminOnly, h(async (req, res) => {
  const old = await getSong(Number(req.params.id));
  if (!old) return res.status(404).json({ error: 'השיר לא נמצא' });
  const merged = { ...old, ...req.body };
  const errs = validateSong(merged);
  if (errs.length) return res.status(400).json({ error: errs.join(' · ') });
  const s = { ...cleanSong(merged), slug: old.slug };
  await q('UPDATE songs SET level = $1, data = $2::jsonb WHERE id = $3', [s.level, JSON.stringify(s), old.id]);
  res.json({ ok: true });
}));

app.delete('/api/admin/songs/:id', auth, adminOnly, h(async (req, res) => {
  const song = await getSong(Number(req.params.id));
  if (!song) return res.status(404).json({ error: 'השיר לא נמצא' });
  if (song.source === 'seed') return res.status(400).json({ error: 'אי אפשר למחוק שיר מתוכנית הבסיס' });
  await q('DELETE FROM songs WHERE id = $1', [song.id]);
  if (!(await one('SELECT 1 AS x FROM unlocked LIMIT 1'))) {
    const first = (await orderedSongs())[0];
    if (first) await q('INSERT INTO unlocked (song_id) VALUES ($1)', [first.id]);
  }
  res.json({ ok: true });
}));

app.get('/api/admin/users', auth, adminOnly, h(async (req, res) => {
  res.json(await q('SELECT id, username, is_admin, created_at FROM users ORDER BY id'));
}));
app.delete('/api/admin/users/:id', auth, adminOnly, h(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'אי אפשר למחוק את מנהל המערכת' });
  await q('DELETE FROM users WHERE id = $1 AND NOT is_admin', [id]);
  res.json({ ok: true });
}));
app.post('/api/admin/users/:id/pin', auth, adminOnly, h(async (req, res) => {
  const pin = String(req.body.pin || '');
  if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: 'קוד אישי: 4–8 ספרות' });
  const id = Number(req.params.id);
  await q('UPDATE users SET pin_hash = $1 WHERE id = $2 AND NOT is_admin', [hashPin(pin), id]);
  await q('DELETE FROM sessions WHERE user_id = $1', [id]);
  res.json({ ok: true });
}));
app.get('/api/admin/suggestions', auth, adminOnly, (req, res) => res.json(MODERN_SUGGESTIONS));

app.use('/api', (err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'שגיאת שרת – נסו שוב בעוד רגע' });
});

export default app;
