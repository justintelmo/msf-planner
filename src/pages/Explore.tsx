import { useMemo, useState } from 'react';
import { ApiError, msfApi } from '../api/client';
import { API_PATHS, fillTemplate, matchTemplate, smallestParams, TEMPLATES } from '../api/params';
import { saveJson } from '../util/download';

const SUGGESTED = ['/game/v1/dds', '/game/v1/episodics/unlockEvent', '/game/v1/raids', '/game/v1/upgradeData/iso8FuseCosts'];

/** Splits "/a/b?x=1" into its path and query values. */
function split(input: string): { path: string; query: Record<string, string> } {
  const url = new URL(input.startsWith('/') ? input : `/${input}`, 'https://x');
  return { path: decodeURIComponent(url.pathname), query: Object.fromEntries(url.searchParams) };
}

/**
 * Calls any API path with your login and shows the raw response, to find data the app doesn't
 * use yet. Documented paths get a form for their parameters, taken from the API spec.
 */
export default function Explore({ live }: { live: boolean }) {
  // What's typed, which may carry its own ?name=value; the form's values are added on top.
  const [input, setInputText] = useState(SUGGESTED[1]);
  const { path, query: typed } = useMemo(() => split(input), [input]);
  const setPath = (p: string) => setInputText(p);
  const [query, setQuery] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ url: string; body: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const match = useMemo(() => matchTemplate(path), [path]);
  const doc = match ? API_PATHS[match.template] : undefined;
  const queryParams = doc?.params.filter((p) => p.in === 'query') ?? [];
  const pathParams = doc?.params.filter((p) => p.in === 'path') ?? [];
  const sent = { ...typed, ...Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '')) };
  const url = path + (Object.keys(sent).length ? `?${new URLSearchParams(sent)}` : '');

  const run = async (target = url) => {
    setLoading(true);
    setError(null);
    try {
      setResult({ url: target, body: await msfApi.raw(target) });
    } catch (e) {
      setResult(null);
      const tooBig = e instanceof ApiError && e.status === 472;
      setError(
        (e instanceof ApiError ? `HTTP ${e.status}: ${e.message}` : String(e)) +
          (tooBig
            ? Object.entries(smallestParams(doc)).every(([k, v]) => sent[k] === v)
              ? '. Still too large with the smallest settings. Try adding ?flexFields=a,b to the path to ask for only some fields.'
              : '. The response is too large: try “Smallest response”, or narrow it with the parameters below.'
            : ''),
      );
    }
    setLoading(false);
  };

  if (!live) return <p className="muted">Log in with your Scopely account to explore the API.</p>;

  const text = result ? JSON.stringify(result.body, null, 2) : '';
  return (
    <section className="explore">
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <input
          aria-label="API path" list="api-paths" value={input} onChange={(e) => setInputText(e.target.value)}
          placeholder="/game/v1/dds" className="path-input"
        />
        <datalist id="api-paths">{TEMPLATES.map((t) => <option key={t} value={t} />)}</datalist>
        <button className="primary" disabled={loading}>{loading ? 'Fetching…' : 'Fetch'}</button>
        {result && (
          <button type="button" className="ghost" onClick={() => saveJson(`msf${result.url.replace(/[^\w]+/g, '-')}.json`, result.body)}>
            Download JSON
          </button>
        )}
      </form>
      <p className="muted small">
        Try:{' '}
        {SUGGESTED.map((s) => (
          <button key={s} type="button" className="ghost small" onClick={() => { setPath(s); setQuery({}); }}>{s}</button>
        ))}
      </p>

      {doc ? (
        <details className="card params" open>
          <summary>
            <strong>Parameters</strong> <span className="muted small">{doc.summary || match?.template}</span>
          </summary>
          {pathParams.length > 0 && (
            <div className="param-grid">
              {pathParams.map((p) => (
                <label key={p.name} title={p.description}>
                  <span>{p.name} <span className="muted small">(in path)</span></span>
                  <input
                    value={match?.values[p.name] ?? ''} placeholder={p.name}
                    onChange={(e) => setPath(fillTemplate(match!.template, { ...match!.values, [p.name]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          )}
          <div className="toolbar small">
            <button type="button" className="ghost small" onClick={() => setQuery({ ...query, ...smallestParams(doc) })}
              disabled={!Object.keys(smallestParams(doc)).length}>
              Smallest response
            </button>
            <button type="button" className="ghost small" onClick={() => setQuery({})}>Reset to defaults</button>
          </div>
          <div className="param-grid">
            {queryParams.map((p) => (
              <label key={p.name}>
                <span>{p.name}</span>
                {p.enum ? (
                  <select value={query[p.name] ?? ''} onChange={(e) => setQuery({ ...query, [p.name]: e.target.value })}>
                    <option value="">default{p.default !== undefined ? ` (${String(p.default)})` : ''}</option>
                    {p.enum.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : (
                  <input
                    value={query[p.name] ?? ''} onChange={(e) => setQuery({ ...query, [p.name]: e.target.value })}
                    placeholder={p.default !== undefined ? `default ${String(p.default)}` : p.type ?? ''}
                  />
                )}
                {p.description && <span className="muted small">{p.description}</span>}
              </label>
            ))}
          </div>
          <p className="muted small">Request: <code>{url}</code></p>
        </details>
      ) : (
        <p className="muted small">This path isn’t in the API documentation, so there’s no parameter list. You can still add ?name=value yourself.</p>
      )}

      {error && <p className="error">{error}</p>}
      {result && (
        <>
          <p className="muted small">{result.url} · {(text.length / 1024).toFixed(0)} KB</p>
          <pre className="json">{text.length > 200_000 ? text.slice(0, 200_000) + '\n… (truncated, download for the full response)' : text}</pre>
        </>
      )}
    </section>
  );
}
