import { useMemo } from 'react';
import type { NodeTeam } from '../data/ddTeams';
import { findCharacter } from '../planner/priority';
import { isUnlocked, type OwnedCharacter } from '../planner/requirements';
import { CharName } from './Details';

/** One mission range's recommended team: owned characters first, with a mark on those who can enter now. */
export function TeamAdvice({ team, roster, eligible }: { team: NodeTeam; roster: OwnedCharacter[]; eligible?: Set<string> }) {
  const resolve = (names: string[]) => names.map((name) => ({ name, c: findCharacter(name, roster) }));
  const main = useMemo(() => resolve(team.main), [team, roster]);
  const alts = useMemo(() => resolve(team.alts ?? []), [team, roster]);
  const who = ({ name, c }: { name: string; c?: OwnedCharacter }) => {
    const owned = c && isUnlocked(c);
    const ok = c && eligible?.has(c.info.id);
    return (
      <li key={name} className={`team-pick${owned ? '' : ' unowned'}`}>
        {c ? <CharName id={c.info.id} portrait /> : <strong>{name}</strong>}
        {!owned ? <span className="muted small">{c ? 'locked' : 'not found'}</span> : ok ? <span className="pill ready">ready</span> : eligible ? <span className="pill short">short</span> : null}
      </li>
    );
  };
  return (
    <div className="team-advice">
      {team.main.length > 0 && <ul className="team-picks">{main.map(who)}</ul>}
      {team.note && <p className="muted small">{team.note}</p>}
      {alts.length > 0 && (
        <details className="small">
          <summary>Alternatives ({alts.filter((a) => a.c && isUnlocked(a.c)).length} of {alts.length} owned)</summary>
          <ul className="team-picks">{[...alts].sort((a, b) => Number(!!(b.c && isUnlocked(b.c))) - Number(!!(a.c && isUnlocked(a.c)))).map(who)}</ul>
        </details>
      )}
    </div>
  );
}
