import type { CharacterInfo, CharacterInstance, EventInfo, ItemQuantity, PlayerCard } from '../api/types';

/**
 * Made-up demo data so the app can be tried without logging in.
 * Character ids and traits only approximate the real game.
 */
export const SAMPLE_CARD: PlayerCard = { name: 'Demo Commander', tcp: 4_250_000, stp: 610_000, charactersCollected: 9 };

export const SAMPLE_CHARACTERS: CharacterInfo[] = [
  { id: 'SpiderMan', name: 'Spider-Man', traits: ['Hero', 'Bio', 'Brawler', 'City', 'SpiderVerse'] },
  { id: 'Cyclops', name: 'Cyclops', traits: ['Hero', 'Mutant', 'Blaster', 'Global', 'Xmen'] },
  { id: 'Wolverine', name: 'Wolverine', traits: ['Hero', 'Mutant', 'Brawler', 'Global', 'Xmen'] },
  { id: 'Storm', name: 'Storm', traits: ['Hero', 'Mutant', 'Controller', 'Global', 'Xmen'] },
  { id: 'Phoenix', name: 'Phoenix', traits: ['Hero', 'Mutant', 'Blaster', 'Cosmic', 'Xmen'] },
  { id: 'Gambit', name: 'Gambit', traits: ['Hero', 'Mutant', 'Blaster', 'Global', 'Xmen'] },
  { id: 'Apocalypse', name: 'Apocalypse', traits: ['Villain', 'Mutant', 'Controller', 'Global'] },
  { id: 'Magneto', name: 'Magneto', traits: ['Villain', 'Mutant', 'Controller', 'Global', 'Brotherhood'] },
  { id: 'IronMan', name: 'Iron Man', traits: ['Hero', 'Tech', 'Blaster', 'Global', 'Avenger'] },
  { id: 'CaptainAmerica', name: 'Captain America', traits: ['Hero', 'Bio', 'Protector', 'Global', 'Avenger'] },
  { id: 'Thor', name: 'Thor', traits: ['Hero', 'Mystic', 'Brawler', 'Cosmic', 'Avenger'] },
  { id: 'Hulk', name: 'Hulk', traits: ['Hero', 'Bio', 'Brawler', 'Global', 'Avenger'] },
];

const inst = (id: string, yellow: number, red: number, gear: number, level: number, power: number): CharacterInstance => ({
  id, activeYellow: yellow, activeRed: red, gearTier: gear, level, power, basic: 6, special: 5, ultimate: 5, passive: 4,
});

export const SAMPLE_ROSTER: CharacterInstance[] = [
  inst('SpiderMan', 7, 5, 18, 95, 420_000),
  inst('Cyclops', 6, 4, 17, 90, 310_000),
  inst('Wolverine', 7, 5, 17, 90, 335_000),
  inst('Storm', 5, 3, 16, 85, 240_000),
  inst('Phoenix', 7, 6, 18, 95, 455_000),
  inst('Gambit', 4, 2, 14, 75, 150_000),
  inst('Magneto', 6, 4, 17, 90, 300_000),
  inst('IronMan', 7, 5, 18, 95, 410_000),
  inst('CaptainAmerica', 5, 3, 16, 85, 230_000),
  { id: 'Apocalypse' },
  { id: 'Thor' },
  { id: 'Hulk' },
];

export const SAMPLE_INVENTORY: ItemQuantity[] = [
  { item: 'Gold', quantity: 48_500_000 },
  { item: 'TrainingModule', quantity: 1_240 },
];

const now = Math.floor(Date.now() / 1000);
const day = 86_400;

export const SAMPLE_EVENTS: EventInfo[] = [
  {
    id: 'demo-blitz-xmen',
    type: 'blitz',
    name: 'X-Men Blitz (demo)',
    details: 'Mutant heroes at Gear 17 or higher.',
    startTime: now - day,
    endTime: now + 2 * day,
    blitz: {
      requirements: {
        minCharacters: 5,
        anyCharacterFilters: [{ allTraits: ['Mutant', 'Hero'], gearTier: 17 }],
        description: 'Mutant Heroes, Gear 17+',
      },
    },
  },
  {
    id: 'demo-tower-avengers',
    type: 'tower',
    name: 'Avengers Tower (demo)',
    startTime: now + 2 * day,
    endTime: now + 9 * day,
    tower: {
      requirements: {
        minCharacters: 5,
        anyCharacterFilters: [{ anyTraits: ['Avenger'], activeYellow: 5 }],
        description: 'Avengers at 5 yellow stars',
      },
    },
  },
  {
    id: 'demo-milestone',
    type: 'milestone',
    name: 'Power Surge Milestone (demo)',
    startTime: now - 3 * day,
    endTime: now + 4 * day,
    milestone: { type: 'solo', brackets: [{ objective: { progress: { completedTier: 6, goalTier: 15, points: 41_000, goal: 120_000 } } }] },
  },
];
