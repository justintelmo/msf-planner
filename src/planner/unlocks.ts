import type { DarkDimension, EpisodicInfo, EventInfo, NodeInfo, Requirements } from '../api/types';
import { plainName } from './export';

/** One place with entry requirements, e.g. a Dark Dimension room or a legendary event tier. */
export interface UnlockNode {
  label: string;
  requirements?: Requirements;
  /** Characters whose shards this node can reward. */
  rewards: string[];
  /** Energy per attempt, for campaign-style nodes. */
  energy?: number;
  /** Shards each repeatable win can drop. */
  drops?: ShardDrop[];
  /** Times the limited rewards can be won, when capped. */
  limit?: number;
}

/** A character's shards in a node's repeatable rewards. */
export interface ShardDrop {
  characterId: string;
  /** Shards per win on average; unknown when a "chance of" package hides the odds. */
  perWin?: number;
  /** Fewest and most shards one win can give. */
  min: number;
  max: number;
  /** True when the drop sits behind a chance the game data doesn't quantify. */
  chance: boolean;
  /** Part of the limited rewards rather than every win. */
  limited?: boolean;
}

/** Content that can unlock characters: a Dark Dimension or an episodic event. */
export interface UnlockSource {
  kind: string;
  id: string;
  name: string;
  subName?: string;
  nodes: UnlockNode[];
  /** Characters rewarded by any node or by completing the whole thing. */
  rewards: string[];
  /** Score tiers hand out yellow star tokens (trials), so stars come straight from this event. */
  starTokens?: boolean;
}

/** Maps reward item ids (e.g. SHARD_ODIN) to character ids. */
export type ShardIndex = Map<string, string>;

/**
 * Star rewards that aren't shards: yellow star tokens like UT_OLDMANLOGAN_UT4YSTRIALS (straight to 4★)
 * and red stars like RS_OLDMANLOGAN_1, as Pick Your Poison events such as Scourge hand out.
 */
export function characterToken(id: string, shards: ShardIndex): string | undefined {
  const m = /^(?:UT|RS)_([A-Z0-9]+)_/.exec(id);
  return m ? shards.get(`CHAR:${m[1]}`) : undefined;
}

/** The yellow stars a star token sets, e.g. 4 for UT_OLDMANLOGAN_UT4YSTRIALS. */
export function tokenStars(id: string): number | undefined {
  const m = /_UT(\d)YS/.exec(id);
  return m ? Number(m[1]) : undefined;
}

/**
 * Collects characters from a reward tree of any shape: SHARD_ item ids, or items
 * that name a characterId. Reward packages nest (oneOf, allOf, chanceOf, tiers).
 */
export function rewardCharacters(tree: unknown, shards: ShardIndex): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      const id = shards.get(v) ?? characterToken(v, shards);
      if (id) found.add(id);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.characterId === 'string' && typeof o.id === 'string' && /^(SHARD|UT|RS)_/.test(o.id)) found.add(o.characterId);
      Object.values(o).forEach(walk);
    }
  };
  walk(tree);
  return [...found];
}

type Package = { item?: unknown; oneOf?: Package[]; allOf?: Package[]; chanceOf?: Package; quantity?: number; maxQuantity?: number; weight?: number; pulls?: number };

/**
 * Shard drops in a reward package: oneOf children by weight, pulls multiplied, and
 * any "chanceOf" marked unknown since the game data doesn't give its odds.
 */
export function shardDrops(tree: unknown, shards: ShardIndex, limited = false): ShardDrop[] {
  const out = new Map<string, ShardDrop>();
  const walk = (p: Package | undefined, odds: number, pulls: number, chance: boolean) => {
    if (!p || typeof p !== 'object') return;
    if (p.item !== undefined) {
      const id = typeof p.item === 'string' ? p.item : (p.item as { id?: string })?.id;
      const cid = id && shards.get(id);
      if (!cid) return;
      const min = p.quantity ?? 1;
      const max = p.maxQuantity ?? min;
      const prev = out.get(cid);
      const each = ((min + max) / 2) * odds * pulls;
      out.set(cid, {
        characterId: cid, limited,
        chance: chance || !!prev?.chance,
        perWin: chance || prev?.chance ? undefined : (prev?.perWin ?? 0) + each,
        min: Math.min(prev?.min ?? Infinity, odds === 1 && !chance ? min * pulls : 0),
        max: (prev?.max ?? 0) + max * pulls,
      });
      return;
    }
    const n = pulls * (p.pulls ?? 1);
    if (p.allOf) p.allOf.forEach((c) => walk(c, odds, n, chance));
    if (p.oneOf) {
      const total = p.oneOf.reduce((t, c) => t + (c.weight ?? 1), 0) || 1;
      p.oneOf.forEach((c) => walk(c, odds * ((c.weight ?? 1) / total), n, chance));
    }
    if (p.chanceOf) walk(p.chanceOf, odds, n, true);
  };
  walk(tree as Package, 1, 1, false);
  return [...out.values()];
}

function hasCharacterRequirement(r: Requirements | undefined): r is Requirements {
  return !!r && !!(r.anyCharacterFilters?.length || r.specificCharacters?.length || r.minCharacters);
}

function nodeRewards(n: NodeInfo, shards: ShardIndex): string[] {
  return rewardCharacters([n.rewards, n.firstTimeRewards, n.limitedRewards], shards);
}

const firstReq = (r: NodeInfo['requirements']) => (Array.isArray(r) ? (r[0] ?? undefined) : r);

export function fromDarkDimension(dd: DarkDimension, shards: ShardIndex): UnlockSource {
  const ids = [...new Set([...(dd.rays ?? []).flat().filter(Boolean), ...Object.keys(dd.rooms ?? {})])];
  const nodes = ids
    .map((id) => ({ id, node: dd.rooms?.[id] }))
    .filter((x): x is { id: string; node: NodeInfo } => !!x.node)
    .map(({ id, node }) => ({ label: node.name ? plainName(node.name) : `Room ${id}`, requirements: firstReq(node.requirements), rewards: nodeRewards(node, shards) }));
  const completion = rewardCharacters([dd.completion, dd.ddCompletion, dd.nodeRewards], shards);
  return {
    kind: 'Dark Dimension', id: dd.id, name: plainName(dd.name ?? dd.id), subName: plainName(dd.subName),
    nodes, rewards: [...new Set([...completion, ...nodes.flatMap((n) => n.rewards)])],
  };
}

export function fromEpisodic(kind: string, ep: EpisodicInfo, shards: ShardIndex): UnlockSource {
  const nodes: UnlockNode[] = [];
  const prefix = plainName(ep.nodeName ?? ep.name ?? '');
  if (hasCharacterRequirement(ep.requirements)) nodes.push({ label: 'Entry', requirements: ep.requirements, rewards: [] });
  for (const [ch, chapter] of Object.entries(ep.chapters ?? {})) {
    if (hasCharacterRequirement(chapter.requirements)) {
      nodes.push({ label: `Chapter ${ch}`, requirements: chapter.requirements, rewards: [] });
    }
    for (const [tier, node] of Object.entries(chapter.tiers ?? {})) {
      const drops = [...shardDrops(node.rewards, shards), ...shardDrops(node.limitedRewards, shards, true)];
      nodes.push({
        label: `${prefix} ${ch}-${tier}`.trim(),
        requirements: firstReq(node.requirements),
        rewards: nodeRewards(node, shards),
        ...(node.energyCost ? { energy: node.energyCost } : {}),
        ...(drops.length ? { drops } : {}),
        ...(node.limitedRewardsLimit ? { limit: node.limitedRewardsLimit } : {}),
      });
    }
  }
  const all = rewardCharacters(ep, shards);
  return { kind, id: ep.id, name: plainName(ep.name ?? ep.id), subName: plainName(ep.subName), nodes, rewards: all };
}

const EVENT_KINDS: Record<string, string> = {
  milestone: 'Milestone', blitz: 'Blitz', tower: 'Tower', pickYourPoison: 'Pick Your Poison', battlePass: 'Battle Pass', strikePass: 'Strike Pass',
};

/**
 * A running event whose reward tiers (milestone, blitz, tower brackets…) hand out character shards.
 * Episodic events are left to the catalog, which reads their nodes.
 */
export function fromLiveEvent(e: EventInfo, shards: ShardIndex): UnlockSource | undefined {
  const parts = Object.keys(EVENT_KINDS).filter((k) => e[k as keyof EventInfo]);
  if (!parts.length) return undefined;
  const rewards = rewardCharacters(parts.map((k) => e[k as keyof EventInfo]), shards);
  if (!rewards.length) return undefined;
  const req = e.blitz?.requirements ?? e.tower?.requirements;
  const ladder = starLadder(e);
  return {
    kind: `${EVENT_KINDS[parts[0]]} event`, id: `event:${e.id}`, name: plainName(e.name ?? e.id),
    subName: [plainName(e.subName), ladder].filter(Boolean).join(' · '),
    nodes: hasCharacterRequirement(req) ? [{ label: 'Entry', requirements: req, rewards }] : [],
    rewards,
    ...(ladder.includes('★') ? { starTokens: true } : {}),
  };
}

const short = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

/** Score tiers that give star tokens or red stars, e.g. "4★ at 1.1M, … 7★ at 13.5M; red stars at 1.6M, 2.3M…". */
function starLadder(e: EventInfo): string {
  const yellow: string[] = [];
  const red: string[] = [];
  const brackets = [e.pickYourPoison, e.milestone].flatMap((x) => ((x as { brackets?: unknown[] } | undefined)?.brackets ?? []));
  for (const b of brackets) {
    const tiers = (b as { objective?: { tiers?: Record<string, { goal?: number; rewards?: unknown }> } }).objective?.tiers ?? {};
    for (const t of Object.values(tiers)) {
      const ids = JSON.stringify(t.rewards ?? '').match(/"(?:UT|RS)_[A-Z0-9_]+"/g) ?? [];
      for (const raw of ids) {
        const id = raw.slice(1, -1);
        const stars = tokenStars(id);
        if (stars) yellow.push(`${stars}★ at ${short(t.goal ?? 0)}`);
        else if (id.startsWith('RS_')) red.push(short(t.goal ?? 0));
      }
    }
  }
  return [yellow.length ? `score for ${yellow.join(', ')}` : '', red.length ? `red stars at ${red.join(', ')}` : ''].filter(Boolean).join('; ');
}

/** Requirement sets that differ, so repeated tiers with the same rules are checked once. */
export function distinctRequirements(source: UnlockSource): { labels: string[]; requirements: Requirements }[] {
  const groups = new Map<string, { labels: string[]; requirements: Requirements }>();
  for (const n of source.nodes) {
    if (!hasCharacterRequirement(n.requirements)) continue;
    const { description: _d, otherRequirements: _o, ...rest } = n.requirements;
    const key = JSON.stringify(rest);
    const g = groups.get(key) ?? { labels: [], requirements: n.requirements };
    g.labels.push(n.label);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** Event campaigns that must be cleared before this one opens. */
export function prerequisiteIds(source: UnlockSource): string[] {
  const ids = source.nodes.flatMap((n) => n.requirements?.otherRequirements?.allNodeCompletions ?? []).map((c) => c.id);
  return [...new Set(ids)].filter((id) => id !== source.id);
}
