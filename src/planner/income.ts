import { idOf, type AbilitySlot, type CharacterInstance, type UpgradeTables } from '../api/types';

/** Ability materials (T1 green … T5 unique) only go into ability upgrades, so their income can be read from syncs. */
export const ABILITY_MATERIAL = /^ABILITY_MATERIAL_/;
const SLOTS: AbilitySlot[] = ['basic', 'special', 'ultimate', 'passive'];
/** Syncs closer together than this say too little about a day's income. */
const MIN_HOURS = 12;
/** Older samples age out so the rate follows what you earn now. */
const KEEP_DAYS = 30;

/** What one stretch between two syncs earned. */
export interface IncomeSample {
  from: number;
  to: number;
  /** Item id → amount earned (the stock change plus what upgrades spent). */
  gained: Record<string, number>;
}

/** Ability materials the roster's ability level-ups between two syncs used. */
export function abilitySpend(before: CharacterInstance[], after: CharacterInstance[], costs: UpgradeTables['abilityUpgradeCosts']): Record<string, number> {
  const was = new Map(before.map((c) => [c.id, c]));
  const out: Record<string, number> = {};
  for (const c of after) {
    const prev = was.get(c.id);
    if (!prev) continue;
    for (const slot of SLOTS) {
      for (let lvl = (prev[slot] ?? 0) + 1; lvl <= (c[slot] ?? 0); lvl++) {
        for (const { item, quantity } of costs[slot]?.[lvl] ?? []) {
          const id = idOf(item);
          if (id && ABILITY_MATERIAL.test(id)) out[id] = (out[id] ?? 0) + (quantity ?? 0);
        }
      }
    }
  }
  return out;
}

/** Ability material earned between two syncs: what the stock gained plus what upgrades spent. */
export function incomeSample(
  before: { syncedAt: number; roster: CharacterInstance[]; inventory: Record<string, number> },
  after: { syncedAt: number; roster: CharacterInstance[]; inventory: Record<string, number> },
  costs: UpgradeTables['abilityUpgradeCosts'],
): IncomeSample {
  const spent = abilitySpend(before.roster, after.roster, costs);
  const ids = new Set([...Object.keys(before.inventory), ...Object.keys(after.inventory), ...Object.keys(spent)].filter((id) => ABILITY_MATERIAL.test(id)));
  const gained: Record<string, number> = {};
  for (const id of ids) {
    const n = (after.inventory[id] ?? 0) - (before.inventory[id] ?? 0) + (spent[id] ?? 0);
    if (n > 0) gained[id] = n;
  }
  return { from: before.syncedAt, to: after.syncedAt, gained };
}

/** Adds a sample and drops the ones older than a month. */
export function addSample(samples: IncomeSample[], s: IncomeSample, now = s.to): IncomeSample[] {
  return [...samples, s].filter((x) => x.to > now - KEEP_DAYS * 864e5 && x.to > x.from);
}

/** Per-day income for each ability material, once the samples cover at least half a day. */
export function incomeRates(samples: IncomeSample[]): { perDay: Record<string, number>; days: number } {
  const ms = samples.reduce((t, s) => t + (s.to - s.from), 0);
  const days = ms / 864e5;
  if (ms < MIN_HOURS * 36e5) return { perDay: {}, days };
  const perDay: Record<string, number> = {};
  for (const s of samples) for (const [id, n] of Object.entries(s.gained)) perDay[id] = (perDay[id] ?? 0) + n / days;
  return { perDay, days };
}
