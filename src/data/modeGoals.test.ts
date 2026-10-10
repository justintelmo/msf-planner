import { describe, expect, it } from 'vitest';
import { withAllModes } from '../planner/priority';
import { combineFilters, modeReports } from './modeGoals';
import type { Catalog } from './unlocks';
import type { OwnedCharacter } from '../planner/requirements';

const c = (id: string, traits: string[], gear: number): OwnedCharacter => ({
  info: { id, traits },
  instance: { id, activeYellow: 7, gearTier: gear, level: 100 },
});

describe('mode targets', () => {
  it('adds a difficulty bar to a room’s traits', () => {
    expect(combineFilters([{ allTraits: ['Mutant'], gearTier: 15 }], [{ gearTier: 18, level: 90 }])).toEqual([
      { allTraits: ['Mutant'], gearTier: 18, level: 90 },
    ]);
  });

  it('targets each raid at its top difficulty unless told otherwise', () => {
    const catalog: Catalog = {
      loadedAt: 0, sources: [], errors: [],
      raids: [{
        id: 'R', name: 'Raid', maxDifficulty: 2, rooms: [{ label: 'Room A1', requirements: { minCharacters: 5, anyCharacterFilters: [{ allTraits: ['Mutant'] }] }, rewards: [] }],
        difficulties: { '1': { requirements: { anyCharacterFilters: [{ gearTier: 17 }] } }, '2': { name: 'Hard', requirements: { anyCharacterFilters: [{ gearTier: 19 }] } } },
      }],
    };
    const roster = ['A', 'B', 'C', 'D', 'E'].map((id) => c(id, ['Mutant'], 18));
    const [report] = modeReports({}, catalog, roster, {});
    expect(report.label).toBe('Raid (Hard)');
    const room = report.sources[0].checks.find((ch) => ch.labels.includes('Room A1'))!;
    expect(room.plan.picks[0].gap).toEqual({ gearTier: 19 });
    expect(modeReports({ raids: { R: -1 } }, catalog, roster, {})).toHaveLength(0);
  });

  it('holds saved Battleworld squads to the typed-in bar', () => {
    const roster = [c('A', [], 15), c('B', [], 18), c('C', [], 19)];
    const [bw] = modeReports(
      { raids: {}, battleworld: { difficulty: 7, characters: 2, target: { gearTier: 18 } } }, null, roster, { battleworld: [['A']] },
    );
    const picks = bw.sources[0].checks[0].plan.picks.map((p) => p.character.info.id);
    expect(picks).toContain('A');
    expect(picks).toHaveLength(2);
  });

  it('slots Battleworld into an older saved mode order', () => {
    expect(withAllModes(['war', 'raids', 'crucible', 'blitz'])).toEqual(['war', 'raids', 'battleworld', 'crucible', 'blitz']);
  });
});
