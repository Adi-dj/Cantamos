import { useState } from 'react';
import { speak } from '../lib/speech.js';
import { analyzeText, pronunciationTips } from '../lib/pronounce.js';

const TYPE_HE = { noun: 'שם עצם', verb: 'פועל', adj: 'שם תואר', num: 'מספר', phrase: 'ביטוי', other: 'מילה' };
const FILTERS = [['all', 'הכול'], ['noun', 'שמות עצם'], ['verb', 'פעלים'], ['adj', 'תארים'], ['num', 'מספרים'], ['other', 'אחר']];

export function Pronunciation({ text, compact }) {
  const words = analyzeText(text);
  return (
    <div className={`pron ${compact ? 'compact' : ''}`}>
      <span className="syl" dir="ltr" lang="es">
        {words.map((w, wi) => (
          <span key={wi} className="w">{w.parts.map((p, i) => <span key={i} className={p.stressed && w.parts.length > 1 ? 'stress' : ''}>{p.latin}{i < w.parts.length - 1 ? '·' : ''}</span>)}</span>
        ))}
      </span>
      <span className="he-tr">
        {words.map((w, wi) => <span key={wi} className="w">{w.parts.map((p, i) => <span key={i} className={p.stressed && w.parts.length > 1 ? 'stress' : ''}>{p.he}</span>)}</span>)}
      </span>
    </div>
  );
}

export default function Vocab({ song }) {
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const list = song.vocab.filter((w) => filter === 'all' || (filter === 'other' ? !['noun', 'verb', 'adj', 'num'].includes(w.type) : w.type === filter));
  return (
    <div className="stack">
      <div className="chips">
        {FILTERS.map(([k, l]) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      <p className="muted small">ההברה המוטעמת מודגשת. התעתיק בעברית לפי מבטא ספרד (z ו-ce/ci = ת׳ כמו th באנגלית). לחצו על מילה לטיפים.</p>
      <div className="vocab-grid">
        {list.map((w) => (
          <article key={w.es} className="card vocab-card">
            <div className="vocab-top">
              <button className="icon-btn big" onClick={() => speak(w.es, { rate: 0.8 })} aria-label={`השמעה: ${w.es}`}>🔊</button>
              <button className="vocab-main" onClick={() => setOpen(open === w.es ? null : w.es)}>
                <span lang="es" dir="ltr" className="es big">{w.es}</span>
                <span>{w.he}</span>
              </button>
              <span className="badge soft">{TYPE_HE[w.type] || 'מילה'}</span>
            </div>
            <Pronunciation text={w.es} />
            {w.note && <p className="note small">💡 {w.note}</p>}
            {open === w.es && (
              <div className="tips">
                <button className="btn small" onClick={() => speak(w.es, { rate: 0.55 })}>🐢 לאט מאוד</button>
                <ul>{pronunciationTips(w.es).map((t) => <li key={t} className="small">{t}</li>)}</ul>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
