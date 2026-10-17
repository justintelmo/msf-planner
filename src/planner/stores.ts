import { idOf, type CharacterInfo, type Cost, type ItemQuantity } from '../api/types';
import { DEFAULT_BUYS_PER_DAY, type ShardOffer, type Stores } from '../data/stores';

/** Inventory id for a typed-in store currency. */
export const currencyItem = (id: string) => `STORE_CURRENCY_${id}`;

/** Inventory id for a red star bought from a store; one promotes the character one red star. */
export const redStarItem = (characterId: string) => `STORE_RED_STAR_${characterId}`;

/** Characters a store sells red stars for. */
export function redStarOffers(stores: Stores): Set<string> {
  return new Set(stores.offers.filter((o) => o.kind === 'redStar' && o.price > 0 && o.shards > 0).map((o) => o.characterId));
}

/** The shard item a character's stars use. */
export const shardOf = (info: CharacterInfo) => idOf(info.starItems?.[0]) ?? `SHARD_${info.id.toUpperCase()}`;

/** Store currencies on hand, as inventory items the planner can spend. */
export function storeInventory(stores: Stores): ItemQuantity[] {
  return stores.currencies.filter((c) => c.have > 0).map((c) => ({ item: currencyItem(c.id), quantity: c.have }));
}

/**
 * Shards and red stars as something "crafted" from store currency: one costs price ÷ amount
 * of the currency, using the cheapest offer per character. The planner then buys shards with
 * currency on hand when a star step is short.
 */
export function storeRecipes(stores: Stores, characters: CharacterInfo[]): Record<string, Cost> {
  const byId = new Map(characters.map((c) => [c.id, c]));
  // Cheapest offer per item: a character's shard, or their store red star.
  const best = new Map<string, ShardOffer>();
  for (const o of stores.offers) {
    if (!(o.price > 0 && o.shards > 0) || !byId.has(o.characterId)) continue;
    const item = o.kind === 'redStar' ? redStarItem(o.characterId) : shardOf(byId.get(o.characterId)!);
    const prev = best.get(item);
    if (!prev || o.price / o.shards < prev.price / prev.shards) best.set(item, o);
  }
  return Object.fromEntries([...best].map(([item, o]) => [item, [{ item: currencyItem(o.currencyId), quantity: o.price / o.shards }]]));
}

/** How many shards (or red stars) each store item can be bought in a day: each offer restocks every 6 hours. */
export function storeLimits(stores: Stores, characters: CharacterInfo[]): Record<string, number> {
  const byId = new Map(characters.map((c) => [c.id, c]));
  const out: Record<string, number> = {};
  for (const o of stores.offers) {
    if (!(o.price > 0 && o.shards > 0) || !byId.has(o.characterId)) continue;
    const item = o.kind === 'redStar' ? redStarItem(o.characterId) : shardOf(byId.get(o.characterId)!);
    out[item] = (out[item] ?? 0) + (o.perDay || DEFAULT_BUYS_PER_DAY) * o.shards;
  }
  return out;
}
