import { useEffect, useState } from 'react';
import { SPEEDS, getSpeed, setSpeed, onSpeedChange, speak } from '../lib/speech.js';

// בורר מהירות הקראה: איטי / רגיל / מהיר (משותף לכל האפליקציה)
export default function SpeedControl({ sample }) {
  const [speed, setLocal] = useState(getSpeed());
  useEffect(() => onSpeedChange(setLocal), []);
  const pick = (k) => { setSpeed(k); if (sample) speak(sample); };
  return (
    <div className="speed-control" role="group" aria-label="מהירות הקראה">
      <span className="small muted">מהירות הקראה:</span>
      <div className="seg small">
        {SPEEDS.map((s) => (
          <button key={s.key} type="button" className={speed === s.key ? 'on' : ''} aria-pressed={speed === s.key} onClick={() => pick(s.key)}>
            {s.icon && <span aria-hidden>{s.icon} </span>}{s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
