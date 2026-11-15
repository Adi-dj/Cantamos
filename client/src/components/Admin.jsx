import { Fragment, useEffect, useState, useCallback } from 'react';
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

function LinesReview({ f, setF }) {
  const es = rows(f.linesEs), he = rows(f.linesHe);
  const setLine = (i, key, val) => {
    const arr = key === 'es' ? [...es] : [...he];
    arr[i] = val.replace(/\n/g, ' ');
    setF({ ...f, [key === 'es' ? 'linesEs' : 'linesHe']: arr.join('\n') });
  };
  return (
    <ol className="lines-review">
      {es.map((line, i) => (
        <li key={i} className={!he[i] || he[i] === '—' ? 'missing' : ''}>
          <input dir="ltr" lang="es" value={line} onChange={(e) => setLine(i, 'es', e.target.value)} aria-label={`שורה ${i + 1} בספרדית`} />
          <input value={he[i] || ''} onChange={(e) => setLine(i, 'he', e.target.value)} placeholder="תרגום…" aria-label={`תרגום שורה ${i + 1}`} />
        </li>
      ))}
    </ol>
  );
}

function SongEditor({ song, template, onClose, onSaved }) {
  const [f, setF] = useState(() => songToForm(song || template));
  const [linesView, setLinesView] = useState(template?.lines?.length ? 'review' : 'text');
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setErr('');
    try {
      const data = formToSong(f, (song || template)?.lines);
      if (song) await api.put(`/api/admin/songs/${song.id}`, data);
      else await api.post('/api/admin/songs', data);
      onSaved();
    } catch (e) { setErr(e.message); }
  };
  const es = rows(f.linesEs).length, he = rows(f.linesHe).length;
  return (
    <section className="card editor">
      <div className="row between"><h2 className="m0">{song ? `עריכת "${song.title}"` : 'הוספת שיר חדש'}</h2><button className="btn ghost" onClick={onClose}>✕ סגירה</button></div>
      <p className="small muted">התרגילים, המבחן וההגייה נוצרים אוטומטית מהשורות ומאוצר המילים.</p>
      {template?.lines?.length > 0 && (
        <div className="note">✨ המילים, התרגום ואוצר המילים מולאו אוטומטית. התרגום הוא תרגום מכונה – עברו עליו ותקנו לפני השמירה. שורות שלא תורגמו מסומנות בצבע.</div>
      )}
      {template?.warnings?.map((w) => <div key={w} className="note">⚠️ {w}</div>)}
      <div className="form grid2">
        <label>שם השיר<input dir="ltr" value={f.title} onChange={set('title')} /></label>
        <label>אמן / להקה<input dir="ltr" value={f.artist} onChange={set('artist')} /></label>
        <label>רמה (קובעת את המיקום במסלול; 1 = הכי קל)<input type="number" min="1" max="20" step="0.5" value={f.level} onChange={set('level')} /></label>
        <label>כותרת שלב<input value={f.stage} onChange={set('stage')} placeholder="שלב 8 · עבר מול עבר מתמשך" /></label>
        <label>מקור / אזור<input value={f.origin} onChange={set('origin')} placeholder="Madrid" /></label>
        <label>ניב<input value={f.variant} onChange={set('variant')} placeholder="España / México / Argentina" /></label>
        <label className="span2">קישור ספוטיפיי לשיר<input dir="ltr" value={f.spotifyUrl} onChange={set('spotifyUrl')} placeholder="https://open.spotify.com/track/..." /></label>
      </div>
      <div className="row between wrap">
        <h3 className="m0">מילים ותרגום · {es} שורות</h3>
        <div className="seg small">
          <button type="button" className={linesView === 'review' ? 'on' : ''} onClick={() => setLinesView('review')}>שורה-שורה</button>
          <button type="button" className={linesView === 'text' ? 'on' : ''} onClick={() => setLinesView('text')}>טקסט חופשי</button>
        </div>
      </div>
      {linesView === 'review' && <LinesReview f={f} setF={setF} />}
      <div className="form grid2">
        {linesView === 'text' && <>
        <label>שורות בספרדית (שורה בכל שורה) · {es}<textarea dir="ltr" lang="es" rows={12} value={f.linesEs} onChange={set('linesEs')} /></label>
        <label>תרגום לעברית, באותו סדר · {he} {es !== he && <span className="error-inline">לא תואם!</span>}<textarea rows={12} value={f.linesHe} onChange={set('linesHe')} /></label>
        </>}
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

const fmtDur = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// הוספה מהירה: קישור ספוטיפיי או שם שיר → מילים מסונכרנות → תרגום ואוצר מילים אוטומטיים
function QuickAdd({ preset, onDraft, onManual, onClose }) {
  const [mode, setMode] = useState(preset ? 'name' : 'link');
  const [link, setLink] = useState('');
  const [title, setTitle] = useState(preset?.title || '');
  const [artist, setArtist] = useState(preset?.artist || '');
  const [found, setFound] = useState(null);
  const [lyrics, setLyrics] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const search = async (e) => {
    e?.preventDefault();
    setErr(''); setFound(null); setBusy('מחפשים את המילים…');
    try {
      setFound(await api.post('/api/admin/import/search', mode === 'link' ? { spotifyUrl: link, title, artist } : { title, artist }));
    } catch (e2) { setErr(e2.message); } finally { setBusy(''); }
  };
  const build = async (body) => {
    setErr(''); setBusy('מתרגמים ובונים אוצר מילים… (עד חצי דקה)');
    try {
      const draft = await api.post('/api/admin/import/build', { title: found?.title || title, artist: found?.artist || artist, spotifyUrl: found?.spotifyUrl || '', ...body });
      // שיר מרשימת ההצעות: הרמה, הניב והשלב מההצעה (אלא אם יש לו ערכה מוכנה)
      onDraft(preset && !preset.pack ? { ...draft, level: preset.level, variant: preset.variant, stage: `שלב ${preset.level} · ${preset.focus}` } : draft);
    } catch (e2) { setErr(e2.message); setBusy(''); }
  };
  useEffect(() => { if (preset) search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="card quick-add stack">
      <div className="row between"><h2 className="m0">✨ הוספת שיר</h2><button className="btn ghost" onClick={onClose}>✕ סגירה</button></div>
      <p className="muted small m0">מדביקים קישור לשיר בספוטיפיי, והאפליקציה מביאה את המילים (בדרך כלל עם סנכרון), מתרגמת לעברית ובוחרת אוצר מילים. אחר כך עוברים על התוצאה ושומרים.</p>

      <div className="seg small" style={{ alignSelf: 'flex-start' }}>
        <button type="button" className={mode === 'link' ? 'on' : ''} onClick={() => setMode('link')}>קישור מספוטיפיי</button>
        <button type="button" className={mode === 'name' ? 'on' : ''} onClick={() => setMode('name')}>שם שיר ואמן</button>
      </div>
      <form className="form" onSubmit={search}>
        {mode === 'link' ? (
          <label>קישור לשיר בספוטיפיי
            <input dir="ltr" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://open.spotify.com/track/…" required />
            <span className="small muted">בספוטיפיי: ⋯ ← Share ← Copy Song Link</span>
          </label>
        ) : (
          <div className="grid2 m0">
            <label>שם השיר<input dir="ltr" lang="es" value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
            <label>אמן<input dir="ltr" value={artist} onChange={(e) => setArtist(e.target.value)} /></label>
          </div>
        )}
        <button className="btn primary" disabled={!!busy}>🔎 חיפוש מילים</button>
      </form>

      {busy && <div className="row gap"><div className="spinner small-spinner" /> <span>{busy}</span></div>}
      {err && <div className="error">{err}</div>}

      {found && !busy && (
        <div className="stack">
          <div className="small muted">חיפשנו: <b lang="es" dir="ltr">{found.title}</b>{found.artist && <> · <span lang="es" dir="ltr">{found.artist}</span></>}</div>
          {found.results.length ? (
            <>
              <h3 className="m0">בחרו את הגרסה המתאימה</h3>
              <p className="small muted m0">כדאי לבחור תוצאה עם ✓ סנכרון ובאורך שדומה לאורך השיר בספוטיפיי – אז המילים יודגשו בזמן הנכון.</p>
              <ul className="results">
                {found.results.map((r) => (
                  <li key={r.id}>
                    <button className="result-btn" onClick={() => build({ lrclibId: r.id, title: r.title, artist: r.artist })}>
                      <span className="row between"><b lang="es" dir="ltr">{r.title}</b><span className="small muted" dir="ltr">{fmtDur(r.duration)}</span></span>
                      <span className="small muted" dir="ltr">{r.artist}{r.album && ` · ${r.album}`}</span>
                      <span className="small" lang="es" dir="ltr">{r.preview.join(' / ')}</span>
                      <span className={`badge ${r.synced ? '' : 'soft'}`}>{r.synced ? '✓ עם סנכרון' : 'בלי סנכרון'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : <div className="note">לא מצאנו את המילים של השיר הזה. אפשר להדביק אותן למטה.</div>}
          <details>
            <summary>לא מצאתם? הדביקו את המילים בעצמכם</summary>
            <textarea dir="ltr" lang="es" rows={8} value={lyrics} onChange={(e) => setLyrics(e.target.value)} placeholder="שורה בכל שורה…" />
            <button className="btn" disabled={!lyrics.trim()} onClick={() => build({ lyrics })}>תרגום ובניית אוצר מילים</button>
          </details>
        </div>
      )}
      <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={onManual}>או: מילוי ידני של כל הטופס</button>
    </section>
  );
}

function UserEdit({ user, onCancel, onSaved }) {
  const [name, setName] = useState(user.username);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const save = async (e) => {
    e.preventDefault();
    const body = {};
    if (name.trim() !== user.username) body.username = name;
    if (pin) body.pin = pin;
    if (!Object.keys(body).length) return onCancel();
    try {
      await api.put(`/api/admin/users/${user.id}`, body);
      onSaved([body.username && 'השם עודכן', body.pin && `הקוד אופס – ${name.trim()} יתחבר/תתחבר מחדש עם הקוד החדש`].filter(Boolean).join(' · ') + ' ✓');
    } catch (e2) { setErr(e2.message); }
  };
  return (
    <form className="form user-edit" onSubmit={save}>
      <label>שם משתמש<input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" /></label>
      <label>קוד חדש (4–8 ספרות) – להשאיר ריק אם לא משנים
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={8} autoComplete="new-password" placeholder="••••" />
      </label>
      {err && <div className="error">{err}</div>}
      <div className="row gap"><button className="btn primary">שמירה</button><button type="button" className="btn ghost" onClick={onCancel}>ביטול</button></div>
    </form>
  );
}

export default function Admin() {
  const [state, setState] = useState(null);
  const [users, setUsers] = useState([]);
  const [sugg, setSugg] = useState([]);
  const [songsFull, setSongsFull] = useState({});
  const [editing, setEditing] = useState(null); // {song} | {template} | {quick}
  const [editUser, setEditUser] = useState(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => {
    api.get('/api/state').then(setState);
    api.get('/api/admin/users').then(setUsers);
  }, []);
  useEffect(() => { load(); api.get('/api/admin/suggestions').then(setSugg); }, [load]);
  if (!state) return <div className="spinner" />;

  const current = state.songs.find((s) => s.current);
  const key = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const inPath = (sg) => state.songs.some((x) => key(x.title).startsWith(key(sg.title)) && key(sg.title));
  const locked = state.songs.filter((s) => !s.unlocked);
  const next = locked.find((s) => !current || s.level > current.level) || locked[0];
  const act = async (fn, ok) => { setMsg(''); try { await fn(); setMsg(ok); load(); } catch (e) { setMsg('⚠️ ' + e.message); } };
  const openEdit = async (id) => {
    const full = songsFull[id] || (await api.get(`/api/songs/${id}`)).song;
    setSongsFull({ ...songsFull, [id]: full });
    setEditing({ song: full });
    scrollTo(0, 0);
  };

  if (editing?.quick) return <QuickAdd preset={editing.preset} onClose={() => setEditing(null)} onManual={() => setEditing({ template: null })} onDraft={(d) => { setEditing({ template: d }); scrollTo(0, 0); }} />;
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
        <div className="row between"><h2 className="m0">שירים במסלול</h2><button className="btn primary" onClick={() => setEditing({ quick: true })}>＋ שיר חדש</button></div>
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
          {[...sugg].sort((a, b) => a.artist.localeCompare(b.artist) || a.level - b.level).map((s, i, arr) => (<Fragment key={s.artist + s.title}>
            {arr[i - 1]?.artist !== s.artist && <li className="sugg-artist" lang="es">{s.artist}</li>}
            <li key={s.artist + s.title}>
              <div><b lang="es">{s.title}</b> · <span lang="es">{s.artist}</span> <span className="badge soft">רמה {s.level}</span>{s.pack && <span className="badge">ערכה מוכנה</span>}<div className="small muted">{s.variant} · {s.focus}</div></div>
              <div className="row gap">
                <a className="btn small ghost" target="_blank" rel="noreferrer" href={`https://open.spotify.com/search/${encodeURIComponent(`${s.artist} ${s.title.startsWith('(') ? '' : s.title}`)}`}>ספוטיפיי ↗</a>
                {inPath(s) ? <span className="badge soft">✓ כבר במסלול</span> : <button className="btn small primary" onClick={() => { setEditing({ quick: true, preset: s }); scrollTo(0, 0); }}>＋ הוספה</button>}
              </div>
            </li>
          </Fragment>))}
        </ul>
      </section>

      <section className="card">
        <h2>משתמשים</h2>
        <p className="small muted">אפשר לשנות לכל בן משפחה את שם המשתמש ואת הקוד האישי. ההתקדמות וההיסטוריה נשמרות.</p>
        <ul className="user-admin">
          {users.map((u) => (
            <li key={u.id}>
              {editUser === u.id ? (
                <UserEdit user={u} onCancel={() => setEditUser(null)} onSaved={(m) => { setEditUser(null); setMsg(m); load(); }} />
              ) : (
                <div className="row between wrap">
                  <div>
                    <b>{u.username}</b>{u.is_admin ? <em className="badge">מנהל</em> : null}
                    <div className="small muted">הצטרף/ה: {new Date(u.created_at).toLocaleDateString('he-IL')}</div>
                  </div>
                  {u.is_admin ? (
                    <span className="small muted">שם וקוד המנהל: בהגדרות Vercel</span>
                  ) : (
                    <div className="row gap">
                      <button className="btn small" onClick={() => setEditUser(u.id)}>✏️ עריכה / איפוס קוד</button>
                      <button className="btn small ghost" onClick={() => confirm(`למחוק את ${u.username} וכל ההיסטוריה שלו/ה?`) && act(() => api.del(`/api/admin/users/${u.id}`), 'המשתמש נמחק')}>מחיקה</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
