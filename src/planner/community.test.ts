import { describe, expect, it } from 'vitest';
import type { CommunitySignal } from '../data/communitySignals';
import { communityReasons } from './community';

const c = (id: string, traits: string[] = []) => ({ info: { id, name: id, traits }, instance: { id, activeYellow: 7 } });
const owned = [c('Knull'), c('Toxin'), c('Nimrod', ['Orchis']), c('Sentinel', ['Orchis']), c('Odin')];
const src = [{ url: 'https://example/1', title: 't', date: '2026-08-23' }];
const signals: CommunitySignal[] = [
  { id: 's6', stance: 'build', team: 'Symbiote Six', characters: ['Knull', 'Toxin'], modes: ['war'], claim: 'strong', sources: src },
  { id: 'old', stance: 'enough', team: 'Orchis', traits: ['Orchis'], claim: 'old stats', sources: src },
  { id: 'hold', stance: 'hold', team: 'Odin', characters: ['Odin'], claim: 'wait', sources: src, until: '2026-10-01' },
];
const none = { squadModes: [], content: [], goals: [], fits: 0 };

describe('communityReasons', () => {
  const r = communityReasons(signals, owned, (id) =>
    id === 'Knull' ? { ...none, squadModes: ['war'] } : id === 'Sentinel' ? { ...none, content: ['Dark Dimension 8'] } : none, '2026-10-13');

  it('backs "build" advice with your squads, and counts it less when nothing uses the character', () => {
    expect(r.get('Knull')).toEqual([expect.objectContaining({ label: 'Reddit: build Symbiote Six (backed by your War squad)', weight: 15, url: 'https://example/1' })]);
    expect(r.get('Toxin')?.[0]).toMatchObject({ weight: 6 });
  });
  it('drops "don’t over-build" when your content still needs the character, and lapsed advice', () => {
    expect(r.get('Nimrod')?.[0]).toMatchObject({ weight: -10 });
    expect(r.get('Sentinel')?.[0]).toMatchObject({ weight: 0, label: 'Reddit says don’t over-build Orchis, but Dark Dimension 8 still needs them' });
    expect(r.has('Odin')).toBe(false);
  });
});
