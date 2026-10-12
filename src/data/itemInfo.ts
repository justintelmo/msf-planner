import { useEffect, useSyncExternalStore } from 'react';
import { msfApi, type ItemInfo } from '../api/client';
import { readJson, writeJson } from '../auth/storage';

const KEY = 'msf.items.v1';
/** Item names and icons rarely change; the inventory is read again after this long. */
const STALE_MS = 7 * 24 * 3600 * 1000;

interface State {
  items: Record<string, ItemInfo>;
  /** When the inventory's item details were last read. */
  readAt?: number;
}

let state: State = readJson<State>(localStorage, KEY) ?? { items: {} };
const listeners = new Set<() => void>();
const save = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  writeJson(localStorage, KEY, state);
  listeners.forEach((l) => l());
};

export function useItemInfo(): Record<string, ItemInfo> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state.items,
  );
}

let reading = false;
const tried = new Set<string>();

/**
 * Fills in names and icons: the whole inventory in one pass (refreshed weekly), then any other
 * ids asked for one at a time, e.g. a gear piece you don't own yet.
 */
export function useLoadItemInfo(ids: string[], live: boolean) {
  const missing = ids.filter((id) => !state.items[id] && !tried.has(id)).slice(0, 30).join(',');
  useEffect(() => {
    if (!live || reading) return;
    const stale = !state.readAt || Date.now() - state.readAt > STALE_MS;
    if (!stale && !missing) return;
    reading = true;
    (async () => {
      try {
        if (stale) {
          const all = await msfApi.inventoryItems();
          save({ items: { ...state.items, ...Object.fromEntries(all.map((i) => [i.id, i])) }, readAt: Date.now() });
        }
        const todo = missing.split(',').filter((id) => id && !state.items[id]);
        todo.forEach((id) => tried.add(id));
        const found = await Promise.all(todo.map((id) => msfApi.itemInfo(id).catch(() => undefined)));
        const add = Object.fromEntries(found.filter((i): i is ItemInfo => !!i).map((i) => [i.id, i]));
        if (Object.keys(add).length) save({ items: { ...state.items, ...add } });
      } finally {
        reading = false;
      }
    })();
  }, [missing, live]);
}
