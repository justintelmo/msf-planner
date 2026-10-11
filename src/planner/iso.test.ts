import { describe, expect, it } from 'vitest';
import type { CharacterInstance, UpgradeTables } from '../api/types';
import upgradeTables from '../data/upgradeTables.json';
import { crystalPlan, crystalsOf } from './iso';

const fuse = (slot: string) => Object.fromEntries(Array.from({ length: 20 }, (_, i) => [String(i + 1), [{ item: `CRYSTAL_${slot}_${i + 1}`, quantity: 1 }]]));
const upgrades: UpgradeTables = {
  ...(upgradeTables as UpgradeTables),
  iso8FuseCosts: { controller: Object.fromEntries(['health', 'damage', 'armor', 'focus', 'resist'].map((s) => [s, fuse(s)])) },
  iso8MatrixUpgradeCosts: { '2': [{ item: 'MATRIX_BLUE', quantity: 1 }], '3': [{ item: 'MATRIX_PURPLE', quantity: 1 }] },
  iso8MatrixLevelRequirements: { '2': 50, '3': 75 },
};
const whiplash = { id: 'Whiplash', traits: ['Villain', 'Controller'] };
const inst = (iso8: Record<string, unknown>): CharacterInstance => ({ id: 'Whiplash', iso8: iso8 as CharacterInstance['iso8'] });

describe('crystals', () => {
  it('reads pips across matrix tiers', () => {
    expect(crystalsOf(inst({ matrix: 'purple', health: 2, damage: 3, armor: 2, focus: 2, resist: 2 }), 12)).toEqual({
      tier: 3, levels: { health: 12, damage: 13, armor: 12, focus: 12, resist: 12 },
    });
  });

  it('charges one target crystal per short slot and the next matrix before the class level', () => {
    // Blue matrix with damage at pip 5 and the rest at pip 4; class level 11 needs purple and pip 1 on all five.
    const c = crystalsOf(inst({ matrix: 'blue', health: 4, damage: 5, armor: 4, focus: 4, resist: 4, active: 'striker', striker: 9 }), 9);
    const plan = crystalPlan(upgrades, whiplash, c, 11);
    expect(plan.cost).toEqual(expect.arrayContaining([
      { item: 'CRYSTAL_damage_11', quantity: 1 }, { item: 'CRYSTAL_health_11', quantity: 1 }, { item: 'MATRIX_PURPLE', quantity: 1 },
    ]));
    expect(plan.cost.some((x) => x.item.endsWith('_10'))).toBe(false);
    expect(plan.levelRequired).toBe(75);
    expect(plan.detail).toContain('5 T3 level 1 crystals');
  });

  it('says so when the role or tables are unknown', () => {
    const c = crystalsOf(inst({ matrix: 'green', health: 1 }), 1);
    expect(crystalPlan(upgrades, { id: 'X', traits: [] }, c, 2).unknown).toMatch(/role/);
    expect(crystalPlan({ ...upgrades, iso8FuseCosts: undefined }, whiplash, c, 2).unknown).toMatch(/Sync/);
  });
});
