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
  /** Raid id → target difficulty (0 = normal, -1 = skip). Unset means every raid at its top difficulty. */
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

export function raidTarget(goals: ModeGoals, raid: RaidSource): number {
  return goals.raids?.[raid.id] ?? raid.maxDifficulty ?? 0;
}

export function difficultyName(raid: RaidSource, difficulty: number): string {
  return difficulty > 0 ? raid.difficulties[String(difficulty)]?.name || `Difficulty ${difficulty}` : 'Normal';
}

/** Mode targets as goal reports, so the Plan treats them like unlock goals. */
export function modeReports(goals: ModeGoals, catalog: Catalog | null, roster: OwnedCharacter[], squads: Squads): GoalReport[] {
  const reports: GoalReport[] = [];
  for (const raid of catalog?.raids ?? []) {
    const difficulty = raidTarget(goals, raid);
    if (difficulty < 0) continue;
    const id = raid.id;
    const source = raidAt(raid, difficulty);
    reports.push({
      characterId: `raid:${id}`,
      label: `${raid.name} (${difficultyName(raid, difficulty)})`,
      sources: [{ source, checks: distinctRequirements(source).map((g) => ({ ...g, plan: planRequirement(roster, g.requirements) })) }],
    });
  }
  const bw = goals.battleworld;
  if (bw && Object.values(bw.target).some(Boolean)) {
    // Saved Battleworld squads have to meet the bar; the rest of the count is filled from the roster.
    const saved = [...new Set((squads.battleworld ?? []).flat().filter(Boolean))];
    const requirements: Requirements = {
      minCharacters: bw.characters,
      anyCharacterFilters: [bw.target as CharacterFilter],
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
