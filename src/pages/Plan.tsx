import { useEffect, useMemo, useState } from 'react';
import { msfApi } from '../api/client';
import type { GearTiers } from '../api/types';
import { readJson, writeJson } from '../auth/storage';
import { SAMPLE_UPGRADES } from '../data/sample';
import type { Snapshot } from '../data/store';
import { buildPlan, type Step } from '../planner/build';
import { plainName } from '../planner/export';
import { compact, formatCost, itemLabel } from '../planner/items';
import { isUnlocked, ownedCharacters } from '../planner/requirements';

const GOLD_KEY = 'msf.plan.gold';
const GEAR_KEY = 'msf.gear.v1';
const ALL = '__all';
const NO_SQUADS: Record<string, string[][]> = {};

const STATUS_LABEL: Record<Step['status'], string> = { ready: 'Do now', short: 'Short', unchecked: 'Check in game' };

/** Gear tier piece lists, fetched per character and cached since they rarely change. */
function useGearTiers(ids: string[], live: boolean) {
  const [gear, setGear] = useState<Record<string, GearTiers>>(() => readJson(localStorage, GEAR_KEY) ?? {});
  const [loading, setLoading] = useState(0);
  const missing = ids.filter((id) => !gear[id]).join(',');

  useEffect(() => {
    if (!live || !missing) return;
    let cancelled = false;
    const todo = missing.split(',');
    setLoading(todo.length);
    (async () => {
      const found: Record<string, GearTiers> = {};
      // A few at a time keeps the API happy.
      for (let i = 0; i < todo.length && !cancelled; i += 4) {
        const batch = todo.slice(i, i + 4);
        const results = await Promise.all(batch.map((id) => msfApi.gearTiers(id).catch(() => undefined)));
        batch.forEach((id, j) => results[j] && (found[id] = results[j]!));
        if (!cancelled) setLoading(Math.max(0, todo.length - i - batch.length));
      }
      if (cancelled) return;
      setGear((g) => {
        const next = { ...g, ...found };
        writeJson(localStorage, GEAR_KEY, next);
        return next;
      });
      setLoading(0);
    })();
    return () => {
      cancelled = true;
    };
  }, [missing, live]);

  return { gear, loading };
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

  const tabs = snapshot.squads ?? NO_SQUADS;
  const tabNames = useMemo(() => Object.keys(tabs).filter((t) => tabs[t]?.some((s) => s.length)), [tabs]);
  // Blitz and Tower can hold 50+ squads each, so start with the main roster tab.
  const [tabChoice, setTab] = useState<string | null>(null);
  const tab = tabChoice ?? (tabs.roster?.some((s) => s.length) ? 'roster' : ALL);
  const [goldText, setGoldText] = useState(() => readJson<string>(localStorage, GOLD_KEY) ?? '');
  const gold = goldText.trim() ? Number(goldText.replace(/[^\d]/g, '')) : undefined;

  const squads = useMemo(() => {
    const chosen = tab === ALL ? tabNames.flatMap((t) => tabs[t]) : tabs[tab] ?? [];
    if (chosen.length) return chosen;
    // No saved squads: plan the strongest characters, five at a time.
    const top = owned.filter(isUnlocked).sort((a, b) => (b.instance?.power ?? 0) - (a.instance?.power ?? 0)).slice(0, 15);
    return [0, 5, 10].map((i) => top.slice(i, i + 5).map((c) => c.info.id));
  }, [tab, tabs, tabNames, owned]);

  const ids = useMemo(() => [...new Set(squads.flat())], [squads]);
  const { gear, loading } = useGearTiers(ids, snapshot.source === 'live');

  const levelCap = Math.max(1, ...owned.map((c) => c.instance?.level ?? 0));
  const plan = useMemo(
    () => buildPlan({
      owned, inventory: snapshot.inventory, upgrades: snapshot.upgrades ?? SAMPLE_UPGRADES,
      squads, levelCap, gearTiers: gear, gold,
    }),
    [owned, snapshot, squads, levelCap, gear, gold],
  );
  const [showAll, setShowAll] = useState(false);
  const doNow = showAll ? plan.doNow : plan.doNow.slice(0, 15);
  const shortages = [...plan.shortages].sort((a, b) => b.quantity - a.quantity);

  return (
    <section className="plan">
      <div className="toolbar">
        <label>
          Plan for{' '}
          <select value={tab} onChange={(e) => setTab(e.target.value)}>
            {tabNames.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)} squads ({tabs[t].filter((s) => s.length).length})</option>
            ))}
            <option value={ALL}>All saved squads</option>
          </select>
        </label>
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
        {loading > 0 && <span className="muted small">Loading gear for {loading} characters…</span>}
      </div>
      {!tabNames.length && (
        <p className="muted small">
          {snapshot.squads
            ? 'You have no saved squads in game, so this plans your 15 strongest characters.'
            : 'Your saved squads haven’t loaded, so this plans your 15 strongest characters. Press Sync to load them.'}
        </p>
      )}
      {snapshot.plannerErrors?.map((e) => (
        <p key={e} className="error small">Couldn’t load {e}</p>
      ))}
      {!snapshot.upgrades && snapshot.source === 'live' && (
        <p className="muted small">Using cost tables from 2026-10-09. Press Sync to load the latest from the game.</p>
      )}

      <div className="tiles">
        <Tile label="Ready to do now" value={String(plan.doNow.length)} />
        <Tile label={gold === undefined ? 'Gold for ready steps' : 'Gold left after'} value={compact(gold === undefined ? plan.goldForReady : gold - plan.goldForReady)} />
        <Tile label="Characters in plan" value={String(ids.length)} />
      </div>

      <h2>Do now, in this order</h2>
      {doNow.length === 0 ? (
        <p className="muted">Nothing is fully affordable with your current materials.</p>
      ) : (
        <ol className="steps">
          {doNow.map((s, i) => (
            <li key={i}>
              <strong>{nameOf(s.characterId)}</strong>: {s.title}
              {s.cost.length > 0 && <span className="muted small"> · {formatCost(s.cost, label)}</span>}
            </li>
          ))}
        </ol>
      )}
      {plan.doNow.length > 15 && (
        <button className="ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${plan.doNow.length}`}
        </button>
      )}

      {shortages.length > 0 && (
        <>
          <h2>What you're short on</h2>
          <p className="muted small">The next step for each character needs these. Shards come from campaign nodes, events and stores.</p>
          <ul className="shortages">
            {shortages.slice(0, 24).map((s) => (
              <li key={s.item}><strong>{compact(s.quantity)}</strong> {label(s.item)}</li>
            ))}
          </ul>
        </>
      )}

      <h2>By squad</h2>
      <div className="squads">
        {plan.squads.map((squad, i) => (
          <article className="card" key={i}>
            {squad.map(({ character, steps }) => (
              <div className="plan-char" key={character.info.id}>
                <h3>
                  {nameOf(character.info.id)}{' '}
                  <span className="muted small">
                    {isUnlocked(character)
                      ? `L${character.instance?.level ?? 0} · ${character.instance?.activeYellow}★ · G${character.instance?.gearTier}`
                      : 'locked'}
                  </span>
                </h3>
                {steps.length === 0 ? (
                  <p className="ok small">Fully built for now.</p>
                ) : (
                  <ul>
                    {steps.map((s, j) => (
                      <li key={j} className={`step ${s.status}`}>
                        <span className={`pill ${s.status}`}>{STATUS_LABEL[s.status]}</span> {s.title}
                        {s.status === 'short' && s.missing.length > 0 && (
                          <span className="small"> · need {formatCost(s.missing, label)}</span>
                        )}
                        {s.status !== 'short' && s.cost.length > 0 && (
                          <span className="muted small"> · {formatCost(s.cost, label)}</span>
                        )}
                        {s.detail && <div className="muted small">{s.detail}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </article>
        ))}
      </div>
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
