/**
 * Recommended teams per Dark Dimension mission, curated from Marvel Church guides (the API has
 * node requirements and enemies but no team advice). Names are display names or ids; they're
 * matched against the game's characters, and ones that don't match are shown as plain text.
 * Re-check against the source when a guide is updated.
 */
export interface NodeTeam {
  /** Mission numbers covered, inclusive. */
  from: number;
  to: number;
  /** The guide's summary of the entry rule, e.g. "City Villains, non-Legendary". */
  rule: string;
  main: string[];
  alts?: string[];
  note?: string;
}

export interface DdGuide {
  source: string;
  /** When the guide was published (Marvel Church sitemap). */
  updated: string;
  nodes: NodeTeam[];
}

const CITY = ['Superior Spider-Man', 'Hobgoblin', 'Scorpion', 'Vulture', 'Shocker'];
const CITY_ALTS = ['Hit-Monkey', 'Punisher', 'Silver Sable', 'Daredevil (Modern)', 'Phantom Rider', 'Gwenpool', 'Squirrel Girl', 'Daredevil', 'Night Thrasher'];
const GLOBAL = ['Omega Red (Phoenix Force)', 'Magneto (Phoenix Force)', 'Darkstar', 'Eclipse', 'Storm (Mighty)'];
const GLOBAL_ALTS = ['Songbird', 'Daimon Hellstrom', 'Hellcat', 'Living Mummy', 'Sentry', 'Angel', 'Morph'];
const COSMIC = ['Knull', 'Thanos', 'High Evolutionary', 'Executioner', 'Franklin Richards'];
const COSMIC_ALTS = ['Havok', 'Invisible Woman (MCU)', 'Mister Fantastic (MCU)', 'Human Torch', 'Nova (Sam Alexander)'];
const LEGENDARY = ['Old Man Logan', 'Quasar', 'Blastaar', 'Thunderstrike', 'Silver Surfer (Breaker)'];
const ANY = 'Any 5 characters at the gear tier; use your strongest synergy team.';

const OLD = 'https://www.marvel.church/heroes-for-dark-dimension/';

/** Keyed by Dark Dimension number, or "target-blue-marvel". */
export const DD_GUIDES: Record<string, DdGuide> = {
  '1': { source: OLD, updated: '2022-04-26', nodes: [{ from: 1, to: 10, rule: 'Any, gear 12', main: [], note: 'No node teams: bring your newest characters, ideally from one synergy team.' }] },
  '2': { source: OLD, updated: '2022-04-26', nodes: [{ from: 1, to: 16, rule: 'Any, gear 13', main: [], note: 'No node teams: bring your newest characters, ideally from one synergy team.' }] },
  '3': {
    source: OLD, updated: '2022-04-26',
    nodes: [
      { from: 1, to: 4, rule: 'Any, gear 14', main: [], note: ANY },
      { from: 5, to: 8, rule: 'Global', main: GLOBAL, alts: ['Morgan Le Fay', 'Rogue', 'Red Hulk', 'Old Man Logan', ...GLOBAL_ALTS.slice(0, 6), 'Omega Red', 'Angel'] },
      { from: 9, to: 12, rule: 'Cosmic', main: ['Knull', 'Thanos', 'High Evolutionary', 'Executioner', 'Silver Surfer (Breaker)'], alts: ['Quasar', 'Blastaar', 'Shadow King', 'Franklin Richards', ...COSMIC_ALTS] },
      { from: 13, to: 16, rule: 'City', main: CITY, alts: CITY_ALTS },
    ],
  },
  '4': {
    source: OLD, updated: '2022-04-26',
    nodes: [
      { from: 1, to: 3, rule: 'Any, gear 15', main: [], note: ANY },
      { from: 4, to: 6, rule: 'Global, non-Legendary', main: GLOBAL, alts: GLOBAL_ALTS },
      { from: 7, to: 9, rule: 'Cosmic, non-Legendary', main: COSMIC, alts: COSMIC_ALTS },
      { from: 10, to: 12, rule: 'City, non-Legendary', main: CITY, alts: CITY_ALTS },
      { from: 13, to: 15, rule: 'Legendary', main: ['Morgan Le Fay', 'Rogue', 'Red Hulk', 'Archangel', 'Old Man Logan'], alts: ['Shadow King', 'Quasar', 'Blastaar', 'Thunderstrike', 'Omega Red', 'Silver Surfer (Breaker)'] },
    ],
  },
  '5': {
    source: OLD, updated: '2022-04-26',
    nodes: [
      { from: 1, to: 3, rule: 'Any, gear 16', main: [], note: ANY },
      { from: 4, to: 6, rule: 'City, non-Legendary', main: CITY, alts: CITY_ALTS },
      { from: 7, to: 9, rule: 'Global, non-Legendary', main: GLOBAL, alts: GLOBAL_ALTS },
      { from: 10, to: 12, rule: 'Cosmic, non-Legendary', main: COSMIC, alts: COSMIC_ALTS },
      { from: 13, to: 15, rule: 'Legendary', main: ['Morgan Le Fay', 'Rogue', 'Red Hulk', 'Archangel', 'Old Man Logan'], alts: ['Shadow King', 'Quasar', 'Blastaar', 'Thunderstrike', 'Omega Red', 'Silver Surfer (Breaker)'] },
    ],
  },
  '6': {
    source: OLD, updated: '2022-04-26',
    nodes: [
      { from: 1, to: 2, rule: 'Any, gear 18', main: [], note: ANY },
      { from: 3, to: 5, rule: 'Global, non-Legendary', main: GLOBAL, alts: ['Apocalypse', ...GLOBAL_ALTS] },
      { from: 6, to: 8, rule: 'Cosmic, non-Legendary', main: COSMIC, alts: COSMIC_ALTS },
      { from: 9, to: 11, rule: 'City, non-Legendary', main: CITY, alts: CITY_ALTS },
      { from: 12, to: 13, rule: 'Legendary, non-Horseman', main: LEGENDARY, alts: ['Shadow King', 'Omega Red'] },
      { from: 14, to: 15, rule: 'Legendary or Apocalypse', main: LEGENDARY, alts: ['Apocalypse', 'Shadow King', 'Omega Red', 'Morgan Le Fay', 'Rogue', 'Red Hulk'] },
    ],
  },
  '7': {
    source: OLD, updated: '2022-04-26',
    nodes: [
      { from: 1, to: 3, rule: 'Any, gear 19', main: [], note: ANY },
      { from: 4, to: 5, rule: 'City, non-Legendary, non-Mythic', main: CITY, alts: CITY_ALTS },
      { from: 6, to: 7, rule: 'Global, non-Legendary, non-Mythic', main: GLOBAL, alts: GLOBAL_ALTS },
      { from: 8, to: 9, rule: 'Cosmic, non-Legendary, non-Mythic', main: COSMIC, alts: COSMIC_ALTS },
      { from: 10, to: 11, rule: 'Legendary', main: LEGENDARY, alts: ['Shadow King', 'Omega Red'] },
      { from: 12, to: 13, rule: 'Mythic, 4 characters', main: ['Super Skrull', 'Apocalypse', 'Ultimus', 'Odin'], alts: ['Doctor Doom', 'Mephisto', 'Dormammu', 'Kestrel'], note: 'Doctor Doom in place of Odin if you don’t have him; Mephisto on a timed or second run.' },
    ],
  },
  '8': {
    source: 'https://www.marvel.church/characters-for-dark-dimension-viii/', updated: '2024-09-09',
    nodes: [
      { from: 1, to: 2, rule: 'Any, purple ISO-8 level 3', main: [], note: 'Any strong team; the guide suggests Spider-Society.' },
      { from: 3, to: 4, rule: 'City Heroes, non-Legendary', main: ['Silver Sable', 'Daredevil (Modern)', 'Punisher', 'Hit-Monkey', 'Gwenpool'] },
      { from: 5, to: 6, rule: 'City Villains, non-Legendary', main: ['Vulture', 'Superior Spider-Man', 'Hobgoblin', 'Scorpion', 'Shocker'] },
      { from: 7, to: 8, rule: 'Global Heroes, non-Legendary', main: ['Daimon Hellstrom', 'Living Mummy', 'Hellcat', 'Storm (Mighty)', 'Eclipse'] },
      { from: 9, to: 10, rule: 'Global Villains, non-Legendary', main: ['Apocalypse', 'Omega Red (Phoenix Force)', 'Magneto (Phoenix Force)', 'Darkstar', 'Lady Bullseye'] },
      { from: 11, to: 13, rule: 'Cosmic or Legendary', main: ['Mephisto', 'Thanos', 'Shadow King', 'Silver Surfer (Breaker)', 'Knull'], alts: ['Super Skrull'] },
    ],
  },
  '9': {
    source: 'https://www.marvel.church/characters-for-dark-dimension-ix/', updated: '2026-04-17',
    nodes: [
      { from: 1, to: 2, rule: 'Any, gear 21', main: [], note: ANY },
      { from: 3, to: 5, rule: 'City, non-Mythic/Epic/Legendary', main: ['Venom', 'Toxin', 'Riot', 'Rachel Cole-Alves', 'Hobgoblin'], alts: ['Spider-Man (Big Time)', 'Vulture', 'Superior Spider-Man', 'Gwenpool', 'Squirrel Girl', 'Iron Fist', 'Night Thrasher', 'Blade (Mighty)', 'Spider-Woman (Julia)', 'Spider-Man'] },
      { from: 6, to: 8, rule: 'Cosmic, non-Mythic/Epic/Legendary', main: ['Executioner', 'Thanos (Endgame)', 'Minn-Erva', 'Thanos', 'Knull'], alts: ['Franklin Richards', 'Mister Fantastic (MCU)', 'Invisible Woman (MCU)', 'Human Torch', 'High Evolutionary', 'Nova (Sam Alexander)', 'Havok', 'Ikaris', 'Sersi', 'Kingo'], note: 'Ikaris and Sersi only together.' },
      { from: 9, to: 11, rule: 'Global, non-Mythic/Epic/Legendary', main: ['Quicksilver (Symbiote)', 'Whiplash', 'Daimon Hellstrom', 'Hellcat', 'Darkstar'], alts: ['Sentry', 'Maestro', 'Storm (Mighty)', 'Yo-Yo', 'Songbird', 'Lady Bullseye', 'Lady Deathstrike', 'Deadpool', 'Emma Frost (X-Men)', 'Moon Girl', 'Jeff the Land Shark', 'Eclipse', 'Red Guardian', 'Hawkeye'] },
      { from: 12, to: 13, rule: 'Legendary or Villain Epic', main: ['Magneto (Phoenix Force)', 'Omega Red (Phoenix Force)', 'Omega Red', 'Silver Surfer (Breaker)', 'Old Man Logan'], alts: ['Quasar', 'Blastaar', 'Thunderstrike', 'Shadow King', 'Juggernaut (Zombie)', 'Kestrel (Zombie)', 'Star-Lord', 'Jubilee', 'Scorpion (Breaker)'] },
      { from: 14, to: 15, rule: 'Mythic or Hero Epic', main: ['Professor Xavier', 'Odin', 'Mephisto', 'Blue Marvel', 'Captain Britain'], alts: ['Apocalypse', 'Super Skrull', 'Dormammu', 'Doctor Doom', 'Kestrel'] },
      { from: 16, to: 16, rule: 'Any, gear 21', main: [], note: ANY },
    ],
  },
  'target-blue-marvel': {
    source: 'https://www.marvel.church/target-blue-marvel/', updated: '2025-11-01',
    nodes: [
      { from: 1, to: 1, rule: 'Any, purple ISO-8 level 4', main: [], note: 'Any of your Conqueror or non-Mythic Cosmic teams.' },
      { from: 2, to: 3, rule: 'Conquerors (Combat mods)', main: ['Quasar', 'Blastaar', 'Franklin Richards', 'Invisible Woman (MCU)', 'Mister Fantastic (MCU)'], alts: ['Human Torch', 'Azazel', 'Strange (Heartless)', 'Thing'], note: 'Fantastic Four (MCU), Insidious Six and Brimstone get event bonuses.' },
      { from: 4, to: 5, rule: 'Cosmic, non-Mythic (Arena mods)', main: ['Quasar', 'Blastaar', 'Franklin Richards', 'Invisible Woman (MCU)', 'Mister Fantastic (MCU)'], alts: ['Human Torch', 'Azazel', 'Strange (Heartless)', 'Thing', 'Knull', 'Shadow King', 'Thanos (Endgame)', 'Hela', 'Kahhori'] },
      { from: 6, to: 7, rule: 'City, non-Mythic (Raid mods)', main: ['Superior Spider-Man', 'Hobgoblin', 'Vulture', 'Scorpion', 'Shocker'], alts: ['Daredevil (Modern)', 'Silver Sable', 'Hit-Monkey', 'Punisher', 'Elektra', 'Blade', 'Oath', 'Phantom Rider', 'Green Goblin (Classic)'], note: 'Vulture and Shocker count as Insidious Six.' },
      { from: 8, to: 9, rule: 'Global, non-Mythic (War mods)', main: ['Daimon Hellstrom', 'Hellcat', 'Living Mummy', 'Elsa Bloodstone', 'Old Man Logan'], alts: ['Juggernaut (Zombie)', 'Scarlet Witch (Zombie)', 'Peggy Carter', 'Falcon (Joaquin)', 'Patriot', 'Captain America (Sam)', 'Lady Deathstrike', 'Ares', 'Songbird', 'Omega Red (Phoenix Force)', 'Phoenix', 'Emma Frost'], note: 'Strange (Heartless) is Cosmic, so he can’t go here.' },
      { from: 10, to: 10, rule: 'Any, purple ISO-8 level 5', main: [], note: 'Any of the teams above.' },
    ],
  },
};

/** Guide key for a Dark Dimension from its id or name, e.g. "..._08" or "Dark Dimension VIII" → "8". */
export function guideKey(id: string, name = ''): string | undefined {
  const text = `${id} ${name}`.toUpperCase();
  if (text.includes('BLUE') && text.includes('MARVEL')) return 'target-blue-marvel';
  const roman: Record<string, string> = { III: '3', IV: '4', V: '5', VI: '6', VII: '7', VIII: '8', IX: '9' };
  const r = /DARK DIMENSION ([IVX]+)\b/.exec(text);
  if (r && roman[r[1]]) return roman[r[1]];
  const n = /(?:_|DD)0?(\d)\b/.exec(id.toUpperCase());
  return n && DD_GUIDES[n[1]] ? n[1] : undefined;
}

/** The team advice for a mission, read from a room name like "Mission 11". */
export function nodeTeam(guide: DdGuide | undefined, roomName: string): NodeTeam | undefined {
  const n = Number(/(\d+)/.exec(roomName)?.[1]);
  return n ? guide?.nodes.find((t) => n >= t.from && n <= t.to) : undefined;
}
