import { plainName } from './planner/export';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { logout } from './auth/auth';
import { leave, sync, useAutoSync, useStore } from './data/store';
import Callback from './pages/Callback';
import Events from './pages/Events';
import Login from './pages/Login';
import Plan from './pages/Plan';
import Roster from './pages/Roster';

export default function App() {
  useAutoSync();
  const { mode, snapshot, loading, error } = useStore();

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
        <nav>
          <NavLink to="/plan">Plan</NavLink>
          <NavLink to="/roster">Roster</NavLink>
          <NavLink to="/events">Events</NavLink>
        </nav>
        <div className="account">
          {snapshot && (
            <span className="muted">
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
          <Routes>
            <Route path="/plan" element={<Plan snapshot={snapshot} />} />
            <Route path="/roster" element={<Roster snapshot={snapshot} />} />
            <Route path="/events" element={<Events snapshot={snapshot} />} />
            <Route path="*" element={<Navigate to="/roster" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
