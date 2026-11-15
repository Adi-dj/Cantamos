import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Bidi from '../lib/Bidi.jsx';

export const PRACTICE_KEYS = ['listen', 'flashcards', 'match', 'fill', 'order', 'listening', 'conjugation', 'speak'];

export function SongProgress({ s }) {
  const done = s.activitiesDone.filter((a) => PRACTICE_KEYS.includes(a)).length;
  return (
    <div className="mini-progress">
      <div className="bar"><span style={{ width: `${(done / PRACTICE_KEYS.length) * 100}%` }} /></div>
      <small>{done}/{PRACTICE_KEYS.length} פעילויות{s.bestQuiz != null && <> · מבחן <b>{s.bestQuiz}%</b></>}</small>
    </div>
  );
}

export default function Home({ me }) {
  const [state, setState] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get('/api/state').then(setState).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="error">{err}</div>;
  if (!state) return <div className="spinner" />;

  const current = state.songs.find((s) => s.current);
  const history = state.songs.filter((s) => s.unlocked && !s.current);

  return (
    <div className="stack-lg">
      {current && (
        <section className="hero card">
          <div className="hero-text">
            <div className="eyebrow">השיר המשפחתי הנוכחי · רמה {current.level}</div>
            <h1 lang="es" dir="ltr" className="hero-title">{current.title}</h1>
            <p className="muted">{current.artist} · {current.origin}</p>
            <p className="stage-pill"><Bidi>{current.stage}</Bidi></p>
            <SongProgress s={current} />
            <div className="row gap">
              <a className="btn primary" href={`#/song/${current.id}/song`}>▶ להאזין ולקרוא</a>
              <a className="btn" href={`#/song/${current.id}/practice`}>תרגול</a>
              <a className="btn" href={`#/song/${current.id}/quiz`}>מבחן</a>
            </div>
          </div>
          <div className="hero-art" aria-hidden><span>♫</span></div>
        </section>
      )}

      <section>
        <h2>מסלול הלימוד</h2>
        <p className="muted">השירים מסודרים מהקל אל הקשה. {me.isAdmin ? 'כמנהל, אתם מקדמים את המשפחה לשיר הבא באזור הניהול.' : 'מנהל המערכת פותח את השיר הבא לכל המשפחה. לשירים קודמים אפשר לחזור תמיד.'}</p>
        <ol className="roadmap">
          {state.songs.map((s) => {
            const cls = s.current ? 'current' : s.unlocked ? 'done' : 'locked';
            const inner = (
              <>
                <span className="node" aria-hidden>{s.unlocked ? (s.current ? '♪' : '✓') : '🔒'}</span>
                <div className="road-body">
                  <div className="road-title"><span lang="es" dir="ltr">{s.title}</span>{s.source === 'admin' && <em className="badge soft">נוסף ע״י המנהל</em>}</div>
                  <div className="muted small"><Bidi>{s.stage}</Bidi></div>
                  {s.unlocked && <SongProgress s={s} />}
                </div>
              </>
            );
            return (
              <li key={s.id} className={cls}>
                {s.unlocked || me.isAdmin ? <a href={`#/song/${s.id}/song`}>{inner}</a> : <div>{inner}</div>}
              </li>
            );
          })}
        </ol>
      </section>

      {history.length > 0 && <p className="muted small">שירים קודמים: {history.length} – לחצו עליהם במסלול כדי להמשיך להשתפר.</p>}
    </div>
  );
}
