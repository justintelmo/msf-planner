import { useEffect, useSyncExternalStore } from 'react';
import { msfApi } from '../api/client';
import type { CharacterInfo, CharacterInstance, EventInfo, ItemQuantity, PlayerCard, Squads, UpgradeTables } from '../api/types';
import { isLoggedIn, onAuthChange } from '../auth/auth';
import { readJson, writeJson } from '../auth/storage';
import { readHistory, recordSync } from './syncHistory';
import { SAMPLE_CARD, SAMPLE_CHARACTERS, SAMPLE_EVENTS, SAMPLE_INVENTORY, SAMPLE_ROSTER, SAMPLE_SQUADS, SAMPLE_UPGRADES } from './sample';

export interface Snapshot {
  source: 'live' | 'demo';
  syncedAt: number;
  card: PlayerCard;
  characters: CharacterInfo[];
  roster: CharacterInstance[];
  inventory: ItemQuantity[];
  events: EventInfo[];
  /** Missing in snapshots cached before the build planner existed, or when the fetch failed. */
  upgrades?: UpgradeTables;
  squads?: Squads;
  /** Why optional planner data is missing, when a fetch failed. */
  plannerErrors?: string[];
  /** Bumped when sync starts reading something new, so older caches refresh once. */
  version?: number;
}

const SNAPSHOT_VERSION = 4;

export type Mode = 'live' | 'demo' | null;

interface State {
  mode: Mode;
  snapshot: Snapshot | null;
  loading: boolean;
  error: string | null;
}

const SNAPSHOT_KEY = 'msf.snapshot';
const DEMO_KEY = 'msf.demo';

let state: State = {
  mode: isLoggedIn() ? 'live' : readJson<boolean>(localStorage, DEMO_KEY) ? 'demo' : null,
  snapshot: readJson<Snapshot>(localStorage, SNAPSHOT_KEY),
  loading: false,
  error: null,
};
const listeners = new Set<() => void>();

// The first time this runs with a cached snapshot, that snapshot becomes the baseline the next sync is compared to.
if (state.snapshot && !readHistory().length) recordSync(state.snapshot);

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

onAuthChange(() => {
  if (isLoggedIn()) set({ mode: 'live' });
  else if (state.mode === 'live') set({ mode: null, snapshot: null });
});

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function startDemo() {
  writeJson(localStorage, DEMO_KEY, true);
  set({ mode: 'demo', snapshot: null });
  void sync();
}

export function leave() {
  writeJson(localStorage, DEMO_KEY, null);
  writeJson(localStorage, SNAPSHOT_KEY, null);
  set({ mode: null, snapshot: null, error: null });
}

export async function sync(): Promise<void> {
  if (!state.mode || state.loading) return;
  set({ loading: true, error: null });
  try {
    let snapshot: Snapshot;
    if (state.mode === 'demo') {
      snapshot = {
        source: 'demo', syncedAt: Date.now(), card: SAMPLE_CARD, characters: SAMPLE_CHARACTERS,
        roster: SAMPLE_ROSTER, inventory: SAMPLE_INVENTORY, events: SAMPLE_EVENTS,
        upgrades: SAMPLE_UPGRADES, squads: SAMPLE_SQUADS,
      };
    } else {
      // Planner data is optional: a failure there shouldn't block the roster from loading.
      const plannerErrors: string[] = [];
      const optional = <T>(name: string, p: Promise<T>) =>
        p.catch((e) => {
          plannerErrors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
          return undefined;
        });
      const [card, characters, roster, inventory, events, upgrades, squads] = await Promise.all([
        msfApi.card(), msfApi.characters(), msfApi.roster(), msfApi.inventory(), msfApi.events(),
        optional('upgrade costs', msfApi.upgrades()), optional('saved squads', msfApi.squads()),
      ]);
      snapshot = {
        source: 'live', syncedAt: Date.now(), card, characters, roster, inventory, events, upgrades, squads, plannerErrors,
        version: SNAPSHOT_VERSION,
      };
    }
    writeJson(localStorage, SNAPSHOT_KEY, snapshot);
    recordSync(snapshot);
    set({ snapshot, loading: false });
  } catch (e) {
    set({ loading: false, error: e instanceof Error ? e.message : String(e) });
  }
}

let refreshedOldSnapshot = false;

/** Cached by an older sync (before squads, XP tables, or per-type inventory). */
const isStale = (s: Snapshot) => (s.version ?? 0) < SNAPSHOT_VERSION;

/**
 * Loads data once when a mode is active but nothing is cached yet, and refreshes
 * once per visit when the cache predates the planner (no squads or upgrade costs).
 */
export function useAutoSync() {
  const { mode, snapshot } = useStore();
  useEffect(() => {
    if (mode && (!snapshot || snapshot.source !== mode)) void sync();
    else if (mode === 'live' && snapshot && isStale(snapshot) && !refreshedOldSnapshot) {
      refreshedOldSnapshot = true;
      void sync();
    }
  }, [mode, snapshot]);
}
