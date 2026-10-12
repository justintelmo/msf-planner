import { useEffect, useSyncExternalStore } from 'react';
import { msfApi } from '../api/client';
import { readJson, writeJson } from '../auth/storage';
import { extractKitTags, type KitTagHit } from '../planner/kitTags';

const KEY = 'msf.kittags.v1';
/** Kits change with reworks; read each one again after this long. */
const STALE_MS = 14 * 24 * 3600 * 1000;

interface State {
  tags: Record<string, KitTagHit[]>;
  readAt: Record<string, number>;
}

let state: State = readJson<State>(localStorage, KEY) ?? { tags: {}, readAt: {} };
const listeners = new Set<() => void>();
let loading = 0;

function emit() {
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Kit tags per character id (only the tags, not the text of whole kits, so it fits in storage). */
export function useKitTags(): Record<string, KitTagHit[]> {
  return useSyncExternalStore(subscribe, () => state.tags);
}

/** How many kits are still being read. */
export function useKitsLoading(): number {
  return useSyncExternalStore(subscribe, () => loading);
}

const tried = new Set<string>();

/** Reads the ability text of any of these characters not read lately. */
export function useLoadKits(ids: string[], live: boolean) {
  const now = Date.now();
  const missing = ids.filter((id) => !tried.has(id) && (!state.tags[id] || now - (state.readAt[id] ?? 0) > STALE_MS)).join(',');
  useEffect(() => {
    if (!live || !missing) return;
    const todo = missing.split(',').filter((id) => !tried.has(id));
    todo.forEach((id) => tried.add(id));
    loading += todo.length;
    emit();
    for (const id of todo) {
      // The client paces requests, so these queue up rather than flood the API.
      msfApi.abilityKit(id)
        .then((kit) => {
          if (!kit) return;
          state = { tags: { ...state.tags, [id]: extractKitTags(kit) }, readAt: { ...state.readAt, [id]: Date.now() } };
          writeJson(localStorage, KEY, state);
        })
        .catch(() => undefined)
        .finally(() => {
          loading--;
          emit();
        });
    }
  }, [missing, live]);
}
