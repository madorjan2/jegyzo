import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App, type Profile } from './App';
import { apiFetch } from './api';
import './styles.css';

// Entry point: hash-based routing + session profile kept in localStorage.
function profileFromStorage(): Profile | null {
  try {
    const raw = localStorage.getItem('profile');
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function currentRoute(): string {
  return window.location.hash.replace(/^#/, '') || '/events';
}

function Root() {
  const [route, setRoute] = useState<string>(() => currentRoute());
  const [profile, setProfile] = useState<Profile | null>(() => profileFromStorage());

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const onLogin = (p: Profile) => {
    localStorage.setItem('profile', JSON.stringify(p));
    setProfile(p);
    window.location.hash = '/events';
  };

  const onLogout = () => {
    // Revoke the refresh token server-side (E2-S4), then clear the session.
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      void apiFetch('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => {});
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('profile');
    setProfile(null);
    window.location.hash = '/events';
  };

  return <App route={route} profile={profile} onLogin={onLogin} onLogout={onLogout} />;
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}
