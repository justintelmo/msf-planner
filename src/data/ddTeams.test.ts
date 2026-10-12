import { describe, expect, it } from 'vitest';
import { DD_GUIDES, guideKey, nodeTeam } from './ddTeams';

describe('Dark Dimension guides', () => {
  it('finds the guide from the API id or name', () => {
    expect(guideKey('dd_id_insanity_event_card_info_08', 'DARK DIMENSION VIII')).toBe('8');
    expect(guideKey('dd_id_insanity_event_card_info_09', '')).toBe('9');
    expect(guideKey('dd_id_target_bluemarvel_details_bm', 'TARGET: BLUE MARVEL')).toBe('target-blue-marvel');
    expect(guideKey('dd_id_pd_encore_details', 'ENCORE DIMENSION (OMEGA)')).toBeUndefined();
  });
  it('maps a room name to its mission range', () => {
    expect(nodeTeam(DD_GUIDES['8'], 'Mission 11')?.main).toContain('Mephisto');
    expect(nodeTeam(DD_GUIDES['9'], 'Mission 16')?.rule).toBe('Any, gear 21');
    expect(nodeTeam(DD_GUIDES['8'], 'Room')).toBeUndefined();
  });
  it('covers every mission in each guide without gaps', () => {
    for (const [key, g] of Object.entries(DD_GUIDES)) {
      g.nodes.forEach((t, i) => i > 0 && expect(t.from, key).toBe(g.nodes[i - 1].to + 1));
    }
  });
});
