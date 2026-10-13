import type { StepKind } from '../planner/build';
import { readJson, writeJson } from '../auth/storage';

const KEY = 'msf.planHistory.v1';
/** Matches the sync history, so every remembered sync has the plan it showed. */
const KEEP = 3;
/** Steps from the top of the list worth remembering. */
const TOP = 40;

/** One step of the priority list as it stood after a sync. */
export interface PlannedStep {
  characterId: string;
  kind: StepKind;
  title: string;
  /** 1-based position in the list. */
  rank: number;
}

interface Entry {
  source: string;
  syncedAt: number;
  steps: PlannedStep[];
}

const read = (): Entry[] => (typeof localStorage !== 'undefined' && readJson<Entry[]>(localStorage, KEY)) || [];

/** Remembers the top of the priority list shown for a sync, replacing an earlier save for the same sync. */
export function savePlanned(source: string, syncedAt: number, steps: { characterId: string; kind: StepKind; title: string }[]) {
  const top = steps.slice(0, TOP).map((s, i) => ({ characterId: s.characterId, kind: s.kind, title: s.title, rank: i + 1 }));
  const rest = read().filter((e) => !(e.source === source && e.syncedAt === syncedAt));
  const next = [...rest, { source, syncedAt, steps: top }].sort((a, b) => a.syncedAt - b.syncedAt).slice(-KEEP);
  if (JSON.stringify(next) !== JSON.stringify(read())) writeJson(localStorage, KEY, next);
}

/** The priority list as it stood after a given sync, if it was ever shown. */
export function plannedAt(source: string, syncedAt: number): PlannedStep[] | undefined {
  return read().find((e) => e.source === source && e.syncedAt === syncedAt)?.steps;
}
