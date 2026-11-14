import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import Player from './Player.jsx';
import Vocab from './Vocab.jsx';
import Practice from './Practice.jsx';
import Quiz from './Quiz.jsx';
import { speak } from '../lib/speech.js';

const TABS = [
  ['song', '🎧 השיר'],
  ['vocab', '📖 אוצר מילים'],
  ['grammar', '🧩 דקדוק'],
  ['practice', '🎯 תרגול'],
  ['quiz', '📝 מבחן'],
];

export default function SongPage({ me, songId, tab }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [nonce, setNonce] = useState(0);
  const load = useCallback(() => api.get(`/api/songs/${songId}`).then(setData).catch((e) => setErr(e.message)), [songId]);
  useEffect(() => { load(); }, [load]);
  if (err) return <div className="error">{err} · <a href="#/">חזרה</a></div>;
  if (!data) return <div className="spinner" />;
  const { song } = data;

  return (
    <div className="stack">
      <div className="song-head">
        <a href="#/" className="back">→ חזרה למסלול</a>
        <div className="eyebrow">רמה {song.level} · {song.stage}{!data.current && data.unlocked && ' · שיר מההיסטוריה'}{!data.unlocked && ' · עוד לא נפתח למשפחה (תצוגת מנהל)'}</div>
        <h1 lang="es" dir="ltr" className="song-title">{song.title}</h1>
        <p className="muted">{song.artist}{song.origin && ` · ${song.origin}`}{song.variant && ` · ניב: ${song.variant}`}</p>
      </div>
      <nav className="tabs" role="tablist">
        {TABS.map(([k, label]) => <a key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} href={`#/song/${songId}/${k}`} onClick={() => tab === k && setNonce(nonce + 1)}>{label}</a>)}
      </nav>

      {tab === 'song' && <Player me={me} song={song} onSaved={load} />}
      {tab === 'vocab' && <Vocab song={song} />}
      {tab === 'grammar' && <Grammar song={song} />}
      {tab === 'practice' && <Practice key={nonce} song={song} history={data.history} onLogged={load} />}
      {tab === 'quiz' && <Quiz key={nonce} song={song} history={data.history} onLogged={load} />}
    </div>
  );
}

function Grammar({ song }) {
  const g = song.grammar;
  return (
    <div className="stack">
      {g ? (
        <section className="card">
          <h2>{g.title}</h2>
          <p className="prose">{g.explanation}</p>
          {g.examples?.length > 0 && (
            <ul className="examples">
              {g.examples.map((ex, i) => (
                <li key={i}>
                  <button className="icon-btn" onClick={() => speak(ex.es.replace(/→/g, ','))} aria-label="השמעה">🔊</button>
                  <span lang="es" dir="ltr" className="es">{ex.es}</span>
                  <span className="muted">{ex.he}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : <p className="muted">לשיר הזה עוד לא נוסף הסבר דקדוקי.</p>}

      {song.verbs?.length > 0 && (
        <section className="card">
          <h2>טבלאות פעלים מהשיר</h2>
          <div className="verb-grid">
            {song.verbs.map((vb) => (
              <div key={vb.inf + vb.tense} className="verb-table">
                <div className="verb-head"><b lang="es">{vb.inf}</b> <span className="muted">– {vb.he}</span><div className="small muted">{vb.tense}</div></div>
                <table>
                  <tbody>
                    {Object.entries(vb.forms).map(([p, f]) => (
                      <tr key={p}>
                        <td lang="es" dir="ltr" className="muted">{p}</td>
                        <td lang="es" dir="ltr"><b>{f}</b></td>
                        <td><button className="icon-btn" onClick={() => speak(`${p.split('/')[0]} ${f}`)} aria-label={`השמעה: ${f}`}>🔊</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}

      {song.culture && (
        <section className="card culture">
          <h2>🇪🇸 רקע ותרבות</h2>
          <p className="prose">{song.culture}</p>
        </section>
      )}
    </div>
  );
}
