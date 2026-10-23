import { describe, expect, it } from 'vitest';
import { abilitySpend, addSample, incomeRates, incomeSample } from './income';
import type { UpgradeTables } from '../api/types';

const ORANGE = 'ABILITY_MATERIAL_ORANGE_ABILITY_MAT';
const costs = {
  basic: { '7': [{ item: ORANGE, quantity: 180 }, { item: 'SC', quantity: 100000 }] },
  special: {}, ultimate: {}, passive: {},
} as unknown as UpgradeTables['abilityUpgradeCosts'];
const day = 864e5;

describe('ability material income', () => {
  it('counts what level-ups spent', () => {
    expect(abilitySpend([{ id: 'Blade', basic: 6 }], [{ id: 'Blade', basic: 7 }], costs)).toEqual({ [ORANGE]: 180 });
  });

  it('adds spending back to the stock change', () => {
    const s = incomeSample(
      { syncedAt: 0, roster: [{ id: 'Blade', basic: 6 }], inventory: { [ORANGE]: 500 } },
      { syncedAt: day, roster: [{ id: 'Blade', basic: 7 }], inventory: { [ORANGE]: 400 } },
      costs,
    );
    expect(s.gained).toEqual({ [ORANGE]: 80 });
  });

  it('gives a daily rate only once the syncs cover half a day', () => {
    expect(incomeRates([{ from: 0, to: 36e5, gained: { [ORANGE]: 10 } }]).perDay).toEqual({});
    const samples = addSample([{ from: 0, to: day, gained: { [ORANGE]: 40 } }], { from: day, to: 3 * day, gained: { [ORANGE]: 80 } });
    expect(incomeRates(samples).perDay[ORANGE]).toBeCloseTo(40);
  });
});
