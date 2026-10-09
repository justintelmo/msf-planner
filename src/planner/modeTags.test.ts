import { describe, expect, it } from 'vitest';
import { extractModeTags } from './modeTags';

describe('extractModeTags', () => {
  it('tags the level where a mode effect first appears or changes', () => {
    const kit = {
      ultimate: {
        levels: {
          '1': { description: 'Attack primary target.' },
          '6': { description: 'Attack primary target.\nIn Raids, gain +10% Damage.' },
          '7': { description: 'Attack primary target.\nIn Raids, gain +20% Damage.' },
        },
      },
      passive: { levels: { '2': { description: 'Ally <color=#fff>War Machine</color> gains Speed.\nIn War, gain Taunt.' } } },
    };
    expect(extractModeTags(kit).map((t) => [t.slot, t.level, t.mode])).toEqual([
      ['ultimate', 6, 'raids'],
      ['ultimate', 7, 'raids'],
      ['passive', 2, 'war'],
    ]);
  });
});
