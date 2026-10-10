import { useSyncExternalStore } from 'react';
import { readJson, writeJson } from '../auth/storage';

const KEY = 'msf.wallet.v1';
/** Where gold lived before the wallet; read once so nothing typed earlier is lost. */
const OLD_GOLD = 'msf.plan.gold';
const OLD_INCOME = 'msf.plan.goldPerDay';

/** Amounts the API can't report, typed in from the game. */
export interface Wallet {
  /** Item id → amount, e.g. SC (gold), POWER_CORES, ISO8-TIER-2-A-CURRENCY. */
  amounts: Record<string, number>;
  goldPerDay?: number;
  updatedAt?: number;
}

export const GOLD_ID = 'SC';
export const POWER_CORES_ID = 'POWER_CORES';

/** "2.5M", "36.8k", "1,200,000" → a number; blank → undefined. */
export function parseAmount(text: string): number | undefined {
  const m = text.trim().replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([kmb])?$/i);
  if (!m) return undefined;
  const scale = { k: 1e3, m: 1e6, b: 1e9 }[m[2]?.toLowerCase() as 'k' | 'm' | 'b'] ?? 1;
  return Math.round(Number(m[1]) * scale);
}

function initial(): Wallet {
  if (typeof localStorage === 'undefined') return { amounts: {} };
  const saved = readJson<Wallet>(localStorage, KEY);
  if (saved) return saved;
  const gold = parseAmount(readJson<string>(localStorage, OLD_GOLD) ?? '');
  const income = parseAmount(readJson<string>(localStorage, OLD_INCOME) ?? '');
  return { amounts: gold === undefined ? {} : { [GOLD_ID]: gold }, goldPerDay: income };
}

let state: Wallet = initial();
const listeners = new Set<() => void>();

export function useWallet(): Wallet {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function setAmount(id: string, value: number | undefined) {
  const amounts = { ...state.amounts };
  if (value === undefined) delete amounts[id];
  else amounts[id] = value;
  save({ ...state, amounts });
}

export function setGoldPerDay(value: number | undefined) {
  save({ ...state, goldPerDay: value });
}

function save(next: Wallet) {
  state = { ...next, updatedAt: Date.now() };
  writeJson(localStorage, KEY, state);
  listeners.forEach((l) => l());
}
