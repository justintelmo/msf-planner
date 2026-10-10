import { idOf, type CharacterInstance, type EventInfo } from '../api/types';
import { readJson, writeJson } from '../auth/storage';
import type { Snapshot } from './store';

const KEY = 'msf.syncHistory.v1';
/** Enough to compare the latest sync with the one before it, without filling localStorage. */
const KEEP = 3;

/** A compact copy of what a sync saw, kept so the next sync can be compared against it. */
export interface SyncPrint {
  syncedAt: number;
  source: Snapshot['source'];
  roster: CharacterInstance[];
  /** Item id → quantity. */
  inventory: Record<string, number>;
  events: EventInfo[];
}

const ROSTER_FIELDS = [
  'id', 'level', 'activeYellow', 'activeRed', 'gearTier', 'basic', 'special', 'ultimate', 'passive', 'power', 'gearSlots', 'iso8',
] as const;

export function printOf(s: Snapshot): SyncPrint {
  const inventory: Record<string, number> = {};
  for (const { item, quantity } of s.inventory) {
    const id = idOf(item);
    if (id) inventory[id] = (inventory[id] ?? 0) + (quantity ?? 0);
  }
  return {
    syncedAt: s.syncedAt,
    source: s.source,
    roster: s.roster.map((r) => Object.fromEntries(ROSTER_FIELDS.filter((k) => r[k] !== undefined).map((k) => [k, r[k]])) as unknown as CharacterInstance),
    inventory,
    events: s.events.map(({ id, type, name, subName, startTime, endTime, blitz, tower }) => ({ id, type, name, subName, startTime, endTime, blitz, tower })),
  };
}

const same = (a: SyncPrint, b: SyncPrint) =>
  JSON.stringify([a.roster, a.inventory]) === JSON.stringify([b.roster, b.inventory]);

export function readHistory(): SyncPrint[] {
  return (typeof localStorage !== 'undefined' && readJson<SyncPrint[]>(localStorage, KEY)) || [];
}

/**
 * Records a sync. A sync that changed nothing only refreshes the last entry's time,
 * so syncing twice in a row doesn't wipe out the comparison with the sync before.
 */
export function recordSync(s: Snapshot): SyncPrint[] {
  const print = printOf(s);
  const history = readHistory().filter((h) => h.source === s.source);
  const last = history[history.length - 1];
  if (last && same(last, print)) history[history.length - 1] = print;
  else history.push(print);
  const kept = history.slice(-KEEP);
  writeJson(localStorage, KEY, kept);
  return kept;
}
