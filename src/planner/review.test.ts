import { describe, expect, it } from 'vitest';
import type { CharacterInstance, EventInfo } from '../api/types';
import type { SyncPrint } from '../data/syncHistory';
import type { OwnedCharacter } from './requirements';
import { reviewSync } from './review';

const DAY = 86_400;
const now = 10 * DAY * 1000;
const inst = (id: string, over: Partial<CharacterInstance> = {}): CharacterInstance => ({
  id, level: 80, activeYellow: 5, gearTier: 14, basic: 5, special: 5, ultimate: 5, passive: 3, ...over,
});
const char = (id: string, traits: string[], over: Partial<CharacterInstance> = {}): OwnedCharacter => ({
  info: { id, name: id, traits }, instance: inst(id, over),
});
const before = (roster: CharacterInstance[], events: EventInfo[] = [], inventory: Record<string, number> = {}): SyncPrint => ({
  syncedAt: now - 2 * DAY * 1000, source: 'live', roster, inventory, events,
});
const blitz = (id: string, trait: string, gearTier: number, start: number, end: number): EventInfo => ({
  id, type: 'blitz', name: id, startTime: start, endTime: end,
  blitz: { requirements: { anyCharacterFilters: [{ allTraits: [trait], gearTier }] } },
});
const base = { ranked: [], targets: {}, nameOf: (id: string) => id, now };

describe('reviewSync', () => {
  it('calls a goal upgrade good, even when it finished the goal', () => {
    const r = reviewSync({
      ...base, before: before([inst('A')]), owned: [char('A', [], { gearTier: 16 })], inventory: {}, events: [],
      targets: {}, prevTargets: { A: { target: { gearTier: 16 }, why: 'For Odin' } },
    });
    expect(r.characters[0]).toMatchObject({ verdict: 'good', changes: ['Gear 14 → 16'] });
    expect(r.characters[0].why[0]).toBe('Now meets the bar for Odin');
    expect(r.mood).toBe('great');
  });

  it('credits an event that ended since the last sync and flags unused investment', () => {
    const ended = blitz('Mutant Blitz', 'Mutant', 15, 9 * DAY, 9.5 * DAY);
    const r = reviewSync({
      ...base, before: before([inst('M'), inst('X')], [ended]),
      owned: [char('M', ['Mutant'], { gearTier: 15 }), char('X', ['Hero'], { gearTier: 16, ultimate: 7 })],
      inventory: {}, events: [],
    });
    const byId = Object.fromEntries(r.characters.map((c) => [c.characterId, c]));
    expect(byId.M.verdict).toBe('good');
    expect(byId.M.why[0]).toContain('ended since your last sync');
    expect(byId.X.verdict).toBe('questionable');
    expect(r.mood).toBe('off-plan');
    expect(r.eventsEnded).toEqual(['Mutant Blitz']);
  });

  it('lists goal characters left behind and material changes', () => {
    const r = reviewSync({
      ...base, before: before([inst('A'), inst('B')], [], { CONSUMABLE_XPLVL80: 100, SHARD_A: 5 }),
      owned: [char('A', []), char('B', [])], inventory: { CONSUMABLE_XPLVL80: 40, SHARD_A: 25 }, events: [],
      targets: { B: { target: { gearTier: 17 }, why: 'For Blue Marvel' } },
    });
    expect(r.mood).toBe('none');
    expect(r.missed).toEqual(['B']);
    expect(r.materials).toEqual(['Training modules: −60', 'Character shards: +20']);
  });

  it('counts a step from the previous upgrade list as good even when the character ranks low', () => {
    const ranked = Array.from({ length: 30 }, (_, i) => ({ character: char(`R${i}`, []), score: 100 - i, reasons: [] }));
    ranked.push({ character: char('Low', []), score: 1, reasons: [] });
    const r = reviewSync({
      ...base, ranked, before: before([inst('Low'), inst('Other')]),
      owned: [char('Low', [], { gearTier: 15 }), char('Other', [], { special: 6 })], inventory: {}, events: [],
      planned: [
        { characterId: 'Low', kind: 'gear', title: 'Gear tier 14 → 15', rank: 1 },
        { characterId: 'Other', kind: 'gear', title: 'Gear tier 14 → 15', rank: 2 },
      ],
    });
    const byId = Object.fromEntries(r.characters.map((c) => [c.characterId, c]));
    expect(byId.Low.verdict).toBe('good');
    expect(byId.Low.why[0]).toBe('#1 on your upgrade list (Gear tier 14 → 15)');
    expect(byId.Other.verdict).toBe('ok');
    expect(byId.Other.why[0]).toContain('not what was done');
  });
});
