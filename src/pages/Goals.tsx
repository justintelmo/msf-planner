import { useMemo, useState } from 'react';
import type { Snapshot } from '../data/store';
import { goalReports, loadCatalog, setGoals, useUnlocks } from '../data/unlocks';
import { plainName } from '../planner/export';
import { describeGap } from '../planner/gaps';
import { isUnlocked, ownedCharacters } from '../planner/requirements';
import { saveJson } from '../util/download';
import ModeTargets from './ModeTargets';

export default function Goals({ snapshot }: { snapshot: Snapshot }) {
  const live = snapshot.source === 'live';
  const roster = useMemo(() => ownedCharacters(snapshot), [snapshot]);
  const byId = useMemo(() => new Map(roster.map((c) => [c.info.id, c])), [roster]);
  const nameOf = (id: string) => plainName(byId.get(id)?.info.name ?? id);
  const { catalog, progress, goals } = useUnlocks();
  const [query, setQuery] = useState('');

  // Every character some content can reward, locked ones first.
  const rewardable = useMemo(() => {
    const ids = new Set((catalog?.sources ?? []).flatMap((s) => s.rewards));
    return [...ids]
      .filter((id) => byId.has(id))
      .sort((a, b) => Number(isUnlocked(byId.get(a)!)) - Number(isUnlocked(byId.get(b)!)) || nameOf(a).localeCompare(nameOf(b)));
  }, [catalog, byId]);
  const matches = query
    ? roster.filter((c) => !goals.includes(c.info.id) && nameOf(c.info.id).toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];
  const reports = useMemo(() => goalReports(goals, catalog, roster), [goals, catalog, roster]);

  const move = (i: number, d: number) => {
    const next = [...goals];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setGoals(next);
  };

  return (
    <section className="goals">
      <p className="muted small">
        Pick characters you want to unlock. The planner finds the content that rewards them, checks every entry
        requirement against your roster, and puts the upgrades that close those gaps at the top of the Plan tab.
      </p>

      <div className="toolbar">
        {live ? (
          <button onClick={() => void loadCatalog(snapshot.characters)} disabled={!!progress}>
            {progress ?? (catalog ? 'Refresh unlock content' : 'Load unlock content')}
          </button>
        ) : (
          <span className="muted small">Log in to load unlock content from the game.</span>
        )}
        {catalog && !progress && (
          <span className="muted small">
            {catalog.sources.length} events and Dark Dimensions, {catalog.raids?.length ?? 0} raids, read {new Date(catalog.loadedAt).toLocaleString()}
          </span>
        )}
        {catalog && !progress && (
          <button className="ghost small" onClick={() => saveJson('msf-unlock-catalog.json', catalog)}>Download (JSON)</button>
        )}
      </div>
      {catalog?.errors.length ? (
        <details className="small muted"><summary>{catalog.errors.length} couldn’t be read</summary>{catalog.errors.join('; ')}</details>
      ) : null}

      <ModeTargets catalog={catalog} />

      <h2>Your goals</h2>
      <div className="toolbar">
        <input placeholder="Add a character, e.g. Odin" value={query} onChange={(e) => setQuery(e.target.value)} list="rewardable" />
        <datalist id="rewardable">{rewardable.map((id) => <option key={id} value={nameOf(id)} />)}</datalist>
      </div>
      {matches.length > 0 && (
        <ul className="matches">
          {matches.map((c) => (
            <li key={c.info.id}>
              <button className="ghost small" onClick={() => { setGoals([...goals, c.info.id]); setQuery(''); }}>
                + {nameOf(c.info.id)} {isUnlocked(c) ? '(owned)' : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
      {goals.length === 0 && <p className="muted">No goals yet.</p>}

      {reports.map((r, i) => {
        const c = byId.get(r.characterId);
        return (
          <article className="card goal" key={r.characterId}>
            <header>
              <h3>{i + 1}. {nameOf(r.characterId)} {c && isUnlocked(c) && <span className="pill ready">Unlocked</span>}</h3>
              {i > 0 && <button className="ghost small" onClick={() => move(i, -1)}>↑</button>}
              <button className="ghost small" onClick={() => setGoals(goals.filter((g) => g !== r.characterId))}>Remove</button>
            </header>
            {!catalog ? (
              <p className="muted small">Load unlock content to see where {nameOf(r.characterId)} comes from.</p>
            ) : r.sources.length === 0 ? (
              <p className="muted small">
                No event, campaign or Dark Dimension in the API rewards {nameOf(r.characterId)} right now. They may come from orbs, stores or an upcoming event.
              </p>
            ) : (
              r.sources.map(({ source, checks, unlocks }) => (
                <div key={source.kind + source.id} className="source">
                  <p><strong>{source.name}</strong> <span className="muted small">{source.kind}{source.subName ? ` · ${source.subName}` : ''}</span>
                    {unlocks && <span className="pill short"> Clear first: opens {unlocks}</span>}</p>
                  {checks.length === 0 && <p className="muted small">No character requirements.</p>}
                  {checks.map((ch, j) => (
                    <div key={j} className="check">
                      <p className="small">
                        <span className={`pill ${ch.plan.met ? 'ready' : 'short'}`}>{ch.plan.met ? 'Ready' : `${ch.plan.ready} of ${ch.plan.needed} ready`}</span>{' '}
                        {plainName(ch.requirements.description) || 'Requirement'}{' '}
                        <span className="muted">· {ch.labels.length > 3 ? `${ch.labels[0]} to ${ch.labels[ch.labels.length - 1]} (${ch.labels.length} nodes)` : ch.labels.join(', ')}</span>
                      </p>
                      {ch.plan.locked.length > 0 && (
                        <p className="small warn">Needs {ch.plan.locked.map((l) => nameOf(l.info.id)).join(', ')} unlocked first.</p>
                      )}
                      {!ch.plan.met && (
                        <ul className="picks">
                          {ch.plan.picks.map((p) => {
                            const gaps = describeGap(p.character, p.gap);
                            return (
                              <li key={p.character.info.id} className="small">
                                {nameOf(p.character.info.id)}: {gaps.length ? <span className="warn">{gaps.join(', ')}</span> : <span className="ok">ready</span>}
                              </li>
                            );
                          })}
                          {ch.plan.picks.length < ch.plan.needed && (
                            <li className="small warn">Only {ch.plan.picks.length} characters in your roster fit; unlock more that match.</li>
                          )}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              ))
            )}
          </article>
        );
      })}
    </section>
  );
}
