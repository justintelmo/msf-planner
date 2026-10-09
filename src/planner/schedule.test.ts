import { describe, expect, it } from 'vitest';
import type { UpgradeTables } from '../api/types';
import upgradeTables from '../data/upgradeTables.json';
import { GOLD } from './build';
import type { OwnedCharacter } from './requirements';
import { buildSchedule, levelCost } from './schedule';

const base = upgradeTables as UpgradeTables;
const upgrades: UpgradeTables = {
  ...base,
  characterXpCosts: [
    { xpReward: 1000, cost: [{ item: 'XP80', quantity: 1 }, { item: GOLD, quantity: 500 }] },
    { xpReward: 100, cost: [{ item: 'XP40', quantity: 1 }, { item: GOLD, quantity: 50 }] },
  ],
  characterLevelTotalXp: [null, ...Array.from({ length: 100 }, (_, i) => i * 1000)],
};

const hero = (id: string, over: Partial<NonNullable<OwnedCharacter['instance']>> = {}): OwnedCharacter => ({
  info: { id, name: id, unlockStars: 3, starItems: [`SHARD_${id}`] },
  instance: {
    id, level: 100, activeYellow: 7, gearTier: 15, basic: 7, special: 7, ultimate: 7, passive: 5,
    iso8: { active: 'striker', striker: 20 }, ...over,
  },
});

const gearTiers = {
  '15': { slots: Array.from({ length: 6 }, (_, i) => ({ piece: `P15_${i}` })) },
  '16': { slots: [] },
};

describe('levelCost', () => {
  it('uses big modules first and rounds up with the smallest', () => {
    // Level 10 → 13 = 3000 XP: 2 big modules on hand, then 10 small ones.
    expect(levelCost(upgrades, (i) => (i === 'XP80' ? 2 : 0), 10, 13)).toEqual([
      { item: 'XP80', quantity: 2 },
      { item: GOLD, quantity: 1500 },
      { item: 'XP40', quantity: 10 },
    ]);
  });
});

describe('buildSchedule', () => {
  const inv = Array.from({ length: 6 }, (_, i) => ({ item: `RAW_${i}`, quantity: 1 }));
  const recipes = Object.fromEntries(
    Array.from({ length: 6 }, (_, i) => [`P15_${i}`, [{ item: `RAW_${i}`, quantity: 1 }, { item: GOLD, quantity: 10_000 }]]),
  );

  it('crafts gear from materials and charges the gold', () => {
    const s = buildSchedule({
      owned: [hero('A')], inventory: inv, upgrades, levelCap: 100, priority: { A: 40 },
      gearTiers: { A: gearTiers }, recipes,
    });
    expect(s.steps[0].title).toBe('Gear tier 15 → 16');
    expect(s.steps[0].gold).toBe(60_000);
    expect(s.steps[0].crafted).toHaveLength(6);
  });

  it('places steps on days from gold income and stops at the horizon', () => {
    const s = buildSchedule({
      owned: [hero('A')], inventory: inv, upgrades, levelCap: 100, priority: { A: 40 },
      gearTiers: { A: gearTiers }, recipes, gold: 20_000, goldPerDay: 20_000, days: 1,
    });
    expect(s.steps).toHaveLength(0);
    expect(s.stoppedBy).toBe('gold');
    const later = buildSchedule({
      owned: [hero('A')], inventory: inv, upgrades, levelCap: 100, priority: { A: 40 },
      gearTiers: { A: gearTiers }, recipes, gold: 20_000, goldPerDay: 20_000, days: 3,
    });
    expect(later.steps[0].day).toBe(2);
  });

  it('levels a character to open its next ability level, then upgrades it', () => {
    const s = buildSchedule({
      owned: [hero('A', { level: 57, special: 5 })],
      inventory: [{ item: 'XP80', quantity: 50 }, { item: 'ABILITY_MATERIAL_PURPLE_ABILITY_MAT', quantity: 1000 }],
      upgrades, levelCap: 100, priority: { A: 40 },
    });
    const titles = s.steps.map((x) => x.title);
    expect(titles.indexOf('Level 57 → 58')).toBeLessThan(titles.indexOf('Special 5 → 6'));
  });

  it('puts goal thresholds ahead of a higher-priority character', () => {
    const s = buildSchedule({
      owned: [hero('A', { gearTier: 15 }), hero('B', { gearTier: 15 })],
      inventory: inv, upgrades, levelCap: 100, priority: { A: 40, B: 10 },
      gearTiers: { A: gearTiers, B: gearTiers }, recipes,
      targets: { B: { target: { gearTier: 16 }, why: 'For Odin' } },
    });
    expect(s.steps[0].characterId).toBe('B');
    expect(s.steps[0].goal).toBe('For Odin');
    expect(s.blocked[0].characterId).toBe('A');
  });
});
