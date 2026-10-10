import { lazy, Suspense } from 'react';
import { plainName } from './planner/export';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';
import { logout } from './auth/auth';
import { leave, sync, useAutoSync, useStore } from './data/store';
import Callback from './pages/Callback';
import Login from './pages/Login';

// Pages load on first visit, so the app starts with only what the current tab needs.
const DarkDimension = lazy(() => import('./pages/DarkDimension'));
const Events = lazy(() => import('./pages/Events'));
const Explore = lazy(() => import('./pages/Explore'));
const Goals = lazy(() => import('./pages/Goals'));
const Plan = lazy(() => import('./pages/Plan'));
const Roster = lazy(() => import('./pages/Roster'));

/** Short labels are shown in the phone tab bar. */
const TABS: { to: string; label: string; short?: string }[] = [
  { to: '/goals', label: 'Goals' },
  { to: '/plan', label: 'Plan' },
  { to: '/roster', label: 'Roster' },
  { to: '/events', label: 'Events' },
  { to: '/dd', label: 'Dark Dimension', short: 'DD' },
  { to: '/explore', label: 'API' },
];

export default function App() {
  useAutoSync();
  const { mode, snapshot, loading, error } = useStore();
  const { pathname } = useLocation();

  if (!mode) {
    return (
      <Routes>
        <Route path="/callback" element={<Callback />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <strong className="brand">MSF Planner</strong>
        <nav className="tabs" aria-label="Main">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to}>
              <span className="tab-long">{t.label}</span>
              <span className="tab-short" aria-hidden="true">{t.short ?? t.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="account">
          {snapshot && (
            <span className="muted who" title={`Synced ${new Date(snapshot.syncedAt).toLocaleString()}`}>
              {plainName(snapshot.card.name)}
              {snapshot.source === 'demo' && ' (demo data)'} · synced {new Date(snapshot.syncedAt).toLocaleTimeString()}
            </span>
          )}
          <button onClick={() => void sync()} disabled={loading}>
            {loading ? 'Syncing…' : 'Sync'}
          </button>
          <button
            className="ghost"
            onClick={() => {
              logout();
              leave();
            }}
          >
            {mode === 'demo' ? 'Exit demo' : 'Log out'}
          </button>
        </div>
      </header>
      {error && <p className="error">Sync failed: {error}</p>}
      <main>
        {!snapshot ? (
          <p className="muted">Loading your account…</p>
        ) : (
          <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<p className="muted" role="status">Loading…</p>}>
          <Routes>
            <Route path="/goals" element={<Goals snapshot={snapshot} />} />
            <Route path="/plan" element={<Plan snapshot={snapshot} />} />
            <Route path="/roster" element={<Roster snapshot={snapshot} />} />
            <Route path="/events" element={<Events snapshot={snapshot} />} />
 <Route path="/dd" element={<DarkDimension snapshot={snapshot} />} />
            <Route path="/explore" element={<Explore live={snapshot.source === 'live'} />} />
            <Route path="*" element={<Navigate to="/roster" replace />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}
