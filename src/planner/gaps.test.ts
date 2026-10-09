import { describe, expect, it } from 'vitest';
import { planRequirement } from './gaps';
import type { OwnedCharacter } from './requirements';

const c = (id: string, traits: string[], gear: number, iso = 13, power = 1): OwnedCharacter => ({
  info: { id, traits },
  instance: { id, activeYellow: 7, gearTier: gear, level: 100, power, iso8: { active: 'raider', raider: iso } },
});

describe('planRequirement', () => {
  const roster = [
    c('A', ['Cosmic'], 19), c('B', ['Cosmic'], 18), c('C', ['Legendary'], 19, 10), c('D', ['Cosmic'], 15),
    c('E', ['Mutant'], 20), c('F', ['Cosmic'], 19), c('G', ['Cosmic'], 19, 13, 5),
  ];
  const req = {
    minCharacters: 5,
    anyCharacterFilters: [{ anyTraits: ['Cosmic'], iso8ClassLevel: 13, gearTier: 19 }, { anyTraits: ['Legendary'], iso8ClassLevel: 13 }],
  };

  it('picks qualifying characters first, then the cheapest gaps', () => {
    const p = planRequirement(roster, req);
    expect(p.picks.map((x) => x.character.info.id)).toEqual(['G', 'A', 'F', 'B', 'C']);
    expect(p.ready).toBe(3);
    expect(p.met).toBe(false);
    expect(p.picks[3].gap).toEqual({ gearTier: 19 });
    expect(p.picks[4].gap).toEqual({ iso8ClassLevel: 13 });
  });

  it('keeps named characters on the team and fills the rest from the traits', () => {
    const named = { minCharacters: 5, anyCharacterFilters: [{ allTraits: ['Cosmic'], gearTier: 19 }], specificCharacters: ['E'] };
    const p = planRequirement(roster, named);
    expect(p.needed).toBe(5);
    expect(p.picks[0].character.info.id).toBe('E');
    expect(p.picks).toHaveLength(5);
    expect(p.picks.map((x) => x.character.info.id)).toContain('A');
  });
});
