import type { Ranked, Reason } from './priority';
import { isUnlocked } from './requirements';
import type { UnlockSource } from './unlocks';

/** Yellow stars stop here. */
export const MAX_YELLOW = 7;

/** Campaign nodes can be farmed any day, so only event-style content gates stars. */
const FARMABLE = new Set(['Campaign']);

/** A squad in a mode below this weight (Blitz, by default) doesn't make a character a team piece. */
const TEAM_SQUAD_WEIGHT = 20;

export interface EventStarGoal {
  characterId: string;
  stars: number;
  /** The teams that use the character, strongest first. */
  teams: Reason[];
  /** Events and Dark Dimensions that reward the character's shards. */
  sources: UnlockSource[];
}

/** Reasons that put the character on a team you play: a squad, a content team, or a backed community pick. */
export function teamReasons(reasons: Reason[]): Reason[] {
  return reasons
    .filter((r) => (r.kind === 'squad' && r.weight >= TEAM_SQUAD_WEIGHT) || r.kind === 'content' || (r.kind === 'community' && r.weight >= 15))
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Unlocked characters on your teams who are short of max yellow stars and whose shards come
 * only from events or Dark Dimensions (Shadow King, Old Man Logan…). Their stars wait on
 * clearing that content, so its requirements become goals of their own.
 */
export function eventStarGoals(ranked: Ranked[], sources: UnlockSource[], skip: Set<string>): EventStarGoal[] {
  const out: EventStarGoal[] = [];
  for (const r of ranked) {
    const c = r.character;
    const id = c.info.id;
    const stars = c.instance?.activeYellow ?? 0;
    if (skip.has(id) || !isUnlocked(c) || stars >= MAX_YELLOW) continue;
    const teams = teamReasons(r.reasons);
    if (!teams.length) continue;
    const from = sources.filter((s) => s.rewards.includes(id));
    if (from.length && !from.some((s) => FARMABLE.has(s.kind))) out.push({ characterId: id, stars, teams, sources: from });
  }
  return out;
}
