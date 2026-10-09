import { describe, expect, it } from 'vitest';
import { rosterExport } from './export';
import type { Snapshot } from '../data/store';

const snapshot: Snapshot = {
  source: 'demo',
  syncedAt: Date.UTC(2026, 9, 9),
  card: { name: '<color=red>Tester</color>', tcp: 1_000_000 },
  characters: [
    { id: 'A', name: 'Alpha', traits: ['Hero', 'Mutant'] },
    { id: 'B', name: 'Beta', traits: ['Villain'] },
    { id: 'C', name: 'Locked' },
  ],
  roster: [
    { id: 'A', activeYellow: 7, activeRed: 9, gearTier: 19, level: 100, power: 500_000, basic: 7, special: 7, ultimate: 7, passive: 5, iso8: { active: 'striker', striker: 12, matrix: 'purple' } },
    { id: 'B', activeYellow: 5, activeRed: 3, gearTier: 15, level: 80, power: 200_000 },
    { id: 'C' },
  ],
  inventory: [],
  events: [],
};

describe('rosterExport', () => {
  it('lists unlocked characters strongest first with diamonds and iso', () => {
    const lines = rosterExport(snapshot).split('\n');
    expect(lines[0]).toBe('MSF roster export · Tester · 2026-10-09');
    expect(lines[1]).toBe('TCP 1,000,000 · 2 unlocked');
    expect(lines[3]).toBe('Alpha | 500,000 | 7Y/7R+2D | G19 | L100 | 7/7/7/5 | striker 12 (purple) | Hero,Mutant');
    expect(lines[4]).toBe('Beta | 200,000 | 5Y/3R | G15 | L80 | 0/0/0/0 | - | Villain');
    expect(lines).toHaveLength(5);
  });
});
