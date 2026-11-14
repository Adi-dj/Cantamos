import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { PRACTICE_KEYS } from './Home.jsx';

// צבעי סדרות קבועים לפי סדר הצטרפות (משתמש = צבע, לא לפי דירוג)
const SERIES = 8;
const colorVar = (i) => (i < SERIES ? `var(--series-${i + 1})` : 'var(--series-other)');

function useTooltip() {
  const [tip, setTip] = useState(null);
  const el = tip && (
    <div className="viz-tooltip" style={{ left: tip.x, top: tip.y }} role="status">
      {tip.title && <div className="tt-title">{tip.title}</div>}
      {tip.rows.map((r, i) => (
        <div key={i} className="tt-row"><span className="swatch" style={{ background: r.color }} />{r.label}<b>{r.value}</b></div>
      ))}
    </div>
  );
  return [el, setTip];
}

function QuizLineChart({ songs, users }) {
  const W = 720, H = 300, m = { t: 16, r: 110, b: 56, l: 40 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const x = (i) => m.l + (songs.length === 1 ? iw / 2 : (i / (songs.length - 1)) * iw);
  const y = (v) => m.t + ih - (v / 100) * ih;
  const [tipEl, setTip] = useTooltip();
  const [hover, setHover] = useState(null);

  // תוויות ישירות בסוף כל סדרה (עד 4 משתמשים), עם הרחקה למניעת חפיפה
  const endLabels = useMemo(() => {
    if (users.length > 4) return [];
    const ls = users.map((u, ui) => {
      let last = -1;
      songs.forEach((s, i) => { if (u.quiz[s.id] != null) last = i; });
      return last < 0 ? null : { ui, name: u.name, y: y(u.quiz[songs[last].id]), x: x(last) };
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ls.length; k++) if (ls[k].y - ls[k - 1].y < 14) ls[k].y = ls[k - 1].y + 14;
    return ls;
  }, [songs, users]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="viz-wrap" onMouseLeave={() => { setTip(null); setHover(null); }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="viz" role="img" aria-label="ציון מבחן הטוב ביותר בכל שיר, לכל בן משפחה">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={m.l + iw} y1={y(v)} y2={y(v)} className="grid" />
            <text x={m.l - 8} y={y(v)} className="tick" textAnchor="end" dominantBaseline="middle">{v}%</text>
          </g>
        ))}
        {songs.map((s, i) => (
          <text key={s.id} x={x(i)} y={H - m.b + 18} className="tick" textAnchor="middle">{i + 1}</text>
        ))}
        <text x={m.l + iw / 2} y={H - 10} className="axis-label" textAnchor="middle">שירים לפי סדר הלימוד</text>
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} className="crosshair" />}
        {users.map((u, ui) => {
          const pts = songs.map((s, i) => (u.quiz[s.id] != null ? [x(i), y(u.quiz[s.id])] : null));
          const segs = [];
          let cur = [];
          pts.forEach((p) => { if (p) cur.push(p); else { if (cur.length) segs.push(cur); cur = []; } });
          if (cur.length) segs.push(cur);
          return (
            <g key={u.id} style={{ color: colorVar(ui) }}>
              {segs.map((sg, k) => sg.length > 1 && <polyline key={k} points={sg.map((p) => p.join(',')).join(' ')} className="series-line" />)}
              {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={hover === i ? 6 : 4.5} className="series-dot" />)}
            </g>
          );
        })}
        {endLabels.map((l) => (
          <text key={l.ui} x={l.x + 10} y={l.y} className="direct-label" dominantBaseline="middle">{l.name}</text>
        ))}
        {songs.map((s, i) => (
          <rect key={s.id} x={x(i) - (songs.length > 1 ? iw / (songs.length - 1) / 2 : iw / 2)} y={m.t} width={songs.length > 1 ? iw / (songs.length - 1) : iw} height={ih} fill="transparent"
            onMouseMove={(e) => {
              const r = e.currentTarget.ownerSVGElement.getBoundingClientRect();
              setHover(i);
              setTip({
                x: Math.min(e.clientX - r.left + 12, r.width - 190), y: e.clientY - r.top + 12,
                title: `${i + 1}. ${s.title}`,
                rows: users.map((u, ui) => ({ color: colorVar(ui), label: u.name, value: u.quiz[s.id] != null ? `${u.quiz[s.id]}%` : '—' })),
              });
            }} />
        ))}
      </svg>
      {tipEl}
    </div>
  );
}

function XpBars({ users }) {
  const max = Math.max(1, ...users.map((u) => u.xp));
  const [tipEl, setTip] = useTooltip();
  return (
    <div className="viz-wrap" onMouseLeave={() => setTip(null)}>
      <div className="hbars">
        {users.map((u, ui) => (
          <div key={u.id} className="hbar-row"
            onMouseMove={(e) => { const r = e.currentTarget.parentElement.getBoundingClientRect(); setTip({ x: Math.min(e.clientX - r.left + 12, r.width - 190), y: e.clientY - r.top + 12, title: u.name, rows: [{ color: colorVar(ui), label: 'נקודות', value: u.xp.toLocaleString('he-IL') }, { color: colorVar(ui), label: 'פעילויות', value: u.sessions }] }); }}>
            <span className="hbar-label">{u.name}</span>
            <div className="hbar-track"><span className="hbar-fill" style={{ width: `${(u.xp / max) * 100}%`, background: colorVar(ui) }} /></div>
            <span className="hbar-value">{u.xp.toLocaleString('he-IL')}</span>
          </div>
        ))}
      </div>
      {tipEl}
    </div>
  );
}

export default function Family({ me }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState('chart');
  useEffect(() => { api.get('/api/family').then(setData); }, []);
  if (!data) return <div className="spinner" />;
  const { songs, users } = data;
  const ranked = [...users].sort((a, b) => b.xp - a.xp);

  return (
    <div className="stack-lg">
      <div>
        <h1>המשפחה שלנו</h1>
        <p className="muted">כל בני המשפחה וההתקדמות שלהם. נקודות: 10 לכל תשובה נכונה בתרגול, 20 במבחן.</p>
      </div>

      <section className="user-cards">
        {users.map((u, ui) => {
          const practiced = songs.filter((s) => u.activities[s.id]).length;
          const avgQuiz = Object.values(u.quiz).length ? Math.round(Object.values(u.quiz).reduce((a, b) => a + b, 0) / Object.values(u.quiz).length) : null;
          return (
            <article key={u.id} className={`card user-card ${u.id === me.id ? 'mine' : ''}`}>
              <div className="row gap">
                <span className="avatar lg" style={{ background: colorVar(ui) }}>{u.name[0]?.toUpperCase()}</span>
                <div>
                  <b>{u.name}</b>{u.isAdmin && <em className="badge">מנהל</em>}{ranked[0]?.id === u.id && u.xp > 0 && <span title="מוביל/ה בנקודות"> 🏆</span>}
                  <div className="small muted">{u.lastActive ? `פעילות אחרונה: ${new Date(u.lastActive).toLocaleDateString('he-IL')}` : 'עוד לא התחיל/ה'}</div>
                </div>
              </div>
              <div className="stats">
                <div><b>{u.xp.toLocaleString('he-IL')}</b><span>נקודות</span></div>
                <div><b>{practiced}/{songs.length}</b><span>שירים בתרגול</span></div>
                <div><b>{avgQuiz == null ? '—' : `${avgQuiz}%`}</b><span>ממוצע מבחנים</span></div>
              </div>
              <div className="song-dots" aria-label="התקדמות בכל שיר">
                {songs.map((s, i) => {
                  const n = u.activities[s.id] || 0;
                  return <span key={s.id} title={`${i + 1}. ${s.title}: ${n}/${PRACTICE_KEYS.length} פעילויות${u.quiz[s.id] != null ? `, מבחן ${u.quiz[s.id]}%` : ''}`} style={{ '--fill': `${(n / PRACTICE_KEYS.length) * 100}%` }} />;
                })}
              </div>
            </article>
          );
        })}
      </section>

      <section className="card">
        <div className="row between wrap">
          <h2 className="m0">גרף ההתקדמות – ציון המבחן הטוב ביותר בכל שיר</h2>
          <div className="seg small">
            <button className={view === 'chart' ? 'on' : ''} onClick={() => setView('chart')}>גרף</button>
            <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>טבלה</button>
          </div>
        </div>
        {users.length > 1 && (
          <div className="legend">
            {users.map((u, ui) => <span key={u.id}><span className="swatch line" style={{ background: colorVar(ui) }} />{u.name}</span>)}
          </div>
        )}
        {view === 'chart' ? (
          <>
            <QuizLineChart songs={songs} users={users} />
            <ol className="song-key small muted">{songs.map((s) => <li key={s.id} lang="es" dir="ltr">{s.title}</li>)}</ol>
          </>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>שיר</th>{users.map((u) => <th key={u.id}>{u.name}</th>)}</tr></thead>
              <tbody>
                {songs.map((s, i) => (
                  <tr key={s.id}><td lang="es">{i + 1}. {s.title}</td>{users.map((u) => <td key={u.id}>{u.quiz[s.id] != null ? `${u.quiz[s.id]}%` : '—'} <span className="muted small">({u.activities[s.id] || 0}/{PRACTICE_KEYS.length})</span></td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="m0">נקודות לכל בן משפחה</h2>
        <XpBars users={users} />
      </section>
    </div>
  );
}
