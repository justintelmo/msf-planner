import type { CharacterInstance, CombatUnit, NodeInfo, Requirements, Stats } from '../api/types';
import { activeKitTags, KIT_TAGS, type KitTag, type KitTagHit } from './kitTags';
import { eligibleCharacters, type OwnedCharacter } from './requirements';

export interface CandidateTeam {
  label: string;
  /** Character ids, best first. */
  ids: string[];
}

/** What a node's enemies look like once its boosts are applied. */
export interface EnemyProfile {
  count: number;
  totalHealth: number;
  medianHealth: number;
  medianDamage: number;
  medianResist: number;
  medianFocus: number;
  /** Median node boosts, in percent. */
  healthBoost: number;
  damageBoost: number;
  /** Enemies whose special or ultimate costs less energy than normal. */
  energyCheats: number;
}

export interface MemberFit {
  c: OwnedCharacter;
  /** Kit tags at the character's ability levels, with the sentence each came from. */
  tags: Map<KitTag, string>;
  /** Enemy median hits this character can take, before armor. */
  hits?: number;
  /** Whether their focus beats the enemies' median resist, so debuffs should land. */
  lands?: boolean;
}

export interface TeamPick {
  label: string;
  members: OwnedCharacter[];
  fits: MemberFit[];
  /** How many members come from the named team (the rest are fill-ins). */
  core: number;
  power: number;
  score: number;
  /** Members who survive two median enemy hits, when stats are known. */
  sturdy?: number;
}

export interface PickContext {
  enemy?: EnemyProfile;
  /** Kit tags per character id; characters not read yet count as having none. */
  kits?: Record<string, KitTagHit[]>;
}

/** A synergy team member is worth this much more than a fill-in of the same power. */
const SYNERGY = 0.12;

/**
 * How much each mechanic is worth against a heavily boosted node, per member. Health-scaled damage is
 * the one thing that keeps pace with +500% health; lockdown and tempo stop energy cheats;
 * drain and sustain buy turns. Raw piercing helps, but less.
 */
const TAG_WEIGHT: Record<KitTag, number> = { maxHealth: 1, lockdown: 0.5, tempo: 0.4, drain: 0.4, sustain: 0.3, piercing: 0.2 };
/** Debuffs from a character whose focus is below the enemies' resist mostly miss. */
const MISSED_DEBUFF = 0.3;
const MEMBER_CAP = 1.5;
/** At this health boost (percent) or more, kits count fully. */
const FULL_BOOST = 300;

const STAT_ORDER: (keyof Stats)[] = [
  'health', 'damage', 'armor', 'focus', 'resist', 'critDamageBonus', 'critChance', 'speed',
  'dodgeChance', 'blockChance', 'blockAmount', 'accuracy', 'damageReduction',
];

/** Stats as an object, whether the API sent an object or CSV. */
export function statsOf(inst: CharacterInstance | undefined): Stats | undefined {
  const s = inst?.stats;
  if (!s) return undefined;
  if (typeof s !== 'string') return s;
  const v = s.split(',').map(Number);
  return Object.fromEntries(STAT_ORDER.map((k, i) => [k, v[i] || 0]));
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Enemy health, damage and boosts across every wave of a node. */
export function enemyProfile(node: NodeInfo | undefined): EnemyProfile | undefined {
  const units = (node?.combat?.right?.waves ?? []).flatMap((w) => (w.units ?? []).map((u) => (Array.isArray(u) ? u[0] : u))).filter((u): u is CombatUnit => !!u);
  const withStats = units.map((u) => ({ u, s: statsOf(u) })).filter((x): x is { u: CombatUnit; s: Stats } => !!x.s);
  if (!withStats.length) return undefined;
  const col = (k: keyof Stats) => withStats.map((x) => x.s[k] ?? 0);
  const boost = (k: string) => median(withStats.map((x) => x.u.nodeEffects?.boosts?.[k] ?? 0));
  return {
    count: withStats.length,
    totalHealth: col('health').reduce((a, b) => a + b, 0),
    medianHealth: median(col('health')),
    medianDamage: median(col('damage')),
    medianResist: median(col('resist')),
    medianFocus: median(col('focus')),
    healthBoost: boost('health'),
    damageBoost: boost('damage'),
    energyCheats: withStats.filter((x) => x.u.nodeEffects?.specialOverride || x.u.nodeEffects?.ultimateOverride).length,
  };
}

/** The hardest of several nodes: the one with the most health per enemy. */
export function hardest(profiles: (EnemyProfile | undefined)[]): EnemyProfile | undefined {
  return profiles.filter((p): p is EnemyProfile => !!p).sort((a, b) => b.medianHealth - a.medianHealth)[0];
}

const power = (c: OwnedCharacter) => c.instance?.power ?? 0;

function memberFit(c: OwnedCharacter, ctx: PickContext): MemberFit {
  const tags = activeKitTags(ctx.kits?.[c.info.id], c.instance);
  const s = statsOf(c.instance);
  const e = ctx.enemy;
  return {
    c,
    tags,
    hits: s?.health && e?.medianDamage ? s.health / e.medianDamage : undefined,
    lands: s?.focus !== undefined && e ? s.focus >= e.medianResist : undefined,
  };
}

/** 0 for an unboosted node, 1 for one boosted to +300% health or more. */
export function boostLevel(e: EnemyProfile | undefined): number {
  return e ? Math.min(1, Math.max(0, e.healthBoost / FULL_BOOST)) : 0;
}

function kitValue(f: MemberFit): number {
  let v = 0;
  for (const t of KIT_TAGS) {
    if (!f.tags.has(t)) continue;
    v += TAG_WEIGHT[t] * (t === 'lockdown' && f.lands === false ? MISSED_DEBUFF : 1);
  }
  return Math.min(MEMBER_CAP, v);
}

/** One character's worth on this node: power, raised by useful kit mechanics as boosts grow. */
function memberScore(f: MemberFit, boost: number): number {
  return power(f.c) * (1 + boost * kitValue(f));
}

/**
 * The best teams the roster can field for a node. Each candidate team (guide pick, saved squads,
 * recommended teams) keeps its members who can enter, topped up with the best other eligible
 * characters; a "best kit fit" team is built purely from mechanics.
 *
 * On a lightly boosted node this is power plus synergy. As node boosts grow, kits count for more:
 * health-scaled damage, lockdown that lands, tempo, drain and sustain. Members who'd fall to
 * one enemy hit drag the team down.
 */
export function bestTeams(roster: OwnedCharacter[], req: Requirements | undefined, candidates: CandidateTeam[], limit = 3, ctx: PickContext = {}): TeamPick[] {
  const boost = boostLevel(ctx.enemy);
  const fits = new Map(eligibleCharacters(roster, req).map((c) => [c.info.id, memberFit(c, ctx)]));
  const ranked = [...fits.values()].sort((a, b) => memberScore(b, boost) - memberScore(a, boost));
  const size = Math.min(5, req?.minCharacters ?? 5);
  if (ranked.length < size) return [];
  const named = new Set(req?.specificCharacters ?? []);

  const build = (label: string, core: MemberFit[]): TeamPick => {
    const must = [...named].map((id) => fits.get(id)).filter((f): f is MemberFit => !!f);
    const team = [...new Set([...must, ...core])].slice(0, size);
    const coreCount = team.filter((m) => core.includes(m)).length;
    for (const f of ranked) {
      if (team.length >= size) break;
      if (!team.includes(f)) team.push(f);
    }
    const total = team.reduce((s, f) => s + power(f.c), 0);
    const kit = team.reduce((s, f) => s + memberScore(f, boost), 0);
    const known = team.filter((f) => f.hits !== undefined);
    const sturdy = known.length ? known.filter((f) => (f.hits ?? 0) >= 2).length : undefined;
    // A member who can't take two hits is a turn the enemy gets for free.
    const survival = sturdy === undefined ? 1 : 0.6 + 0.4 * (sturdy / team.length);
    return {
      label,
      members: team.map((f) => f.c),
      fits: team,
      core: coreCount,
      power: total,
      sturdy,
      score: kit * (1 + SYNERGY * Math.max(0, coreCount - 1)) * survival,
    };
  };

  const picks = candidates
    .map((t) => ({ label: t.label, core: t.ids.map((id) => fits.get(id)).filter((f): f is MemberFit => !!f) }))
    .filter((t) => t.core.length >= 2)
    .map((t) => build(t.label, t.core));
  picks.push(build(boost > 0 && ranked.some((f) => f.tags.size) ? 'Best kit fit' : 'Your strongest eligible', []));

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
