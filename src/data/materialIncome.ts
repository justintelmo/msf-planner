import { incomeRates } from '../planner/income';
import { readIncome } from './syncHistory';

/** Ability material tiers, cheapest first. */
export const ABILITY_TIERS = ['GREEN', 'BLUE', 'PURPLE', 'ORANGE', 'UNIQUE'].map((c, i) => ({
  id: `ABILITY_MATERIAL_${c}_ABILITY_MAT`,
  label: `T${i + 1} Ability Material`,
}));

/** Wallet key for a typed daily income that replaces the estimate. */
export const perDayKey = (id: string) => `${id}/day`;

/** Daily ability material income: what you typed, else the estimate from your syncs. */
export function materialIncome(amounts: Record<string, number>): { perDay: Record<string, number>; estimated: Record<string, number>; days: number } {
  const { perDay: estimated, days } = incomeRates(readIncome());
  const perDay: Record<string, number> = {};
  for (const { id } of ABILITY_TIERS) {
    const v = amounts[perDayKey(id)] ?? estimated[id];
    if (v) perDay[id] = v;
  }
  return { perDay, estimated, days };
}
