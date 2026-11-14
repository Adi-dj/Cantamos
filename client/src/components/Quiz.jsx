import { useEffect, useMemo, useState } from 'react';
import { logProgress } from '../api.js';
import { buildQuiz } from '../lib/exercises.js';
import { speak } from '../lib/speech.js';
import { OrderTask } from './Practice.jsx';

function QuizQuestion({ q, onAnswer }) {
  const [picked, setPicked] = useState(null);
  useEffect(() => { if (q.speak) setTimeout(() => speak(q.speak, { rate: 0.85 }), 250); }, [q]);
  return (
    <div className="stack">
      <p className="q-prompt">{q.prompt}</p>
      {q.es && <p lang="es" dir="ltr" className="es big">{q.es}</p>}
      {q.speak && <button className="btn primary" onClick={() => speak(q.speak, { rate: 0.85 })}>🔊 השמעה חוזרת</button>}
      {q.hint && <p className="muted small">רמז: {q.hint}</p>}
      {q.kind === 'order' ? (
        <OrderTask task={q.task} onAnswer={(ok) => onAnswer(ok, null)} />
      ) : (
        <div className="options">
          {q.options.map((o) => (
            <button key={o} lang={q.optionsEs ? 'es' : undefined} dir={q.optionsEs ? 'ltr' : undefined}
              className={`option ${picked == null ? '' : o === q.answer ? 'right' : o === picked ? 'wrong' : 'dim'}`}
              disabled={picked != null} onClick={() => { setPicked(o); setTimeout(() => onAnswer(o === q.answer, o), 1000); }}>{o}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Quiz({ song, history, onLogged }) {
  const [attempt, setAttempt] = useState(0);
  const [started, setStarted] = useState(false);
  const questions = useMemo(() => buildQuiz(song), [song.id, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState([]);
  const past = history.filter((h) => h.activity === 'quiz');

  const answer = async (ok, picked) => {
    const next = [...answers, { q: questions[i], ok, picked }];
    setAnswers(next);
    if (i + 1 >= questions.length) {
      await logProgress(song.id, 'quiz', next.filter((a) => a.ok).length, questions.length);
      onLogged?.();
    }
    setI(i + 1);
  };
  const restart = () => { setAttempt(attempt + 1); setI(0); setAnswers([]); setStarted(true); };

  if (!started) {
    return (
      <div className="stack">
        <section className="card center">
          <h2>מבחן על "{song.title}"</h2>
          <p className="muted">{questions.length} שאלות: אוצר מילים, תרגום שורות, השלמה, הטיית פעלים, האזנה וסידור משפט. כל ניסיון נשמר בהיסטוריה שלכם, והציון הטוב ביותר מופיע בגרף המשפחתי.</p>
          <button className="btn primary" onClick={() => setStarted(true)}>מתחילים ▶</button>
        </section>
        {past.length > 0 && (
          <section className="card">
            <h3>הניסיונות שלכם</h3>
            <ul className="attempts">
              {past.map((h, k) => {
                const pct = Math.round((h.score / h.max_score) * 100);
                return (
                  <li key={k}>
                    <span className="small muted">{new Date(h.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    <div className="bar"><span style={{ width: `${pct}%` }} /></div>
                    <b>{pct}%</b>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    );
  }

  if (i >= questions.length) {
    const score = answers.filter((a) => a.ok).length;
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="stack">
        <section className="card result">
          <div className="result-score">{pct}%</div>
          <p>{score} מתוך {questions.length} · {pct >= 90 ? '¡Eres un crack! 🏆' : pct >= 70 ? '¡Muy bien! 👏' : 'ממשיכים לתרגל ומנסים שוב 💪'}</p>
          <button className="btn primary" onClick={restart}>מבחן נוסף</button>
        </section>
        {answers.some((a) => !a.ok) && (
          <section className="card">
            <h3>מה כדאי לחזור עליו</h3>
            <ul className="review">
              {answers.filter((a) => !a.ok).map((a, k) => (
                <li key={k}>
                  <div className="small muted">{a.q.prompt}</div>
                  {a.q.es && <div lang="es" dir="ltr" className="es">{a.q.es}</div>}
                  <div>✔ <span lang={a.q.optionsEs || a.q.kind === 'order' ? 'es' : undefined}>{a.q.answer}</span>{a.picked && <span className="muted"> · בחרתם: {a.picked}</span>}</div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  return (
    <section className="card exercise">
      <div className="progress-dots">{questions.map((_, k) => <span key={k} className={k < i ? (answers[k]?.ok ? 'done' : 'miss') : k === i ? 'now' : ''} />)}</div>
      <div className="small muted">שאלה {i + 1} מתוך {questions.length}</div>
      <QuizQuestion key={`${attempt}-${i}`} q={questions[i]} onAnswer={answer} />
    </section>
  );
}
