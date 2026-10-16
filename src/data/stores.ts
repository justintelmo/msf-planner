import { useSyncExternalStore } from 'react';
import { readJson, writeJson } from '../auth/storage';

const KEY = 'msf.stores.v1';

/** A store currency the API doesn't report, e.g. the current Chapter Store currency. */
export interface StoreCurrency {
  id: string;
  name: string;
  have: number;
  /** Rough income per day, for estimating when shards can be bought. */
  perDay?: number;
}

/** What a store sells for a character: shards, or red stars (one promotion each). */
export type OfferKind = 'shards' | 'redStar';

/** Character shards or red stars a store sells for one of those currencies. */
export interface ShardOffer {
  id: string;
  characterId: string;
  currencyId: string;
  /** Shards when omitted, from offers saved before red stars. */
  kind?: OfferKind;
  /** Currency per purchase. */
  price: number;
  /** Shards (or red stars) per purchase. */
  shards: number;
  /** Purchases allowed per day, if the store limits it. */
  perDay?: number;
}

export interface Stores {
  currencies: StoreCurrency[];
  offers: ShardOffer[];
}

let state: Stores = (typeof localStorage !== 'undefined' && readJson<Stores>(localStorage, KEY)) || { currencies: [], offers: [] };
const listeners = new Set<() => void>();

export function useStores(): Stores {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function saveStores(next: Stores) {
  state = next;
  writeJson(localStorage, KEY, state);
  listeners.forEach((l) => l());
}

export const newId = () => Math.random().toString(36).slice(2, 9);
