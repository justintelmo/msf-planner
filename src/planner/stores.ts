import { idOf, type CharacterInfo, type Cost, type ItemQuantity } from '../api/types';
import type { ShardOffer, Stores } from '../data/stores';

/** Inventory id for a typed-in store currency. */
export const currencyItem = (id: string) => `STORE_CURRENCY_${id}`;

/** The shard item a character's stars use. */
export const shardOf = (info: CharacterInfo) => idOf(info.starItems?.[0]) ?? `SHARD_${info.id.toUpperCase()}`;

/** Store currencies on hand, as inventory items the planner can spend. */
export function storeInventory(stores: Stores): ItemQuantity[] {
  return stores.currencies.filter((c) => c.have > 0).map((c) => ({ item: currencyItem(c.id), quantity: c.have }));
}

/**
 * Shards as something that can be "crafted" from store currency: one shard costs price ÷ shards
 * of the currency, using the cheapest offer per character. The planner then buys shards with
 * currency on hand when a star step is short.
 */
export function storeRecipes(stores: Stores, characters: CharacterInfo[]): Record<string, Cost> {
  const byId = new Map(characters.map((c) => [c.id, c]));
  const best = new Map<string, ShardOffer>();
  for (const o of stores.offers) {
    if (!(o.price > 0 && o.shards > 0) || !byId.has(o.characterId)) continue;
    const prev = best.get(o.characterId);
    if (!prev || o.price / o.shards < prev.price / prev.shards) best.set(o.characterId, o);
  }
  return Object.fromEntries(
    [...best].map(([cid, o]) => [shardOf(byId.get(cid)!), [{ item: currencyItem(o.currencyId), quantity: o.price / o.shards }]]),
  );
}
