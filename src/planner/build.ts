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
import type { Target } from './gaps';
import type { ModeTag } from './modeTags';
import { MODE_LABELS } from './priority';
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
  /** The unlock goal this step works toward, when it's part of one. */
  goal?: string;
  /** Mode-specific ability effects this step adds, e.g. "Raids: In Raids, gain +20% Damage." */
  modeEffects?: ModeTag[];
}

export interface CharacterPlan {
  character: OwnedCharacter;
  steps: Step[];
}

export interface Plan {
  characters: CharacterPlan[];
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
  /** Character ids, highest priority first. Earlier characters get materials first. */
  order: string[];
  /** Mode-specific ability effects per character, from their ability text. */
  modeTags?: Record<string, ModeTag[]>;
  /** Weight per mode; abilities with effects in heavier modes are upgraded first. */
  modeWeights?: Record<string, number>;
  /** Highest character level reachable now. */
  levelCap: number;
  gearTiers?: Record<string, GearTiers>;
  /** Gold on hand. When omitted, gold costs are shown but not checked. */
  gold?: number;
  /**
   * Requirement thresholds from unlock goals. These characters are planned first,
   * only up to the threshold, before the regular plan runs.
   */
  targets?: Record<string, { target: Target; why: string }>;
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
  const tags = input.modeTags?.[c.info.id] ?? [];
  const weight = (t: ModeTag) => input.modeWeights?.[t.mode] ?? 0;
  const tagsIn = (slot: AbilitySlot, from: number, to: number) =>
    tags.filter((t) => t.slot === slot && t.level > from && t.level <= to);
  // Abilities with effects in the player's top modes go first.
  const slotValue = (slot: AbilitySlot) =>
    Math.max(0, ...tagsIn(slot, inst[slot] ?? 1, Infinity).map(weight));
  const slots = [...ABILITY_SLOTS].sort((a, b) => slotValue(b) - slotValue(a));
  for (const slot of slots) {
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
          title: `${ABILITY_NAMES[slot]} ${lv - 1} → ${lv}`, modeEffects: tagsIn(slot, lv - 1, lv),
        };
        break;
      }
      spent.push(cost);
      reached = lv;
    }
    if (reached > current) {
      steps.push({
        characterId: c.info.id, kind: 'ability', status: 'ready', cost: sumCost(...spent), missing: [],
        title: `${ABILITY_NAMES[slot]} ${current} → ${reached}`, modeEffects: tagsIn(slot, current, reached),
      });
    }
    if (blocked) steps.push(blocked);
  }
  return steps;
}

function shardItem(c: OwnedCharacter): string {
  return idOf(c.info.starItems?.[0]) ?? `SHARD_${c.info.id.toUpperCase()}`;
}

function starSteps(c: OwnedCharacter, input: PlanInput, ledger: Ledger, upTo?: number): Step[] {
  const shardTotals = input.upgrades.yellowStarTotalShards;
  const goldTotals = input.upgrades.yellowStarTotalCosts;
  const shard = shardItem(c);
  const current = c.instance?.activeYellow ?? 0;
  const max = Math.min(upTo ?? Infinity, Math.max(...levels(shardTotals)));
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

/** Gear pieces still needed to finish each tier, from the current one up to (not including) `toTier`. */
function gearSteps(c: OwnedCharacter, input: PlanInput, ledger: Ledger, toTier?: number): Step[] {
  const tiers = input.gearTiers?.[c.info.id];
  if (!tiers) return [];
  const current = c.instance?.gearTier ?? 1;
  const last = Math.min(toTier ?? current + 1, Math.max(...levels(tiers)));
  const steps: Step[] = [];
  for (let tier = current; tier < last; tier++) {
    const slots = tiers[String(tier)]?.slots ?? [];
    // In the current tier, skip slots the roster says are already equipped.
    const equipped = tier === current ? (c.instance?.gearSlots ?? []) : [];
    const pieces = slots.filter((_, i) => !equipped[i]).map((sl) => idOf(sl.piece)).filter((p): p is string => !!p);
    if (!pieces.length) continue;
    const cost = sumCost(pieces.map((item) => ({ item, quantity: 1 })));
    const missing = ledger.spend(cost);
    steps.push({
      characterId: c.info.id, kind: 'gear', cost, missing,
      status: missing.length ? 'short' : 'ready',
      title: `Finish gear tier ${tier} → ${tier + 1}`,
      detail: missing.length ? 'Missing pieces may be craftable from materials you have.' : undefined,
    });
    if (missing.length) break;
  }
  return steps;
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
    ...gearSteps(c, input, ledger),
    isoStep(c, input),
  ].filter((s): s is Step => !!s);
  return { character: c, steps };
}

export function modeEffectLabel(t: ModeTag): string {
  return `${MODE_LABELS[t.mode] ?? t.mode}: ${t.text}`;
}

/**
 * Plans characters in priority order. Each step draws down a shared inventory, so a
 * character earlier in the list gets materials before one further down.
 */
/** Only the steps that bring a character up to a requirement threshold. */
function targetSteps(c: OwnedCharacter, target: Target, input: PlanInput, ledger: Ledger): Step[] {
  const inst = c.instance ?? { id: c.info.id };
  const id = c.info.id;
  const steps: (Step | undefined)[] = [];
  if (target.level && (inst.level ?? 0) < target.level) {
    steps.push({
      characterId: id, kind: 'level', status: 'unchecked', cost: [], missing: [],
      title: `Level ${inst.level ?? 0} → ${target.level}`, detail: 'Uses training modules. XP per level isn’t in the API.',
    });
  }
  if (target.activeYellow) steps.push(...starSteps(c, input, ledger, target.activeYellow));
  if (target.activeRed && (inst.activeRed ?? 0) < target.activeRed) {
    steps.push({
      characterId: id, kind: 'stars', status: 'unchecked', cost: [], missing: [],
      title: `Red stars ${inst.activeRed ?? 0} → ${target.activeRed}`, detail: 'Needs red star promotion items; check in game.',
    });
  }
  if (target.gearTier) steps.push(...gearSteps(c, input, ledger, target.gearTier));
  if (target.gearTier && !input.gearTiers?.[id] && (inst.gearTier ?? 0) < target.gearTier) {
    steps.push({
      characterId: id, kind: 'gear', status: 'unchecked', cost: [], missing: [],
      title: `Gear tier ${inst.gearTier ?? 0} → ${target.gearTier}`, detail: 'Gear pieces for this character haven’t loaded yet.',
    });
  }
  const cls = (target.iso8Class ?? inst.iso8?.active) as IsoClass | undefined;
  if (target.iso8Class && inst.iso8?.active !== target.iso8Class) {
    steps.push({ characterId: id, kind: 'iso', status: 'unchecked', cost: [], missing: [], title: `Switch ISO-8 class to ${target.iso8Class}` });
  }
  if (target.iso8ClassLevel && cls) {
    const table = input.upgrades.iso8AbilityUpgradeCosts[cls] ?? {};
    const current = (inst.iso8?.[cls] as number | undefined) ?? 0;
    const lv = levels(table).filter((l) => l > current && l <= target.iso8ClassLevel!);
    if (lv.length) {
      steps.push({
        characterId: id, kind: 'iso', status: 'unchecked', missing: [],
        cost: sumCost(...lv.map((l) => table[l])),
        title: `ISO-8 ${cls} ${current} → ${target.iso8ClassLevel}`, detail: 'Ion balances aren’t in the API, so check this one in game.',
      });
    }
  } else if (target.iso8ClassLevel && !cls) {
    steps.push({ characterId: id, kind: 'iso', status: 'unchecked', cost: [], missing: [], title: `Choose an ISO-8 class and raise it to ${target.iso8ClassLevel}` });
  }
  return steps.filter((s): s is Step => !!s);
}

/** The character as it will be once its goal thresholds are met. */
function afterTarget(c: OwnedCharacter, t: Target): OwnedCharacter {
  if (!c.instance) return c;
  const i = { ...c.instance };
  for (const k of ['level', 'activeYellow', 'activeRed', 'gearTier'] as const) {
    if (t[k] !== undefined) i[k] = Math.max(i[k] ?? 0, t[k]!);
  }
  if (t.gearTier !== undefined && t.gearTier! > (c.instance.gearTier ?? 0)) i.gearSlots = [];
  return { ...c, instance: i };
}

export function buildPlan(input: PlanInput): Plan {
  const ledger = new Ledger(input.inventory, input.gold);
  const byId = new Map(input.owned.map((c) => [c.info.id, c]));
  const targets = input.targets ?? {};

  // Phase 1: unlock-goal thresholds, in goal order.
  const goalPlans = Object.entries(targets)
    .filter(([id]) => byId.has(id))
    .map(([id, { target, why }]) => ({
      character: byId.get(id)!,
      steps: targetSteps(byId.get(id)!, target, input, ledger).map((s) => ({ ...s, goal: why })),
    }));
  // Phase 2: the regular plan, starting from where the goals leave each character.
  const regular = [...new Set(input.order)]
    .filter((id) => byId.has(id))
    .map((id) => planCharacter(targets[id] ? afterTarget(byId.get(id)!, targets[id].target) : byId.get(id)!, input, ledger));
  const merged = new Map<string, CharacterPlan>();
  for (const p of [...goalPlans, ...regular]) {
    const prev = merged.get(p.character.info.id);
    merged.set(p.character.info.id, prev ? { character: prev.character, steps: [...prev.steps, ...p.steps] } : p);
  }
  const characters = [...merged.values()];
  const steps = [...goalPlans, ...regular].flatMap((p) => p.steps);
  const ready = steps.filter((s) => s.status === 'ready');
  return {
    characters,
    doNow: ready,
    shortages: sumCost(...steps.filter((s) => s.status === 'short').map((s) => s.missing)),
    goldForReady: ready.reduce((sum, s) => sum + goldOf(s.cost), 0),
  };
}
