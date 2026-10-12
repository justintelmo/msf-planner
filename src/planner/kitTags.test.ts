import { describe, expect, it } from 'vitest';
import { activeKitTags, extractKitTags } from './kitTags';

const kit = {
  basic: { levels: { '1': { description: 'Attack primary target for 200% Piercing.' } } },
  special: {
    levels: {
      '1': { description: 'Attack all enemies for 150% damage.\nHeal self for 10% of Max Health.' },
      '5': { description: 'Attack all enemies for 150% damage + 3% of target\'s Max Health.\nApply <color=#ff0>Stun</color> to the primary target.' },
    },
  },
  passive: { levels: { '1': { description: 'This character is immune to Stun.\nOn turn, reduce Speed Bar of all allies by 10%.' } } },
};

describe('extractKitTags', () => {
  it('finds each mechanic at the level it first appears, ignoring self-protection and heals', () => {
    const hits = extractKitTags(kit);
    expect(hits.map((h) => [h.tag, h.slot, h.level])).toEqual([
      ['piercing', 'basic', 1],
      ['sustain', 'special', 1],
      ['maxHealth', 'special', 5],
      ['lockdown', 'special', 5],
    ]);
  });
  it('only counts tags the character has unlocked', () => {
    const hits = extractKitTags(kit);
    expect([...activeKitTags(hits, { id: 'x', basic: 7, special: 4 }).keys()]).toEqual(['piercing', 'sustain']);
    expect([...activeKitTags(hits, { id: 'x', basic: 7, special: 7 }).keys()]).toContain('maxHealth');
  });
});
