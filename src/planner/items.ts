import type { Cost } from '../api/types';
import { GOLD } from './build';

const TIER: Record<string, string> = { GREEN: 'T1', BLUE: 'T2', PURPLE: 'T3', ORANGE: 'T4', TEAL: 'T5', RED: 'T6' };

/** Readable names for item ids, e.g. ABILITY_MATERIAL_PURPLE_ABILITY_MAT → "T3 ability mats". */
export function itemLabel(id: string, characterName: (id: string) => string | undefined): string {
  if (id === GOLD) return 'gold';
  const shard = /^SHARD_(.+)$/.exec(id);
  if (shard) return `${characterName(shard[1]) ?? titleCase(shard[1])} shards`;
  const red = /^STORE_RED_STAR_(.+)$/.exec(id);
  if (red) return `${characterName(red[1]) ?? titleCase(red[1])} red star`;
  const ability = /^ABILITY_MATERIAL_(\w+?)_ABILITY_MAT$/.exec(id);
  if (ability) return `${TIER[ability[1]] ?? ability[1]} ability mats`;
  const unique = /^ABILITY_MATERIAL_UNIQUE_ABILITY_MAT_(.+)$/.exec(id);
  if (unique) return `unique ability mat (${titleCase(unique[1])})`;
  const ions = /^ISO8-TIER-(\d)(?:-([A-C]))?-CURRENCY$/.exec(id);
  // Ion levels as the game names them: A covers levels 1-3, B level 4, C level 5.
  if (ions) return `T${Number(ions[1]) + 1}${ions[2] ? ` level ${{ A: 1, B: 4, C: 5 }[ions[2]]}` : ''} ions`;
  const crystal = /^ISOITEM_([A-Z]+)_([A-Z]+)_([A-Z]+)_(\d+)$/.exec(id);
  if (crystal) return `${TIER[crystal[1]] ?? crystal[1]} ${titleCase(crystal[2])} ${titleCase(crystal[3])} level ${((Number(crystal[4]) - 1) % 5) + 1} crystal`;
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
  if (n >= 1e4) return `${+(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`;
  return n.toLocaleString();
}
