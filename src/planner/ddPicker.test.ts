import { describe, expect, it } from 'vitest';
import { bestTeams, enemyProfile } from './ddPicker';
import type { KitTagHit } from './kitTags';
import type { OwnedCharacter } from './requirements';

const c = (id: string, traits: string[], power: number, iso = 13): OwnedCharacter => ({
  info: { id, traits },
  instance: { id, activeYellow: 7, gearTier: 19, level: 100, basic: 7, power, iso8: { active: 'striker', striker: iso } },
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

  it('favours kit mechanics over raw power when a node is heavily boosted', () => {
    const enemyUnit = { id: 'Gorr', nodeEffects: { boosts: { health: 700, damage: 900 } }, stats: { health: 25_000_000, damage: 1_500_000, resist: 30_000 } };
    const node = { combat: { right: { waves: [{ units: [enemyUnit, enemyUnit] }] } } };
    const enemy = enemyProfile(node)!;
    expect(enemy.medianHealth).toBe(25_000_000);
    expect(enemy.healthBoost).toBe(700);
    const hit = (tag: KitTagHit['tag']): KitTagHit[] => [{ tag, slot: 'basic', level: 1, text: '' }];
    const kits = { Kahhori: hit('maxHealth'), Gladiator: hit('maxHealth'), Gorr: hit('drain') };
    const cosmic = { minCharacters: 5, anyCharacterFilters: [{ anyTraits: ['Cosmic'] }] };
    const plain = bestTeams(roster, cosmic, [], 1)[0];
    const boosted = bestTeams(roster, cosmic, [], 1, { enemy, kits })[0];
    expect(plain.label).toBe('Your strongest eligible');
    expect(boosted.label).toBe('Best kit fit');
    expect(boosted.members.map((m) => m.info.id)).toEqual(['Gladiator', 'Gorr', 'Knull', 'Thanos', 'Kahhori']);
    expect(boosted.fits.find((f) => f.c.info.id === 'Kahhori')!.tags.has('maxHealth')).toBe(true);
  });
});
