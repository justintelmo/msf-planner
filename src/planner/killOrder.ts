import type { CombatUnit, CombatWave } from '../api/types';
import { statsOf } from './ddPicker';

/** How much a role adds to an enemy's threat. Protectors taunt and soak, so they usually go last. */
const ROLE_WEIGHT: Record<string, number> = { Healer: 1.6, Support: 1.3, Controller: 1.3, Blaster: 1.1, Brawler: 1, Protector: 0.7 };
const ROLES = Object.keys(ROLE_WEIGHT);
/** At or below this, the next wave waits for your kill: you choose when it comes. */
const CONTROLLED = 3;

export interface KillTarget {
  unit: CombatUnit;
  /** Position in the wave's unit list, so duplicates stay distinct. */
  slot: number;
  priority: number;
  reasons: string[];
  role?: string;
}

export interface WavePlan {
  order: KillTarget[];
  /** Slots of enemies to leave alive until you're ready for the next wave. */
  keepForLast: number[];
  /** When the next wave arrives and what to do about it. */
  next?: string;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
};

const unitOf = (u: CombatUnit | CombatUnit[]) => (Array.isArray(u) ? u[0] : u);

/** How often a cheap ability fires, in words. Enemies gain about one energy a turn. */
function every(cost: number | undefined): string {
  return cost === undefined ? '' : cost <= 1 ? 'every turn' : `every ${cost} turns`;
}

/**
 * Who to kill first in each wave: the enemies that do the most harm per point of health it takes to
 * remove them. Harm counts damage, speed, abilities the node lets them fire more often, and role
 * (from the playable character's traits; mission variants can differ). Wave triggers decide how
 * many to leave alive while you set up for the next wave.
 */
export function killPlan(waves: CombatWave[] | undefined, traitsOf: (id: string) => string[] = () => []): WavePlan[] {
  const list = waves ?? [];
  return list.map((w, i) => {
    const units = (w.units ?? []).map(unitOf).filter(Boolean);
    const dmgMedian = median(units.map((u) => statsOf(u)?.damage ?? 0));
    const hpMedian = median(units.map((u) => statsOf(u)?.health ?? 0));

    const order = units.map((unit, slot): KillTarget => {
      const s = statsOf(unit) ?? {};
      const fx = unit.nodeEffects;
      const role = traitsOf(unit.id).find((t) => ROLES.includes(t));
      const reasons: string[] = [];
      let cheat = 1;
      if (fx?.ultimateOverride) {
        cheat += 1.5 / Math.max(1, fx.ultimateOverride.costEnergy ?? 1);
        reasons.push(`Ultimate ${every(fx.ultimateOverride.costEnergy)}`);
      }
      if (fx?.specialOverride) {
        cheat += 0.5 / Math.max(1, fx.specialOverride.costEnergy ?? 1);
        reasons.push(`Special ${every(fx.specialOverride.costEnergy)}`);
      }
      if (role && role !== 'Brawler') reasons.push(role === 'Protector' ? 'Protector (may taunt)' : role);
      const damage = s.damage ?? 0;
      const health = s.health ?? 1;
      if (dmgMedian && damage >= 1.3 * dmgMedian) reasons.push('High damage');
      if (dmgMedian && damage <= 0.3 * dmgMedian) reasons.push('Low damage');
      if ((s.speed ?? 0) >= 140) reasons.push('Fast');
      if (hpMedian && health >= 1.5 * hpMedian) reasons.push('Tanky');
      const priority = (damage * ((s.speed ?? 100) / 120) * cheat * (ROLE_WEIGHT[role ?? 'Brawler'] ?? 1)) / health;
      return { unit, slot, priority, reasons, role };
    }).sort((a, b) => b.priority - a.priority);

    const nextWave = list[i + 1];
    let next: string | undefined;
    let keepForLast: number[] = [];
    if (nextWave) {
      const n = nextWave.onFewerThan;
      const group = nextWave.maxSpawnPerTick ? `, up to ${nextWave.maxSpawnPerTick} at a time` : '';
      const meter = nextWave.turnMeter ? ` They arrive with ${Math.round(nextWave.turnMeter / 10)}% turn meter, so expect them to act early.` : '';
      if (w.holdNextWaveUntil === 'AllOwnDeadThisWave') {
        next = `The next wave waits until every enemy from this wave is dead, so take your time and kill in order.${meter}`;
      } else if (n !== undefined && n <= CONTROLLED) {
        // The kill that leaves fewer than n alive brings the next wave: keep the least dangerous for last.
        keepForLast = order.slice(-n).map((t) => t.slot);
        next = `The next wave arrives once fewer than ${n} enemies are left${group}. Leave the ${n === 1 ? 'last enemy' : `last ${n}`} (marked below) alive while you heal up and charge ultimates, then make that kill.${meter}`;
      } else if (n !== undefined) {
        // Counted from this wave alone; leftovers from earlier waves bring it sooner.
        const kills = Math.max(1, units.length - n + 1);
        next = kills <= 1
          ? `Reinforcements arrive as soon as fewer than ${n} enemies are left${group}, so killing won't thin the field. Focus on threat, not on count.${meter}`
          : `The next wave arrives once fewer than ${n} enemies are left (about ${kills} kills into this wave${group}). Spend your big hits on the top of this list before then.${meter}`;
      }
    }
    return { order, keepForLast, next };
  });
}
