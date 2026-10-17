import { describe, expect, it } from 'vitest';
import { farmOptions, refreshCost } from './farming';
import { shardDrops, type UnlockSource } from './unlocks';

const shards = new Map([['SHARD_DARKSTAR', 'Darkstar'], ['SHARD_X', 'X']]);

describe('shardDrops', () => {
  it('weighs oneOf children and pulls, and marks chance drops as unknown odds', () => {
    const tree = { allOf: [
      { oneOf: [{ item: 'SHARD_DARKSTAR', quantity: 2, maxQuantity: 4, weight: 1 }, { item: 'GOLD', weight: 3 }], pulls: 2 },
      { chanceOf: { item: 'SHARD_X', quantity: 5 } },
    ] };
    const d = shardDrops(tree, shards);
    expect(d.find((x) => x.characterId === 'Darkstar')).toMatchObject({ perWin: 1.5, chance: false, max: 8 });
    expect(d.find((x) => x.characterId === 'X')).toMatchObject({ perWin: undefined, chance: true, max: 5 });
  });
});

describe('farmOptions', () => {
  const source: UnlockSource = {
    kind: 'Campaign', id: 'c', name: 'Heroes', rewards: ['Darkstar'],
    nodes: [
      { label: 'Heroes 3-9', rewards: ['Darkstar'], energy: 12, drops: [{ characterId: 'Darkstar', perWin: 2, min: 2, max: 2, chance: false }] },
      { label: 'Heroes 1-3', rewards: ['Darkstar'], energy: 6, drops: [{ characterId: 'Darkstar', min: 0, max: 3, chance: true }] },
    ],
  };
  it('ranks nodes by energy per shard and prices cores against a store refresh', () => {
    const [o] = farmOptions([{ characterId: 'Darkstar', need: 100 }], [source],
      [{ id: 'o', characterId: 'Darkstar', currencyId: 'c', price: 400, shards: 5 }],
      { energyRefresh: 50, energyPerRefresh: 100, energyFlatRefreshes: 1, storeRefresh: 50 });
    expect(o.nodes[0]).toMatchObject({ label: 'Heroes 3-9', energyPerShard: 6, coresPerShard: 3 });
    expect(o.nodes[1].perWin).toBeUndefined();
    expect(o.store[0].coresPerShard).toBe(10);
  });

  it('uses a chance estimate only when one is entered', () => {
    const [o] = farmOptions([{ characterId: 'Darkstar', need: 1 }], [source], [], { energyRefresh: 50, energyFlatRefreshes: 1, storeRefresh: 50, chanceRate: 0.5 });
    expect(o.nodes.find((n) => n.label === 'Heroes 1-3')).toMatchObject({ estimated: true, perWin: 0.75 });
  });

  it('doubles refresh costs after the flat ones', () => {
    expect([1, 2, 3, 4].map((n) => refreshCost(50, n, 2))).toEqual([50, 50, 100, 200]);
  });
});

import scourge from './__fixtures__/scourge-oml.json';
import { fromLiveEvent } from './unlocks';
import type { EventInfo } from '../api/types';

describe('star tokens', () => {
  it('reads Old Man Logan from a Scourge event that gives star tokens and red stars, not shards', () => {
    const src = fromLiveEvent(scourge as unknown as EventInfo, new Map([['CHAR:OLDMANLOGAN', 'OldManLogan']]))!;
    expect(src.rewards).toEqual(['OldManLogan']);
    expect(src.subName).toBe('Earn Old Man Logan Shards · score for 4★ at 1.1M, 5★ at 3.3M, 6★ at 6.7M, 7★ at 13.5M; red stars at 1.6M, 2.3M, 4.7M, 9.5M');
  });
});
