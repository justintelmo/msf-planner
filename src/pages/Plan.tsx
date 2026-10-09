import { useEffect, useMemo, useState } from 'react';
import { msfApi } from '../api/client';
import { idOf, type GearTiers } from '../api/types';
import { readJson, writeJson } from '../auth/storage';
import { CONTENT_TEAMS } from '../data/contentTeams';
import { SAMPLE_UPGRADES } from '../data/sample';
import type { Snapshot } from '../data/store';
import { buildPlan, modeEffectLabel, type Step } from '../planner/build';
import { plainName } from '../planner/export';
import { compact, formatCost, itemLabel } from '../planner/items';
import { extractModeTags, type ModeTag } from '../planner/modeTags';
import { goalReports, goalTargets, useUnlocks } from '../data/unlocks';
import { describeGap, mergeTargets, type Target } from '../planner/gaps';
import { DEFAULT_MODE_ORDER, MODE_LABELS, modeWeights, rankCharacters } from '../planner/priority';
import { isUnlocked, ownedCharacters } from '../planner/requirements';

const GOLD_KEY = 'msf.plan.gold';
const MODES_KEY = 'msf.plan.modes';
const DETAIL_KEY = 'msf.chardetail.v1';
/** Characters whose gear and ability text get fetched; the rest are planned without them. */
const DETAIL_LIMIT = 60;
const SHOWN = 20;

const STATUS_LABEL: Record<Step['status'], string> = { ready: 'Do now', short: 'Short', unchecked: 'Check in game' };

interface Detail {
  gearTiers: GearTiers;
  modeTags: ModeTag[];
}

/** Gear piece ids and mode-specific ability effects per character, cached since they rarely change. */
function useCharacterDetails(ids: string[], live: boolean) {
  const [details, setDetails] = useState<Record<string, Detail>>(() => readJson(localStorage, DETAIL_KEY) ?? {});
  const [remaining, setRemaining] = useState(0);
  const missing = ids.filter((id) => !details[id]).join(',');

  useEffect(() => {
    if (!live || !missing) return;
    let cancelled = false;
    const todo = missing.split(',');
    setRemaining(todo.length);
    (async () => {
      // A few at a time keeps the API happy; save as we go so a refresh doesn't start over.
      for (let i = 0; i < todo.length && !cancelled; i += 4) {
        const batch = todo.slice(i, i + 4);
        const results = await Promise.all(batch.map((id) => msfApi.characterDetail(id).catch(() => undefined)));
        if (cancelled) return;
        const found: Record<string, Detail> = {};
        batch.forEach((id, j) => {
          const r = results[j];
          if (!r) return;
          // Keep only piece ids: the full payload would overflow localStorage across many characters.
          const gearTiers: GearTiers = Object.fromEntries(
            Object.entries(r.gearTiers).map(([t, tier]) => [t, { slots: (tier.slots ?? []).map((s) => ({ piece: idOf(s.piece) })) }]),
          );
          found[id] = { gearTiers, modeTags: extractModeTags(r.abilityKit) };
        });
        setDetails((d) => {
          const next = { ...d, ...found };
          writeJson(localStorage, DETAIL_KEY, next);
          return next;
        });
        setRemaining(Math.max(0, todo.length - i - batch.length));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [missing, live]);

  return { details, remaining };
}

export default function Plan({ snapshot }: { snapshot: Snapshot }) {
  const owned = useMemo(() => ownedCharacters(snapshot), [snapshot]);
  const names = useMemo(() => {
    const m = new Map<string, string>();
    owned.forEach((c) => {
      const name = plainName(c.info.name ?? c.info.id);
      m.set(c.info.id, name);
      m.set(c.info.id.toUpperCase(), name);
    });
    return m;
  }, [owned]);
  const label = (id: string) => itemLabel(id, (key) => names.get(key));
  const nameOf = (id: string) => names.get(id) ?? id;

  const [modeOrder, setModeOrder] = useState<string[]>(() => readJson(localStorage, MODES_KEY) ?? DEFAULT_MODE_ORDER);
  const moveUp = (i: number) => {
    const next = [...modeOrder];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setModeOrder(next);
    writeJson(localStorage, MODES_KEY, next);
  };
  const [goldText, setGoldText] = useState(() => readJson<string>(localStorage, GOLD_KEY) ?? '');
  const gold = goldText.trim() ? Number(goldText.replace(/[^\d]/g, '')) : undefined;

  const ranked = useMemo(
    () => rankCharacters({ owned, squads: snapshot.squads ?? {}, modeOrder, contentTeams: CONTENT_TEAMS, events: snapshot.events }),
    [owned, snapshot, modeOrder],
  );
  const order = useMemo(() => ranked.map((r) => r.character.info.id), [ranked]);
  const { catalog, goals } = useUnlocks();
  const reports = useMemo(() => goalReports(goals, catalog, owned), [goals, catalog, owned]);
  const targets = useMemo(() => goalTargets(reports, (id) => names.get(id) ?? id), [reports, names]);
  const detailIds = useMemo(() => [...new Set([...Object.keys(targets), ...order])].slice(0, DETAIL_LIMIT), [order, targets]);
  const { details, remaining } = useCharacterDetails(detailIds, snapshot.source === 'live');

  const levelCap = Math.max(1, ...owned.map((c) => c.instance?.level ?? 0));
  const plan = useMemo(() => {
    const gearTiers = Object.fromEntries(Object.entries(details).map(([id, d]) => [id, d.gearTiers]));
    const modeTags = Object.fromEntries(Object.entries(details).map(([id, d]) => [id, d.modeTags]));
    return buildPlan({
      owned, inventory: snapshot.inventory, upgrades: snapshot.upgrades ?? SAMPLE_UPGRADES,
      order, levelCap, gearTiers, modeTags, modeWeights: modeWeights(modeOrder), gold, targets,
    });
  }, [owned, snapshot, order, levelCap, details, modeOrder, gold, targets]);
  const reasonsOf = useMemo(() => new Map(ranked.map((r) => [r.character.info.id, r])), [ranked]);

  const [showAllSteps, setShowAllSteps] = useState(false);
  const [shownChars, setShownChars] = useState(SHOWN);
  const doNow = showAllSteps ? plan.doNow : plan.doNow.slice(0, 15);
  const shortages = [...plan.shortages].sort((a, b) => b.quantity - a.quantity);
  const withSteps = plan.characters.filter((p) => p.steps.length);

  return (
    <section className="plan">
      <div className="toolbar">
        <span>Mode priority</span>
        <ol className="modes">
          {modeOrder.map((m, i) => (
            <li key={m}>
              {i + 1}. {MODE_LABELS[m] ?? m}
              {i > 0 && (
                <button className="ghost small" title="Move up" onClick={() => moveUp(i)}>↑</button>
              )}
            </li>
          ))}
        </ol>
        <label>
          Gold on hand{' '}
          <input
            inputMode="numeric" placeholder="optional" value={goldText} style={{ width: 140 }}
            onChange={(e) => {
              setGoldText(e.target.value);
              writeJson(localStorage, GOLD_KEY, e.target.value);
            }}
          />
        </label>
        {remaining > 0 && <span className="muted small">Reading gear and abilities for {remaining} characters…</span>}
      </div>
      {goals.length > 0 && (
        <p className="small">
          <strong>Unlock goals come first:</strong> {goals.map((g) => names.get(g) ?? g).join(', ')}.{' '}
          {Object.keys(targets).length
            ? `${Object.keys(targets).length} characters need upgrades to meet their requirements.`
            : catalog ? 'Your roster already meets their requirements.' : 'Load unlock content on the Goals tab to plan for them.'}
        </p>
      )}
      <p className="muted small">
        After that, characters are ranked by your saved squads in each mode (weighted by the order above), recommended teams for
        unlock content like {CONTENT_TEAMS[0]?.content}, and live events. Higher ranks get your materials first.
      </p>
      {!snapshot.squads && (
        <p className="muted small">Your saved squads haven’t loaded yet. Press Sync to include them.</p>
      )}
      {snapshot.plannerErrors?.map((e) => (
        <p key={e} className="error small">Couldn’t load {e}</p>
      ))}

      <div className="tiles">
        <Tile label="Ready to do now" value={String(plan.doNow.length)} />
        <Tile label={gold === undefined ? 'Gold for ready steps' : 'Gold left after'} value={compact(gold === undefined ? plan.goldForReady : gold - plan.goldForReady)} />
        <Tile label="Characters ranked" value={String(order.length)} />
      </div>

      {goals.length > 0 && catalog && (
        <>
          <h2>Unlock goals</h2>
          <p className="muted small">
            Who to build for each goal and what they still need. Most of these say “check in game” because ion balances and
            gear crafting aren’t in the API, so they won’t show up under “Do now” until the materials are on hand.
          </p>
          {reports.map((r) => {
            const checks = r.sources.flatMap((s) => s.checks);
            const met = checks.filter((c) => c.plan.met).length;
            const merged = new Map<string, { character: (typeof owned)[number]; target: Target }>();
            for (const c of checks) {
              for (const p of c.plan.picks) {
                const prev = merged.get(p.character.info.id);
                merged.set(p.character.info.id, { character: p.character, target: prev ? mergeTargets(prev.target, p.gap) : p.gap });
              }
            }
            const gaps = new Map(
              [...merged].map(([id, m]) => [id, describeGap(m.character, m.target)] as const).filter(([, g]) => g.length),
            );
            const steps = plan.doNow.concat(plan.characters.flatMap((p) => p.steps.filter((x) => x.status !== 'ready')));
            const prereqs = r.sources.filter((s) => s.unlocks).map((s) => (s.source.subName ? `${s.source.name} (${s.source.subName})` : s.source.name));
            return (
              <article className="card plan-goal" key={r.characterId}>
                <h3>
                  {nameOf(r.characterId)}{' '}
                  <span className="muted small">
                    {r.sources.length ? `${met} of ${checks.length} requirements met` : 'no content in the API rewards them right now'}
                  </span>
                </h3>
                {prereqs.length > 0 && <p className="small warn">Clear first: {prereqs.join(', ')}.</p>}
                <ul>
                  {[...gaps].map(([id, g]) => {
                    const own = steps.filter((x) => x.characterId === id && x.goal);
                    const count = (st: Step['status']) => own.filter((x) => x.status === st).length;
                    return (
                      <li key={id} className="small">
                        <strong>{nameOf(id)}</strong>: {g.join(', ')}
                        {count('ready') > 0 && <span className="pill ready"> {count('ready')} do now</span>}
                        {count('short') > 0 && <span className="pill short"> {count('short')} short</span>}
                        {count('unchecked') > 0 && <span className="pill unchecked"> {count('unchecked')} check in game</span>}
                      </li>
                    );
                  })}
                  {gaps.size === 0 && r.sources.length > 0 && <li className="small ok">Your roster already meets every requirement.</li>}
                </ul>
              </article>
            );
          })}
        </>
      )}

      <h2>Do now, in this order</h2>
      {doNow.length === 0 ? (
        <p className="muted">Nothing is fully affordable with your current materials.</p>
      ) : (
        <ol className="steps">
          {doNow.map((s, i) => (
            <li key={i}>
              <strong>{nameOf(s.characterId)}</strong>: {s.title}
              {s.goal && <span className="pill goal"> {s.goal}</span>}
              {s.modeEffects?.length ? <span className="pill mode"> {s.modeEffects.map((t) => MODE_LABELS[t.mode] ?? t.mode).join(', ')} effect</span> : null}
              {s.cost.length > 0 && <span className="muted small"> · {formatCost(s.cost, label)}</span>}
            </li>
          ))}
        </ol>
      )}
      {plan.doNow.length > 15 && (
        <button className="ghost" onClick={() => setShowAllSteps((v) => !v)}>
          {showAllSteps ? 'Show fewer' : `Show all ${plan.doNow.length}`}
        </button>
      )}

      {shortages.length > 0 && (
        <>
          <h2>What you're short on</h2>
          <p className="muted small">The next blocked step for each character needs these. Shards come from campaign nodes, events and stores.</p>
          <ul className="shortages">
            {shortages.slice(0, 24).map((s) => (
              <li key={s.item}><strong>{compact(s.quantity)}</strong> {label(s.item)}</li>
            ))}
          </ul>
        </>
      )}

      <h2>By character, highest priority first</h2>
      <div className="squads">
        {withSteps.slice(0, shownChars).map(({ character, steps }) => {
          const rank = reasonsOf.get(character.info.id);
          return (
            <article className="card plan-char" key={character.info.id}>
              <h3>
                {nameOf(character.info.id)}{' '}
                <span className="muted small">
                  {isUnlocked(character)
                    ? `L${character.instance?.level ?? 0} · ${character.instance?.activeYellow}★ · G${character.instance?.gearTier}`
                    : 'locked'}
                </span>
              </h3>
              {targets[character.info.id] && <p className="small why">{targets[character.info.id].why}</p>}
              {rank && (
                <p className="muted small why">
                  Priority {rank.score}: {rank.reasons.map((r) => r.label).join(' · ')}
                </p>
              )}
              <ul>
                {steps.map((s, j) => (
                  <li key={j} className={`step ${s.status}`}>
                    <span className={`pill ${s.status}`}>{STATUS_LABEL[s.status]}</span> {s.title}
                    {s.goal && <span className="pill goal"> {s.goal}</span>}
                    {s.status === 'short' && s.missing.length > 0 && (
                      <span className="small"> · need {formatCost(s.missing, label)}</span>
                    )}
                    {s.status !== 'short' && s.cost.length > 0 && (
                      <span className="muted small"> · {formatCost(s.cost, label)}</span>
                    )}
                    {s.detail && <div className="muted small">{s.detail}</div>}
                    {s.modeEffects?.map((t, k) => (
                      <div key={k} className="small mode-effect">{modeEffectLabel(t)}</div>
                    ))}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
      {withSteps.length > shownChars && (
        <button className="ghost" onClick={() => setShownChars((n) => n + SHOWN)}>
          Show more ({withSteps.length - shownChars} left)
        </button>
      )}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
