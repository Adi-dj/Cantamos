import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onDone }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await api.post(mode === 'login' ? '/api/auth/login' : '/api/auth/register', { username, pin });
      onDone();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <div className="login-screen">
      <div className="login-card card">
        <div className="login-hero">
          <span className="brand-mark big" aria-hidden>♪</span>
          <h1>Cantamos</h1>
          <p className="muted">לומדים ספרדית של ספרד – ביחד, שיר אחרי שיר</p>
          <p className="es-quote" lang="es" dir="ltr">«Quien canta, su mal espanta»</p>
        </div>
        <div className="seg">
          <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')} type="button">כניסה</button>
          <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')} type="button">משתמש חדש</button>
        </div>
        <form onSubmit={submit} className="form">
          <label>שם משתמש
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus placeholder={mode === 'register' ? 'בחרו שם (בלי רווחים)' : ''} />
          </label>
          <label>{mode === 'register' ? 'בחרו קוד אישי (4–8 ספרות)' : 'קוד אישי'}
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required maxLength={8} />
          </label>
          {err && <div className="error">{err}</div>}
          <button className="btn primary block" disabled={busy}>{mode === 'login' ? 'כניסה' : 'יצירת משתמש והצטרפות למשפחה'}</button>
        </form>
      </div>
    </div>
  );
}
