import { useEffect, useRef, useState, useCallback } from 'react';
import { api, logProgress } from '../api.js';
import { speak, stopSpeaking, canSpeak } from '../lib/speech.js';
import { hebrewTranslit } from '../lib/pronounce.js';

// ---------- Spotify iFrame API ----------
let apiPromise;
function loadSpotifyApi() {
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      window.onSpotifyIframeApiReady = (IFrameAPI) => resolve(IFrameAPI);
      const s = document.createElement('script');
      s.src = 'https://open.spotify.com/embed/iframe-api/v1';
      s.async = true;
      document.body.appendChild(s);
    });
  }
  return apiPromise;
}
export function spotifyUri(url) {
  const m = (url || '').match(/(?:track[/:])([A-Za-z0-9]{10,})/);
  return m ? `spotify:track:${m[1]}` : null;
}
const fmt = (t) => (t == null ? '—' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);

export default function Player({ me, song, onSaved }) {
  const uri = spotifyUri(song.spotifyUrl);
  const hostRef = useRef(null);
  const ctrlRef = useRef(null);
  const pos = useRef({ ms: 0, at: 0, paused: true });
  const [now, setNow] = useState(0); // שניות
  const [paused, setPaused] = useState(true);
  const [ready, setReady] = useState(false);
  const [lines, setLines] = useState(song.lines);
  const [showHe, setShowHe] = useState(true);
  const [showTr, setShowTr] = useState(false);
  const [learnMode, setLearnMode] = useState(false);
  const [waitingLine, setWaitingLine] = useState(null);
  const [readIdx, setReadIdx] = useState(null);
  const [sync, setSync] = useState(null); // אינדקס השורה הבאה לסנכרון
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const loggedListen = useRef(false);
  const lastIdx = useRef(-1);
  const lineRefs = useRef([]);
  const synced = lines.some((l) => l.t != null);

  useEffect(() => { setLines(song.lines); }, [song]);

  // יצירת נגן ספוטיפיי
  useEffect(() => {
    if (!uri || !hostRef.current) return;
    let cancelled = false;
    const el = document.createElement('div');
    hostRef.current.innerHTML = '';
    hostRef.current.appendChild(el);
    loadSpotifyApi().then((IFrameAPI) => {
      if (cancelled) return;
      IFrameAPI.createController(el, { uri, width: '100%', height: 152 }, (c) => {
        if (cancelled) { c.destroy?.(); return; }
        ctrlRef.current = c;
        c.addListener('ready', () => setReady(true));
        c.addListener('playback_update', (e) => {
          const d = e.data;
          pos.current = { ms: d.position, at: performance.now(), paused: d.isPaused };
          setPaused(d.isPaused);
        });
      });
    });
    return () => { cancelled = true; ctrlRef.current?.destroy?.(); ctrlRef.current = null; setReady(false); };
  }, [uri]);

  // שעון מקומי בין עדכוני ספוטיפיי
  useEffect(() => {
    const id = setInterval(() => {
      const p = pos.current;
      setNow((p.paused ? p.ms : p.ms + (performance.now() - p.at)) / 1000);
    }, 100);
    return () => clearInterval(id);
  }, []);

  let active = -1;
  if (synced) lines.forEach((l, i) => { if (l.t != null && l.t <= now + 0.15) active = i; });
  if (readIdx != null) active = readIdx;

  // גלילה לשורה הפעילה + מצב לימוד (עצירה בסוף כל שורה) + רישום האזנה
  useEffect(() => {
    if (active === lastIdx.current) return;
    const prev = lastIdx.current;
    lastIdx.current = active;
    lineRefs.current[active]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (readIdx == null && learnMode && !paused && sync == null && prev >= 0 && active === prev + 1) {
      ctrlRef.current?.pause();
      setWaitingLine(prev);
    }
    if (active === lines.length - 1 && !loggedListen.current && sync == null) {
      loggedListen.current = true;
      logProgress(song.id, 'listen', 1, 1);
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const seekTo = (t) => { if (ctrlRef.current && t != null) { ctrlRef.current.seek(t); ctrlRef.current.resume(); setWaitingLine(null); } };
  const togglePlay = () => { setWaitingLine(null); ctrlRef.current?.togglePlay(); };
  const repeatLine = () => {
    const i = waitingLine ?? active;
    if (i >= 0) seekTo(lines[i].t);
  };

  // הקראה בקול (בלי ספוטיפיי)
  const readFrom = useCallback((i) => {
    if (i >= lines.length) { setReadIdx(null); if (!loggedListen.current) { loggedListen.current = true; logProgress(song.id, 'listen', 1, 1); } return; }
    setReadIdx(i);
    speak(lines[i].es, { rate: 0.85, onend: () => setTimeout(() => readFrom(i + 1), 450) });
  }, [lines, song.id]);
  const stopReading = () => { stopSpeaking(); setReadIdx(null); };
  useEffect(() => () => stopSpeaking(), []);

  // ---------- סנכרון (מנהל) ----------
  const tap = useCallback(() => {
    if (sync == null || sync >= lines.length) return;
    const t = Math.round(now * 10) / 10;
    setLines((ls) => ls.map((l, i) => (i === sync ? { ...l, t } : l)));
    setSync(sync + 1);
    setDirty(true);
  }, [sync, now, lines.length]);
  useEffect(() => {
    if (sync == null) return;
    const on = (e) => { if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); tap(); } };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [sync, tap]);
  const startSync = () => {
    setLines((ls) => ls.map((l) => ({ ...l, t: null })));
    setSync(0);
    setDirty(true);
    if (ctrlRef.current) { ctrlRef.current.seek(0); ctrlRef.current.resume(); }
  };
  const saveLines = async () => {
    try {
      await api.put(`/api/admin/songs/${song.id}`, { lines });
      setDirty(false); setSync(null); setMsg('הסנכרון נשמר ✓'); onSaved?.();
    } catch (e) { setMsg(e.message); }
  };
  const [urlDraft, setUrlDraft] = useState(song.spotifyUrl || '');
  const saveUrl = async () => {
    try { await api.put(`/api/admin/songs/${song.id}`, { spotifyUrl: urlDraft }); setMsg('קישור הספוטיפיי נשמר ✓'); onSaved?.(); } catch (e) { setMsg(e.message); }
  };

  const searchUrl = `https://open.spotify.com/search/${encodeURIComponent(song.spotifySearch || song.title)}`;

  return (
    <div className="player-layout">
      <section className="card player-card">
        {uri ? (
          <>
            <div ref={hostRef} className="spotify-host" />
            <div className="controls">
              <button className="btn primary" onClick={togglePlay} disabled={!ready}>{paused ? '▶ נגן' : '⏸ עצור'}</button>
              <button className="btn" onClick={repeatLine} disabled={!ready || !synced}>↺ חזרה על השורה</button>
              <label className="toggle"><input type="checkbox" checked={learnMode} onChange={(e) => setLearnMode(e.target.checked)} disabled={!synced} /> עצירה אחרי כל שורה</label>
              <span className="time" dir="ltr">{fmt(now)}</span>
            </div>
            {!synced && <p className="note">המילים של השיר הזה עוד לא סונכרנו עם ההקלטה, אז הן לא יודגשו אוטומטית. {me.isAdmin ? 'אפשר לסנכרן למטה.' : 'מנהל המערכת יכול לסנכרן אותן.'}</p>}
            <p className="small muted">ספוטיפיי מנגן את השיר המלא רק כשאתם מחוברים לחשבון ספוטיפיי בדפדפן. בלי חיבור מתנגנת דוגמה של 30 שניות.</p>
          </>
        ) : (
          <div className="no-spotify">
            <p>🎵 לשיר הזה עוד לא הוגדרה הקלטה בספוטיפיי.</p>
            <a className="btn" href={searchUrl} target="_blank" rel="noreferrer">חיפוש בספוטיפיי ↗</a>
          </div>
        )}
        {canSpeak() && (
          <div className="controls">
            {readIdx == null
              ? <button className="btn" onClick={() => readFrom(0)}>🗣 הקראת המילים בקול (לאט)</button>
              : <button className="btn" onClick={stopReading}>⏹ עצירת ההקראה</button>}
          </div>
        )}
        {waitingLine != null && (
          <div className="learn-pause">
            <div lang="es" dir="ltr" className="es big">{lines[waitingLine].es}</div>
            <div>{lines[waitingLine].he}</div>
            <div className="row gap">
              <button className="btn" onClick={repeatLine}>↺ שוב</button>
              <button className="btn" onClick={() => speak(lines[waitingLine].es, { rate: 0.75 })}>🐢 הקראה איטית</button>
              <button className="btn primary" onClick={() => { setWaitingLine(null); ctrlRef.current?.resume(); }}>המשך ▶</button>
            </div>
          </div>
        )}

        {me.isAdmin && (
          <details className="admin-box" open={!uri ? true : undefined}>
            <summary>כלי מנהל: הקלטה וסנכרון</summary>
            <div className="form">
              <label>קישור לשיר בספוטיפיי (Share → Copy Song Link)
                <div className="row gap">
                  <input dir="ltr" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} placeholder="https://open.spotify.com/track/..." />
                  <button className="btn" onClick={saveUrl}>שמירה</button>
                </div>
              </label>
              <a className="small" href={searchUrl} target="_blank" rel="noreferrer">חיפוש "{song.spotifySearch || song.title}" בספוטיפיי ↗</a>
              {uri && (
                <div className="sync">
                  <p className="small">סנכרון: לחצו "התחלה", והשיר יתנגן מההתחלה. בכל פעם ששורה מתחילה להישמע – לחצו על הכפתור הגדול (או על מקש הרווח). אפשר לתקן זמנים ידנית בטבלה.</p>
                  <div className="row gap">
                    <button className="btn" onClick={startSync} disabled={!ready}>⏺ התחלת סנכרון</button>
                    {sync != null && <button className="btn primary sync-tap" onClick={tap} disabled={sync >= lines.length}>{sync < lines.length ? `השורה הבאה מתחילה עכשיו (${sync + 1}/${lines.length})` : 'סיימתם ✓'}</button>}
                    {dirty && <button className="btn primary" onClick={saveLines}>💾 שמירת הסנכרון</button>}
                  </div>
                </div>
              )}
            </div>
          </details>
        )}
        {msg && <div className="note">{msg}</div>}
      </section>

      <section className="card lyrics-card">
        <div className="lyrics-tools">
          <label className="toggle"><input type="checkbox" checked={showHe} onChange={(e) => setShowHe(e.target.checked)} /> תרגום לעברית</label>
          <label className="toggle"><input type="checkbox" checked={showTr} onChange={(e) => setShowTr(e.target.checked)} /> תעתיק בעברית</label>
        </div>
        <ol className="lyrics">
          {lines.map((l, i) => (
            <li key={i} ref={(el) => (lineRefs.current[i] = el)} className={`${i === active ? 'active' : ''} ${i < active ? 'past' : ''} ${sync === i ? 'sync-next' : ''}`}>
              <button className="line-main" onClick={() => (l.t != null && uri ? seekTo(l.t) : speak(l.es, { rate: 0.85 }))} title={l.t != null && uri ? 'קפיצה לשורה' : 'השמעת השורה'}>
                <span lang="es" dir="ltr" className="es">{l.es}</span>
                {showTr && <span className="translit">{hebrewTranslit(l.es)}</span>}
                {showHe && <span className="he">{l.he}</span>}
              </button>
              <button className="icon-btn" onClick={() => speak(l.es, { rate: 0.8 })} aria-label="הקראת השורה">🔊</button>
              {me.isAdmin && sync != null && (
                <input className="t-input" dir="ltr" type="number" step="0.1" value={l.t ?? ''} onChange={(e) => { const t = e.target.value === '' ? null : Number(e.target.value); setLines((ls) => ls.map((x, j) => (j === i ? { ...x, t } : x))); setDirty(true); }} aria-label="זמן בשניות" />
              )}
            </li>
          ))}
        </ol>
        {!loggedListen.current && (
          <button className="btn ghost small" onClick={() => { loggedListen.current = true; logProgress(song.id, 'listen', 1, 1); setMsg('סומן שהאזנתם לשיר ✓'); }}>✓ סמנו שהאזנתי לשיר עד הסוף</button>
        )}
      </section>
    </div>
  );
}
