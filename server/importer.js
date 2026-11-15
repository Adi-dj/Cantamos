// הוספה מהירה של שיר: מילים מ-LRCLIB (חינמי, כולל זמני סנכרון), תרגום מכונה חינמי מ-MyMemory,
// אוצר מילים לפי שכיחות, טבלאות הטיה בהווה, והצעת רמה. בלי AI ובלי מפתחות.

import { MODERN_SUGGESTIONS } from './seedSongs.js';

const UA = 'Cantamos family Spanish app (https://github.com/Adi-dj/cantamos)';
const TIMEOUT = 8000;

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ---------- Spotify: שם השיר והאמן מתוך קישור ----------
export async function spotifyInfo(url) {
  const m = String(url || '').match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)/);
  if (!m) return null;
  const clean = `https://open.spotify.com/track/${m[1]}`;
  const info = { spotifyUrl: clean, title: '', artist: '' };
  try { info.title = (await getJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(clean)}`)).title || ''; } catch { /* ממשיכים בלי */ }
  try {
    const html = await (await fetch(clean, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(TIMEOUT) })).text();
    const desc = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1] || '';
    // לרוב: "Artist · Song · 1984" או "Listen to X on Spotify. Song · Artist · 1984"
    const parts = desc.replace(/&amp;/g, '&').replace(/^Listen to .*? on Spotify\.\s*/, '').split(' · ').map((s) => s.trim());
    info.artist = parts.find((p) => p && !/^(song|canción|single|ep|album)$/i.test(p) && !/^\d{4}$/.test(p) && p !== info.title) || '';
    if (!info.title) info.title = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || '';
  } catch { /* ממשיכים בלי */ }
  return info;
}

// ---------- LRCLIB ----------
export async function searchLyrics({ title, artist }) {
  const qs = artist ? `track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}` : `q=${encodeURIComponent(title)}`;
  let res = await getJson(`https://lrclib.net/api/search?${qs}`);
  if (!res.length && artist) res = await getJson(`https://lrclib.net/api/search?q=${encodeURIComponent(`${title} ${artist}`)}`);
  return res.filter((r) => r.plainLyrics || r.syncedLyrics).slice(0, 8).map((r) => ({
    id: r.id, title: r.trackName, artist: r.artistName, album: r.albumName, duration: Math.round(r.duration || 0),
    synced: !!r.syncedLyrics, preview: (r.plainLyrics || stripLrc(r.syncedLyrics)).split('\n').filter(Boolean).slice(0, 2),
  }));
}
export const getLyrics = (id) => getJson(`https://lrclib.net/api/get/${Number(id)}`);

const stripLrc = (s) => (s || '').replace(/^\[[^\]]*\]\s*/gm, '');

// "[01:23.45] texto" → [{ es, t }]
export function parseLyrics({ syncedLyrics, plainLyrics }) {
  if (syncedLyrics) {
    const out = [];
    for (const raw of syncedLyrics.split('\n')) {
      const m = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
      if (!m) continue;
      const es = m[3].trim();
      if (es) out.push({ es, t: Math.round((Number(m[1]) * 60 + Number(m[2])) * 10) / 10 });
    }
    if (out.length) return out;
  }
  return (plainLyrics || '').split('\n').map((s) => s.trim()).filter(Boolean).map((es) => ({ es, t: null }));
}

// ---------- תרגום מכונה (MyMemory, חינמי) ----------
async function translate(text) {
  const email = process.env.MYMEMORY_EMAIL ? `&de=${encodeURIComponent(process.env.MYMEMORY_EMAIL)}` : '';
  const j = await getJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=es|he${email}`);
  const out = j?.responseData?.translatedText || '';
  if (j?.quotaFinished || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(out)) throw Object.assign(new Error('quota'), { quota: true });
  return out.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
}
async function translateMany(texts) {
  const uniq = [...new Set(texts)];
  const map = new Map();
  let quota = false;
  for (let i = 0; i < uniq.length; i += 6) { // עד 6 בקשות במקביל
    await Promise.all(uniq.slice(i, i + 6).map(async (t) => {
      if (quota) return;
      try { map.set(t, await translate(t)); } catch (e) { if (e.quota) quota = true; }
    }));
  }
  return { map, quota };
}

// ---------- אוצר מילים לפי שכיחות ----------
const STOP = new Set(`a al algo algún alguna ante antes así aunque aquí ahí allí bien cada como cómo con contra cual cuál cuando cuándo de del desde donde dónde dos e el él ella ellas ellos en entre era eres es esa ese eso esta está estas este esto estos fue ha hay hasta la las le les lo los más me mi mí mis muy nada ni no nos nosotros o oh ay os para pero poco por porque pues que qué quien quién se sé si sí sin sobre son su sus también tan te ti tu tú tus un una uno unos unas usted vez y ya yo eh uh na la-la oh-oh uoh yeah todo toda todos todas otro otra otros otras mucho mucha muchos muchas mismo misma tanto tanta cuanto cuánto aquel aquella eso esos esas mío mía tuyo tuya suyo nuestro nuestra vuestro les nunca siempre ahora hoy luego así entonces alguno alguna algunos algunas ningún ninguna cosa`.split(/\s+/));
const norm = (w) => w.toLowerCase().replace(/^[¡¿"'«(]+|[!?"'»),.;:…]+$/g, '');

export function pickVocab(lines, n = 16) {
  // שמות פרטיים: מילה שמופיעה באות גדולה גם באמצע שורה (Asturias, María…)
  const proper = new Set();
  for (const l of lines) l.es.split(/\s+/).forEach((raw, i) => { const c = raw.replace(/^[¡¿"'«(]+/, ''); if (i > 0 && /^[A-ZÁÉÍÓÚÑ]/.test(c)) proper.add(norm(raw)); });
  const freq = new Map();
  for (const l of lines) for (const raw of l.es.split(/\s+/)) {
    const w = norm(raw);
    if (proper.has(w)) continue;
    if (w.length < 3 || STOP.has(w) || /\d|-/.test(w)) continue;
    const key = FORM_TO_INF.get(w) || w; // צורת פועל → שם הפועל (quiero → querer)
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, n).map(([w]) => w);
}
function guessType(w) {
  if (/(ar|er|ir|ando|iendo|ado|ido|iera|ieras|ara|aras|aba|abas|aban)$/.test(w) || VERB_FORMS.has(w)) return 'verb';
  if (/mente$/.test(w)) return 'other';
  return 'noun';
}

// ---------- פעלים: זיהוי והטיה בהווה ----------
// פעלים לא סדירים / עם שינוי גזע – הטיה מלאה בהווה
const IRREGULAR = {
  ser: 'soy eres es somos sois son', estar: 'estoy estás está estamos estáis están', ir: 'voy vas va vamos vais van',
  tener: 'tengo tienes tiene tenemos tenéis tienen', hacer: 'hago haces hace hacemos hacéis hacen',
  poder: 'puedo puedes puede podemos podéis pueden', querer: 'quiero quieres quiere queremos queréis quieren',
  decir: 'digo dices dice decimos decís dicen', saber: 'sé sabes sabe sabemos sabéis saben',
  venir: 'vengo vienes viene venimos venís vienen', dar: 'doy das da damos dais dan', ver: 'veo ves ve vemos veis ven',
  poner: 'pongo pones pone ponemos ponéis ponen', salir: 'salgo sales sale salimos salís salen',
  sentir: 'siento sientes siente sentimos sentís sienten', pensar: 'pienso piensas piensa pensamos pensáis piensan',
  volver: 'vuelvo vuelves vuelve volvemos volvéis vuelven', dormir: 'duermo duermes duerme dormimos dormís duermen',
  pedir: 'pido pides pide pedimos pedís piden', encontrar: 'encuentro encuentras encuentra encontramos encontráis encuentran',
  contar: 'cuento cuentas cuenta contamos contáis cuentan', recordar: 'recuerdo recuerdas recuerda recordamos recordáis recuerdan',
  perder: 'pierdo pierdes pierde perdemos perdéis pierden', entender: 'entiendo entiendes entiende entendemos entendéis entienden',
  empezar: 'empiezo empiezas empieza empezamos empezáis empiezan', jugar: 'juego juegas juega jugamos jugáis juegan',
  morir: 'muero mueres muere morimos morís mueren', soñar: 'sueño sueñas sueña soñamos soñáis sueñan',
  oír: 'oigo oyes oye oímos oís oyen', conocer: 'conozco conoces conoce conocemos conocéis conocen',
  vivir: 'vivo vives vive vivimos vivís viven', llorar: 'lloro lloras llora lloramos lloráis lloran',
  amar: 'amo amas ama amamos amáis aman', cantar: 'canto cantas canta cantamos cantáis cantan',
  bailar: 'bailo bailas baila bailamos bailáis bailan', mirar: 'miro miras mira miramos miráis miran',
  llevar: 'llevo llevas lleva llevamos lleváis llevan', cambiar: 'cambio cambias cambia cambiamos cambiáis cambian',
  necesitar: 'necesito necesitas necesita necesitamos necesitáis necesitan', esperar: 'espero esperas espera esperamos esperáis esperan',
  buscar: 'busco buscas busca buscamos buscáis buscan', dejar: 'dejo dejas deja dejamos dejáis dejan',
  quedar: 'quedo quedas queda quedamos quedáis quedan', creer: 'creo crees cree creemos creéis creen',
  olvidar: 'olvido olvidas olvida olvidamos olvidáis olvidan', caminar: 'camino caminas camina caminamos camináis caminan',
};
const P = ['yo', 'tú', 'él/ella', 'nosotros', 'vosotros', 'ellos'];
const FORM_TO_INF = new Map();
for (const [inf, f] of Object.entries(IRREGULAR)) for (const form of f.split(' ')) if (!FORM_TO_INF.has(form)) FORM_TO_INF.set(form, inf);
const VERB_FORMS = new Set(FORM_TO_INF.keys());

function conjugateRegular(inf) {
  const stem = inf.slice(0, -2), end = inf.slice(-2);
  const E = { ar: ['o', 'as', 'a', 'amos', 'áis', 'an'], er: ['o', 'es', 'e', 'emos', 'éis', 'en'], ir: ['o', 'es', 'e', 'imos', 'ís', 'en'] }[end];
  return E ? E.map((e) => stem + e) : null;
}

export function pickVerbs(lines, n = 2) {
  const count = new Map();
  for (const l of lines) for (const raw of l.es.split(/\s+/)) {
    const w = norm(raw);
    const inf = FORM_TO_INF.get(w) || (IRREGULAR[w] ? w : null);
    if (inf && inf !== 'ser' && inf !== 'estar' && inf !== 'ir') count.set(inf, (count.get(inf) || 0) + 1);
  }
  // ser/estar/ir רק אם אין פעלים אחרים
  if (count.size < n) for (const l of lines) for (const raw of l.es.split(/\s+/)) { const inf = FORM_TO_INF.get(norm(raw)); if (inf && !count.has(inf)) count.set(inf, 0.5); }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([inf]) => {
    const forms = IRREGULAR[inf] ? IRREGULAR[inf].split(' ') : conjugateRegular(inf);
    return { inf, tense: 'הווה', forms: Object.fromEntries(P.map((p, i) => [p, forms[i]])) };
  });
}

// ---------- רמה מוצעת ----------
export function suggestLevel(lines) {
  const words = lines.flatMap((l) => l.es.split(/\s+/).map(norm)).filter(Boolean);
  const uniq = new Set(words).size;
  const text = ` ${words.join(' ')} `;
  let level = 2 + uniq / 40;
  if (/(aba|ía|abas|ían) /.test(text)) level += 1;                  // imperfecto
  if (/ (fui|fue|dije|hice|tuve|estuve)|é |ó /.test(text)) level += 0.5; // indefinido
  if (/(iera|ara|ase|iese)s? /.test(text)) level += 1.5;             // subjuntivo עבר
  return Math.max(1, Math.min(12, Math.round(level * 2) / 2));
}

// ---------- בניית טיוטה ----------
export async function buildDraft({ lrclibId, lyrics, title, artist, spotifyUrl }) {
  let meta = { title, artist };
  let lines;
  if (lrclibId) {
    const r = await getLyrics(lrclibId);
    lines = parseLyrics(r);
    meta = { title: title || r.trackName, artist: artist || r.artistName };
  } else {
    lines = parseLyrics({ plainLyrics: lyrics });
  }
  if (lines.length < 2) throw new Error('לא נמצאו מספיק שורות במילים');

  const vocabWords = pickVocab(lines);
  const verbs = pickVerbs(lines);
  const { map, quota } = await translateMany([...lines.map((l) => l.es), ...vocabWords, ...verbs.map((v) => v.inf)]);
  const tr = (s) => map.get(s) || '—';
  const level = suggestLevel(lines);

  // לשיר שיש לו ערכה מוכנה: אוצר המילים, הפעלים, הדקדוק והרקע מהערכה (במקום הניחוש האוטומטי)
  const key = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const sugg = MODERN_SUGGESTIONS.find((m) => m.pack && key(m.title) && key(meta.title).startsWith(key(m.title)));
  if (sugg) {
    const p = sugg.pack;
    return {
      title: meta.title || sugg.title, artist: meta.artist || sugg.artist, spotifyUrl: spotifyUrl || '', spotifySearch: p.spotifySearch,
      level: sugg.level, stage: p.stage, origin: '', variant: sugg.variant, culture: p.culture, grammar: p.grammar,
      lines: lines.map((l) => ({ es: l.es, he: tr(l.es), t: l.t })), vocab: p.vocab, verbs: p.verbs,
      warnings: [`לשיר הזה יש ערכה מוכנה – אוצר המילים, הפעלים, הדקדוק והרקע נלקחו ממנה.`, ...warningsFor(quota, lines)],
    };
  }

  return {
    title: meta.title || '', artist: meta.artist || '', spotifyUrl: spotifyUrl || '', spotifySearch: `${meta.title || ''} ${meta.artist || ''}`.trim(),
    level, stage: `שלב ${level}`, origin: '', variant: '', culture: '', grammar: null,
    lines: lines.map((l) => ({ es: l.es, he: tr(l.es), t: l.t })),
    vocab: vocabWords.map((w) => ({ es: w, he: tr(w), type: guessType(w) })),
    verbs: verbs.map((v) => ({ ...v, he: tr(v.inf) })),
    warnings: warningsFor(quota, lines),
  };
}
const warningsFor = (quota, lines) => [
  ...(quota ? ['מכסת התרגום החינמי היומית נגמרה – חלק מהשורות סומנו "—". אפשר לתרגם אותן ידנית או לנסות שוב מחר.'] : []),
  ...(lines.some((l) => l.t != null) ? [] : ['למילים האלה אין זמני סנכרון – אפשר לסנכרן אחר כך בעמוד השיר.']),
];
