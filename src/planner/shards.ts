import type { ItemQuantity, UpgradeTables } from '../api/types';
import { idOf } from '../api/types';
import { shardItem } from './build';
import type { OwnedCharacter } from './requirements';

export interface ShardProgress {
  have: number;
  need: number;
  /** Star level the shards lead to. */
  stars: number;
  unlock: boolean;
}

/** Shards in the inventory toward unlocking, or toward the next yellow star; undefined at max stars. */
export function shardProgress(c: OwnedCharacter, inventory: ItemQuantity[], totals: UpgradeTables['yellowStarTotalShards']): ShardProgress | undefined {
  const id = shardItem(c);
  const have = inventory.find((i) => idOf(i.item) === id)?.quantity ?? 0;
  const current = c.instance?.activeYellow ?? 0;
  const max = Math.max(0, ...Object.keys(totals).map(Number));
  if (current >= max) return undefined;
  const stars = current === 0 ? (c.info.unlockStars ?? 1) : current + 1;
  const need = (totals[stars] ?? 0) - (totals[current] ?? 0);
  return need > 0 ? { have, need, stars, unlock: current === 0 } : undefined;
}
