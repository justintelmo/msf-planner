import { describe, expect, it } from 'vitest';
import { shardProgress } from './shards';

const totals = { 1: 10, 2: 25, 3: 50, 4: 80, 5: 130, 6: 230, 7: 530 };

describe('shardProgress', () => {
  it('counts toward the unlock star level for locked characters', () => {
    const c = { info: { id: 'HumanTorch', unlockStars: 5 } };
    expect(shardProgress(c, [{ item: 'SHARD_HUMANTORCH', quantity: 120 }], totals)).toEqual({ have: 120, need: 130, stars: 5, unlock: true });
  });
  it('counts toward the next star, and stops at max', () => {
    const c = { info: { id: 'Odin' }, instance: { id: 'Odin', activeYellow: 6 } };
    expect(shardProgress(c, [], totals)).toEqual({ have: 0, need: 300, stars: 7, unlock: false });
    expect(shardProgress({ ...c, instance: { id: 'Odin', activeYellow: 7 } }, [], totals)).toBeUndefined();
  });
});
