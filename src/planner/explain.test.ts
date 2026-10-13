import { describe, expect, it } from 'vitest';
import { explainStep } from './explain';
import type { ScheduledStep } from './schedule';

const step = (over: Partial<ScheduledStep>): ScheduledStep => ({
  characterId: 'A', kind: 'gear', title: 'Gear tier 15 → 16', cost: [], missing: [], status: 'ready', gold: 200_000, score: 1,
  uses: [{ item: 'GEAR_X', quantity: 10 }],
  why: { value: 10, weight: 4, goal: false, unchecked: false, price: 2, share: 0.5, scarcest: 'GEAR_X' },
  ...over,
});
const id = (x: string) => x;

describe('explainStep', () => {
  it('names the goal, the top reason and the scarce material', () => {
    const c = explainStep(step({ goal: 'For Odin', why: { value: 10, weight: 4, goal: true, unchecked: false, price: 2, share: 0.5, scarcest: 'GEAR_X' } }), 1,
      [{ label: 'Raids squad', weight: 50 }, { label: 'Crucible squad', weight: 20 }], id, () => 'Gear X');
    expect(c.summary).toBe('#1 because it moves A toward the bar for Odin, which counts triple, and A ranks high for “Raids squad” and 1 more reason.');
    expect(c.cost).toBe('200K gold and 50% of your Gear X.');
    expect(c.worth).toMatch(/biggest single stat jump/);
  });
  it('says what puts it above the next step', () => {
    const next = step({ characterId: 'B', why: { value: 10, weight: 1.5, goal: false, unchecked: false, price: 2, share: 0.5 } });
    expect(explainStep(step({}), 1, [], id, id, next).versus).toBe('Above B: Gear tier 15 → 16 mainly because A matters more to your plan than B.');
  });
});
