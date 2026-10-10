import { idOf, type CharacterInfo, type CharacterInstance, type Cost, type UpgradeTables } from '../api/types';
import { sumCost } from './build';

/**
 * ISO-8 has two halves. The class (striker, fortifier, …) is levelled with ions, but a class
 * level can't go past the crystals: five crystal slots in a matrix (green, blue, purple), each
 * with 0-5 pips. Class level L needs matrix tier ⌈L/5⌉ with every crystal at pip L − 5(tier − 1),
 * e.g. level 12 = purple matrix, five crystals at pip 2 (the API's own shorthand: "fortifier,12"
 * is "purple,2,2,2,2,2,fortifier,12").
 */
export const CRYSTAL_SLOTS = ['health', 'damage', 'armor', 'focus', 'resist'] as const;
export type CrystalSlot = (typeof CRYSTAL_SLOTS)[number];
const MATRIX = ['green', 'blue', 'purple'];
/** Crystal fuse costs depend on the character's role, which the game models as a trait. */
const ROLES = ['blaster', 'brawler', 'controller', 'protector', 'support'];

/** Matrix tier (1 green, 2 blue, 3 purple) and each slot's crystal level counted across tiers: purple pip 2 = 12. */
export interface Crystals {
  tier: number;
  levels: Record<CrystalSlot, number>;
}

export function roleOf(info: CharacterInfo): string | undefined {
  const traits = (info.traits ?? []).map((t) => (idOf(t) ?? '').toLowerCase());
  return ROLES.find((r) => traits.includes(r));
}

type Pips = Partial<Record<CrystalSlot | 'matrix', number | string>>;

export function crystalsOf(i: CharacterInstance | undefined, classLevel: number): Crystals {
  const iso = (i?.iso8 ?? {}) as Pips;
  const tier = Math.max(1, MATRIX.indexOf(String(iso.matrix ?? 'green')) + 1);
  const hasPips = CRYSTAL_SLOTS.some((s) => typeof iso[s] === 'number');
  // Older data without pips: assume the crystals match the class level they allow.
  if (!hasPips) return { tier: Math.max(1, Math.ceil(classLevel / 5)), levels: Object.fromEntries(CRYSTAL_SLOTS.map((s) => [s, classLevel])) as Crystals['levels'] };
  return { tier, levels: Object.fromEntries(CRYSTAL_SLOTS.map((s) => [s, (tier - 1) * 5 + Number(iso[s] ?? 0)])) as Crystals['levels'] };
}

/** Fuse cost of one crystal level. The table is indexed either across tiers (1-15) or per tier (1-5). */
function fuseCost(table: Record<string, Cost> | undefined, level: number): Cost | undefined {
  if (!table) return undefined;
  const folded = Object.keys(table).some((k) => Number(k) > 5);
  return table[String(folded ? level : ((level - 1) % 5) + 1)];
}

export interface CrystalPlan {
  cost: Cost;
  /** Set when crystal or matrix costs couldn't be counted. */
  unknown?: string;
  /** e.g. "Crystals to pip 3 (blue matrix)". */
  detail?: string;
  /** Minimum character level for the matrix, when the API gives one. */
  levelRequired?: number;
}

/** Matrix upgrades and crystal fusing needed before the class can reach level `to`. */
export function crystalPlan(upgrades: UpgradeTables, info: CharacterInfo, crystals: Crystals, to: number): CrystalPlan {
  if (to <= 0) return { cost: [] };
  const needTier = Math.ceil(to / 5);
  const short = CRYSTAL_SLOTS.filter((s) => crystals.levels[s] < to);
  if (!short.length) return { cost: [] };
  const detail = `Includes fusing ${short.length} crystal${short.length > 1 ? 's' : ''} to ${MATRIX[needTier - 1] ?? 'tier ' + needTier} pip ${to - 5 * (needTier - 1)}.`;
  const role = roleOf(info);
  const tables = role ? upgrades.iso8FuseCosts?.[role] : undefined;
  if (!tables) {
    return {
      cost: [], detail,
      unknown: role ? 'Crystal fuse costs haven’t loaded; press Sync.' : 'Couldn’t tell this character’s role, so crystal costs aren’t counted.',
    };
  }
  const costs: Cost[] = [];
  let missingTable = false;
  for (const s of short) {
    for (let l = crystals.levels[s] + 1; l <= to; l++) {
      const c = fuseCost(tables[s], l);
      if (c) costs.push(c);
      else missingTable = true;
    }
  }
  let levelRequired: number | undefined;
  for (let t = crystals.tier + 1; t <= needTier; t++) {
    const c = upgrades.iso8MatrixUpgradeCosts?.[String(t)];
    if (c) costs.push(c);
    levelRequired = upgrades.iso8MatrixLevelRequirements?.[String(t)] ?? levelRequired;
  }
  return {
    cost: sumCost(...costs), detail, levelRequired,
    unknown: missingTable ? 'Some crystal fuse costs are missing from the API data.' : undefined,
  };
}
