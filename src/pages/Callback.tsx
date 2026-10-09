import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeLogin } from '../auth/auth';

export default function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice; the code can only be exchanged once.
    if (started.current) return;
    started.current = true;
    completeLogin(new URLSearchParams(window.location.search))
      .then(() => navigate('/roster', { replace: true }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [navigate]);

  return (
    <div className="login">
      {error ? (
        <>
          <h1>Login failed</h1>
          <p className="error">{error}</p>
          <a href={import.meta.env.BASE_URL}>Back to start</a>
        </>
      ) : (
        <p className="muted">Finishing login…</p>
      )}
    </div>
  );
}
