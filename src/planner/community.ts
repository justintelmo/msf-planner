import type { CommunitySignal } from '../data/communitySignals';
import { MODE_LABELS, resolveTeam, type Reason } from './priority';
import { isUnlocked, type OwnedCharacter } from './requirements';

/** What the planner's own data says about a character, to check community advice against. */
export interface Evidence {
  /** Modes of saved squads the character is on. */
  squadModes: string[];
  /** Curated content teams (Battleworld, Dark Dimension) the character is on. */
  content: string[];
  /** Unlock goals that need the character. */
  goals: string[];
  /** How many unlock events and Dark Dimensions the character's traits fit. */
  fits: number;
}

/** A backed "build" signal adds this; one the data doesn't back yet adds about half. */
const BUILD = 15;
const BUILD_UNBACKED = 6;
/** "Build only to what you need" and "wait for the event" lower a character unless the data needs them. */
const ENOUGH = -10;
const HOLD = -20;

const list = (xs: string[]) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, 2).join(', ')} and ${xs.length - 2} more`);

/**
 * Turns community advice into priority reasons, each checked against the planner's data:
 * players' "build this" counts fully only when your squads, content or goals use the character;
 * "don't over-build" and "wait" are dropped when a goal or content team you face still needs them.
 */
export function communityReasons(
  signals: CommunitySignal[],
  owned: OwnedCharacter[],
  evidenceOf: (id: string) => Evidence,
  today = new Date().toISOString().slice(0, 10),
): Map<string, Reason[]> {
  const out = new Map<string, Reason[]>();
  const add = (id: string, r: Reason) => out.set(id, [...(out.get(id) ?? []), r]);
  for (const s of signals) {
    if (s.until && today > s.until) continue;
    const { found } = resolveTeam({ content: 'Reddit', team: s.team, characters: s.characters ?? [], traits: s.traits }, owned);
    const except = new Set(resolveTeam({ content: '', team: '', characters: s.except ?? [] }, owned).found.map((c) => c.info.id));
    const url = s.sources[0]?.url;
    for (const c of found) {
      const id = c.info.id;
      if (except.has(id) || !isUnlocked(c) && s.stance !== 'build') continue;
      const e = evidenceOf(id);
      const needs = [...e.goals, ...e.content];
      if (s.stance === 'build') {
        const modes = e.squadModes.filter((m) => !s.modes || s.modes.includes(m)).map((m) => `${MODE_LABELS[m] ?? m} squad`);
        const backing = [...modes, ...e.content, ...(e.fits >= 3 ? [`${e.fits} unlock events`] : [])];
        add(id, {
          label: `Reddit: build ${s.team}${backing.length ? ` (backed by your ${list(backing)})` : ' (not on your squads or content yet)'}`,
          weight: backing.length ? BUILD : BUILD_UNBACKED,
          detail: s.claim,
          url,
          kind: 'community',
        });
      } else if (needs.length) {
        add(id, { label: `Reddit says don’t over-build ${s.team}, but ${list(needs)} still needs them`, weight: 0, detail: s.claim, url, kind: 'community' });
      } else if (s.stance === 'enough') {
        add(id, { label: `Reddit: build ${s.team} only as far as content needs`, weight: ENOUGH, detail: s.claim, url, kind: 'community' });
      } else {
        add(id, { label: `Reddit: hold upgrades on ${s.team} until the event that scores them${s.until ? ` (checked to ${s.until})` : ''}`, weight: HOLD, detail: s.claim, url, kind: 'community' });
      }
    }
  }
  return out;
}
