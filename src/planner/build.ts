import {
  ABILITY_SLOTS,
  idOf,
  type AbilitySlot,
  type Cost,
  type GearTiers,
  type IsoClass,
  type ItemQuantity,
  type UpgradeTables,
} from '../api/types';
import { isUnlocked, type OwnedCharacter } from './requirements';

export const GOLD = 'SC';

export type StepKind = 'level' | 'ability' | 'stars' | 'shards' | 'iso' | 'gear';
/**
 * ready: everything it costs is in your inventory (gold only if you entered a budget).
 * short: you're missing items, listed in `missing`.
 * unchecked: it costs something the API doesn't report (training XP, ISO-8 ions).
 */
export type StepStatus = 'ready' | 'short' | 'unchecked';

export interface Step {
  characterId: string;
  kind: StepKind;
  title: string;
  detail?: string;
  cost: Cost;
  status: StepStatus;
  missing: Cost;
}

export interface CharacterPlan {
  character: OwnedCharacter;
  steps: Step[];
}

export interface Plan {
  squads: CharacterPlan[][];
  /** Ready steps in priority order. */
  doNow: Step[];
  /** What the blocked steps are short of, summed across the plan. */
  shortages: Cost;
  goldForReady: number;
}

export interface PlanInput {
  owned: OwnedCharacter[];
  inventory: ItemQuantity[];
  upgrades: UpgradeTables;
  /** Squads in priority order, as character ids. */
  squads: string[][];
  /** Highest character level reachable now. */
  levelCap: number;
  gearTiers?: Record<string, GearTiers>;
  /** Gold on hand. When omitted, gold costs are shown but not checked. */
  gold?: number;
}

/** Inventory that steps draw down as they're planned, so later steps see what's left. */
class Ledger {
  private stock = new Map<string, number>();

  constructor(inventory: ItemQuantity[], gold?: number) {
    for (const { item, quantity } of inventory) {
      const id = idOf(item);
      if (id) this.stock.set(id, (this.stock.get(id) ?? 0) + (quantity ?? 0));
    }
    this.stock.set(GOLD, gold ?? Infinity);
  }

  have(item: string): number {
    return this.stock.get(item) ?? 0;
  }

  missing(cost: Cost): Cost {
    const need = sumCost(cost);
    return need
      .map(({ item, quantity }) => ({ item, quantity: quantity - this.have(item) }))
      .filter((c) => c.quantity > 0);
  }

  /** Takes the cost if it's affordable; returns what's missing otherwise. */
  spend(cost: Cost): Cost {
    const missing = this.missing(cost);
    if (missing.length === 0) cost.forEach(({ item, quantity }) => this.stock.set(item, this.have(item) - quantity));
    return missing;
  }
}

export function sumCost(...costs: Cost[]): Cost {
  const total = new Map<string, number>();
  costs.flat().forEach(({ item, quantity }) => total.set(item, (total.get(item) ?? 0) + quantity));
  return [...total].map(([item, quantity]) => ({ item, quantity }));
}

export function goldOf(cost: Cost): number {
  return cost.filter((c) => c.item === GOLD).reduce((s, c) => s + c.quantity, 0);
}

const levels = (table: Record<string, unknown> | undefined) =>
  Object.keys(table ?? {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);

const ABILITY_NAMES: Record<AbilitySlot, string> = {
  basic: 'Basic', special: 'Special', ultimate: 'Ultimate', passive: 'Passive',
};
const UNIQUE_MAT = 'ABILITY_MATERIAL_UNIQUE_ABILITY_MAT';

/** Level 8 abilities use a character-specific material, e.g. ..._UNIQUE_ABILITY_MAT_NOVA_SPECIAL. */
function uniqueMat(ledger: Ledger, inventory: ItemQuantity[], characterId: string, slot: AbilitySlot): string | undefined {
  const suffix = `_${slot.toUpperCase()}`;
  const name = characterId.toUpperCase();
  return inventory
    .map((i) => idOf(i.item) ?? '')
    .find((id) => id.startsWith(UNIQUE_MAT + '_') && id.endsWith(suffix) && name.includes(id.slice(UNIQUE_MAT.length + 1, -suffix.length)) && ledger.have(id) > 0);
}

function abilitySteps(c: OwnedCharacter, input: PlanInput, ledger: Ledger): Step[] {
  const inst = c.instance!;
  const steps: Step[] = [];
  for (const slot of ABILITY_SLOTS) {
    const costs = input.upgrades.abilityUpgradeCosts[slot];
    const reqs = input.upgrades.abilityLevelRequirements[slot] ?? {};
    const current = inst[slot] ?? 1;
    let reached = current;
    let spent: Cost[] = [];
    let blocked: Step | undefined;
    for (const lv of levels(costs).filter((l) => l > current)) {
      if ((reqs[lv] ?? 0) > input.levelCap) break;
      let cost = costs[lv];
      if (cost.some((x) => x.item === UNIQUE_MAT)) {
        // Only plan level 8 when the character's own unique material is on hand.
        const mat = uniqueMat(ledger, input.inventory, c.info.id, slot);
        if (!mat) break;
        cost = cost.map((x) => (x.item === UNIQUE_MAT ? { ...x, item: mat } : x));
      }
      const missing = ledger.spend(cost);
      if (missing.length) {
        blocked = {
          characterId: c.info.id, kind: 'ability', status: 'short', cost, missing,
          title: `${ABILITY_NAMES[slot]} ${lv - 1} → ${lv}`,
        };
        break;
      }
      spent.push(cost);
      reached = lv;
    }
    if (reached > current) {
      steps.push({
        characterId: c.info.id, kind: 'ability', status: 'ready', cost: sumCost(...spent), missing: [],
        title: `${ABILITY_NAMES[slot]} ${current} → ${reached}`,
      });
    }
    if (blocked) steps.push(blocked);
  }
  return steps;
}

function shardItem(c: OwnedCharacter): string {
  return idOf(c.info.starItems?.[0]) ?? `SHARD_${c.info.id.toUpperCase()}`;
}

function starSteps(c: OwnedCharacter, input: PlanInput, ledger: Ledger): Step[] {
  const shardTotals = input.upgrades.yellowStarTotalShards;
  const goldTotals = input.upgrades.yellowStarTotalCosts;
  const shard = shardItem(c);
  const current = c.instance?.activeYellow ?? 0;
  const max = Math.max(...levels(shardTotals));
  if (current >= max) return [];

  const costTo = (from: number, to: number): Cost => {
    const gold = goldOf(goldTotals[to] ?? []) - goldOf(goldTotals[from] ?? []);
    const shards = (shardTotals[to] ?? 0) - (shardTotals[from] ?? 0);
    return [{ item: shard, quantity: shards }, ...(gold > 0 ? [{ item: GOLD, quantity: gold }] : [])];
  };

  // Locked characters unlock straight to their unlock star level.
  let reached = current;
  const first = current === 0 ? (c.info.unlockStars ?? 1) : current + 1;
  const steps: Step[] = [];
  for (let to = first; to <= max; to = Math.max(to + 1, reached + 1)) {
    const cost = costTo(reached, to);
    const missing = ledger.missing(cost);
    if (missing.length) {
      const shardsShort = missing.find((m) => m.item === shard);
      steps.push({
        characterId: c.info.id, kind: 'shards', status: 'short', cost, missing,
        title: current === 0 && reached === 0 ? `Unlock at ${to}★` : `${reached}★ → ${to}★`,
        detail: shardsShort ? `Have ${ledger.have(shard)} of ${cost[0].quantity} shards` : undefined,
      });
      break;
    }
    ledger.spend(cost);
    steps.push({
      characterId: c.info.id, kind: 'stars', status: 'ready', cost, missing: [],
      title: reached === 0 ? `Unlock at ${to}★` : `Promote ${reached}★ → ${to}★`,
    });
    reached = to;
  }
  return steps;
}

function isoStep(c: OwnedCharacter, input: PlanInput): Step | undefined {
  const iso = c.instance?.iso8;
  const cls = iso?.active as IsoClass | undefined;
  if (!cls) {
    return { characterId: c.info.id, kind: 'iso', status: 'unchecked', cost: [], missing: [], title: 'Choose an ISO-8 class' };
  }
  const table = input.upgrades.iso8AbilityUpgradeCosts[cls];
  const current = iso?.[cls] ?? 0;
  const next = levels(table).find((l) => l > current);
  if (!next) return undefined;
  return {
    characterId: c.info.id, kind: 'iso', status: 'unchecked', cost: table[next], missing: [],
    title: `ISO-8 ${cls} ${current} → ${next}`,
    detail: 'Ion balances aren’t in the API, so check this one in game.',
  };
}

function gearStep(c: OwnedCharacter, input: PlanInput, ledger: Ledger): Step | undefined {
  const tiers = input.gearTiers?.[c.info.id];
  if (!tiers) return undefined;
  const tier = c.instance?.gearTier ?? 1;
  if (tier >= Math.max(...levels(tiers))) return undefined;
  const pieces = (tiers[String(tier)]?.slots ?? []).map((s) => idOf(s.piece)).filter((p): p is string => !!p);
  if (!pieces.length) return undefined;
  const cost = sumCost(pieces.map((item) => ({ item, quantity: 1 })));
  const missing = ledger.spend(cost);
  return {
    characterId: c.info.id, kind: 'gear', cost, missing,
    status: missing.length ? 'short' : 'ready',
    title: `Finish gear tier ${tier} → ${tier + 1}`,
    detail: missing.length
      ? 'Pieces you already equipped aren’t visible to the API, and missing pieces may be craftable.'
      : undefined,
  };
}

function levelStep(c: OwnedCharacter, input: PlanInput): Step | undefined {
  const level = c.instance?.level ?? 1;
  if (level >= input.levelCap) return undefined;
  return {
    characterId: c.info.id, kind: 'level', status: 'unchecked', cost: [], missing: [],
    title: `Level ${level} → ${input.levelCap}`,
    detail: 'Uses training modules. XP per level isn’t in the API.',
  };
}

function planCharacter(c: OwnedCharacter, input: PlanInput, ledger: Ledger): CharacterPlan {
  if (!isUnlocked(c)) return { character: c, steps: starSteps(c, input, ledger) };
  const steps = [
    levelStep(c, input),
    ...abilitySteps(c, input, ledger),
    ...starSteps(c, input, ledger),
    gearStep(c, input, ledger),
    isoStep(c, input),
  ].filter((s): s is Step => !!s);
  return { character: c, steps };
}

/**
 * Plans squads in priority order. Each step draws down a shared inventory, so a
 * character earlier in the list gets materials before one further down.
 */
export function buildPlan(input: PlanInput): Plan {
  const ledger = new Ledger(input.inventory, input.gold);
  const byId = new Map(input.owned.map((c) => [c.info.id, c]));
  const seen = new Set<string>();
  const squads = input.squads.map((squad) =>
    squad
      .filter((id) => byId.has(id) && !seen.has(id) && seen.add(id))
      .map((id) => planCharacter(byId.get(id)!, input, ledger)),
  ).filter((s) => s.length);
  const steps = squads.flat().flatMap((p) => p.steps);
  const ready = steps.filter((s) => s.status === 'ready');
  return {
    squads,
    doNow: ready,
    shortages: sumCost(...steps.filter((s) => s.status === 'short').map((s) => s.missing)),
    goldForReady: ready.reduce((sum, s) => sum + goldOf(s.cost), 0),
  };
}
