import { EN as strings } from '../i18n/en';
import { charName, traitName } from '../i18n/names';
import type { CharacterFilter, EventInfo, Squads } from '../api/types';
import type { ContentTeam } from '../data/contentTeams';
import type { CommunitySignal } from '../data/communitySignals';
import { communityReasons, type Evidence } from './community';
import { isUnlocked, matchesFilter, type OwnedCharacter } from './requirements';

export const MODE_LABELS: Record<string, string> = strings.mode;
export const DEFAULT_MODE_ORDER = ['raids', 'battleworld', 'war', 'crucible', 'blitz'];

/** Adds modes a saved order predates, each after the mode it follows by default. */
export function withAllModes(saved: string[]): string[] {
  const out = saved.filter((m) => DEFAULT_MODE_ORDER.includes(m));
  DEFAULT_MODE_ORDER.forEach((m, i) => {
    if (out.includes(m)) return;
    const after = out.indexOf(DEFAULT_MODE_ORDER[i - 1]);
    out.splice(after + 1, 0, m);
  });
  return out;
}

/** Weight of the mode at each position in the player's order: 10 per place from the bottom. */
export function modeWeights(order: string[]): Record<string, number> {
  return Object.fromEntries(order.map((m, i) => [m, (order.length - i) * 10]));
}

const CONTENT_WEIGHT = 35;
const GOAL_WEIGHT = 30;
/** Per unlock source a character's traits fit, capped so it can't outrank a top mode squad. */
const VERSATILITY_STEP = 2;
const VERSATILITY_CAP = 30;
const EVENT_WEIGHT = 25;

export interface Reason {
  label: string;
  weight: number;
  /** A longer explanation, e.g. what players said. */
  detail?: string;
  /** Where it comes from. */
  url?: string;
  /** What kind of use it records; squads, content teams and backed community picks are teams. */
  kind?: 'squad' | 'content' | 'event' | 'goal' | 'fits' | 'community';
}

export interface Ranked {
  character: OwnedCharacter;
  score: number;
  reasons: Reason[];
}

export interface RankInput {
  owned: OwnedCharacter[];
  squads: Squads;
  modeOrder: string[];
  contentTeams: ContentTeam[];
  events: EventInfo[];
  now?: number;
  /** Trait requirements of every unlock event and Dark Dimension, one list per source. */
  contentFilters?: { name: string; filters: CharacterFilter[] }[];
  /** Goal names each character is picked for. */
  goalPicks?: Record<string, string[]>;
  /** Community advice to weigh in, checked against the rest of this input. */
  signals?: CommunitySignal[];
  today?: string;
}

const THRESHOLDS: (keyof CharacterFilter)[] = ['level', 'activeYellow', 'activeRed', 'gearTier', 'iso8ClassLevel'];

/** Requirement text for what the character still lacks, e.g. "gear 17 (you're at 15)". */
function shortOf(c: OwnedCharacter, f: CharacterFilter): string | undefined {
  const i = c.instance ?? { id: c.info.id };
  const gaps = [
    f.gearTier && (i.gearTier ?? 0) < f.gearTier && `gear ${f.gearTier} (at ${i.gearTier ?? 0})`,
    f.level && (i.level ?? 0) < f.level && `level ${f.level} (at ${i.level ?? 0})`,
    f.activeYellow && (i.activeYellow ?? 0) < f.activeYellow && `${f.activeYellow}★ (at ${i.activeYellow ?? 0}★)`,
    f.activeRed && (i.activeRed ?? 0) < f.activeRed && `${f.activeRed} red stars (at ${i.activeRed ?? 0})`,
  ].filter(Boolean);
  return gaps.length ? gaps.join(', ') : undefined;
}

function looseOf(f: CharacterFilter): CharacterFilter {
  const loose = { ...f };
  THRESHOLDS.forEach((k) => delete loose[k]);
  delete loose.iso8Class;
  return loose;
}

function eventReasons(c: OwnedCharacter, events: EventInfo[], weights: Record<string, number>, now: number): Reason[] {
  const reasons: Reason[] = [];
  for (const e of events) {
    if (e.endTime < now) continue;
    const req = e.blitz?.requirements ?? e.tower?.requirements;
    if (!req) continue;
    const filters = req.anyCharacterFilters ?? [];
    const named = req.specificCharacters?.includes(c.info.id);
    // Match on traits alone, so characters below the gear or star bar still count as candidates.
    const traitFilter = filters.find((f) => {
      const loose = { ...f };
      THRESHOLDS.forEach((k) => delete loose[k]);
      return matchesFilter(c, loose);
    });
    if (!named && !traitFilter) continue;
    const gap = traitFilter && shortOf(c, traitFilter);
    // Blitz events follow the player's Blitz weight; other events count as progression.
    const weight = e.blitz ? (weights.blitz ?? 0) : EVENT_WEIGHT;
    if (weight) reasons.push({ label: `${e.name ?? e.type}${gap ? `: needs ${gap}` : ''}`, weight, kind: 'event' });
  }
  return reasons;
}

const normCache = new Map<string, string>();
const norm = (s: string) => {
  let n = normCache.get(s);
  if (n === undefined) {
    n = s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
    normCache.set(s, n);
  }
  return n;
};

/** Matches a curated name to a character by id, display name, or the name without its "(Variant)" suffix. */
export function findCharacter(key: string, owned: OwnedCharacter[]): OwnedCharacter | undefined {
  const k = norm(key);
  return (
    owned.find((c) => c.info.id === key) ??
    owned.find((c) => norm(c.info.id) === k || norm(c.info.name ?? '') === k)
  );
}

function hasTrait(c: OwnedCharacter, trait: string): boolean {
  const t = norm(trait);
  return [...(c.info.traits ?? []), ...(c.info.invisibleTraits ?? [])]
    .map((x) => (typeof x === 'string' ? x : x?.id ?? ''))
    .some((x) => norm(x) === t);
}

export function resolveTeam(team: ContentTeam, owned: OwnedCharacter[]): { found: OwnedCharacter[]; missing: string[] } {
  const named = team.characters.map((key) => ({ key, c: findCharacter(key, owned) }));
  const byTrait = (team.traits ?? []).flatMap((t) => owned.filter((c) => isUnlocked(c) && hasTrait(c, t)));
  const found = [...new Set([...named.flatMap((n) => (n.c ? [n.c] : [])), ...byTrait])];
  const missing = [
    ...named.filter((n) => !n.c).map((n) => n.key),
    ...(team.traits ?? []).filter((t) => !owned.some((c) => hasTrait(c, t))).map((t) => `${traitName(t)} (trait)`),
  ];
  return { found, missing };
}

/**
 * How much a saved squad counts, from its power against the strongest squad saved for the mode.
 * Game modes keep every squad ever saved, so old teams linger there: a squad at half the power
 * of your best one or less counts nothing, and it rises to full weight at 90%.
 */
export function squadShare(power: number, top: number): number {
  if (!top) return 1;
  return Math.max(0, Math.min(1, (power / top - 0.5) / 0.4));
}

/** Traits this many characters share are categories, not teams. */
const CATEGORY_SIZE = 40;
/** Alignment, origin, location and role traits, which never name a team. */
const CATEGORIES = new Set([
  'Hero', 'Villain', 'Bio', 'Mystic', 'Mutant', 'Skill', 'Tech', 'City', 'Global', 'Cosmic',
  'Blaster', 'Brawler', 'Controller', 'Protector', 'Support', 'Healer', 'Legendary', 'Minion',
]);

/**
 * Names a saved squad: the rarest trait at least three members share (a team like "Annihilators"),
 * else its first three members.
 */
export function squadNamer(owned: OwnedCharacter[]): (ids: string[]) => string {
  const byId = new Map(owned.map((c) => [c.info.id, c]));
  const freq = new Map<string, number>();
  const traitsOf = (c: OwnedCharacter | undefined) => (c?.info.traits ?? []).map((t) => (typeof t === 'string' ? t : t.id));
  owned.forEach((c) => traitsOf(c).forEach((t) => freq.set(t, (freq.get(t) ?? 0) + 1)));
  return (ids) => {
    const count = new Map<string, number>();
    ids.forEach((id) => traitsOf(byId.get(id)).forEach((t) => count.set(t, (count.get(t) ?? 0) + 1)));
    const team = [...count]
      .filter(([t, n]) => n >= 3 && !CATEGORIES.has(t) && (freq.get(t) ?? 0) <= CATEGORY_SIZE)
      .sort((a, b) => (freq.get(a[0]) ?? 0) - (freq.get(b[0]) ?? 0) || b[1] - a[1])[0]?.[0];
    if (team) return traitName(team);
    const names = ids.slice(0, 3).map((id) => charName(byId.get(id)?.info, id));
    return `${names.join(', ')}${ids.length > 3 ? ' and more' : ''}`;
  };
}

/**
 * Scores characters by where they're used: each saved squad mode adds that mode's
 * weight, recommended content-unlock teams add 35, and live events add 25 (Blitz
 * events use the Blitz weight). Higher scores get materials first.
 */
export function rankCharacters(input: RankInput): Ranked[] {
  const weights = modeWeights(input.modeOrder);
  const now = input.now ?? Date.now() / 1000;
  const reasons = new Map<string, Reason[]>();
  const add = (id: string, r: Reason) => reasons.set(id, [...(reasons.get(id) ?? []), r]);

  const name = squadNamer(input.owned);
  const squadModes = new Map<string, string[]>();
  const powerOf = new Map(input.owned.map((c) => [c.info.id, c.instance?.power ?? 0]));
  for (const mode of input.modeOrder) {
    const squads = (input.squads[mode] ?? []).map((squad) => squad.filter(Boolean)).filter((ids) => ids.length);
    const power = squads.map((ids) => ids.reduce((s, id) => s + (powerOf.get(id) ?? 0), 0));
    const top = Math.max(0, ...power);
    // Each character counts once per mode, under their strongest squad.
    const best = new Map<string, Reason>();
    squads.forEach((ids, i) => {
      const share = squadShare(power[i], top);
      const weight = Math.round(weights[mode] * share);
      if (!weight) return;
      const label = `${MODE_LABELS[mode] ?? mode} squad: ${name(ids)}${share < 1 ? ` (${Math.round((power[i] / top) * 100)}% of your strongest)` : ''}`;
      ids.forEach((id) => {
        if ((best.get(id)?.weight ?? 0) < weight) best.set(id, { label, weight, kind: 'squad' });
      });
    });
    best.forEach((r, id) => {
      add(id, r);
      squadModes.set(id, [...(squadModes.get(id) ?? []), mode]);
    });
  }
  for (const team of input.contentTeams) {
    resolveTeam(team, input.owned).found.forEach((c) =>
      add(c.info.id, { label: `${team.content}: ${team.team}`, weight: CONTENT_WEIGHT, kind: 'content' }),
    );
  }
  for (const c of input.owned.filter(isUnlocked)) {
    eventReasons(c, input.events, weights, now).forEach((r) => add(c.info.id, r));
  }

  for (const [id, goals] of Object.entries(input.goalPicks ?? {})) {
    goals.forEach((g) => add(id, { label: `Needed for ${g}`, weight: GOAL_WEIGHT, kind: 'goal' }));
  }
  // Characters whose traits fit many unlock events and Dark Dimensions keep paying off.
  if (input.contentFilters?.length) {
    const traited = input.contentFilters
      // Origin, side and role traits ("any Cosmic") fit most of the roster, so only team traits and named characters count.
      .map((s) => ({ ...s, filters: s.filters.filter((f) => f.anyCharacters?.length || [...(f.allTraits ?? []), ...(f.anyTraits ?? [])].some((t) => !CATEGORIES.has(typeof t === 'string' ? t : t.id))).map(looseOf) }))
      .filter((s) => s.filters.length);
    for (const c of input.owned) {
      const fits = traited.filter((s) => s.filters.some((f) => matchesFilter(c, f))).length;
      if (fits >= 3) {
        add(c.info.id, { label: `Fits ${fits} unlock events and Dark Dimensions`, weight: Math.min(VERSATILITY_CAP, fits * VERSATILITY_STEP), kind: 'fits' });
      }
    }
  }

  // Community advice last, so it can be checked against everything above.
  if (input.signals?.length) {
    const evidence = new Map<string, Evidence>();
    const ev = (id: string) => {
      let e = evidence.get(id);
      if (!e) {
        e = { squadModes: squadModes.get(id) ?? [], content: [], goals: input.goalPicks?.[id] ?? [], fits: 0 };
        evidence.set(id, e);
      }
      return e;
    };
    for (const team of input.contentTeams) resolveTeam(team, input.owned).found.forEach((c) => !ev(c.info.id).content.includes(team.content) && ev(c.info.id).content.push(team.content));
    for (const [id, rs] of reasons) {
      const fit = rs.find((r) => r.label.startsWith('Fits '));
      if (fit) ev(id).fits = Number(/\d+/.exec(fit.label)?.[0] ?? 0);
    }
    communityReasons(input.signals, input.owned, ev, input.today).forEach((rs, id) => rs.forEach((r) => add(id, r)));
  }

  const byId = new Map(input.owned.map((c) => [c.info.id, c]));
  return [...reasons]
    .filter(([id]) => byId.has(id))
    .map(([id, rs]) => ({ character: byId.get(id)!, reasons: rs, score: rs.reduce((s, r) => s + r.weight, 0) }))
    .sort((a, b) => b.score - a.score || (b.character.instance?.power ?? 0) - (a.character.instance?.power ?? 0));
}
