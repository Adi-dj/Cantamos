// יצירת תרגילים ומבחנים אוטומטית מנתוני השיר.
export const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
export const sample = (arr, n) => shuffle(arr).slice(0, n);
export const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zñ0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const stripArticle = (s) => s.replace(/^(el|la|los|las|un|una)\s+/i, '').replace(/^¿|\?$/g, '');
const tokens = (line) => line.split(/\s+/).filter(Boolean);
const PRONOUNS = ['yo', 'tú', 'él/ella', 'nosotros', 'vosotros', 'ellos'];

function options(correct, pool, n = 4) {
  const uniq = [...new Set(pool.filter((p) => p && p !== correct))];
  return shuffle([correct, ...sample(uniq, n - 1)]);
}

// --- התאמה ---
export function matchPairs(song, n = 6) {
  return sample(song.vocab, Math.min(n, song.vocab.length));
}

// --- השלמת מילה בשורה ---
function blankable(line, song) {
  const toks = tokens(line.es);
  const heads = song.vocab.map((w) => norm(stripArticle(w.es)).split(' ')[0]).filter((h) => h.length >= 3);
  let idx = toks.findIndex((t) => { const n = norm(t); return n.length >= 3 && heads.some((h) => n.startsWith(h.slice(0, Math.max(3, h.length - 2)))); });
  if (idx < 0) {
    let best = -1;
    toks.forEach((t, i) => { if (norm(t).length > 3 && (best < 0 || norm(t).length > norm(toks[best]).length)) best = i; });
    idx = best;
  }
  return idx;
}
export function fillBlanks(song, n = 6) {
  const allWords = [...new Set(song.lines.flatMap((l) => tokens(l.es).map((t) => t.replace(/[¡!¿?,.;:—]/g, ''))).filter((w) => w.length > 2))];
  const uniqLines = [...new Map(song.lines.map((l) => [l.es, l])).values()];
  return sample(uniqLines, Math.min(n, uniqLines.length)).map((line) => {
    const toks = tokens(line.es);
    const idx = blankable(line, song);
    if (idx < 0) return null;
    const answer = toks[idx].replace(/[¡!¿?,.;:—]/g, '');
    const display = toks.map((t, i) => (i === idx ? t.replace(answer, '_____') : t)).join(' ');
    return { line, display, answer, options: options(answer, allWords) };
  }).filter(Boolean);
}

// --- סידור משפט ---
export function orderTasks(song, n = 5) {
  const cands = [...new Map(song.lines.map((l) => [l.es, l])).values()].filter((l) => { const k = tokens(l.es).length; return k >= 3 && k <= 9; });
  return sample(cands, Math.min(n, cands.length)).map((line) => {
    const words = tokens(line.es).map((w, i) => ({ id: i, w }));
    let shuffled = shuffle(words);
    if (shuffled.every((x, i) => x.id === i)) shuffled = [...words].reverse();
    return { line, words, shuffled };
  });
}

// --- הטיית פעלים ---
export function conjugationTasks(song, n = 8) {
  const verbs = song.verbs || [];
  if (!verbs.length) return [];
  const tasks = [];
  for (const vb of verbs) for (const p of PRONOUNS) if (vb.forms[p]) tasks.push({ verb: vb, pronoun: p, answer: vb.forms[p], options: options(vb.forms[p], Object.values(vb.forms)) });
  return sample(tasks, Math.min(n, tasks.length));
}

// --- האזנה ---
export function listeningTasks(song, n = 6) {
  const heAll = song.vocab.map((w) => w.he);
  return sample(song.vocab, Math.min(n, song.vocab.length)).map((w) => ({ word: w, answer: w.he, options: options(w.he, heAll) }));
}

// --- מבחן מסכם ---
export function buildQuiz(song) {
  const q = [];
  const heAll = song.vocab.map((w) => w.he);
  const esAll = song.vocab.map((w) => w.es);
  for (const w of sample(song.vocab, 3)) q.push({ kind: 'es→he', prompt: 'מה הפירוש?', es: w.es, options: options(w.he, heAll), answer: w.he });
  for (const w of sample(song.vocab, 3)) q.push({ kind: 'he→es', prompt: `איך אומרים בספרדית: "${w.he}"?`, options: options(w.es, esAll), answer: w.es, optionsEs: true });
  for (const w of sample(song.vocab, 1)) q.push({ kind: 'listen', prompt: 'הקשיבו ובחרו את הפירוש', speak: w.es, options: options(w.he, heAll), answer: w.he });
  const uniqLines = [...new Map(song.lines.map((l) => [l.es, l])).values()];
  const heLines = uniqLines.map((l) => l.he);
  for (const l of sample(uniqLines, 2)) q.push({ kind: 'line', prompt: 'מה התרגום של השורה?', es: l.es, options: options(l.he, heLines), answer: l.he });
  for (const f of fillBlanks(song, 2)) q.push({ kind: 'fill', prompt: 'השלימו את המילה החסרה', es: f.display, hint: f.line.he, options: f.options, answer: f.answer, optionsEs: true });
  for (const c of conjugationTasks(song, 2)) q.push({ kind: 'conj', prompt: `הטו את הפועל ${c.verb.inf} (${c.verb.tense})`, es: `${c.pronoun} ___`, options: c.options, answer: c.answer, optionsEs: true });
  for (const o of orderTasks(song, 1)) q.push({ kind: 'order', prompt: 'סדרו את המילים לפי השיר', hint: o.line.he, task: o, answer: o.line.es });
  return shuffle(q);
}
