import type { EventInfo } from '../api/types';
import { plainName } from '../planner/export';
import type { UnlockSource } from '../planner/unlocks';
import { difficultyName, raidAt } from './modeGoals';
import type { RaidSource } from './unlocks';

/** The Pick Your Poison map an event is played on: same name as its type ("Scourge"), else the only map. */
export function pypMapFor(e: EventInfo, pyps: RaidSource[]): RaidSource | undefined {
  const squash = (n?: string) => (n ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // Trial maps are named for their character (shadowking_trials_01 for the SHADOW KING event).
  const who = squash(plainName(e.name));
  const byName = who ? pyps.filter((p) => [p.id, p.name].some((n) => squash(n).includes(who))) : [];
  if (byName.length) return byName[0];
  const type = squash(plainName(e.pickYourPoison?.typeName));
  const named = pyps.filter((p) => type && [p.name, p.subName, p.id].some((n) => squash(n).includes(type)));
  return named.length === 1 ? named[0] : pyps.length === 1 ? pyps[0] : named[0];
}

/**
 * A Pick Your Poison event's rooms at the map's highest difficulty, where score (and the 7★
 * token) comes fastest, so its team requirements are checked like a raid's.
 */
export function withPypMap(source: UnlockSource | undefined, e: EventInfo, pyps: RaidSource[]): UnlockSource | undefined {
  if (!source || !e.pickYourPoison) return source;
  const map = pypMapFor(e, pyps);
  if (!map || (!map.rooms.length && !Object.keys(map.difficulties).length)) return source;
  const top = map.maxDifficulty ?? Math.max(0, ...Object.keys(map.difficulties).map(Number));
  const at = raidAt(map, top);
  return {
    ...source,
    subName: [source.subName, `${map.name} at ${difficultyName(map, top)}`].filter(Boolean).join(' · '),
    nodes: [...source.nodes, ...at.nodes],
  };
}
