import { useEffect, useMemo, useRef, useState } from 'react';
import { logProgress } from '../api.js';
import { speak, canRecognize, listenOnce } from '../lib/speech.js';
import { shuffle, matchPairs, fillBlanks, orderTasks, conjugationTasks, listeningTasks, norm } from '../lib/exercises.js';
import { Pronunciation } from './Vocab.jsx';
import SpeedControl from './SpeedControl.jsx';

export const ACTIVITY_INFO = {
  listen: ['🎧', 'האזנה לשיר'],
  flashcards: ['🃏', 'כרטיסיות'],
  match: ['🔗', 'התאמת מילים'],
  fill: ['✏️', 'השלמת מילה בשיר'],
  order: ['🧱', 'סידור משפט'],
  listening: ['👂', 'הבנת הנשמע'],
  conjugation: ['🔤', 'הטיית פעלים'],
  speak: ['🎙', 'הגייה'],
  quiz: ['📝', 'מבחן'],
};
const PRACTICES = ['flashcards', 'match', 'fill', 'order', 'listening', 'conjugation', 'speak'];

export default function Practice({ song, history, onLogged }) {
  const [act, setAct] = useState(null);
  const [round, setRound] = useState(0);
  const best = (a) => {
    const h = history.filter((x) => x.activity === a);
    return h.length ? Math.max(...h.map((x) => Math.round((x.score / x.max_score) * 100))) : null;
  };
  const done = async (score, max) => { await logProgress(song.id, act, score, max); onLogged?.(); };

  if (act) {
    const props = { song, onDone: done, key: round };
    const Comp = { flashcards: Flashcards, match: Match, fill: Fill, order: Order, listening: Listening, conjugation: Conjugation, speak: Speak }[act];
    return (
      <div className="stack">
        <div className="row between practice-head">
          <button className="btn ghost" onClick={() => setAct(null)}>→ כל הפעילויות</button>
          <h2 className="m0">{ACTIVITY_INFO[act][0]} {ACTIVITY_INFO[act][1]}</h2>
          <button className="btn ghost" onClick={() => setRound(round + 1)}>↻ סבב חדש</button>
        </div>
        <Comp {...props} />
        <SpeedControl />
      </div>
    );
  }
  return (
    <div className="activity-grid">
      {PRACTICES.map((a) => {
        const disabled = a === 'conjugation' && !song.verbs?.length;
        const b = best(a);
        return (
          <button key={a} className="card activity-card" disabled={disabled} onClick={() => { setAct(a); setRound(round + 1); }}>
            <span className="act-icon" aria-hidden>{ACTIVITY_INFO[a][0]}</span>
            <b>{ACTIVITY_INFO[a][1]}</b>
            <span className="small muted">{b == null ? (disabled ? 'אין פעלים בשיר' : 'עוד לא תרגלתם') : `השיא שלכם: ${b}%`}</span>
          </button>
        );
      })}
    </div>
  );
}

function Result({ score, max, onDone, children }) {
  const saved = useRef(false);
  useEffect(() => { if (!saved.current) { saved.current = true; onDone(score, max); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = Math.round((score / max) * 100);
  return (
    <div className="card result">
      <div className="result-score">{pct}%</div>
      <p>{score} מתוך {max} · {pct >= 90 ? '¡Perfecto! 🎉' : pct >= 70 ? '¡Muy bien! 👏' : pct >= 50 ? '¡Bien! ממשיכים לתרגל' : 'כדאי לנסות שוב 💪'}</p>
      {children}
    </div>
  );
}

function Choice({ options, answer, onPick, es }) {
  const [picked, setPicked] = useState(null);
  return (
    <div className="options">
      {options.map((o) => {
        const state = picked == null ? '' : o === answer ? 'right' : o === picked ? 'wrong' : 'dim';
        return (
          <button key={o} className={`option ${state}`} lang={es ? 'es' : undefined} dir={es ? 'ltr' : undefined} disabled={picked != null}
            onClick={() => { setPicked(o); if (es) speak(answer); setTimeout(() => onPick(o === answer), 900); }}>{o}</button>
        );
      })}
    </div>
  );
}

function Steps({ tasks, render, onDone }) {
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  if (!tasks.length) return <p className="muted">אין מספיק תוכן בשיר לתרגיל הזה.</p>;
  if (i >= tasks.length) return <Result score={score} max={tasks.length} onDone={onDone} />;
  const next = (ok) => { if (ok) setScore((s) => s + 1); setI((x) => x + 1); };
  return (
    <div className="card exercise">
      <div className="progress-dots">{tasks.map((_, k) => <span key={k} className={k < i ? 'done' : k === i ? 'now' : ''} />)}</div>
      <div key={i}>{render(tasks[i], next)}</div>
    </div>
  );
}

// ---------- כרטיסיות ----------
function Flashcards({ song, onDone }) {
  const cards = useMemo(() => shuffle(song.vocab), [song.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [known, setKnown] = useState(0);
  if (i >= cards.length) return <Result score={known} max={cards.length} onDone={onDone} />;
  const w = cards[i];
  const answer = (k) => { if (k) setKnown(known + 1); setFlip(false); setI(i + 1); };
  return (
    <div className="stack center">
      <div className="small muted">{i + 1} / {cards.length}</div>
      <button className={`flashcard ${flip ? 'flipped' : ''}`} onClick={() => { setFlip(!flip); if (!flip) speak(w.es, { rate: 0.8 }); }}>
        {!flip ? <span lang="es" dir="ltr" className="es huge">{w.es}</span> : (
          <span className="stack center">
            <span className="huge">{w.he}</span>
            <Pronunciation text={w.es} />
            {w.note && <span className="small">💡 {w.note}</span>}
          </span>
        )}
      </button>
      <p className="small muted">לחצו על הכרטיס כדי להפוך ולשמוע</p>
      <div className="row gap">
        <button className="btn" onClick={() => answer(false)}>😕 עוד לא</button>
        <button className="btn primary" onClick={() => answer(true)}>😎 ידעתי</button>
      </div>
    </div>
  );
}

// ---------- התאמה ----------
function Match({ song, onDone }) {
  const pairs = useMemo(() => matchPairs(song, 6), [song.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = useMemo(() => shuffle(pairs), [pairs]);
  const right = useMemo(() => shuffle(pairs), [pairs]);
  const [sel, setSel] = useState(null);
  const [matched, setMatched] = useState([]);
  const [wrongFlash, setWrongFlash] = useState(null);
  const [mistakes, setMistakes] = useState(0);
  if (matched.length === pairs.length) return <Result score={Math.max(0, pairs.length - mistakes)} max={pairs.length} onDone={onDone} />;
  const pickRight = (w) => {
    if (!sel) return;
    if (sel.es === w.es) { setMatched([...matched, w.es]); setSel(null); }
    else { setMistakes(mistakes + 1); setWrongFlash(w.es); setTimeout(() => setWrongFlash(null), 500); }
  };
  return (
    <div className="card exercise">
      <p className="muted">בחרו מילה בספרדית ואז את הפירוש שלה. טעויות: {mistakes}</p>
      <div className="match-cols">
        <div className="col">
          {left.map((w) => (
            <button key={w.es} lang="es" dir="ltr" className={`option ${matched.includes(w.es) ? 'right' : sel?.es === w.es ? 'selected' : ''}`} disabled={matched.includes(w.es)}
              onClick={() => { setSel(w); speak(w.es); }}>{w.es}</button>
          ))}
        </div>
        <div className="col">
          {right.map((w) => (
            <button key={w.es} className={`option ${matched.includes(w.es) ? 'right' : wrongFlash === w.es ? 'wrong' : ''}`} disabled={matched.includes(w.es)} onClick={() => pickRight(w)}>{w.he}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- השלמה ----------
function Fill({ song, onDone }) {
  const tasks = useMemo(() => fillBlanks(song, 6), [song.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Steps tasks={tasks} onDone={onDone} render={(t, next) => (
      <>
        <p lang="es" dir="ltr" className="es big">{t.display}</p>
        <p className="muted">{t.line.he}</p>
        <Choice options={t.options} answer={t.answer} onPick={next} es />
      </>
    )} />
  );
}

// ---------- סידור משפט ----------
function OrderTask({ task, onAnswer }) {
  const [built, setBuilt] = useState([]);
  const [checked, setChecked] = useState(null);
  const remaining = task.shuffled.filter((w) => !built.includes(w));
  const check = () => {
    const ok = norm(built.map((w) => w.w).join(' ')) === norm(task.line.es);
    setChecked(ok); speak(task.line.es);
    setTimeout(() => onAnswer(ok), 1400);
  };
  return (
    <>
      <p className="muted">{task.line.he}</p>
      <div className={`builder ${checked === true ? 'right' : checked === false ? 'wrong' : ''}`} dir="ltr" lang="es">
        {built.length ? built.map((w) => <button key={w.id} className="word" disabled={checked != null} onClick={() => setBuilt(built.filter((x) => x !== w))}>{w.w}</button>) : <span className="muted">לחצו על המילים לפי הסדר…</span>}
      </div>
      {checked === false && <p lang="es" dir="ltr" className="es">✔ {task.line.es}</p>}
      <div className="word-bank" dir="ltr" lang="es">
        {remaining.map((w) => <button key={w.id} className="word" disabled={checked != null} onClick={() => setBuilt([...built, w])}>{w.w}</button>)}
      </div>
      <button className="btn primary" disabled={remaining.length > 0 || checked != null} onClick={check}>בדיקה</button>
    </>
  );
}
function Order({ song, onDone }) {
  const tasks = useMemo(() => orderTasks(song, 5), [song.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Steps tasks={tasks} onDone={onDone} render={(t, next) => <OrderTask task={t} onAnswer={next} />} />;
}

// ---------- הבנת הנשמע ----------
function ListenTask({ t, next }) {
  useEffect(() => { const id = setTimeout(() => speak(t.word.es, { rate: 0.85 }), 250); return () => clearTimeout(id); }, [t]);
  return (
    <>
      <div className="row gap center">
        <button className="btn primary big-btn" onClick={() => speak(t.word.es, { rate: 0.85 })}>🔊 השמעה</button>
        <button className="btn" onClick={() => speak(t.word.es, { rate: 0.55 })}>🐢 לאט</button>
      </div>
      <p className="muted center-text">מה שמעתם?</p>
      <Choice options={t.options} answer={t.answer} onPick={next} />
    </>
  );
}
function Listening({ song, onDone }) {
  const tasks = useMemo(() => listeningTasks(song, 6), [song.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Steps tasks={tasks} onDone={onDone} render={(t, next) => <ListenTask t={t} next={next} />} />;
}

// ---------- הטיית פעלים ----------
function Conjugation({ song, onDone }) {
  const tasks = useMemo(() => conjugationTasks(song, 8), [song.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Steps tasks={tasks} onDone={onDone} render={(t, next) => (
      <>
        <p className="muted">{t.verb.inf} – {t.verb.he} · {t.verb.tense}</p>
        <p lang="es" dir="ltr" className="es huge">{t.pronoun} ______</p>
        <Choice options={t.options} answer={t.answer} onPick={next} es />
      </>
    )} />
  );
}

// ---------- הגייה ----------
function similarity(a, b) {
  a = norm(a); b = norm(b);
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[m][n] / Math.max(m, n);
}
function SpeakTask({ item, onAnswer }) {
  const [status, setStatus] = useState('');
  const [heard, setHeard] = useState(null);
  const rec = canRecognize();
  const tryIt = async () => {
    setStatus('🎙 מקשיבים… דברו עכשיו'); setHeard(null);
    try {
      const alts = await listenOnce();
      const best = alts.reduce((b, a) => (similarity(a, item.es) > similarity(b, item.es) ? a : b), alts[0]);
      const s = similarity(best, item.es);
      setHeard({ text: best, s });
      setStatus(s >= 0.8 ? '¡Excelente! 🎉' : s >= 0.55 ? 'כמעט! נסו שוב או המשיכו' : 'עוד לא – הקשיבו ונסו שוב');
    } catch (e) { setStatus(e.message); }
  };
  return (
    <>
      <p lang="es" dir="ltr" className="es huge">{item.es}</p>
      <p className="muted">{item.he}</p>
      <Pronunciation text={item.es} />
      <div className="row gap center">
        <button className="btn" onClick={() => speak(item.es, { rate: 0.75 })}>🔊 איך אומרים</button>
        {rec && <button className="btn primary" onClick={tryIt}>🎙 תורכם לומר</button>}
      </div>
      {status && <p className="center-text">{status}</p>}
      {heard && <p className="small muted center-text" dir="ltr">שמענו: “{heard.text}” · {Math.round(heard.s * 100)}%</p>}
      <div className="row gap center">
        {rec ? (
          <button className="btn" onClick={() => onAnswer(!!heard && heard.s >= 0.8)}>הבא ←</button>
        ) : (
          <>
            <span className="small muted">הדפדפן לא תומך בזיהוי דיבור (נסו Chrome). אמרו בקול והעריכו בעצמכם:</span>
            <button className="btn" onClick={() => onAnswer(false)}>צריך עוד תרגול</button>
            <button className="btn primary" onClick={() => onAnswer(true)}>אמרתי נכון ✓</button>
          </>
        )}
      </div>
    </>
  );
}
function Speak({ song, onDone }) {
  const tasks = useMemo(() => {
    const words = shuffle(song.vocab).slice(0, 4).map((w) => ({ es: w.es, he: w.he }));
    const lines = shuffle([...new Map(song.lines.map((l) => [l.es, l])).values()]).slice(0, 2).map((l) => ({ es: l.es.replace(/[—¡!¿?]/g, '').trim(), he: l.he }));
    return [...words, ...lines];
  }, [song.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Steps tasks={tasks} onDone={onDone} render={(t, next) => <SpeakTask item={t} onAnswer={next} />} />;
}

export { Choice, OrderTask, Result };
