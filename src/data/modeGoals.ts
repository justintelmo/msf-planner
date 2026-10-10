import { useSyncExternalStore } from 'react';
import type { CharacterFilter, Requirements, Squads } from '../api/types';
import { readJson, writeJson } from '../auth/storage';
import { planRequirement, type Target } from '../planner/gaps';
import type { OwnedCharacter } from '../planner/requirements';
import { distinctRequirements, type UnlockSource } from '../planner/unlocks';
import type { Catalog, GoalReport, RaidSource } from './unlocks';

const KEY = 'msf.modeGoals.v1';

/**
 * Difficulty targets per game mode. Raid requirements come from the API; Battleworld
 * isn't in the API, so its thresholds are typed in from the game.
 */
export interface ModeGoals {
  /** Raid id → target difficulty (0 = normal, -1 = skip). Unset means the newest raid of each type at its top difficulty. */
  raids?: Record<string, number>;
  battleworld?: { difficulty: number; characters: number; target: Target };
}

// Battleworld starts at the alliance's difficulty 7; its thresholds come from the game screen.
let state: ModeGoals = (typeof localStorage !== 'undefined' ? readJson<ModeGoals>(localStorage, KEY) : null) ?? { battleworld: { difficulty: 7, characters: 15, target: {} } };
const listeners = new Set<() => void>();

export function useModeGoals(): ModeGoals {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function setModeGoals(next: ModeGoals) {
  state = next;
  writeJson(localStorage, KEY, next);
  listeners.forEach((l) => l());
}

const THRESHOLDS = ['level', 'activeYellow', 'activeRed', 'gearTier', 'iso8ClassLevel'] as const;

/** Thresholds from a difficulty requirement layered onto a room's trait filters. */
export function combineFilters(room: CharacterFilter[], difficulty: CharacterFilter[]): CharacterFilter[] {
  if (!difficulty.length) return room;
  if (!room.length) return difficulty;
  return room.flatMap((r) =>
    difficulty.map((d) => {
      const out: CharacterFilter = { ...d, ...r };
      for (const k of THRESHOLDS) {
        const v = Math.max(r[k] ?? 0, d[k] ?? 0);
        if (v) out[k] = v;
      }
      return out;
    }),
  );
}

/** A raid at one difficulty as a source of requirements: every room, with the difficulty's bar added. */
export function raidAt(raid: RaidSource, difficulty: number): UnlockSource {
  const diff: Requirements | undefined = difficulty > 0 ? raid.difficulties[String(difficulty)]?.requirements : undefined;
  const nodes = [
    ...(diff ? [{ label: 'Entry', requirements: diff, rewards: [] }] : []),
    ...raid.rooms.map((n) => ({
      ...n,
      requirements: n.requirements || diff
        ? {
            ...diff,
            ...n.requirements,
            anyCharacterFilters: combineFilters(n.requirements?.anyCharacterFilters ?? [], diff?.anyCharacterFilters ?? []),
          }
        : undefined,
    })),
  ];
  return { kind: 'Raid', id: raid.id, name: raid.name, subName: raid.subName, nodes, rewards: [] };
}

/**
 * Minimum power recommendations per Battleworld difficulty, from the in-game difficulty
 * select screen (2026-10-10). Diamonds sit above 7 red stars (activeRed 8 = 1 diamond);
 * ISO-8 tier 3 level 5 is class level 15.
 */
export const BATTLEWORLD_PRESETS: Record<number, Target> = {
  6: { level: 105, gearTier: 20, activeYellow: 7, activeRed: 10, iso8ClassLevel: 15 },
  7: { level: 108, gearTier: 20, activeYellow: 7, activeRed: 10, iso8ClassLevel: 15 },
  8: { level: 110, gearTier: 20, activeYellow: 7, activeRed: 11, iso8ClassLevel: 15 },
  9: { level: 110, gearTier: 20, activeYellow: 7, activeRed: 12, iso8ClassLevel: 15 },
};

/** Typed-in thresholds win; otherwise the difficulty's known recommendation. */
export function battleworldTarget(bw: NonNullable<ModeGoals['battleworld']>): Target {
  return Object.values(bw.target).some(Boolean) ? bw.target : (BATTLEWORLD_PRESETS[bw.difficulty] ?? {});
}

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };
function fromRoman(r: string): number {
  let total = 0;
  for (let i = 0; i < r.length; i++) {
    const v = ROMAN[r[i]] ?? 0;
    total += v < (ROMAN[r[i + 1]] ?? 0) ? -v : v;
  }
  return total;
}

const TIER_SUFFIX = /\s+(?:([IVXL]+)|(\d+))$/;

/** The raid's number within its type: "Orchis III" → 3, raid_x_02 → 2, otherwise 1. */
export function raidTier(raid: RaidSource): number {
  const m = raid.name.trim().match(TIER_SUFFIX);
  if (m) return m[1] ? fromRoman(m[1]) : Number(m[2]);
  const id = raid.id.match(/_(\d+)$/);
  return id ? Number(id[1]) : 1;
}

/** Raid type: the API's raid group when known, else the name without its number ("Trepidation Raids" = "Trepidation Raid"). */
export function raidFamily(raid: RaidSource, catalog: Catalog | null): { key: string; name: string } {
  const base = raid.name.trim().replace(TIER_SUFFIX, '');
  const fallback = base.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
  if (raid.groupId) return { key: raid.groupId, name: catalog?.raidGroups?.[raid.groupId] ?? base };
  return { key: fallback, name: base };
}

/** Endgame raids: the highest-numbered raid of each type. Older ones are skipped unless chosen. */
export function isLatestOfType(raid: RaidSource, catalog: Catalog | null): boolean {
  const key = raidFamily(raid, catalog).key;
  const siblings = (catalog?.raids ?? []).filter((r) => raidFamily(r, catalog).key === key);
  return raidTier(raid) >= Math.max(...siblings.map(raidTier));
}

export function raidTarget(goals: ModeGoals, raid: RaidSource, catalog: Catalog | null = null): number {
  const chosen = goals.raids?.[raid.id];
  if (chosen !== undefined) return chosen;
  return isLatestOfType(raid, catalog) ? (raid.maxDifficulty ?? 0) : -1;
}

export function difficultyName(raid: RaidSource, difficulty: number): string {
  return difficulty > 0 ? raid.difficulties[String(difficulty)]?.name || `Difficulty ${difficulty}` : 'Normal';
}

/** Mode targets as goal reports, so the Plan treats them like unlock goals. */
export function modeReports(goals: ModeGoals, catalog: Catalog | null, roster: OwnedCharacter[], squads: Squads): GoalReport[] {
  const reports: GoalReport[] = [];
  for (const raid of catalog?.raids ?? []) {
    const difficulty = raidTarget(goals, raid, catalog);
    if (difficulty < 0) continue;
    const id = raid.id;
    const source = raidAt(raid, difficulty);
    reports.push({
      characterId: `raid:${id}`,
      label: `${raid.name} (${difficultyName(raid, difficulty)})`,
      group: `Raids: ${raidFamily(raid, catalog).name}`,
      sources: [{ source, checks: distinctRequirements(source).map((g) => ({ ...g, plan: planRequirement(roster, g.requirements) })) }],
    });
  }
  const bw = goals.battleworld;
  const bwTarget = bw ? battleworldTarget(bw) : {};
  if (bw && Object.values(bwTarget).some(Boolean)) {
    // Saved Battleworld squads have to meet the bar; the rest of the count is filled from the roster.
    const saved = [...new Set((squads.battleworld ?? []).flat().filter(Boolean))];
    const requirements: Requirements = {
      minCharacters: bw.characters,
      anyCharacterFilters: [bwTarget as CharacterFilter],
      specificCharacters: saved.length ? saved : undefined,
      description: `Battleworld difficulty ${bw.difficulty}`,
    };
    const source: UnlockSource = {
      kind: 'Battleworld', id: 'battleworld', name: `Battleworld difficulty ${bw.difficulty}`,
      nodes: [{ label: 'Alliance difficulty', requirements, rewards: [] }], rewards: [],
    };
    reports.push({
      characterId: 'battleworld',
      label: `Battleworld (difficulty ${bw.difficulty})`,
      sources: [{ source, checks: [{ labels: ['Alliance difficulty'], requirements, plan: planRequirement(roster, requirements) }] }],
    });
  }
  return reports;
}

/** Raids worth reading in full: the ones the current targets would plan for. */
export function wantRaidDetail(raid: RaidSource, catalog: Catalog): boolean {
  return raidTarget(state, raid, catalog) >= 0;
}
