import { describe, expect, it } from 'vitest';
import type { EventInfo } from '../api/types';
import event from '../planner/__fixtures__/scourge-oml.json';
import { fromLiveEvent, type ShardIndex } from '../planner/unlocks';
import { pypMapFor, trialSources, withPypMap } from './pyp';
import type { RaidSource } from './unlocks';

const map = (id: string, name: string): RaidSource => ({
  id, name, maxDifficulty: 2,
  difficulties: { '1': { name: 'Hard' }, '2': { name: 'Nightmare', requirements: { minCharacters: 5, anyCharacterFilters: [{ activeYellow: 6 }] } } },
  rooms: [{ label: 'Room A1', requirements: { anyCharacterFilters: [{ allTraits: ['Mutant'] }] }, rewards: [] }],
});

describe('Pick Your Poison events', () => {
  const e = { ...(event as unknown as EventInfo), endTime: Date.now() / 1000 + 3600 };
  const shards: ShardIndex = new Map([['CHAR:OLDMANLOGAN', 'OldManLogan']]);

  it('finds a trial map by the character the event is named for', () => {
    expect(pypMapFor(e, [map('shadowking_trials_01', ''), map('oldmanlogan_trials_01', '')])?.id).toBe('oldmanlogan_trials_01');
  });

  it('finds the map by the event type name', () => {
    expect(pypMapFor(e, [map('other', 'Gauntlet'), map('sc', 'Scourge')])?.id).toBe('sc');
  });

  it('checks the event against the map’s rooms at its top difficulty', () => {
    const src = withPypMap(fromLiveEvent(e, shards), e, [map('sc', 'Scourge')])!;
    expect(src.starTokens).toBe(true);
    expect(src.rewards).toContain('OldManLogan');
    expect(src.subName).toContain('Scourge at Nightmare');
    expect(src.nodes.map((n) => n.label)).toEqual(['Entry', 'Room A1']);
    expect(src.nodes[1].requirements?.minCharacters).toBe(5);
  });

  it('keeps each trial map as a standing source of its character’s stars', () => {
    const sk: ShardIndex = new Map([['CHAR:SHADOWKING', 'ShadowKing'], ['CHAR:OLDMANLOGAN', 'OldManLogan']]);
    const maps = [map('shadowking_trials_01', ''), map('oldmanlogan_trials_01', '')];
    const out = trialSources(maps, sk, new Set(['oldmanlogan_trials_01']));
    expect(out.map((s) => [s.id, s.rewards, s.starTokens])).toEqual([['pyp:shadowking_trials_01', ['ShadowKing'], true]]);
    expect(out[0].nodes.map((n) => n.label)).toEqual(['Entry', 'Room A1']);
  });
});
