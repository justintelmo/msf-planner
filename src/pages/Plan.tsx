import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { msfApi } from '../api/client';
import { idOf, type GearTiers } from '../api/types';
import { readJson, writeJson } from '../auth/storage';
import { CONTENT_TEAMS } from '../data/contentTeams';
import { SAMPLE_UPGRADES } from '../data/sample';
import type { Snapshot } from '../data/store';
import { buildPlan, modeEffectLabel, sumCost, type Step } from '../planner/build';
import { plainName } from '../planner/export';
import { compact, itemLabel } from '../planner/items';
import { extractModeTags, type ModeTag } from '../planner/modeTags';
import { isMetRaid, modeReports, useModeGoals } from '../data/modeGoals';
import { GOLD_ID, useWallet } from '../data/wallet';
import Currencies, { withTypedAmounts } from './Currencies';
import SyncReview from './SyncReview';
import StoresPanel from './StoresPanel';
import SourceLadder from './SourceLadder';
import { CharName, CharPortrait, CostChips, ItemChip } from './Details';
import { useStores } from '../data/stores';
import { currencyItem, storeInventory, storeRecipes } from '../planner/stores';
import { activeGoals, catalogFilters, withLiveEvents, goalPicks, goalReports, goalTargets, useUnlocks, type GoalReport } from '../data/unlocks';
import { buildSchedule, type Recipes, type ScheduledStep } from '../planner/schedule';
import { describeGap, mergeTargets, type Target } from '../planner/gaps';
import { DEFAULT_MODE_ORDER, MODE_LABELS, modeWeights, rankCharacters, resolveTeam, withAllModes } from '../planner/priority';
import { isUnlocked, ownedCharacters } from '../planner/requirements';

const HIDE_MET_KEY = 'msf.plan.hideMetRaids';
const DAYS_KEY = 'msf.plan.days';
const RECIPES_KEY = 'msf.recipes.v1';
const MODES_KEY = 'msf.plan.modes';
const DETAIL_KEY = 'msf.chardetail.v1';
const TAB_KEY = 'msf.plan.tab';

type PlanTab = 'goals' | 'priority' | 'farm' | 'characters';
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

/** Crafting recipes for gear pieces, cached since they don't change. */
function useRecipes(pieces: string[], live: boolean) {
  const [recipes, setRecipes] = useState<Recipes>(() => readJson(localStorage, RECIPES_KEY) ?? {});
  const [tried] = useState(() => new Set<string>());
  const [remaining, setRemaining] = useState(0);
  const missing = pieces.filter((p) => !recipes[p] && !tried.has(p)).join(',');

  useEffect(() => {
    if (!live || !missing) return;
    let cancelled = false;
    const todo = missing.split(',');
    todo.forEach((p) => tried.add(p));
    setRemaining(todo.length);
    let done = 0;
    (async () => {
      for (let i = 0; i < todo.length && !cancelled; i += 4) {
        const batch = await Promise.all(todo.slice(i, i + 4).map((p) => msfApi.gearRecipes(p).catch(() => ({}))));
        if (cancelled) return;
        done = i + 4;
        setRecipes((r) => {
          const next = Object.assign({}, r, ...batch);
          writeJson(localStorage, RECIPES_KEY, next);
          return next;
        });
        setRemaining(Math.max(0, todo.length - i - 4));
      }
    })();
    return () => {
      cancelled = true;
      // Pieces not fetched yet are tried again when the page shows next.
      todo.slice(done).forEach((p) => tried.delete(p));
    };
  }, [missing, live, tried]);

  return { recipes, remaining };
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
  const stores = useDeferredValue(useStores());
  const label = (id: string) =>
    stores.currencies.find((c) => currencyItem(c.id) === id)?.name ?? itemLabel(id, (key) => names.get(key));
  const nameOf = (id: string) => names.get(id) ?? id;

  const [modeOrder, setModeOrder] = useState<string[]>(() => withAllModes(readJson(localStorage, MODES_KEY) ?? DEFAULT_MODE_ORDER));
  const moveUp = (i: number) => {
    const next = [...modeOrder];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setModeOrder(next);
    writeJson(localStorage, MODES_KEY, next);
  };
  const wallet = useWallet();
  // Deferred so a saved amount never blocks the page: the plan recalculates in the background
  // and the inputs stay responsive. Only ions touch the inventory, so power cores don't trigger a rebuild.
  const gold = useDeferredValue(wallet.amounts[GOLD_ID]);
  const goldPerDay = useDeferredValue(wallet.goldPerDay);
  const ionKey = useDeferredValue(JSON.stringify(Object.entries(wallet.amounts).filter(([id]) => id.startsWith('ISO8-'))));
  const inventory = useMemo(
    () => [...withTypedAmounts(snapshot.inventory, Object.fromEntries(JSON.parse(ionKey) as [string, number][])), ...storeInventory(stores)],
    [snapshot.inventory, ionKey, stores],
  );
  const sheet = useRef<HTMLDialogElement>(null);
  const tabMark = useRef<HTMLDivElement>(null);
  const [days, setDays] = useState(() => readJson<number>(localStorage, DAYS_KEY) ?? 7);

  const { catalog: saved, goals: allGoals, hideDone } = useUnlocks();
  const catalog = useMemo(() => withLiveEvents(saved, snapshot.events, snapshot.characters), [saved, snapshot.events, snapshot.characters]);
  const goals = useMemo(() => activeGoals(allGoals, owned, hideDone), [allGoals, owned, hideDone]);
  const modeGoals = useModeGoals();
  const reports = useMemo(
    () => [...goalReports(goals, catalog, owned), ...modeReports(modeGoals, catalog, owned, snapshot.squads ?? {})],
    [goals, catalog, owned, modeGoals, snapshot.squads],
  );
  const targets = useMemo(() => goalTargets(reports, (id) => names.get(id) ?? id), [reports, names]);
  const ranked = useMemo(
    () => rankCharacters({
      owned, squads: snapshot.squads ?? {}, modeOrder, contentTeams: CONTENT_TEAMS, events: snapshot.events,
      contentFilters: catalogFilters(catalog), goalPicks: goalPicks(reports, (id) => names.get(id) ?? id),
    }),
    [owned, snapshot, modeOrder, catalog, reports, names],
  );
  const order = useMemo(() => ranked.map((r) => r.character.info.id), [ranked]);
  const detailIds = useMemo(() => [...new Set([...Object.keys(targets), ...order])].slice(0, DETAIL_LIMIT), [order, targets]);
  const { details, remaining } = useCharacterDetails(detailIds, snapshot.source === 'live');

  const levelCap = Math.max(1, ...owned.map((c) => c.instance?.level ?? 0));
  const plan = useMemo(() => {
    const gearTiers = Object.fromEntries(Object.entries(details).map(([id, d]) => [id, d.gearTiers]));
    const modeTags = Object.fromEntries(Object.entries(details).map(([id, d]) => [id, d.modeTags]));
    return buildPlan({
      owned, inventory, upgrades: snapshot.upgrades ?? SAMPLE_UPGRADES,
      order, levelCap, gearTiers, modeTags, modeWeights: modeWeights(modeOrder), gold, targets,
    });
  }, [owned, snapshot, inventory, order, levelCap, details, modeOrder, gold, targets]);

  // Pieces for the current gear tier of every character in the plan, to look up crafting recipes.
  const pieceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of detailIds) {
      const tier = owned.find((c) => c.info.id === id)?.instance?.gearTier;
      details[id]?.gearTiers[String(tier)]?.slots?.forEach((sl) => {
        const p = idOf(sl.piece);
        if (p) ids.add(p);
      });
    }
    return [...ids];
  }, [detailIds, details, owned]);
  const { recipes, remaining: recipesLeft } = useRecipes(pieceIds, snapshot.source === 'live');
  const priority = useMemo(() => Object.fromEntries(ranked.map((r) => [r.character.info.id, r.score])), [ranked]);
  const schedule = useMemo(() => {
    const gearTiers = Object.fromEntries(Object.entries(details).map(([id, d]) => [id, d.gearTiers]));
    const modeTags = Object.fromEntries(Object.entries(details).map(([id, d]) => [id, d.modeTags]));
    return buildSchedule({
      owned, inventory, upgrades: snapshot.upgrades ?? SAMPLE_UPGRADES, levelCap, priority,
      gearTiers, recipes: { ...storeRecipes(stores, snapshot.characters), ...recipes }, targets, modeTags,
      modeWeights: modeWeights(modeOrder), gold, goldPerDay, days,
    });
  }, [owned, snapshot, inventory, levelCap, priority, details, recipes, targets, modeOrder, gold, goldPerDay, days, stores]);
  // Days of store income a blocked step still needs, from the store currency it's short of.
  const storeDays = (missing: { item: string; quantity: number }[]) => {
    const waits = stores.currencies.flatMap((c) => {
      const short = missing.find((m) => m.item === currencyItem(c.id));
      return short && c.perDay ? [`≈${Math.ceil(short.quantity / c.perDay)} days of ${c.name}`] : [];
    });
    return waits.join(', ');
  };
  const byDay = useMemo(() => {
    const groups = new Map<string, ScheduledStep[]>();
    for (const st of schedule.steps) {
      const key = st.day === undefined ? 'In this order' : st.day === 0 ? 'Today, with the gold you have' : `Day ${st.day}`;
      groups.set(key, [...(groups.get(key) ?? []), st]);
    }
    return [...groups];
  }, [schedule]);
  const farm = useMemo(
    () => sumCost(...schedule.blocked.slice(0, 15).map((b) => b.missing)).filter((m) => !m.item.startsWith('SC')).sort((a, b) => b.quantity - a.quantity),
    [schedule],
  );
  const tabs: [PlanTab, string, number?][] = [
    ...(reports.length > 0 && catalog ? [['goals', 'Goals', reports.length] as [PlanTab, string, number]] : []),
    ['priority', 'Priority', schedule.steps.length],
    ...(schedule.blocked.length > 0 ? [['farm', 'Farm', schedule.blocked.length] as [PlanTab, string, number]] : []),
    ['characters', 'Characters'],
  ];
  const [savedTab, setSavedTab] = useState<PlanTab>(() => readJson<PlanTab>(localStorage, TAB_KEY) ?? 'goals');
  const tab = tabs.some(([id]) => id === savedTab) ? savedTab : tabs[0][0];
  const pickTab = (id: PlanTab) => {
    setSavedTab(id);
    writeJson(localStorage, TAB_KEY, id);
    // Keep the bar in view: jump back up only when the page is scrolled past it.
    const mark = tabMark.current;
    if (!mark) return;
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 0;
    const top = mark.getBoundingClientRect().top + window.scrollY - header;
    if (window.scrollY > top) window.scrollTo({ top });
  };
  const reasonsOf = useMemo(() => new Map(ranked.map((r) => [r.character.info.id, r])), [ranked]);

  const [shownChars, setShownChars] = useState(SHOWN);
  const withSteps = plan.characters.filter((p) => p.steps.length);

  const [hideMet, setHideMet] = useState(() => readJson<boolean>(localStorage, HIDE_MET_KEY) ?? true);
  const metRaids = reports.filter(isMetRaid).length;
  const shownReports = hideMet ? reports.filter((r) => !isMetRaid(r)) : reports;

  const goalCard = (r: GoalReport) => {
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
            return (
              <article className="card plan-goal" key={r.characterId}>
                <h3>
                  {r.label ?? <CharName id={r.characterId} portrait />}{' '}
                  <span className="muted small">
                    {r.sources.length ? `${met} of ${checks.length} requirements met` : 'no content in the API rewards them right now'}
                  </span>
                </h3>
                <SourceLadder report={r} nameOf={nameOf} />
                <ul>
                  {[...gaps].map(([id, g]) => {
                    const own = steps.filter((x) => x.characterId === id && x.goal);
                    const count = (st: Step['status']) => own.filter((x) => x.status === st).length;
                    return (
                      <li key={id} className="small">
                        <CharName id={id} portrait />: {g.join(', ')}
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
  };

  return (
    <section className="plan">
      <SyncReview
        snapshot={snapshot} owned={owned} ranked={ranked} targets={targets} nameOf={nameOf}
        targetsFor={(o) => goalTargets([...goalReports(activeGoals(allGoals, o, hideDone), catalog, o), ...modeReports(modeGoals, catalog, o, snapshot.squads ?? {})], nameOf)}
      />
      <div className="plan-bar">
        <button className="ghost account-btn" onClick={() => sheet.current?.showModal()} aria-haspopup="dialog">
          <span>Account and settings</span>
          <span className="muted small">
            {gold === undefined ? 'enter gold' : `${compact(gold)} gold`} · {days === 1 ? '1 day' : `${days} days`} ·{' '}
            {modeOrder.slice(0, 2).map((m) => MODE_LABELS[m] ?? m).join(', ')} first
          </span>
        </button>
      </div>
      <dialog ref={sheet} className="sheet" aria-label="Account and settings" onClick={(e) => e.target === sheet.current && sheet.current?.close()}>
        <div className="sheet-head">
          <h2>Account and settings</h2>
          <button className="ghost" onClick={() => sheet.current?.close()}>Done</button>
        </div>
      <Currencies inventory={snapshot.inventory} upgrades={snapshot.upgrades ?? SAMPLE_UPGRADES} label={label} />
      <StoresPanel owned={owned} nameOf={nameOf} />
      <details className="card settings" open>
        <summary>
          <strong>Settings</strong>{' '}
          <span className="muted small">
            {days === 1 ? '1 day' : `${days} days`} ·{' '}
            {modeOrder.slice(0, 2).map((m) => MODE_LABELS[m] ?? m).join(', ')} first
          </span>
        </summary>
      <div className="toolbar">
        <span>Mode priority</span>
        <ol className="modes">
          {modeOrder.map((m, i) => (
            <li key={m}>
              {i + 1}. {MODE_LABELS[m] ?? m}
              {i > 0 && (
                <button className="ghost small" aria-label={`Move ${MODE_LABELS[m] ?? m} up`} title="Move up" onClick={() => moveUp(i)}>↑</button>
              )}
            </li>
          ))}
        </ol>
        <label>
          Plan{' '}
          <select
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              writeJson(localStorage, DAYS_KEY, Number(e.target.value));
            }}
          >
            {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d === 1 ? '1 day' : `${d} days`}</option>)}
          </select>
        </label>
      </div>
      </details>
      <details className="explain small">
        <summary>How the plan is ranked</summary>
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
          unlock content like {CONTENT_TEAMS[0]?.content}, live events, and how many unlock events and Dark Dimensions their
          traits fit. A character useful in several places outranks one built for a single mode.
        </p>
        {snapshot.source === 'live' && (() => {
          const ids = snapshot.inventory.map((i) => idOf(i.item) ?? '');
          const ions = ids.filter((id) => id.startsWith('ISO8-TIER-') && id.endsWith('-CURRENCY')).length;
          const moduleIds = new Set((snapshot.upgrades?.characterXpCosts ?? []).flatMap((w) => w.cost.map((c) => c.item)));
          const modules = ids.filter((id) => moduleIds.has(id)).length;
          return (
            <p className="muted small">
              From your inventory: {ions} ion types and {modules} training module types.
              {!modules && ' Press Sync if modules show 0; level steps can’t be checked without them.'}{!ions && ' Type your ions in the Currencies panel so ISO-8 steps can be checked.'}
            </p>
          );
        })()}
        {(() => {
          const missing = [...new Set(CONTENT_TEAMS.flatMap((t) => resolveTeam(t, owned).missing))];
          return missing.length ? (
            <details className="small muted">
              <summary>{missing.length} recommended characters or traits didn’t match your roster</summary>
              {missing.join(', ')}. They’re either not in the game data under that name, or the name needs fixing.
            </details>
          ) : null;
        })()}
      </details>
      </dialog>
      {remaining > 0 && <p className="muted small" role="status">Reading gear and abilities for {remaining} characters…</p>}
      {recipesLeft > 0 && <p className="muted small" role="status">Reading crafting recipes for {recipesLeft} gear pieces…</p>}
      {!snapshot.squads && (
        <p className="muted small">Your saved squads haven’t loaded yet. Press Sync to include them.</p>
      )}
      {snapshot.plannerErrors?.map((e) => (
        <p key={e} className="error small">Couldn’t load {e}</p>
      ))}

      <div className="tiles">
        <Tile label="Steps in the list" value={String(schedule.steps.length)} />
        <Tile label="Gold they cost" value={compact(schedule.goldUsed)} />
        <Tile
          label={gold === undefined ? 'Enter gold to place on days' : 'Gold left after'}
          value={gold === undefined ? '–' : compact(Math.max(0, gold + (goldPerDay ?? 0) * Math.max(0, ...schedule.steps.map((x) => x.day ?? 0)) - schedule.goldUsed))}
        />
      </div>

      <div ref={tabMark} />
      <nav className="subtabs" aria-label="Plan sections">
        {tabs.map(([id, text, count]) => (
          <button key={id} className={id === tab ? 'active' : ''} aria-current={id === tab ? 'page' : undefined} onClick={() => pickTab(id)}>
            {text}{count !== undefined && <span className="count">{count}</span>}
          </button>
        ))}
      </nav>

      {tab === 'goals' && (
        <>
          <h2 id="goals">Unlock goals and mode targets</h2>
          <p className="muted small">
            Who to build for each goal and what they still need. Their steps lead the priority list below. “Check in game”
            means the cost uses something the API doesn’t report, like ions.
          </p>
          {metRaids > 0 && (
            <label className="toggle small">
              <input type="checkbox" checked={hideMet} onChange={(e) => {
                setHideMet(e.target.checked);
                writeJson(localStorage, HIDE_MET_KEY, e.target.checked);
              }} />{' '}
              Hide raids I already meet ({metRaids})
            </label>
          )}
          {groupReports(shownReports).map((item) =>
            'reports' in item ? (
              <details key={item.group} className="card goal-group">
                <summary>
                  <strong>{item.group}</strong>{' '}
                  <span className="muted small">
                    {item.reports.length} raid{item.reports.length > 1 ? 's' : ''} ·{' '}
                    {item.reports.reduce((n, r) => n + r.sources.flatMap((x) => x.checks).filter((c) => c.plan.met).length, 0)} of{' '}
                    {item.reports.reduce((n, r) => n + r.sources.flatMap((x) => x.checks).length, 0)} requirements met
                  </span>
                </summary>
                {item.reports.map(goalCard)}
              </details>
            ) : (
              goalCard(item)
            ),
          )}
        </>
      )}

      {tab === 'priority' && (
        <>
      <h2 id="priority">Priority list</h2>
      <p className="muted small">
        Levels, abilities, gear, stars and ISO-8 across your roster, best value for the gold first. Unlock-goal thresholds
        count triple; characters that fit many modes, events and goals rank higher. Gear is crafted from your materials
        when a recipe is known. {gold === undefined && 'Enter gold on hand and gold per day to see which day each step fits.'}
      </p>
      {schedule.steps.length === 0 ? (
        <p className="muted">Nothing is affordable with your current materials.</p>
      ) : (
        byDay.map(([day, list]) => (
          <div key={day}>
            <h3 className="day">{day}</h3>
            <ol className="steps">
              {list.map((s, i) => (
                <li key={i}>
                  <CharName id={s.characterId} />: {s.title}
                  {s.status === 'unchecked' && <span className="pill unchecked"> check in game</span>}
                  {s.goal && <span className="pill goal"> {s.goal}</span>}
                  {s.modeEffects?.length ? <span className="pill mode"> {s.modeEffects.map((t) => MODE_LABELS[t.mode] ?? t.mode).join(', ')} effect</span> : null}
                  <div className="step-cost">
                    {(() => {
                      const mats = (s.uses ?? s.cost).filter((c) => !s.crafted?.includes(c.item) && c.item !== 'SC');
                      return mats.length ? <CostChips cost={mats} label={label} /> : <span className="muted small">no materials</span>;
                    })()}
                    <span className="muted small">
                      {s.crafted && `crafts ${s.crafted.length} ${s.kind === 'iso' ? 'crystal' : 'piece'}${s.crafted.length > 1 ? 's' : ''}`}
                      {s.crafted && s.gold > 0 && ' · '}
                      {s.gold > 0 && `${compact(s.gold)} gold`}
                    </span>
                  </div>
                  {s.detail && <div className="muted small">{s.detail}</div>}
                </li>
              ))}
            </ol>
          </div>
        ))
      )}
      {schedule.stoppedBy === 'gold' && (
        <p className="muted small">The list stops where your gold runs out within {days === 1 ? '1 day' : `${days} days`}.</p>
      )}

        </>
      )}

      {tab === 'farm' && (
        <>
          <h2 id="farm">Farm next</h2>
          <p className="muted small">
            The most valuable steps waiting on materials. Training modules, gear materials and shards for these come first.
          </p>
          <ul className="shortages">
            {farm.slice(0, 18).map((m) => (
              <li key={m.item}><ItemChip id={m.item} quantity={m.quantity} label={label(m.item)} /></li>
            ))}
          </ul>
          <ol className="steps">
            {schedule.blocked.slice(0, 10).map((s, i) => (
              <li key={i} className="small">
                <CharName id={s.characterId} />: {s.title}{s.goal && <span className="pill goal"> {s.goal}</span>}
                <div className="step-cost"><span className="muted">needs</span> <CostChips cost={s.missing} label={label} /></div>
                {storeDays(s.missing) && <span className="small"> · {storeDays(s.missing)}</span>}
              </li>
            ))}
          </ol>
        </>
      )}

      {tab === 'characters' && (
        <>
      <h2 id="characters">By character, highest priority first</h2>
      <div className="squads">
        {withSteps.slice(0, shownChars).map(({ character, steps }) => {
          const rank = reasonsOf.get(character.info.id);
          return (
            <details className="card plan-char" key={character.info.id}>
              <summary>
                <CharPortrait id={character.info.id} />
                <strong>{nameOf(character.info.id)}</strong>{' '}
                <span className="muted small">
                  {isUnlocked(character)
                    ? `L${character.instance?.level ?? 0} · ${character.instance?.activeYellow}★ · G${character.instance?.gearTier}`
                    : 'locked'}
                </span>
                {(['ready', 'short', 'unchecked'] as const).map((st) => {
                  const n = steps.filter((x) => x.status === st).length;
                  return n ? <span key={st} className={`pill ${st}`}>{n} {STATUS_LABEL[st]}</span> : null;
                })}
              </summary>
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
                      <div className="step-cost"><span className="small">need</span> <CostChips cost={s.missing} label={label} /></div>
                    )}
                    {s.status !== 'short' && s.cost.length > 0 && (
                      <div className="step-cost"><CostChips cost={s.cost} label={label} /></div>
                    )}
                    {s.detail && <div className="muted small">{s.detail}</div>}
                    {s.modeEffects?.map((t, k) => (
                      <div key={k} className="small mode-effect">{modeEffectLabel(t)}</div>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
      {withSteps.length > shownChars && (
        <button className="ghost" onClick={() => setShownChars((n) => n + SHOWN)}>
          Show more ({withSteps.length - shownChars} left)
        </button>
      )}
        </>
      )}
    </section>
  );
}

/** Keeps ungrouped reports in place and gathers grouped ones (e.g. one raid type) where the group first appears. */
function groupReports(reports: GoalReport[]): (GoalReport | { group: string; reports: GoalReport[] })[] {
  const out: (GoalReport | { group: string; reports: GoalReport[] })[] = [];
  const groups = new Map<string, { group: string; reports: GoalReport[] }>();
  for (const r of reports) {
    if (!r.group) {
      out.push(r);
      continue;
    }
    let g = groups.get(r.group);
    if (!g) {
      g = { group: r.group, reports: [] };
      groups.set(r.group, g);
      out.push(g);
    }
    g.reports.push(r);
  }
  return out;
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
