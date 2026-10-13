import { describe, expect, it } from 'vitest';
import { charName, humanize, traitName } from './names';
import { squadNamer } from '../planner/priority';

describe('names', () => {
  it('splits ids into words and prefers curated trait names', () => {
    expect(humanize('SpiderManBigTime')).toBe('Spider-Man Big Time');
    expect(humanize('KravenTheHunter')).toBe('Kraven the Hunter');
    expect(humanize('MsMarvelHardLight')).toBe('Ms. Marvel Hard Light');
    expect(humanize('AntManWasp')).toBe('Ant-Man Wasp');
    expect(humanize('XForce')).toBe('X-Force');
    expect(humanize('PeterBParker')).toBe('Peter B. Parker');
    expect(humanize('ShangChi')).toBe('Shang-Chi');
    expect(charName(undefined, 'SpiderManBigTime')).toBe('Spider-Man (Big Time)');
    expect(humanize('GhostRiderRobbie')).toBe('Ghost Rider Robbie');
    expect(traitName('FantasticFourMCU')).toBe('Fantastic Four (MCU)');
  });
  it('names a squad by its shared team trait, else by members', () => {
    const c = (id: string, traits: string[]) => ({ info: { id, name: id, traits } });
    const owned = [c('Gorr', ['Annihilator', 'Cosmic']), c('Gladiator', ['Annihilator', 'Cosmic']), c('Thanos', ['Annihilator', 'Cosmic']), c('Kahhori', ['Cosmic']), c('Blade', ['Mystic'])];
    const name = squadNamer(owned);
    expect(name(['Gorr', 'Gladiator', 'Thanos', 'Kahhori'])).toBe('Annihilator');
    expect(name(['Kahhori', 'Blade'])).toBe('Kahhori, Blade');
  });
});
