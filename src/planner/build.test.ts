import { describe, expect, it } from 'vitest';
import type { UpgradeTables } from '../api/types';
import upgradeTables from '../data/upgradeTables.json';
import { buildPlan, GOLD } from './build';
import type { OwnedCharacter } from './requirements';

const upgrades = upgradeTables as UpgradeTables;
const blue = 'ABILITY_MATERIAL_BLUE_ABILITY_MAT';
const purple = 'ABILITY_MATERIAL_PURPLE_ABILITY_MAT';

const hero = (id: string, over: Partial<NonNullable<OwnedCharacter['instance']>> = {}): OwnedCharacter => ({
  info: { id, name: id, unlockStars: 3, starItems: [`SHARD_${id.toUpperCase()}`] },
  instance: {
    id, level: 100, activeYellow: 7, gearTier: 19, basic: 7, special: 7, ultimate: 7, passive: 5,
    iso8: { active: 'striker', striker: 20 }, ...over,
  },
});

const plan = (owned: OwnedCharacter[], inventory: { item: string; quantity: number }[], gold?: number) =>
  buildPlan({ owned, inventory, upgrades, order: owned.map((c) => c.info.id), levelCap: 100, gold });

describe('buildPlan', () => {
  it('has nothing to do for a maxed character', () => {
    expect(plan([hero('A')], []).characters[0].steps).toEqual([]);
  });

  it('merges affordable ability levels and reports the first one it can’t afford', () => {
    // Special 3→4 costs 35 blue, 4→5 costs 65 purple, 5→6 costs 125 purple.
    const steps = plan([hero('A', { special: 3 })], [{ item: blue, quantity: 35 }, { item: purple, quantity: 100 }])
      .characters[0].steps;
    expect(steps.map((s) => [s.title, s.status])).toEqual([
      ['Special 3 → 5', 'ready'],
      ['Special 5 → 6', 'short'],
    ]);
    expect(steps[1].missing).toEqual([{ item: purple, quantity: 90 }]);
  });

  it('gives materials to earlier characters first', () => {
    const p = plan([hero('A', { special: 4 }), hero('B', { special: 4 })], [{ item: purple, quantity: 65 }]);
    expect(p.characters[0].steps[0].status).toBe('ready');
    expect(p.characters[1].steps[0].status).toBe('short');
  });

  it('promotes stars with owned shards and asks for the rest', () => {
    // 5★ total is 310 shards, 6★ is 510, 7★ is 810.
    const steps = plan([hero('A', { activeYellow: 5 })], [{ item: 'SHARD_A', quantity: 300 }]).characters[0].steps;
    expect(steps.map((s) => [s.title, s.status])).toEqual([
      ['Promote 5★ → 6★', 'ready'],
      ['6★ → 7★', 'short'],
    ]);
    expect(steps[1].detail).toBe('Have 100 of 300 shards');
  });

  it('checks gold only when a budget is given', () => {
    const inv = [{ item: purple, quantity: 1000 }];
    expect(plan([hero('A', { special: 4 })], inv).doNow).toHaveLength(1);
    const broke = plan([hero('A', { special: 4 })], inv, 0);
    expect(broke.doNow).toHaveLength(0);
    expect(broke.shortages.find((s) => s.item === GOLD)?.quantity).toBe(12000);
  });

  it('upgrades abilities with effects in top modes first', () => {
    const p = buildPlan({
      owned: [hero('A', { special: 4, basic: 6 })], upgrades, order: ['A'], levelCap: 100,
      inventory: [{ item: purple, quantity: 1000 }, { item: 'ABILITY_MATERIAL_ORANGE_ABILITY_MAT', quantity: 1000 }],
      modeTags: { A: [{ slot: 'basic', level: 7, mode: 'raids', text: 'In Raids, gain Speed Up.' }] },
      modeWeights: { raids: 40 },
    });
    expect(p.characters[0].steps[0].title).toBe('Basic 6 → 7');
    expect(p.characters[0].steps[0].modeEffects?.[0].mode).toBe('raids');
  });

  it('plans goal thresholds first and continues from there', () => {
    const gear = { '17': { slots: [{ piece: 'P17' }] }, '18': { slots: [{ piece: 'P18' }] }, '19': { slots: [] }, '20': { slots: [] } };
    const p = buildPlan({
      owned: [hero('A'), hero('B', { gearTier: 17, activeYellow: 5 })], upgrades, order: ['A', 'B'], levelCap: 100,
      inventory: [{ item: 'P17', quantity: 1 }, { item: 'SHARD_B', quantity: 200 }],
      gearTiers: { B: gear }, targets: { B: { target: { gearTier: 19, activeYellow: 6 }, why: 'DD8' } },
    });
    const b = p.characters.find((c) => c.character.info.id === 'B')!;
    expect(p.characters[0].character.info.id).toBe('B');
    expect(b.steps.filter((s) => s.goal).map((s) => [s.title, s.status])).toEqual([
      ['Promote 5★ → 6★', 'ready'],
      ['Finish gear tier 17 → 18', 'ready'],
      ['Finish gear tier 18 → 19', 'short'],
    ]);
    // The regular plan then starts from 6★ and gear 19.
    expect(b.steps.some((s) => !s.goal && s.title === '6★ → 7★')).toBe(true);
  });

  it('unlocks a locked character at its unlock stars', () => {
    const locked: OwnedCharacter = { info: { id: 'L', unlockStars: 3, starItems: ['SHARD_L'] }, instance: { id: 'L' } };
    const steps = plan([locked], [{ item: 'SHARD_L', quantity: 100 }]).characters[0].steps;
    expect(steps[0].title).toBe('Unlock at 3★');
    expect(steps[0].status).toBe('ready');
  });
});
