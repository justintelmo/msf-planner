import { useSyncExternalStore } from 'react';
import { msfApi } from '../api/client';
import { idOf, type CharacterInfo, type Requirements } from '../api/types';
import { readJson, writeJson } from '../auth/storage';
import { mergeTargets, planRequirement, type RequirementPlan, type Target } from '../planner/gaps';
import type { OwnedCharacter } from '../planner/requirements';
import {
  distinctRequirements, fromDarkDimension, fromEpisodic, type ShardIndex, type UnlockSource,
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

export interface Catalog {
  loadedAt: number;
  sources: UnlockSource[];
  errors: string[];
}

interface State {
  catalog: Catalog | null;
  progress: string | null;
  goals: string[];
}

let state: State = {
  catalog: readJson<Catalog>(localStorage, CATALOG_KEY),
  progress: null,
  goals: readJson<string[]>(localStorage, GOALS_KEY) ?? [],
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
  const catalog = { loadedAt: Date.now(), sources, errors };
  writeJson(localStorage, CATALOG_KEY, catalog);
  set({ catalog, progress: null });
}

export interface RequirementCheck {
  labels: string[];
  requirements: Requirements;
  plan: RequirementPlan;
}

export interface GoalReport {
  characterId: string;
  sources: { source: UnlockSource; checks: RequirementCheck[] }[];
}

/** Campaign-style sources only need the nodes that drop the shards; events need every node. */
const NODE_SCOPED = new Set(['Campaign', 'Event campaign']);

export function goalReports(goals: string[], catalog: Catalog | null, roster: OwnedCharacter[]): GoalReport[] {
  return goals.map((goal) => {
    const sources = (catalog?.sources ?? []).filter((s) => s.rewards.includes(goal));
    return {
      characterId: goal,
      sources: sources.map((source) => {
        const scoped = NODE_SCOPED.has(source.kind)
          ? { ...source, nodes: source.nodes.filter((n) => n.rewards.includes(goal)) }
          : source;
        return {
          source,
          checks: distinctRequirements(scoped).map((g) => ({ ...g, plan: planRequirement(roster, g.requirements) })),
        };
      }),
    };
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
          const why = `For ${nameOf(r.characterId)}`;
          out[id] = {
            target: prev ? mergeTargets(prev.target, pick.gap) : pick.gap,
            why: prev && !prev.why.includes(nameOf(r.characterId)) ? `${prev.why}, ${nameOf(r.characterId)}` : prev?.why ?? why,
          };
        }
      }
    }
  }
  return out;
}
