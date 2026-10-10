import { describe, expect, it } from 'vitest';
import { withAllModes } from '../planner/priority';
import { combineFilters, isLatestOfType, isMetRaid, modeReports, raidFamily, raidTier } from './modeGoals';
import type { Catalog, GoalReport } from './unlocks';
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

  it('uses the game’s difficulty 7 numbers when nothing is typed in', () => {
    const [bw] = modeReports({ raids: {}, battleworld: { difficulty: 7, characters: 1, target: {} } }, null, [c('A', [], 19)], {});
    expect(bw.sources[0].checks[0].plan.picks[0].gap).toMatchObject({ level: 108, gearTier: 20, activeRed: 10, iso8ClassLevel: 15 });
  });

  it('groups raids by type and only targets the newest of each by default', () => {
    const raid = (id: string, name: string) => ({ id, name, maxDifficulty: 3, difficulties: {}, rooms: [] });
    const raids = [
      raid('raid_trepidation', 'Trepidation Raids'), raid('raid_trepidation_02', 'Trepidation Raids'), raid('raid_trepidation_03', 'Trepidation Raid'),
      raid('raid_orchis_1', 'Orchis I'), raid('raid_orchis_2', 'Orchis II'), raid('raid_ultimus', 'Ultimus'),
    ];
    const catalog: Catalog = { loadedAt: 0, sources: [], errors: [], raids };
    expect(raidFamily(raids[0], catalog).key).toBe(raidFamily(raids[2], catalog).key);
    expect(raidTier(raids[4])).toBe(2);
    expect(raids.filter((r) => isLatestOfType(r, catalog)).map((r) => r.id)).toEqual(['raid_trepidation_03', 'raid_orchis_2', 'raid_ultimus']);
    const reports = modeReports({}, catalog, [], {});
    expect(reports.map((r) => r.group)).toEqual(['Raids: Trepidation Raid', 'Raids: Orchis', 'Raids: Ultimus']);
  });

  it('slots Battleworld into an older saved mode order', () => {
    expect(withAllModes(['war', 'raids', 'crucible', 'blitz'])).toEqual(['war', 'raids', 'battleworld', 'crucible', 'blitz']);
  });
});

describe('isMetRaid', () => {
  const report = (met: boolean[], group = 'Raids: Ultimus'): GoalReport => ({
    characterId: 'r', group,
    sources: [{ checks: met.map((m) => ({ plan: { met: m } })) }],
  } as unknown as GoalReport);
  it('is true only for raids where every requirement is met', () => {
    expect(isMetRaid(report([true, true]))).toBe(true);
    expect(isMetRaid(report([true, false]))).toBe(false);
    expect(isMetRaid(report([true], 'Battleworld'))).toBe(false);
    expect(isMetRaid({ characterId: 'r', group: 'Raids: X', sources: [] })).toBe(false);
  });
});
