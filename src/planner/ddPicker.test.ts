import { describe, expect, it } from 'vitest';
import { bestTeams } from './ddPicker';
import type { OwnedCharacter } from './requirements';

const c = (id: string, traits: string[], power: number, iso = 13): OwnedCharacter => ({
  info: { id, traits },
  instance: { id, activeYellow: 7, gearTier: 19, level: 100, power, iso8: { active: 'striker', striker: iso } },
});

const roster = [
  c('PeniParker', ['City', 'Hero'], 500_000), c('PeterBParker', ['City', 'Hero'], 480_000), c('SpiderManPavitr', ['City', 'Hero'], 470_000),
  c('Knull', ['Cosmic', 'Villain'], 700_000), c('Thanos', ['Cosmic', 'Villain'], 650_000), c('Gorr', ['Cosmic', 'Villain'], 640_000),
  c('Gladiator', ['Cosmic', 'Villain'], 630_000), c('Kahhori', ['Cosmic', 'Hero'], 300_000, 8),
];
const req = { minCharacters: 5, anyCharacterFilters: [{ iso8ClassLevel: 13 }] };

describe('bestTeams', () => {
  it('keeps a team together and fills the gaps with the strongest eligible', () => {
    const [best, ...rest] = bestTeams(roster, req, [{ label: 'Spider-Society', ids: ['PeniParker', 'PeterBParker', 'SpiderManPavitr', 'Gwen', 'Miles'] }]);
    expect(best).toBeDefined();
    const all = [best, ...rest];
    const spiders = all.find((p) => p.label === 'Spider-Society')!;
    expect(spiders.core).toBe(3);
    expect(spiders.members.map((m) => m.info.id)).toEqual(['PeniParker', 'PeterBParker', 'SpiderManPavitr', 'Knull', 'Thanos']);
  });
  it('skips characters below the entry bar and returns nothing when five can’t enter', () => {
    const picks = bestTeams(roster, req, []);
    expect(picks[0].members.some((m) => m.info.id === 'Kahhori')).toBe(false);
    expect(bestTeams(roster, { minCharacters: 5, anyCharacterFilters: [{ allTraits: ['City'], iso8ClassLevel: 13 }] }, [])).toEqual([]);
  });
});
