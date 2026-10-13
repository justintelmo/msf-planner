import { describe, expect, it } from 'vitest';
import { eventStarGoals } from './eventStars';
import type { Ranked } from './priority';
import type { UnlockSource } from './unlocks';

const ranked = (id: string, stars: number, reasons: Ranked['reasons']): Ranked => ({
  character: { info: { id, name: id }, instance: { id, activeYellow: stars, power: 1 } },
  score: reasons.reduce((s, r) => s + r.weight, 0),
  reasons,
});
const source = (kind: string, rewards: string[]): UnlockSource => ({ kind, id: kind + rewards[0], name: `${kind} ${rewards[0]}`, nodes: [], rewards });

describe('eventStarGoals', () => {
  const sources = [source('Unlock event', ['ShadowKing']), source('Unlock event', ['OldManLogan']), source('Campaign', ['Farmed']), source('Unlock event', ['Farmed'])];
  const war = { label: 'War squad: X', weight: 30, kind: 'squad' as const };

  it('tracks team characters short of 7★ whose shards only come from events', () => {
    const goals = eventStarGoals([
      ranked('ShadowKing', 5, [war]),
      ranked('OldManLogan', 7, [war]),
      ranked('Farmed', 4, [war]),
      ranked('BlitzOnly', 4, [{ label: 'Blitz squad: Y', weight: 10, kind: 'squad' }]),
    ], [...sources, source('Unlock event', ['BlitzOnly'])], new Set());
    expect(goals.map((g) => [g.characterId, g.stars])).toEqual([['ShadowKing', 5]]);
  });

  it('skips characters already set as goals or turned off', () => {
    expect(eventStarGoals([ranked('ShadowKing', 5, [war])], sources, new Set(['ShadowKing']))).toEqual([]);
  });
});
