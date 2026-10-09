import { describe, expect, it } from 'vitest';
import { checkRequirements, matchesFilter, type OwnedCharacter } from './requirements';

const char = (id: string, traits: string[], yellow: number, gear: number, power = 100): OwnedCharacter => ({
  info: { id, traits },
  instance: { id, activeYellow: yellow, gearTier: gear, level: 90, power },
});

const roster = [
  char('A', ['Hero', 'Mutant'], 7, 18, 500),
  char('B', ['Hero', 'Mutant'], 5, 15, 300),
  char('C', ['Villain', 'Mutant'], 7, 19, 400),
  char('D', ['Hero', 'Tech'], 0, 0),
];

describe('matchesFilter', () => {
  it('requires every listed field', () => {
    expect(matchesFilter(roster[0], { allTraits: ['Hero', 'Mutant'], gearTier: 17 })).toBe(true);
    expect(matchesFilter(roster[1], { allTraits: ['Hero', 'Mutant'], gearTier: 17 })).toBe(false);
    expect(matchesFilter(roster[2], { anyTraits: ['Hero'] })).toBe(false);
    expect(matchesFilter(roster[2], { exceptTraits: ['Villain'] })).toBe(false);
  });
});

describe('iso8ClassLevel', () => {
  it('uses the active ISO-8 class level', () => {
    const c = { info: { id: 'X' }, instance: { id: 'X', activeYellow: 7, iso8: { active: 'raider', raider: 13 } } };
    expect(matchesFilter(c, { iso8ClassLevel: 13 })).toBe(true);
    expect(matchesFilter(c, { iso8ClassLevel: 14 })).toBe(false);
    expect(matchesFilter(roster[0], { iso8ClassLevel: 1 })).toBe(false);
  });
});

describe('checkRequirements', () => {
  it('ignores locked characters and sorts by power', () => {
    const r = checkRequirements(roster, { minCharacters: 2, anyCharacterFilters: [{ anyTraits: ['Mutant'] }] });
    expect(r.eligible.map((c) => c.info.id)).toEqual(['A', 'C', 'B']);
    expect(r.met).toBe(true);
  });

  it('reports unmet requirements', () => {
    const r = checkRequirements(roster, { minCharacters: 3, anyCharacterFilters: [{ anyTraits: ['Hero'] }] });
    expect(r.eligible).toHaveLength(2);
    expect(r.met).toBe(false);
  });
});
