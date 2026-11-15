import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const PRONOUNS = ['yo', 'tú', 'él/ella', 'nosotros', 'vosotros', 'ellos'];

// ---------- המרה בין טקסט חופשי לנתוני שיר ----------
function songToForm(s) {
  return {
    title: s?.title || '', artist: s?.artist || '', origin: s?.origin || '', variant: s?.variant || '',
    level: s?.level ?? 6, stage: s?.stage || '', spotifyUrl: s?.spotifyUrl || '', spotifySearch: s?.spotifySearch || '', culture: s?.culture || '',
    grammarTitle: s?.grammar?.title || '', grammarText: s?.grammar?.explanation || '',
    grammarExamples: (s?.grammar?.examples || []).map((e) => `${e.es} | ${e.he}`).join('\n'),
    linesEs: (s?.lines || []).map((l) => l.es).join('\n'),
    linesHe: (s?.lines || []).map((l) => l.he).join('\n'),
    vocab: (s?.vocab || []).map((w) => [w.es, w.he, w.type, w.note].filter(Boolean).join(' | ')).join('\n'),
    verbs: (s?.verbs || []).map((v) => `${v.inf} | ${v.he} | ${v.tense} | ${PRONOUNS.map((p) => v.forms[p]).join(', ')}`).join('\n'),
  };
}
const rows = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);
function formToSong(f, oldLines = []) {
  const es = rows(f.linesEs), he = rows(f.linesHe);
  if (es.length !== he.length) throw new Error(`מספר השורות בספרדית (${es.length}) שונה ממספר שורות התרגום (${he.length})`);
  return {
    title: f.title, artist: f.artist, origin: f.origin, variant: f.variant, level: Number(f.level), stage: f.stage || `שלב ${f.level}`,
    spotifyUrl: f.spotifyUrl, spotifySearch: f.spotifySearch, culture: f.culture,
    grammar: f.grammarTitle ? {
      title: f.grammarTitle, explanation: f.grammarText,
      examples: rows(f.grammarExamples).map((r) => { const [a, b] = r.split('|').map((x) => x.trim()); return { es: a, he: b || '' }; }),
    } : null,
    // שמירת זמני סנכרון לשורות שלא השתנו
    lines: es.map((x, i) => ({ es: x, he: he[i], t: oldLines[i]?.es === x ? oldLines[i].t : null })),
    vocab: rows(f.vocab).map((r) => {
      const [w, tr, type, note] = r.split('|').map((x) => x.trim());
      if (!tr) throw new Error(`חסר תרגום במילה: ${w}`);
      return { es: w, he: tr, type: ['noun', 'verb', 'adj', 'num', 'phrase', 'other'].includes(type) ? type : 'other', ...(note ? { note } : {}) };
    }),
    verbs: rows(f.verbs).map((r) => {
      const [inf, tr, tense, forms] = r.split('|').map((x) => x.trim());
      const fs = (forms || '').split(',').map((x) => x.trim());
      if (fs.length !== 6) throw new Error(`לפועל ${inf} צריך 6 הטיות מופרדות בפסיקים`);
      return { inf, he: tr, tense, forms: Object.fromEntries(PRONOUNS.map((p, i) => [p, fs[i]])) };
    }),
  };
}

function SongEditor({ song, template, onClose, onSaved }) {
  const [f, setF] = useState(() => songToForm(song || template));
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setErr('');
    try {
      const data = formToSong(f, song?.lines);
      if (song) await api.put(`/api/admin/songs/${song.id}`, data);
      else await api.post('/api/admin/songs', data);
      onSaved();
    } catch (e) { setErr(e.message); }
  };
  const es = rows(f.linesEs).length, he = rows(f.linesHe).length;
  return (
    <section className="card editor">
      <div className="row between"><h2 className="m0">{song ? `עריכת "${song.title}"` : 'הוספת שיר חדש'}</h2><button className="btn ghost" onClick={onClose}>✕ סגירה</button></div>
      <p className="small muted">התרגילים, המבחן וההגייה נוצרים אוטומטית מהשורות ומאוצר המילים. מילים של שירים מודרניים – הדביקו מהעותק שלכם (למשל מתוך ספוטיפיי).</p>
      <div className="form grid2">
        <label>שם השיר<input dir="ltr" value={f.title} onChange={set('title')} /></label>
        <label>אמן / להקה<input dir="ltr" value={f.artist} onChange={set('artist')} /></label>
        <label>רמה (קובעת את המיקום במסלול; 1 = הכי קל)<input type="number" min="1" max="20" step="0.5" value={f.level} onChange={set('level')} /></label>
        <label>כותרת שלב<input value={f.stage} onChange={set('stage')} placeholder="שלב 8 · עבר מול עבר מתמשך" /></label>
        <label>מקור / אזור<input value={f.origin} onChange={set('origin')} placeholder="Madrid" /></label>
        <label>ניב<input value={f.variant} onChange={set('variant')} placeholder="España / México / Argentina" /></label>
        <label className="span2">קישור ספוטיפיי לשיר<input dir="ltr" value={f.spotifyUrl} onChange={set('spotifyUrl')} placeholder="https://open.spotify.com/track/..." /></label>
      </div>
      <div className="form grid2">
        <label>שורות בספרדית (שורה בכל שורה) · {es}<textarea dir="ltr" lang="es" rows={12} value={f.linesEs} onChange={set('linesEs')} /></label>
        <label>תרגום לעברית, באותו סדר · {he} {es !== he && <span className="error-inline">לא תואם!</span>}<textarea rows={12} value={f.linesHe} onChange={set('linesHe')} /></label>
        <label className="span2">אוצר מילים – בכל שורה: <code dir="ltr">מילה | תרגום | סוג | הערה</code> (סוג: noun / verb / adj / num / phrase / other)
          <textarea dir="ltr" rows={8} value={f.vocab} onChange={set('vocab')} placeholder="la vida | החיים | noun&#10;cambiar | לשנות | verb" />
        </label>
        <label className="span2">פעלים (לא חובה) – <code dir="ltr">פועל | תרגום | זמן | yo, tú, él, nosotros, vosotros, ellos</code>
          <textarea dir="ltr" rows={4} value={f.verbs} onChange={set('verbs')} placeholder="cambiar | לשנות | הווה | cambio, cambias, cambia, cambiamos, cambiáis, cambian" />
        </label>
        <label>נושא דקדוקי<input value={f.grammarTitle} onChange={set('grammarTitle')} /></label>
        <label>דוגמאות: <code dir="ltr">ספרדית | עברית</code><textarea dir="ltr" rows={3} value={f.grammarExamples} onChange={set('grammarExamples')} /></label>
        <label className="span2">הסבר דקדוקי<textarea rows={3} value={f.grammarText} onChange={set('grammarText')} /></label>
        <label className="span2">רקע ותרבות<textarea rows={2} value={f.culture} onChange={set('culture')} /></label>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="row gap"><button className="btn primary" onClick={save}>💾 שמירה</button><button className="btn ghost" onClick={onClose}>ביטול</button></div>
    </section>
  );
}

export default function Admin() {
  const [state, setState] = useState(null);
  const [users, setUsers] = useState([]);
  const [sugg, setSugg] = useState([]);
  const [songsFull, setSongsFull] = useState({});
  const [editing, setEditing] = useState(null); // {song} | {template}
  const [msg, setMsg] = useState('');
  const load = useCallback(() => {
    api.get('/api/state').then(setState);
    api.get('/api/admin/users').then(setUsers);
  }, []);
  useEffect(() => { load(); api.get('/api/admin/suggestions').then(setSugg); }, [load]);
  if (!state) return <div className="spinner" />;

  const current = state.songs.find((s) => s.current);
  const locked = state.songs.filter((s) => !s.unlocked);
  const next = locked.find((s) => !current || s.level > current.level) || locked[0];
  const act = async (fn, ok) => { setMsg(''); try { await fn(); setMsg(ok); load(); } catch (e) { setMsg('⚠️ ' + e.message); } };
  const openEdit = async (id) => {
    const full = songsFull[id] || (await api.get(`/api/songs/${id}`)).song;
    setSongsFull({ ...songsFull, [id]: full });
    setEditing({ song: full });
    scrollTo(0, 0);
  };

  if (editing) return <SongEditor {...editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setSongsFull({}); setMsg('השיר נשמר ✓'); load(); }} />;

  return (
    <div className="stack-lg">
      <h1>ניהול</h1>
      {msg && <div className="note">{msg}</div>}

      <section className="card">
        <h2>השיר המשפחתי</h2>
        <p>עכשיו: <b lang="es">{current?.title}</b> <span className="muted">(רמה {current?.level})</span></p>
        {next ? (
          <button className="btn primary" onClick={() => confirm(`לפתוח לכל המשפחה את "${next.title}"?`) && act(() => api.post('/api/admin/advance'), `"${next.title}" נפתח למשפחה 🎉`)}>
            ⏭ מעבר לשיר הבא: <span lang="es">{next.title}</span>
          </button>
        ) : <p className="muted">כל השירים במסלול כבר נפתחו – הוסיפו שיר חדש למטה.</p>}
        <details className="small">
          <summary>בחירת שיר אחר כשיר המשפחתי</summary>
          <div className="row gap wrap">
            {state.songs.filter((s) => !s.current).map((s) => (
              <button key={s.id} className="btn small" onClick={() => act(() => api.post('/api/admin/advance', { songId: s.id }), `"${s.title}" הוא עכשיו השיר המשפחתי`)}>{s.level}. {s.title}{s.unlocked ? '' : ' 🔒'}</button>
            ))}
          </div>
        </details>
      </section>

      <section className="card">
        <div className="row between"><h2 className="m0">שירים במסלול</h2><button className="btn primary" onClick={() => setEditing({ template: null })}>＋ שיר חדש</button></div>
        <table className="data-table">
          <thead><tr><th>רמה</th><th>שיר</th><th>מצב</th><th /></tr></thead>
          <tbody>
            {state.songs.map((s) => (
              <tr key={s.id}>
                <td>{s.level}</td>
                <td><a href={`#/song/${s.id}/song`} lang="es">{s.title}</a><div className="small muted">{s.artist}</div></td>
                <td>{s.current ? '♪ נוכחי' : s.unlocked ? '✓ נפתח' : '🔒'}</td>
                <td className="row gap">
                  <button className="btn small" onClick={() => openEdit(s.id)}>עריכה</button>
                  {s.source === 'admin' && <button className="btn small ghost" onClick={() => confirm(`למחוק את "${s.title}"?`) && act(() => api.del(`/api/admin/songs/${s.id}`), 'השיר נמחק')}>מחיקה</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>הצעות לשירים מודרניים בסגנון שביקשתם</h2>
        <p className="small muted">המילים של שירים אלה מוגנות בזכויות יוצרים, ולכן אינן כלולות. לחצו "הוספה" כדי לפתוח טופס עם הפרטים, והדביקו את המילים והתרגום. בשירים עם "ערכה מוכנה" אוצר המילים, הפעלים, הדקדוק והרקע כבר ממולאים. שימו לב לניב: Maná (מקסיקו) ו-Mercedes Sosa (ארגנטינה) שונים מהספרדית של ספרד.</p>
        <ul className="sugg">
          {sugg.map((s) => (
            <li key={s.artist + s.title}>
              <div><b lang="es">{s.title}</b> · <span lang="es">{s.artist}</span> <span className="badge soft">רמה {s.level}</span>{s.pack && <span className="badge">ערכה מוכנה</span>}<div className="small muted">{s.variant} · {s.focus}</div></div>
              <div className="row gap">
                <a className="btn small ghost" target="_blank" rel="noreferrer" href={`https://open.spotify.com/search/${encodeURIComponent(`${s.artist} ${s.title.startsWith('(') ? '' : s.title}`)}`}>ספוטיפיי ↗</a>
                <button className="btn small" onClick={() => setEditing({ template: { stage: `שלב ${s.level} · ${s.focus}`, ...s.pack, title: s.title.startsWith('(') ? '' : s.title, artist: s.artist, level: s.level, variant: s.variant } })}>הוספה</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>משתמשים</h2>
        <table className="data-table">
          <thead><tr><th>שם</th><th>הצטרף/ה</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}{u.is_admin ? <em className="badge">מנהל</em> : null}</td>
                <td className="small muted">{new Date(u.created_at).toLocaleDateString('he-IL')}</td>
                <td className="row gap">
                  {!u.is_admin && <>
                    <button className="btn small" onClick={() => { const pin = prompt(`קוד חדש ל-${u.username} (4–8 ספרות):`); if (pin) act(() => api.post(`/api/admin/users/${u.id}/pin`, { pin }), 'הקוד עודכן'); }}>איפוס קוד</button>
                    <button className="btn small ghost" onClick={() => confirm(`למחוק את ${u.username} וכל ההיסטוריה שלו/ה?`) && act(() => api.del(`/api/admin/users/${u.id}`), 'המשתמש נמחק')}>מחיקה</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
