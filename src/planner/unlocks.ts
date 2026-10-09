import type { DarkDimension, EpisodicInfo, NodeInfo, Requirements } from '../api/types';
import { plainName } from './export';

/** One place with entry requirements, e.g. a Dark Dimension room or a legendary event tier. */
export interface UnlockNode {
  label: string;
  requirements?: Requirements;
  /** Characters whose shards this node can reward. */
  rewards: string[];
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
}

/** Maps reward item ids (e.g. SHARD_ODIN) to character ids. */
export type ShardIndex = Map<string, string>;

/**
 * Collects characters from a reward tree of any shape: SHARD_ item ids, or items
 * that name a characterId. Reward packages nest (oneOf, allOf, chanceOf, tiers).
 */
export function rewardCharacters(tree: unknown, shards: ShardIndex): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      const id = shards.get(v);
      if (id) found.add(id);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.characterId === 'string' && typeof o.id === 'string' && o.id.startsWith('SHARD_')) found.add(o.characterId);
      Object.values(o).forEach(walk);
    }
  };
  walk(tree);
  return [...found];
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
    .map(({ node }) => ({ label: plainName(node.name ?? 'Room'), requirements: firstReq(node.requirements), rewards: nodeRewards(node, shards) }));
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
      nodes.push({
        label: `${prefix} ${ch}-${tier}`.trim(),
        requirements: firstReq(node.requirements),
        rewards: nodeRewards(node, shards),
      });
    }
  }
  const all = rewardCharacters(ep, shards);
  return { kind, id: ep.id, name: plainName(ep.name ?? ep.id), subName: plainName(ep.subName), nodes, rewards: all };
}

/** Requirement sets that differ, so repeated tiers with the same rules are checked once. */
export function distinctRequirements(source: UnlockSource): { labels: string[]; requirements: Requirements }[] {
  const groups = new Map<string, { labels: string[]; requirements: Requirements }>();
  for (const n of source.nodes) {
    if (!hasCharacterRequirement(n.requirements)) continue;
    const { description: _d, ...rest } = n.requirements;
    const key = JSON.stringify(rest);
    const g = groups.get(key) ?? { labels: [], requirements: n.requirements };
    g.labels.push(n.label);
    groups.set(key, g);
  }
  return [...groups.values()];
}
