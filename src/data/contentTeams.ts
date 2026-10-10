/**
 * Hand-curated teams recommended for content-unlock events, which the API doesn't
 * describe. Characters are matched by id first, then by display name.
 * Sources are listed so each entry can be re-checked when the content changes.
 */
export interface ContentTeam {
  content: string;
  team: string;
  /** Character ids or display names. */
  characters: string[];
  /** Every owned character with one of these traits counts, e.g. a whole faction. */
  traits?: string[];
  source?: string;
}

/** Marvel Church walkthrough, run at difficulty 6. */
const BATTLEWORLD_SOURCE = 'https://www.marvel.church/battleworld-dystopia/';

export const CONTENT_TEAMS: ContentTeam[] = [
  {
    content: 'Dark Dimension 8',
    team: 'Annihilators (Legendary nodes)',
    characters: ['Gladiator', 'ThanosEndgame', 'Gorr', 'Kahhori', 'Super Skrull', 'Vahl'],
    source: 'theriagames.com DD8 guide',
  },
  {
    content: 'Dark Dimension 8',
    team: 'Recommended upgrades for the Legendary nodes',
    characters: ['Mephisto', 'ShadowKing', 'OldManLogan', 'Knull'],
    source: 'theriagames.com DD8 guide',
  },
  {
    content: 'Dark Dimension 8',
    team: 'Fantastic Four (MCU), Cosmic nodes',
    characters: ['FranklinRichards', 'InvisibleWomanMCU', 'MrFantasticMCU', 'Thing', 'HumanTorch'],
  },
  {
    content: 'Battleworld: Dystopia',
    team: 'Zone 1 standard and miniboss: Insidious Six',
    characters: [],
    traits: ['InsidiousSix'],
    source: BATTLEWORLD_SOURCE,
  },
  {
    content: 'Battleworld: Dystopia',
    team: 'Zone 1 bonus (Mutant)',
    characters: ['Shadow King', 'Storm (Mighty)', 'Darkstar', 'Magneto (Phoenix Force)', 'Omega Red (Phoenix Force)'],
    source: BATTLEWORLD_SOURCE,
  },
  {
    content: 'Battleworld: Dystopia',
    team: 'Zone 1 bonus (Blaster)',
    characters: ['Odin', 'Storm (Mighty)', 'Magneto (Phoenix Force)', 'Songbird', 'Havok'],
    source: BATTLEWORLD_SOURCE,
  },
  {
    content: 'Battleworld: Dystopia',
    team: 'Zone 2 standard and miniboss: Brimstone plus Darkstar',
    characters: ['Darkstar'],
    traits: ['Brimstone'],
    source: BATTLEWORLD_SOURCE,
  },
  {
    content: 'Battleworld: Dystopia',
    team: 'Zone 2 bonus (Spiderverse and Knull)',
    characters: ['Knull', 'Vulture', 'Superior Spider-Man', 'Hobgoblin', 'Green Goblin (Classic)'],
    source: BATTLEWORLD_SOURCE,
  },
  {
    content: 'Battleworld: Dystopia',
    team: 'Zone 2 bonus (Support)',
    characters: ['Darkstar', 'Emma Frost (X-Men)', 'Falcon (Joaquin)', 'Thunderstrike', 'Superior Spider-Man'],
    source: BATTLEWORLD_SOURCE,
  },
  {
    content: 'Battleworld: Dystopia',
    team: 'Zone 3 standard and miniboss: Fantastic Four (MCU), Odin, Knull',
    characters: ['FranklinRichards', 'InvisibleWomanMCU', 'MrFantasticMCU', 'Thing', 'HumanTorch', 'Odin', 'Knull'],
    source: BATTLEWORLD_SOURCE,
  },
  {
    content: 'Battleworld: Dystopia',
    team: 'Zone 3 bonus (4 Diamonds)',
    characters: ['Knull', 'Havok', 'Omega Red (Phoenix Force)', 'Songbird', 'Franklin Richards'],
    source: BATTLEWORLD_SOURCE,
  },
  {
    content: 'Battleworld: Dystopia',
    team: 'Elite missions: Daring Warriors',
    characters: [],
    traits: ['DaringWarrior'],
    source: BATTLEWORLD_SOURCE,
  },
  {
    content: 'Battleworld: Dystopia',
    team: 'Maestro boss',
    characters: ['Professor X', 'Lady Bullseye', 'Adam Warlock', 'Hit-Monkey', 'Thanos (Endgame)'],
    source: BATTLEWORLD_SOURCE,
  },
];
