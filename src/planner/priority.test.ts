import { describe, expect, it } from 'vitest';
import type { EventInfo } from '../api/types';
import { rankCharacters, squadShare } from './priority';
import type { OwnedCharacter } from './requirements';

const c = (id: string, traits: string[] = [], gear = 15, name = id): OwnedCharacter => ({
  info: { id, name, traits },
  instance: { id, activeYellow: 7, gearTier: gear, power: 1 },
});

describe('rankCharacters', () => {
  const owned = [c('A'), c('B'), c('C', ['Mutant']), c('SuperSkrull', [], 15, 'Super Skrull'), c('Unused')];
  const event: EventInfo = {
    id: 'e', type: 'tower', name: 'Mutant Tower', startTime: 0, endTime: 2e9,
    tower: { requirements: { anyCharacterFilters: [{ anyTraits: ['Mutant'], gearTier: 17 }] } },
  };
  const ranked = rankCharacters({
    owned, modeOrder: ['raids', 'war'], squads: { raids: [['A', 'B']], war: [['A']] }, events: [event], now: 1,
    contentTeams: [{ content: 'DD8', team: 'T', characters: ['Super Skrull'] }],
  });

  it('adds up mode, content and event weights', () => {
    expect(ranked.map((r) => [r.character.info.id, r.score])).toEqual([
      ['A', 30], ['SuperSkrull', 35], ['C', 25], ['B', 20],
    ].sort((a, b) => (b[1] as number) - (a[1] as number)));
  });

  it('explains event gaps and leaves unused characters out', () => {
    expect(ranked.find((r) => r.character.info.id === 'C')?.reasons[0].label).toBe('Mutant Tower: needs gear 17 (at 15)');
    expect(ranked.some((r) => r.character.info.id === 'Unused')).toBe(false);
  });

  it('barely counts old squads far weaker than your best one in a mode', () => {
    const p = (id: string, power: number, traits: string[] = []): OwnedCharacter => ({ info: { id, name: id, traits }, instance: { id, power } });
    const roster = [p('Meta1', 9e6), p('Meta2', 9e6), p('Old1', 2e6, ['Aim']), p('Old2', 2e6, ['Aim'])];
    const r = rankCharacters({
      owned: roster, modeOrder: ['raids', 'war'], squads: { war: [['Old1', 'Old2'], ['Meta1', 'Meta2']] }, events: [], contentTeams: [],
    });
    expect(r.map((x) => x.character.info.id)).toEqual(['Meta1', 'Meta2']);
    expect(squadShare(7, 10)).toBeCloseTo(0.5);
    expect(squadShare(9.5, 10)).toBe(1);
  });

  it('counts unlock-event fits only for team traits, not origins like Cosmic', () => {
    const roster = [c('K', ['Cosmic', 'Villain']), c('S', ['Shield'])];
    const filters = (t: string) => [{ anyTraits: [t] }];
    const r = rankCharacters({
      owned: roster, modeOrder: [], squads: {}, events: [], contentTeams: [],
      contentFilters: [1, 2, 3].flatMap((i) => [{ name: `c${i}`, filters: filters('Cosmic') }, { name: `s${i}`, filters: filters('Shield') }]),
    });
    expect(r.map((x) => x.character.info.id)).toEqual(['S']);
  });
});
