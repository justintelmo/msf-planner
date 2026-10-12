import type { Requirements } from '../api/types';
import { eligibleCharacters, type OwnedCharacter } from './requirements';

export interface CandidateTeam {
  label: string;
  /** Character ids, best first. */
  ids: string[];
}

export interface TeamPick {
  label: string;
  members: OwnedCharacter[];
  /** How many members come from the named team (the rest are the strongest fill-ins). */
  core: number;
  power: number;
  score: number;
}

/** A synergy team member is worth this much more than a fill-in of the same power. */
const SYNERGY = 0.12;

const power = (c: OwnedCharacter) => c.instance?.power ?? 0;

/**
 * The strongest teams the roster can field for a node: each candidate team (guide pick, saved
 * squads, recommended teams) keeps its members who can enter, topped up with the strongest
 * other eligible characters. Teams that stay together score higher, since kits are built around
 * their synergies. Picks with the same members are shown once.
 */
export function bestTeams(roster: OwnedCharacter[], req: Requirements | undefined, candidates: CandidateTeam[], limit = 3): TeamPick[] {
  const eligible = eligibleCharacters(roster, req).sort((a, b) => power(b) - power(a));
  const size = Math.min(5, req?.minCharacters ?? 5);
  if (eligible.length < size) return [];
  const byId = new Map(eligible.map((c) => [c.info.id, c]));
  const named = new Set(req?.specificCharacters ?? []);

  const build = (label: string, core: OwnedCharacter[]): TeamPick => {
    const must = [...named].map((id) => byId.get(id)).filter((c): c is OwnedCharacter => !!c);
    const members = [...new Set([...must, ...core])].slice(0, size);
    const coreCount = members.filter((m) => core.includes(m)).length;
    for (const c of eligible) {
      if (members.length >= size) break;
      if (!members.includes(c)) members.push(c);
    }
    const total = members.reduce((s, c) => s + power(c), 0);
    return { label, members, core: coreCount, power: total, score: total * (1 + SYNERGY * Math.max(0, coreCount - 1)) };
  };

  const picks = candidates
    .map((t) => ({ label: t.label, core: t.ids.map((id) => byId.get(id)).filter((c): c is OwnedCharacter => !!c) }))
    .filter((t) => t.core.length >= 2)
    .map((t) => build(t.label, t.core));
  picks.push(build('Your strongest eligible', []));

  const seen = new Set<string>();
  return picks
    .sort((a, b) => b.score - a.score)
    .filter((p) => {
      const key = p.members.map((m) => m.info.id).sort().join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
