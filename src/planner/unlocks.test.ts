import { describe, expect, it } from 'vitest';
import type { EventInfo } from '../api/types';
import { fromLiveEvent } from './unlocks';

const shards = new Map([['SHARD_HUMANTORCH', 'HumanTorch']]);
const base = { id: 'ev1', name: 'Hot Streak', startTime: 0, endTime: 2e9 };

describe('fromLiveEvent', () => {
  it('finds shards in milestone reward tiers', () => {
    const e = {
      ...base, type: 'milestone',
      milestone: { type: 'solo', brackets: [{ objective: { tiers: { 1: { goal: 100, rewards: [{ item: 'SHARD_HUMANTORCH', quantity: 10 }] } } } }] },
    } as unknown as EventInfo;
    expect(fromLiveEvent(e, shards)).toMatchObject({ id: 'event:ev1', kind: 'Milestone event', rewards: ['HumanTorch'], nodes: [] });
  });

  it('keeps blitz entry requirements and skips events without shards', () => {
    const req = { minCharacters: 5, anyCharacterFilters: [{ allTraits: ['Mutant'] }] };
    const e = { ...base, type: 'blitz', blitz: { requirements: req, brackets: [{ rewards: ['SHARD_HUMANTORCH'] }] } } as unknown as EventInfo;
    expect(fromLiveEvent(e, shards)?.nodes[0].requirements).toEqual(req);
    expect(fromLiveEvent({ ...base, type: 'blitz', blitz: { brackets: [] } }, shards)).toBeUndefined();
  });
});
