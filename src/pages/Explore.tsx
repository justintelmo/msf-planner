import { useState } from 'react';
import { ApiError, msfApi } from '../api/client';
import { saveJson } from '../util/download';

const SUGGESTED = ['/game/v1/episodics', '/game/v1/dds', '/player/v1/episodics', '/player/v1/dds'];

/** Calls any API path with your login and shows the raw response, to find data the app doesn't use yet. */
export default function Explore({ live }: { live: boolean }) {
  const [path, setPath] = useState(SUGGESTED[1]);
  const [result, setResult] = useState<{ path: string; body: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (p = path) => {
    setPath(p);
    setLoading(true);
    setError(null);
    try {
      setResult({ path: p, body: await msfApi.raw(p) });
    } catch (e) {
      setResult(null);
      setError(e instanceof ApiError ? `HTTP ${e.status}: ${e.message}` : String(e));
    }
    setLoading(false);
  };

  if (!live) return <p className="muted">Log in with your Scopely account to explore the API.</p>;

  const text = result ? JSON.stringify(result.body, null, 2) : '';
  return (
    <section>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/game/v1/dds" />
        <button className="primary" disabled={loading}>{loading ? 'Fetching…' : 'Fetch'}</button>
        {result && (
          <button type="button" className="ghost" onClick={() => saveJson(`msf${result.path.replace(/[^\w]+/g, '-')}.json`, result.body)}>
            Download JSON
          </button>
        )}
      </form>
      <p className="muted small">
        Try:{' '}
        {SUGGESTED.map((s) => (
          <button key={s} type="button" className="ghost small" onClick={() => void run(s)}>{s}</button>
        ))}
      </p>
      {error && <p className="error">{error}</p>}
      {result && (
        <>
          <p className="muted small">{(text.length / 1024).toFixed(0)} KB</p>
          <pre className="json">{text.length > 200_000 ? text.slice(0, 200_000) + '\n… (truncated, download for the full response)' : text}</pre>
        </>
      )}
    </section>
  );
}
