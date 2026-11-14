import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import Login from './components/Login.jsx';
import Home from './components/Home.jsx';
import SongPage from './components/SongPage.jsx';
import Family from './components/Family.jsx';
import Admin from './components/Admin.jsx';

function useHashRoute() {
  const [hash, setHash] = useState(location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => { setHash(location.hash.slice(1) || '/'); window.scrollTo(0, 0); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash.split('/').filter(Boolean);
}

export default function App() {
  const [me, setMe] = useState(undefined);
  const route = useHashRoute();
  const loadMe = useCallback(() => api.get('/api/me').then(setMe).catch(() => setMe(null)), []);
  useEffect(() => { loadMe(); }, [loadMe]);

  if (me === undefined) return <div className="center-screen"><div className="spinner" /></div>;
  if (!me) return <Login onDone={loadMe} />;

  const [page, id, tab] = route;
  const logout = async () => { await api.post('/api/auth/logout'); setMe(null); location.hash = '/'; };
  const nav = [
    ['/', 'השיר שלנו', !page],
    ['/family', 'המשפחה', page === 'family'],
    ...(me.isAdmin ? [['/admin', 'ניהול', page === 'admin']] : []),
  ];

  return (
    <div className="app">
      <header className="topbar">
        <a href="#/" className="brand"><span className="brand-mark" aria-hidden>♪</span> Cantamos <small>ספרדית בשירים</small></a>
        <nav className="nav">
          {nav.map(([href, label, active]) => <a key={href} href={'#' + href} className={active ? 'active' : ''}>{label}</a>)}
        </nav>
        <div className="me">
          <span className="avatar" aria-hidden>{me.displayName[0]?.toUpperCase()}</span>
          <span className="me-name">{me.displayName}{me.isAdmin && <em className="badge">מנהל</em>}</span>
          <button className="btn ghost small" onClick={logout}>יציאה</button>
        </div>
      </header>
      <main className="container">
        {!page && <Home me={me} />}
        {page === 'song' && <SongPage key={id} me={me} songId={Number(id)} tab={tab || 'song'} />}
        {page === 'family' && <Family me={me} />}
        {page === 'admin' && me.isAdmin && <Admin me={me} />}
      </main>
    </div>
  );
}
