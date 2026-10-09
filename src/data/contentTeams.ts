/**
 * Hand-curated teams recommended for content-unlock events, which the API doesn't
 * describe. Characters are matched by id first, then by display name.
 * Sources are listed so each entry can be re-checked when the content changes.
 */
export interface ContentTeam {
  content: string;
  team: string;
  characters: string[];
  source?: string;
}

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
];
