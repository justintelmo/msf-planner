import { useSyncExternalStore } from 'react';
import { msfApi } from '../api/client';
import { idOf, type CharacterFilter, type CharacterInfo, type RaidDifficulty, type Requirements } from '../api/types';
import { readJson, writeJson } from '../auth/storage';
import { plainName } from '../planner/export';
import { mergeTargets, planRequirement, type RequirementPlan, type Target } from '../planner/gaps';
import type { OwnedCharacter } from '../planner/requirements';
import { wantRaidDetail } from './modeGoals';
import {
  distinctRequirements, fromDarkDimension, fromEpisodic, prerequisiteIds, type ShardIndex, type UnlockSource,
} from '../planner/unlocks';

const CATALOG_KEY = 'msf.unlocks.v1';
const GOALS_KEY = 'msf.goals';

/** Episodic types whose nodes can hand out character shards. */
export const EPISODIC_TYPES: Record<string, string> = {
  unlockEvent: 'Unlock event',
  otherEvent: 'Event',
  eventCampaign: 'Event campaign',
  campaign: 'Campaign',
  challenge: 'Challenge',
  flashEvent: 'Flash event',
};

export interface RaidSource {
  id: string;
  name: string;
  groupId?: string;
  subName?: string;
  teams?: number;
  maxDifficulty?: number;
  difficulties: Record<string, RaidDifficulty>;
  rooms: UnlockSource['nodes'];
}

export interface Catalog {
  loadedAt: number;
  sources: UnlockSource[];
  /** Missing in catalogs loaded before raids were read. */
  raids?: RaidSource[];
  /** Raid group id → name. */
  raidGroups?: Record<string, string>;
  errors: string[];
}

/** Legendaries the catch-up plan is built around. */
export const DEFAULT_GOALS = ['Odin', 'BlueMarvel', 'Xavier'];

interface State {
  catalog: Catalog | null;
  progress: string | null;
  goals: string[];
}

let state: State = {
  catalog: readJson<Catalog>(localStorage, CATALOG_KEY),
  progress: null,
  // Catch-up targets until goals are saved on the Goals tab.
  goals: readJson<string[]>(localStorage, GOALS_KEY) ?? DEFAULT_GOALS,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export function useUnlocks(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function setGoals(goals: string[]) {
  writeJson(localStorage, GOALS_KEY, goals);
  set({ goals });
}

function shardIndex(characters: CharacterInfo[]): ShardIndex {
  const m: ShardIndex = new Map();
  for (const c of characters) {
    m.set(idOf(c.starItems?.[0]) ?? `SHARD_${c.id.toUpperCase()}`, c.id);
    m.set(`SHARD_${c.id.toUpperCase()}`, c.id);
  }
  return m;
}

/** Reads every Dark Dimension and episodic from the API and keeps what unlocks need. */
export async function loadCatalog(characters: CharacterInfo[]): Promise<void> {
  if (state.progress) return;
  const shards = shardIndex(characters);
  const sources: UnlockSource[] = [];
  const errors: string[] = [];
  const note = (what: string, e: unknown) => errors.push(`${what}: ${e instanceof Error ? e.message : String(e)}`);

  set({ progress: 'Reading Dark Dimensions…' });
  const dds = await msfApi.darkDimensions().catch((e) => (note('Dark Dimensions', e), []));
  for (const dd of dds) {
    const full = await msfApi.darkDimensionUnlocks(dd.id).catch((e) => (note(dd.name ?? dd.id, e), undefined));
    if (full) sources.push(fromDarkDimension(full, shards));
  }
  set({ progress: 'Reading raids…' });
  const raids: RaidSource[] = [];
  const raidList = await msfApi.raids().catch((e) => (note('Raids', e), []));
  const groups = await msfApi.raidGroups().catch(() => []);
  const raidGroups = Object.fromEntries(groups.map((g) => [g.id, plainName(g.name ?? g.id)]));
  // Rooms and difficulties are only read for raids that get planned: the newest of each
  // type, plus any the player picked. The rest keep their name so they can be picked later.
  const listed: RaidSource[] = raidList.map((r) => ({
    id: r.id, name: plainName(r.name ?? r.id), subName: plainName(r.subName), groupId: r.groupId,
    teams: r.teams, maxDifficulty: r.maxDifficulty, difficulties: {}, rooms: [],
  }));
  const shell: Catalog = { loadedAt: 0, sources: [], raids: listed, raidGroups, errors: [] };
  const wanted = raidList.filter((_, i) => wantRaidDetail(listed[i], shell));
  const detailed = new Set(wanted.map((r) => r.id));
  raids.push(...listed.filter((r) => !detailed.has(r.id)));
  for (let i = 0; i < wanted.length; i += 2) {
    set({ progress: `Reading raids (${Math.min(i + 2, wanted.length)} of ${wanted.length})…` });
    const batch = await Promise.all(
      wanted.slice(i, i + 2).map((r) => msfApi.raid(r.id, r.maxDifficulty).catch((e) => (note(r.name ?? r.id, e), undefined))),
    );
    for (const r of batch) {
      if (!r) continue;
      const asDd = fromDarkDimension(r, shards);
      raids.push({
        id: r.id, name: asDd.name, subName: asDd.subName, groupId: r.groupId ?? raidList.find((x) => x.id === r.id)?.groupId, teams: r.teams, maxDifficulty: r.maxDifficulty,
        difficulties: r.difficulties ?? {}, rooms: asDd.nodes,
      });
    }
  }
  for (const [type, label] of Object.entries(EPISODIC_TYPES)) {
    set({ progress: `Reading ${label.toLowerCase()}s…` });
    const list = await msfApi.episodics(type).catch((e) => (note(label, e), []));
    for (let i = 0; i < list.length; i += 4) {
      set({ progress: `Reading ${label.toLowerCase()}s (${Math.min(i + 4, list.length)} of ${list.length})…` });
      const batch = await Promise.all(
        list.slice(i, i + 4).map((ep) => msfApi.episodic(type, ep.id).catch((e) => (note(ep.name ?? ep.id, e), undefined))),
      );
      batch.forEach((ep) => ep && sources.push(fromEpisodic(label, ep, shards)));
    }
  }
  const catalog = { loadedAt: Date.now(), sources, raids, raidGroups, errors };
  writeJson(localStorage, CATALOG_KEY, catalog);
  set({ catalog, progress: null });
}

export interface RequirementCheck {
  labels: string[];
  requirements: Requirements;
  plan: RequirementPlan;
}

export interface GoalSourceReport {
  source: UnlockSource;
  checks: RequirementCheck[];
  /** Set when this source only matters because it opens another one. */
  unlocks?: string;
}

export interface GoalReport {
  characterId: string;
  /** Display name when the goal isn't a character, e.g. a raid difficulty. */
  label?: string;
  /** Reports sharing a group (e.g. one raid type) are shown together. */
  group?: string;
  sources: GoalSourceReport[];
}

/** Campaign-style sources only need the nodes that drop the shards; events need every node. */
const NODE_SCOPED = new Set(['Campaign', 'Event campaign']);
const ALWAYS = new Set(['Entry']);

export function goalReports(goals: string[], catalog: Catalog | null, roster: OwnedCharacter[]): GoalReport[] {
  const all = catalog?.sources ?? [];
  const byId = new Map(all.map((s) => [s.id, s]));
  const check = (source: UnlockSource) =>
    distinctRequirements(source).map((g) => ({ ...g, plan: planRequirement(roster, g.requirements) }));

  return goals.map((goal) => {
    const sources: GoalSourceReport[] = [];
    const seen = new Set<string>();
    // Prerequisites come before what they open, so walk them first.
    const addPrereqs = (s: UnlockSource) => {
      for (const id of prerequisiteIds(s)) {
        const pre = byId.get(id);
        if (!pre || seen.has(id)) continue;
        seen.add(id);
        addPrereqs(pre);
        sources.push({ source: pre, checks: check(pre), unlocks: s.name });
      }
    };
    for (const source of all.filter((s) => s.rewards.includes(goal))) {
      if (seen.has(source.id)) continue;
      seen.add(source.id);
      const scoped = NODE_SCOPED.has(source.kind)
        ? { ...source, nodes: source.nodes.filter((n) => n.rewards.includes(goal) || ALWAYS.has(n.label) || n.label.startsWith('Chapter ')) }
        : source;
      addPrereqs(source);
      sources.push({ source, checks: check(scoped) });
    }
    return { characterId: goal, sources };
  });
}

/** Per-character thresholds across all goals, in goal order, with the goals they serve. */
export function goalTargets(reports: GoalReport[], nameOf: (id: string) => string): Record<string, { target: Target; why: string }> {
  const out: Record<string, { target: Target; why: string }> = {};
  for (const r of reports) {
    for (const { checks } of r.sources) {
      for (const { plan } of checks) {
        for (const pick of plan.picks) {
          if (!Object.keys(pick.gap).length) continue;
          const id = pick.character.info.id;
          const prev = out[id];
          const why = `For ${(r.label ?? nameOf(r.characterId))}`;
          out[id] = {
            target: prev ? mergeTargets(prev.target, pick.gap) : pick.gap,
            why: prev && !prev.why.includes((r.label ?? nameOf(r.characterId))) ? `${prev.why}, ${(r.label ?? nameOf(r.characterId))}` : prev?.why ?? why,
          };
        }
      }
    }
  }
  return out;
}

/** Character filters per unlock source, for scoring how widely a character's traits fit. */
export function catalogFilters(catalog: Catalog | null): { name: string; filters: CharacterFilter[] }[] {
  return (catalog?.sources ?? []).map((s) => ({
    name: s.name,
    filters: s.nodes.flatMap((n) => n.requirements?.anyCharacterFilters ?? []),
  }));
}

/** Goal names each character is picked for, from the requirement plans. */
export function goalPicks(reports: GoalReport[], nameOf: (id: string) => string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of reports) {
    const ids = new Set(r.sources.flatMap((s) => s.checks.flatMap((c) => c.plan.picks.map((p) => p.character.info.id))));
    ids.forEach((id) => (out[id] = [...(out[id] ?? []), (r.label ?? nameOf(r.characterId))]));
  }
  return out;
}
