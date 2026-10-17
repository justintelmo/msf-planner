import type { Ranked, Reason } from './priority';
import { isUnlocked, type OwnedCharacter } from './requirements';
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
 * clearing that content, so its requirements become goals of their own. Characters a running
 * trial gives star tokens for are included whether or not they're unlocked or on a team.
 */
export function eventStarGoals(ranked: Ranked[], sources: UnlockSource[], skip: Set<string>, owned: OwnedCharacter[] = []): EventStarGoal[] {
  const out: EventStarGoal[] = [];
  for (const r of ranked) {
    const c = r.character;
    const id = c.info.id;
    const stars = c.instance?.activeYellow ?? 0;
    if (skip.has(id) || stars >= MAX_YELLOW) continue;
    const from = sources.filter((s) => s.rewards.includes(id));
    // A running trial hands out the stars themselves, so it's worth tracking for anyone, unlocked or not.
    const trial = from.some((s) => s.starTokens);
    const teams = teamReasons(r.reasons);
    if (!trial && (!isUnlocked(c) || !teams.length)) continue;
    if (from.length && !from.some((s) => FARMABLE.has(s.kind))) out.push({ characterId: id, stars, teams, sources: from });
  }
  // Trial characters you haven't unlocked aren't ranked, so add them from the roster.
  const seen = new Set(out.map((g) => g.characterId));
  for (const c of owned) {
    const id = c.info.id;
    const stars = c.instance?.activeYellow ?? 0;
    if (seen.has(id) || skip.has(id) || stars >= MAX_YELLOW) continue;
    const from = sources.filter((s) => s.rewards.includes(id));
    if (from.some((s) => s.starTokens)) out.push({ characterId: id, stars, teams: [], sources: from });
  }
  return out;
}
