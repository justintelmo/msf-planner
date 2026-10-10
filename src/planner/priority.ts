import type { CharacterFilter, EventInfo, Squads } from '../api/types';
import type { ContentTeam } from '../data/contentTeams';
import { isUnlocked, matchesFilter, type OwnedCharacter } from './requirements';

export const MODE_LABELS: Record<string, string> = {
  raids: 'Raids', war: 'War', crucible: 'Crucible', blitz: 'Blitz', arena: 'Arena', tower: 'Tower',
  battleworld: 'Battleworld', roster: 'Roster',
};
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
    if (weight) reasons.push({ label: `${e.name ?? e.type}${gap ? `: needs ${gap}` : ''}`, weight });
  }
  return reasons;
}

function resolveTeam(team: ContentTeam, owned: OwnedCharacter[]): OwnedCharacter[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return team.characters
    .map((key) => owned.find((c) => c.info.id === key) ?? owned.find((c) => norm(c.info.name ?? '') === norm(key)))
    .filter((c): c is OwnedCharacter => !!c);
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

  for (const mode of input.modeOrder) {
    const ids = new Set((input.squads[mode] ?? []).flat().filter(Boolean));
    ids.forEach((id) => add(id, { label: `${MODE_LABELS[mode] ?? mode} squad`, weight: weights[mode] }));
  }
  for (const team of input.contentTeams) {
    resolveTeam(team, input.owned).forEach((c) =>
      add(c.info.id, { label: `${team.content}: ${team.team}`, weight: CONTENT_WEIGHT }),
    );
  }
  for (const c of input.owned.filter(isUnlocked)) {
    eventReasons(c, input.events, weights, now).forEach((r) => add(c.info.id, r));
  }

  for (const [id, goals] of Object.entries(input.goalPicks ?? {})) {
    goals.forEach((g) => add(id, { label: `Needed for ${g}`, weight: GOAL_WEIGHT }));
  }
  // Characters whose traits fit many unlock events and Dark Dimensions keep paying off.
  if (input.contentFilters?.length) {
    const traited = input.contentFilters
      .map((s) => ({ ...s, filters: s.filters.filter((f) => f.allTraits?.length || f.anyTraits?.length || f.anyCharacters?.length) }))
      .filter((s) => s.filters.length);
    for (const c of input.owned) {
      const fits = traited.filter((s) => s.filters.some((f) => matchesFilter(c, looseOf(f)))).length;
      if (fits >= 3) {
        add(c.info.id, { label: `Fits ${fits} unlock events and Dark Dimensions`, weight: Math.min(VERSATILITY_CAP, fits * VERSATILITY_STEP) });
      }
    }
  }

  const byId = new Map(input.owned.map((c) => [c.info.id, c]));
  return [...reasons]
    .filter(([id]) => byId.has(id))
    .map(([id, rs]) => ({ character: byId.get(id)!, reasons: rs, score: rs.reduce((s, r) => s + r.weight, 0) }))
    .sort((a, b) => b.score - a.score || (b.character.instance?.power ?? 0) - (a.character.instance?.power ?? 0));
}
