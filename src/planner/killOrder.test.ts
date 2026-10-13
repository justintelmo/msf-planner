import { describe, expect, it } from 'vitest';
import { killPlan } from './killOrder';

const u = (id: string, health: number, damage: number, fx = {}) => ({ id, stats: { health, damage, speed: 120 }, nodeEffects: fx });

describe('killPlan', () => {
  const waves = [
    { units: [u('Tank', 40e6, 500e3), u('Cheater', 20e6, 1.5e6, { ultimateOverride: { costEnergy: 1 } }), u('Healer', 20e6, 1e6), u('Brute', 20e6, 1e6)] },
    { onFewerThan: 2, turnMeter: 300 },
    { onFewerThan: 7, maxSpawnPerTick: 2 },
  ];
  const traits = (id: string) => (id === 'Healer' ? ['Healer'] : id === 'Tank' ? ['Protector'] : []);

  it('kills energy cheaters and healers first and tanks last', () => {
    const [plan] = killPlan(waves, traits);
    expect(plan.order.map((t) => t.unit.id)).toEqual(['Cheater', 'Healer', 'Brute', 'Tank']);
    expect(plan.order[0].reasons).toContain('Ultimate every turn');
  });
  it('marks who to leave alive when the next wave waits for a kill', () => {
    const [plan, second] = killPlan(waves, traits);
    expect(plan.keepForLast).toEqual([3, 0]);
    expect(plan.next).toMatch(/fewer than 2.*30% turn meter/);
    expect(second.next).toMatch(/fewer than 7.*up to 2 at a time/);
  });
});
