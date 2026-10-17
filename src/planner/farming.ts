import type { ShardOffer } from '../data/stores';
import type { ShardDrop, UnlockSource } from './unlocks';

/** What a refresh costs in cores and what it gives, as the player enters it (none of this is in the API). */
export interface CoreCosts {
  /** Cores for the first campaign energy refresh of the day. */
  energyRefresh: number;
  /** Energy one refresh gives. */
  energyPerRefresh?: number;
  /** Refreshes at the first price before the price starts doubling. */
  energyFlatRefreshes: number;
  /** Cores for the first store refresh; each later one doubles. */
  storeRefresh: number;
  /** Share of wins a "chance of" shard drop lands, if the player wants to estimate it (0-1). */
  chanceRate?: number;
}

export const DEFAULT_CORE_COSTS: CoreCosts = { energyRefresh: 50, energyFlatRefreshes: 1, storeRefresh: 50 };

/** Cores the nth refresh costs (1-based): flat for the first few, then doubling. */
export function refreshCost(first: number, n: number, flat = 1): number {
  return n <= flat ? first : first * 2 ** (n - flat);
}

export interface FarmNode {
  source: string;
  kind: string;
  label: string;
  energy?: number;
  drop: ShardDrop;
  /** Shards per win, known or estimated from the chance rate. */
  perWin?: number;
  estimated: boolean;
  energyPerShard?: number;
  /** Cores per shard when energy comes from the first refresh. */
  coresPerShard?: number;
  limit?: number;
}

export interface FarmOption {
  characterId: string;
  need: number;
  nodes: FarmNode[];
  /** Store offers for the character's shards, cheapest first, with cores per shard for the first refresh. */
  store: { offer: ShardOffer; coresPerShard: number }[];
}

/** Campaign-style content: nodes you can replay with energy. */
const FARM_KINDS = new Set(['Campaign', 'Event campaign']);

/**
 * Where each wanted character's shards drop, cheapest energy per shard first, and what a
 * core-bought energy refresh or store refresh costs per shard.
 */
export function farmOptions(
  wanted: { characterId: string; need: number }[],
  sources: UnlockSource[],
  offers: ShardOffer[],
  costs: CoreCosts,
): FarmOption[] {
  const byChar = new Map<string, FarmNode[]>();
  for (const s of sources) {
    if (!FARM_KINDS.has(s.kind)) continue;
    for (const n of s.nodes) {
      for (const d of n.drops ?? []) {
        const estimated = d.perWin === undefined;
        const perWin = d.perWin ?? (costs.chanceRate ? ((d.min + d.max) / 2 || d.max) * costs.chanceRate : undefined);
        const energyPerShard = n.energy && perWin ? n.energy / perWin : undefined;
        const coresPerShard = energyPerShard && costs.energyPerRefresh ? (costs.energyRefresh / costs.energyPerRefresh) * energyPerShard : undefined;
        const node: FarmNode = {
          source: s.subName ? `${s.name} (${s.subName})` : s.name, kind: s.kind, label: n.label, energy: n.energy,
          drop: d, perWin, estimated, energyPerShard, coresPerShard, limit: n.limit,
        };
        byChar.set(d.characterId, [...(byChar.get(d.characterId) ?? []), node]);
      }
    }
  }
  return wanted.map(({ characterId, need }) => ({
    characterId,
    need,
    nodes: (byChar.get(characterId) ?? []).sort((a, b) => (a.energyPerShard ?? Infinity) - (b.energyPerShard ?? Infinity) || (a.energy ?? 0) - (b.energy ?? 0)),
    store: offers
      .filter((o) => o.characterId === characterId && o.kind !== 'redStar' && o.shards > 0)
      .map((offer) => ({ offer, coresPerShard: costs.storeRefresh / offer.shards }))
      .sort((a, b) => a.coresPerShard - b.coresPerShard),
  }));
}
