import { useMemo } from 'react';
import type { Snapshot } from '../data/store';
import { goalReports, loadCatalog, setGoals, setHideDone, unreadEvents, useUnlocks, withLiveEvents, type GoalSourceReport } from '../data/unlocks';
import { plainName } from '../planner/export';
import { describeGap } from '../planner/gaps';
import { isUnlocked, ownedCharacters } from '../planner/requirements';
import { saveJson } from '../util/download';
import GoalPicker from './GoalPicker';
import { SAMPLE_UPGRADES } from '../data/sample';
import { shardProgress } from '../planner/shards';
import ModeTargets from './ModeTargets';
import { chaptersOf, requirementText, tierMet, tierName } from './SourceLadder';

export default function Goals({ snapshot }: { snapshot: Snapshot }) {
  const live = snapshot.source === 'live';
  const roster = useMemo(() => ownedCharacters(snapshot), [snapshot]);
  const byId = useMemo(() => new Map(roster.map((c) => [c.info.id, c])), [roster]);
  const nameOf = (id: string) => plainName(byId.get(id)?.info.name ?? id);
  const { catalog: saved, progress, goals, hideDone } = useUnlocks();
  const catalog = useMemo(() => withLiveEvents(saved, snapshot.events, snapshot.characters), [saved, snapshot.events, snapshot.characters]);
  const unread = useMemo(() => unreadEvents(saved, snapshot.events), [saved, snapshot.events]);

  const doneCount = goals.filter((g) => { const c = byId.get(g); return c && isUnlocked(c); }).length;
  const reports = useMemo(() => goalReports(goals, catalog, roster), [goals, catalog, roster]);

  const move = (i: number, d: number) => {
    const next = [...goals];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setGoals(next);
  };

  const sourceBlock = ({ source, checks, unlocks }: GoalSourceReport) => (
                  <div key={source.kind + source.id} className="source">
                    <p><strong>{source.name}</strong> <span className="muted small">{source.kind}{source.subName ? ` · ${source.subName}` : ''}</span>
                      {unlocks && <span className="pill short"> Clear first: opens {unlocks}</span>}</p>
                    {checks.filter((ch) => !ch.plan.met).map((ch, j) => (
                      <div key={j} className="check">
                        <p className="small">
                          <span className="pill short">{`${ch.plan.ready} of ${ch.plan.needed} ready`}</span>{' '}
                          {plainName(ch.requirements.description) || requirementText({ source, checks: [ch] }, nameOf)}{' '}
                          <span className="muted">· {ch.labels.length > 3 ? `${ch.labels[0]} to ${ch.labels[ch.labels.length - 1]} (${ch.labels.length} nodes)` : ch.labels.join(', ')}</span>
                        </p>
                        {ch.plan.locked.length > 0 && (
                          <p className="small warn">Needs {ch.plan.locked.map((l) => nameOf(l.info.id)).join(', ')} unlocked first.</p>
                        )}
                        <ul className="picks">
                          {ch.plan.picks.map((p) => {
                            const gaps = describeGap(p.character, p.gap);
                            return gaps.length ? (
                              <li key={p.character.info.id} className="small">
                                {nameOf(p.character.info.id)}: <span className="warn">{gaps.join(', ')}</span>
                              </li>
                            ) : null;
                          })}
                          {ch.plan.picks.length < ch.plan.needed && (
                            <li className="small warn">Only {ch.plan.picks.length} characters in your roster fit; unlock more that match.</li>
                          )}
                        </ul>
                      </div>
                    ))}
                  </div>
                
  );

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
      {unread.length > 0 && !progress && (
        <p className="small warn">
          {unread.length === 1 ? `${unread[0]} is running but isn’t in your saved content.` : `${unread.length} running events aren’t in your saved content (${unread.join(', ')}).`}{' '}
          {live ? 'Refresh unlock content to read their rewards.' : ''}
        </p>
      )}
      {catalog?.errors.length ? (
        <details className="small muted"><summary>{catalog.errors.length} couldn’t be read</summary>{catalog.errors.join('; ')}</details>
      ) : null}

      <ModeTargets catalog={catalog} />

      <h2>Your goals</h2>
      <GoalPicker roster={roster} goals={goals} catalog={catalog} nameOf={nameOf} onPick={(id) => setGoals([...goals, id])} />
      {doneCount > 0 && (
        <label className="toggle small">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide unlocked goals ({doneCount})
        </label>
      )}
      {goals.length === 0 && <p className="muted">No goals yet.</p>}
      {goals.length > 0 && hideDone && doneCount === goals.length && <p className="muted">Every goal is unlocked. Add another above.</p>}

      {reports.map((r, i) => {
        const c = byId.get(r.characterId);
        if (hideDone && c && isUnlocked(c)) return null;
        const n = reports.slice(0, i + 1).filter((x) => { const d = byId.get(x.characterId); return !(hideDone && d && isUnlocked(d)); }).length;
        const sp = c && shardProgress(c, snapshot.inventory, (snapshot.upgrades ?? SAMPLE_UPGRADES).yellowStarTotalShards);
        const checks = r.sources.flatMap((x) => x.checks);
        const met = checks.filter((ch) => ch.plan.met).length;
        const open = r.sources.filter((x) => x.checks.some((ch) => !ch.plan.met));
        const ready = r.sources.filter((x) => !open.includes(x));
        return (
          <details className="card goal" key={r.characterId}>
            <summary>
              <span className="goal-title">
                <strong>{n}. {nameOf(r.characterId)}</strong>
                {c && isUnlocked(c) && <span className="pill ready">Unlocked</span>}
              </span>
              {catalog && r.sources.length > 0 ? (
                <span className="goal-progress muted small">
                  <meter min={0} max={checks.length} value={met} aria-label="Requirements met" />
                  {met} of {checks.length} met
                </span>
              ) : (
                <span className="muted small">{catalog ? 'no content rewards them now' : 'load unlock content'}</span>
              )}
              {sp && (
                <span className="goal-shards small">
                  <meter min={0} max={sp.need} value={Math.min(sp.have, sp.need)} aria-label="Shards" />
                  {sp.have.toLocaleString()} / {sp.need.toLocaleString()} shards {sp.unlock ? `to unlock at ${sp.stars}★` : `to ${sp.stars}★`}
                </span>
              )}
            </summary>
            <div className="toolbar goal-actions">
              {i > 0 && <button className="ghost small" onClick={() => move(i, -1)}>Move up</button>}
              <button className="ghost small" onClick={() => setGoals(goals.filter((g) => g !== r.characterId))}>Remove</button>
            </div>
            {!catalog ? (
              <p className="muted small">Load unlock content to see where {nameOf(r.characterId)} comes from.</p>
            ) : r.sources.length === 0 ? (
              <p className="muted small">
                No event, campaign or Dark Dimension in the API rewards {nameOf(r.characterId)} right now. They may come from orbs, stores or an upcoming event.
              </p>
            ) : (
              <>
                {ready.length > 0 && (
                  <p className="small ok">
                    ✓ Roster ready for {ready.map((x) => (x.source.subName ? `${x.source.name} (${x.source.subName})` : x.source.name)).join(', ')}.
                  </p>
                )}
                {chaptersOf(r).length > 1 ? (
                  chaptersOf(r).filter((ch) => ch.tiers.some((t) => open.includes(t))).map((ch) => (
                    <details key={ch.key} className="chapter">
                      <summary>
                        <strong>{ch.name}</strong>{' '}
                        <span className="small">
                          {ch.tiers.map((t, k) => (
                            <span key={t.source.id} className={`rung ${tierMet(t) ? 'met' : 'open'}`}>{k > 0 && ' · '}{tierName(t)} {tierMet(t) ? '✓' : ''}</span>
                          ))}
                        </span>
                      </summary>
                      {ch.tiers.filter((t) => open.includes(t)).map(sourceBlock)}
                    </details>
                  ))
                ) : (
                  open.map(sourceBlock)
                )}
              </>
            )}
          </details>
        );
      })}
    </section>
  );
}
