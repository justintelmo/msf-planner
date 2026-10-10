import { ABILITY_SLOTS, type CharacterFilter, type CharacterInstance, type EventInfo } from '../api/types';
import type { SyncPrint } from '../data/syncHistory';
import type { Target } from './gaps';
import type { Ranked } from './priority';
import { isoClassLevel, matchesFilter, type OwnedCharacter } from './requirements';

export type Verdict = 'good' | 'ok' | 'questionable';

export interface CharacterReview {
  characterId: string;
  /** What changed, e.g. "Gear 15 → 16". */
  changes: string[];
  verdict: Verdict;
  /** Why the verdict, most important first. */
  why: string[];
  /** Rough size of the investment, used to weigh the overall verdict. */
  effort: number;
}

export interface SyncReview {
  since: number;
  /** "great" | "good" | "mixed" | "off-plan" | "none" (nothing upgraded). */
  mood: 'great' | 'good' | 'mixed' | 'off-plan' | 'none';
  headline: string;
  characters: CharacterReview[];
  /** Net change per material group, e.g. ["Training modules −340"]. */
  materials: string[];
  eventsEnded: string[];
  eventsStarted: string[];
  /** Goal characters still short that weren't upgraded. */
  missed: string[];
}

export interface ReviewInput {
  before: SyncPrint;
  owned: OwnedCharacter[];
  inventory: Record<string, number>;
  events: EventInfo[];
  ranked: Ranked[];
  targets: Record<string, { target: Target; why: string }>;
  /** Goal targets as they stood at the previous sync, so goals finished since then still count. */
  prevTargets?: Record<string, { target: Target; why: string }>;
  /** Item ids of training modules, from the XP tables. */
  trainingIds?: Set<string>;
  nameOf: (id: string) => string;
  now?: number;
}

/** Ranks at or above this count as "near the top" of the priority list. */
const TOP_RANK = 25;
const THRESHOLDS: (keyof CharacterFilter)[] = ['level', 'activeYellow', 'activeRed', 'gearTier', 'iso8ClassLevel'];
const loose = (f: CharacterFilter): CharacterFilter => {
  const out = { ...f };
  THRESHOLDS.forEach((k) => delete out[k]);
  return out;
};

/** "For Odin" → "for Odin", to sit mid-sentence. */
const lowerFor = (why: string) => why.replace(/^For /, 'for ');

const ABILITY_NAMES = { basic: 'Basic', special: 'Special', ultimate: 'Ultimate', passive: 'Passive' } as const;

/** What changed on one character, with a rough effort score (gear and stars weigh most). */
function diff(a: CharacterInstance | undefined, b: CharacterInstance): { changes: string[]; effort: number } {
  const changes: string[] = [];
  let effort = 0;
  const step = (label: string, from: number, to: number, weight: number, fmt = (n: number) => String(n)) => {
    if (to > from) {
      changes.push(`${label} ${fmt(from)} → ${fmt(to)}`);
      effort += (to - from) * weight;
    }
  };
  if (!a || !(a.activeYellow ?? 0)) {
    if (b.activeYellow) {
      changes.push(`Unlocked at ${b.activeYellow}★`);
      effort += 3;
    }
    if (!a) return { changes, effort };
  }
  step('Level', a.level ?? 0, b.level ?? 0, 0.2);
  if (a.activeYellow) step('Stars', a.activeYellow ?? 0, b.activeYellow ?? 0, 2, (n) => `${n}★`);
  step('Red stars', a.activeRed ?? 0, b.activeRed ?? 0, 2);
  step('Gear', a.gearTier ?? 0, b.gearTier ?? 0, 3);
  if ((b.gearTier ?? 0) === (a.gearTier ?? 0)) {
    const slots = (b.gearSlots ?? []).filter(Boolean).length - (a.gearSlots ?? []).filter(Boolean).length;
    if (slots > 0) {
      changes.push(`${slots} gear piece${slots > 1 ? 's' : ''} equipped`);
      effort += slots * 0.5;
    }
  }
  for (const s of ABILITY_SLOTS) step(ABILITY_NAMES[s], a[s] ?? 0, b[s] ?? 0, 1);
  const isoA = isoClassLevel(a);
  const isoB = isoClassLevel(b);
  if (b.iso8?.active && b.iso8.active !== a.iso8?.active) changes.push(`ISO-8 class set to ${b.iso8.active}`);
  step('ISO-8', isoA, isoB, 1);
  return { changes, effort };
}

const fieldOf = (i: CharacterInstance | undefined, f: keyof Target): number =>
  !i ? 0 : f === 'iso8ClassLevel' ? isoClassLevel(i) : f === 'iso8Class' ? 0 : ((i[f as keyof CharacterInstance] as number | undefined) ?? 0);

function filtersOf(e: EventInfo): { filters: CharacterFilter[]; named: string[] } | undefined {
  const req = e.blitz?.requirements ?? e.tower?.requirements;
  if (!req) return undefined;
  return { filters: req.anyCharacterFilters ?? [], named: req.specificCharacters ?? [] };
}

/**
 * Compares the roster with the previous sync and judges each upgrade: good when it moves an
 * unlock goal, makes a character newly eligible for a running (or just-finished) event, or
 * goes to someone near the top of the priority list; questionable when the character isn't
 * used anywhere the planner knows about.
 */
export function reviewSync(input: ReviewInput): SyncReview {
  const now = input.now ?? Date.now();
  const { before } = input;
  const prevById = new Map(before.roster.map((r) => [r.id, r]));
  const rank = new Map(input.ranked.map((r, i) => [r.character.info.id, { i: i + 1, r }]));

  // Events running now, plus ones that ended since the last sync (upgrades may have been for them).
  const sinceSec = before.syncedAt / 1000;
  const nowSec = now / 1000;
  const allEvents = new Map<string, EventInfo>();
  [...before.events, ...input.events].forEach((e) => allEvents.set(e.id, e));
  const relevant = [...allEvents.values()].filter((e) => e.endTime >= sinceSec && e.startTime <= nowSec);
  const eventName = (e: EventInfo) => e.name ?? e.type;

  const characters: CharacterReview[] = [];
  for (const c of input.owned) {
    const after = c.instance;
    if (!after) continue;
    const prev = prevById.get(c.info.id);
    const { changes, effort } = diff(prev, after);
    if (!changes.length) continue;

    const good: string[] = [];
    const neutral: string[] = [];
    const id = c.info.id;

    const goal = input.prevTargets?.[id] ?? input.targets[id];
    if (goal) {
      const fields = (Object.keys(goal.target) as (keyof Target)[]).filter((f) => f !== 'iso8Class');
      const moved = fields.filter((f) => fieldOf(after, f) > fieldOf(prev, f));
      const metNow = fields.every((f) => fieldOf(after, f) >= (goal.target[f] as number));
      if (moved.length) good.push(`${metNow ? 'Now meets' : 'Moves toward'} the bar ${lowerFor(goal.why)}`);
    }

    const beforeChar: OwnedCharacter = { info: c.info, instance: prev ?? { id } };
    for (const e of relevant) {
      const f = filtersOf(e);
      if (!f) continue;
      const fits = f.named.includes(id) || f.filters.some((x) => matchesFilter(c, loose(x)));
      if (!fits) continue;
      const ended = e.endTime < nowSec;
      const qualifies = f.named.includes(id) || f.filters.some((x) => matchesFilter(c, x));
      const qualifiedBefore = f.named.includes(id) || f.filters.some((x) => matchesFilter(beforeChar, x));
      if (qualifies && !qualifiedBefore) good.push(`Now qualifies for ${eventName(e)}${ended ? ' (ended since your last sync)' : ''}`);
      else if (!ended) neutral.push(`Fits ${eventName(e)}, running now`);
    }

    const r = rank.get(id);
    if (r && r.i <= TOP_RANK) good.push(`#${r.i} on your priority list (${r.r.reasons[0]?.label ?? 'priority'})`);
    else if (r) neutral.push(`#${r.i} on your priority list`);

    let verdict: Verdict;
    let why: string[];
    if (good.length) {
      verdict = 'good';
      why = [...good, ...neutral];
    } else if (neutral.length || effort < 2) {
      verdict = 'ok';
      why = neutral.length ? neutral : ['A small upgrade'];
    } else {
      verdict = 'questionable';
      why = ['Not on a saved squad, unlock goal, recommended team, or live event, so these resources may have done more elsewhere'];
    }
    characters.push({ characterId: id, changes, verdict, why, effort });
  }
  const order: Record<Verdict, number> = { good: 0, questionable: 1, ok: 2 };
  characters.sort((a, b) => order[a.verdict] - order[b.verdict] || b.effort - a.effort);

  // Goal characters still short that got nothing, top-ranked first.
  const touched = new Set(characters.map((c) => c.characterId));
  const byId = new Map(input.owned.map((c) => [c.info.id, c]));
  const missed = Object.entries(input.targets)
    .filter(([id, t]) => {
      if (touched.has(id)) return false;
      const inst = byId.get(id)?.instance;
      return (Object.keys(t.target) as (keyof Target)[]).some((f) => f !== 'iso8Class' && fieldOf(inst, f) < (t.target[f] as number));
    })
    .sort(([a], [b]) => (rank.get(a)?.i ?? 1e9) - (rank.get(b)?.i ?? 1e9))
    .slice(0, 5)
    .map(([id]) => input.nameOf(id));

  const total = characters.reduce((s, c) => s + c.effort, 0);
  const goodShare = total ? characters.filter((c) => c.verdict === 'good').reduce((s, c) => s + c.effort, 0) / total : 0;
  const offShare = total ? characters.filter((c) => c.verdict === 'questionable').reduce((s, c) => s + c.effort, 0) / total : 0;
  const mood: SyncReview['mood'] = !characters.length ? 'none' : goodShare >= 0.75 ? 'great' : goodShare >= 0.5 ? 'good' : offShare >= 0.5 ? 'off-plan' : 'mixed';
  const pct = Math.round(goodShare * 100);
  const headline = {
    none: 'No upgrades since your last sync.',
    great: `Great session: ${pct}% of your upgrades went where the plan wanted them.`,
    good: `Solid session: ${pct}% of your upgrades went to goals, events, or top priorities.`,
    mixed: `Mixed session: only ${pct}% of your upgrades went to goals, events, or top priorities.`,
    'off-plan': `Off plan: most upgrades went to characters the planner doesn't use anywhere.`,
  }[mood];

  return {
    since: before.syncedAt, mood, headline, characters,
    materials: materials(before.inventory, input.inventory, input.trainingIds),
    eventsEnded: [...allEvents.values()].filter((e) => e.endTime >= sinceSec && e.endTime < nowSec).map(eventName),
    eventsStarted: input.events.filter((e) => e.startTime * 1000 > before.syncedAt && e.startTime <= nowSec).map(eventName),
    missed,
  };
}

/** Net change per material group between two inventories. */
function materials(a: Record<string, number>, b: Record<string, number>, trainingIds = new Set<string>()): string[] {
  const groups: [string, (id: string) => boolean][] = [
    ['Training modules', (id) => trainingIds.has(id) || id.startsWith('CONSUMABLE_XPLVL')],
    ['Ability materials', (id) => id.startsWith('ABILITY_MATERIAL')],
    ['Ions', (id) => id.startsWith('ISO8-') && id.endsWith('-CURRENCY')],
    ['Character shards', (id) => id.startsWith('SHARD_')],
  ];
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const [label, test] of groups) {
    let used = 0;
    let gained = 0;
    ids.forEach((id) => {
      if (!test(id)) return;
      const d = (b[id] ?? 0) - (a[id] ?? 0);
      if (d > 0) gained += d;
      else used -= d;
    });
    if (used || gained) out.push(`${label}: ${gained ? `+${gained.toLocaleString()}` : ''}${gained && used ? ' / ' : ''}${used ? `−${used.toLocaleString()}` : ''}`);
  }
  return out;
}
