import { useEffect, useSyncExternalStore } from 'react';
import { msfApi } from '../api/client';
import type { CharacterInfo, CharacterInstance, EventInfo, ItemQuantity, PlayerCard } from '../api/types';
import { isLoggedIn, onAuthChange } from '../auth/auth';
import { readJson, writeJson } from '../auth/storage';
import { SAMPLE_CARD, SAMPLE_CHARACTERS, SAMPLE_EVENTS, SAMPLE_INVENTORY, SAMPLE_ROSTER } from './sample';

export interface Snapshot {
  source: 'live' | 'demo';
  syncedAt: number;
  card: PlayerCard;
  characters: CharacterInfo[];
  roster: CharacterInstance[];
  inventory: ItemQuantity[];
  events: EventInfo[];
}

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
      };
    } else {
      const [card, characters, roster, inventory, events] = await Promise.all([
        msfApi.card(), msfApi.characters(), msfApi.roster(), msfApi.inventory(), msfApi.events(),
      ]);
      snapshot = { source: 'live', syncedAt: Date.now(), card, characters, roster, inventory, events };
    }
    writeJson(localStorage, SNAPSHOT_KEY, snapshot);
    set({ snapshot, loading: false });
  } catch (e) {
    set({ loading: false, error: e instanceof Error ? e.message : String(e) });
  }
}

/** Loads data once when a mode is active but nothing is cached yet. */
export function useAutoSync() {
  const { mode, snapshot } = useStore();
  useEffect(() => {
    if (mode && (!snapshot || snapshot.source !== mode)) void sync();
  }, [mode, snapshot]);
}
