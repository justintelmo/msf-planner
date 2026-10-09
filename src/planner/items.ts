import type { Cost } from '../api/types';
import { GOLD } from './build';

const TIER: Record<string, string> = { GREEN: 'T1', BLUE: 'T2', PURPLE: 'T3', ORANGE: 'T4', TEAL: 'T5', RED: 'T6' };

/** Readable names for item ids, e.g. ABILITY_MATERIAL_PURPLE_ABILITY_MAT → "T3 ability mats". */
export function itemLabel(id: string, characterName: (id: string) => string | undefined): string {
  if (id === GOLD) return 'gold';
  const shard = /^SHARD_(.+)$/.exec(id);
  if (shard) return `${characterName(shard[1]) ?? titleCase(shard[1])} shards`;
  const ability = /^ABILITY_MATERIAL_(\w+?)_ABILITY_MAT$/.exec(id);
  if (ability) return `${TIER[ability[1]] ?? ability[1]} ability mats`;
  const unique = /^ABILITY_MATERIAL_UNIQUE_ABILITY_MAT_(.+)$/.exec(id);
  if (unique) return `unique ability mat (${titleCase(unique[1])})`;
  const ions = /^ISO8-TIER-(\d)(?:-([A-C]))?-CURRENCY$/.exec(id);
  if (ions) return `T${Number(ions[1]) + 1}${ions[2] ? ` level ${'ABC'.indexOf(ions[2]) + 1}` : ''} ions`;
  return titleCase(id.replace(/^GEAR_/, ''));
}

function titleCase(s: string): string {
  return s.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function formatCost(cost: Cost, label: (id: string) => string): string {
  return cost.map((c) => `${compact(c.quantity)} ${label(c.item)}`).join(', ');
}

export function compact(n: number): string {
  if (n >= 1e6) return `${+(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e4) return `${+(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString();
}
