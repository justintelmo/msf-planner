import { useMemo } from 'react';
import type { NodeTeam } from '../data/ddTeams';
import { CONTENT_TEAMS } from '../data/contentTeams';
import { boostLevel, type CandidateTeam, type EnemyProfile, type TeamPick } from '../planner/ddPicker';
import { KIT_LABELS, type KitTag } from '../planner/kitTags';
import { compact } from '../planner/items';
import { findCharacter, MODE_LABELS, resolveTeam } from '../planner/priority';
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

/** One line on what a node's enemies look like after its boosts. */
export function EnemySummary({ enemy }: { enemy: EnemyProfile }) {
  const boosted = enemy.healthBoost > 0 || enemy.damageBoost > 0;
  return (
    <p className="small">
      <strong>Enemies:</strong> {enemy.count}, {compact(enemy.medianHealth)} health and {compact(enemy.medianDamage)} damage each (median)
      {boosted && <span className="warn"> · node boosts +{Math.round(enemy.healthBoost)}% health, +{Math.round(enemy.damageBoost)}% damage</span>}
      {enemy.energyCheats > 0 && <span className="warn"> · {enemy.energyCheats} with cheap specials or ultimates</span>}
      <span className="muted"> · {compact(enemy.totalHealth)} health in all · resist {compact(enemy.medianResist)}</span>
    </p>
  );
}

const TAG_TITLE: Record<KitTag, string> = {
  maxHealth: 'Damage scaled off the target’s Max Health keeps pace with health boosts',
  lockdown: 'Stun, Ability Block or Disrupted stops energy-cheating enemies acting',
  tempo: 'Takes Speed Bar or Ability Energy, or applies Slow',
  drain: 'Drain or Health Steal keeps the team up while trading',
  sustain: 'Barrier, Heal, Revive, Taunt, Deflect or Protect',
  piercing: 'Ignores armor',
};

/** Roster-built teams for a node, best first, with each member's useful mechanics and how sturdy they are. */
export function TeamPicks({ picks, enemy, kitsRead = true }: { picks: TeamPick[]; enemy?: EnemyProfile; kitsRead?: boolean }) {
  if (!picks.length) return <p className="small warn">Your roster can’t field a full team for this yet.</p>;
  const boosted = boostLevel(enemy) > 0;
  return (
    <ol className="team-options">
      {picks.map((p, i) => (
        <li key={i}>
          <p className="small">
            <strong>{i === 0 ? 'Best: ' : ''}{p.label}</strong>{' '}
            <span className="muted">
              · {compact(p.power)} power{p.core > 1 && p.core < p.members.length ? ` · ${p.core} together + ${p.members.length - p.core} fill-in` : ''}
            </span>
            {p.sturdy !== undefined && p.sturdy < p.members.length && (
              <span className="warn"> · {p.members.length - p.sturdy} of {p.members.length} fall to two hits, before armor</span>
            )}
          </p>
          <ul className="team-picks">
            {p.fits.map((f) => (
              <li key={f.c.info.id} className="team-pick">
                <CharName id={f.c.info.id} portrait />
                <span className="muted small">{compact(f.c.instance?.power ?? 0)}</span>
                {boosted && [...f.tags.entries()].map(([t, text]) => (
                  <span key={t} className={`pill kit${t === 'lockdown' && f.lands === false ? ' miss' : ''}`} title={`${TAG_TITLE[t]}. “${text}”`}>
                    {KIT_LABELS[t]}{t === 'lockdown' && f.lands === false ? ' (resisted)' : ''}
                  </span>
                ))}
                {f.hits !== undefined && f.hits < 2 && <span className="muted small">{f.hits < 1 ? 'one-hit' : '~1 hit'}</span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
      {boosted && !kitsRead && <li className="muted small">Still reading ability text, so mechanics aren’t counted for every character yet.</li>}
    </ol>
  );
}

/** Teams worth trying for a node: the guide's pick, your saved squads and the curated content teams. */
export function candidateTeams(roster: OwnedCharacter[], squads: Record<string, string[][]> | undefined, guideTeam?: NodeTeam): CandidateTeam[] {
  const ids = (names: string[]) => names.map((n) => findCharacter(n, roster)?.info.id).filter((x): x is string => !!x);
  const out: CandidateTeam[] = [];
  if (guideTeam?.main.length) out.push({ label: 'Marvel Church pick', ids: ids([...guideTeam.main, ...(guideTeam.alts ?? [])]) });
  for (const [mode, list] of Object.entries(squads ?? {})) {
    list.forEach((sq, i) => out.push({ label: `Your ${MODE_LABELS[mode] ?? mode} squad ${i + 1}`, ids: sq.filter(Boolean) }));
  }
  for (const t of CONTENT_TEAMS) out.push({ label: `${t.team} (${t.content})`, ids: resolveTeam(t, roster).found.map((c) => c.info.id) });
  return out;
}
