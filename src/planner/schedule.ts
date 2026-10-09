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
import { GOLD, goldOf, sumCost, type Step, type StepKind } from './build';
import type { Target } from './gaps';
import type { ModeTag } from './modeTags';
import { isUnlocked, type OwnedCharacter } from './requirements';

/** Gear piece id → what it takes to craft one (sub-pieces and gold). */
export type Recipes = Record<string, Cost>;

export interface ScheduleInput {
  owned: OwnedCharacter[];
  inventory: ItemQuantity[];
  upgrades: UpgradeTables;
  levelCap: number;
  /** Priority score per character; characters without one aren't scheduled. */
  priority: Record<string, number>;
  gearTiers?: Record<string, GearTiers>;
  recipes?: Recipes;
  targets?: Record<string, { target: Target; why: string }>;
  modeTags?: Record<string, ModeTag[]>;
  modeWeights?: Record<string, number>;
  /** Gold on hand. Unknown gold means steps aren't placed on days. */
  gold?: number;
  goldPerDay?: number;
  /** How many days of income to plan. */
  days?: number;
  maxSteps?: number;
}

export interface ScheduledStep extends Step {
  /** 0 = affordable now; N = after N days of income. Undefined when gold is unknown. */
  day?: number;
  gold: number;
  /** Gear pieces this step crafts from materials. */
  crafted?: string[];
  score: number;
}

export interface Schedule {
  steps: ScheduledStep[];
  /** The best next step each priority character can't do yet, with what it's missing. */
  blocked: ScheduledStep[];
  goldUsed: number;
  /** Why the list ended. */
  stoppedBy: 'gold' | 'materials' | 'limit';
}

/** Inventory with recursive crafting. Trials run on an overlay so failed ones leave no trace. */
class Stock {
  private stock = new Map<string, number>();

  constructor(inventory: ItemQuantity[], private recipes: Recipes) {
    for (const { item, quantity } of inventory) {
      const id = idOf(item);
      if (id) this.stock.set(id, (this.stock.get(id) ?? 0) + (quantity ?? 0));
    }
  }

  has(item: string): number {
    return this.stock.get(item) ?? 0;
  }

  holdsAny(prefix: string): boolean {
    return [...this.stock.keys()].some((k) => k.startsWith(prefix) && k.endsWith('-CURRENCY'));
  }

  /** What taking `cost` would use, crafting missing pieces when a recipe exists. */
  trial(cost: Cost): { gold: number; missing: Cost; crafted: string[]; commit: () => void } {
    const overlay = new Map<string, number>();
    const get = (id: string) => overlay.get(id) ?? this.has(id);
    let gold = 0;
    const missing = new Map<string, number>();
    const crafted: string[] = [];
    const take = (item: string, qty: number, depth: number) => {
      if (item === GOLD) {
        gold += qty;
        return;
      }
      const have = get(item);
      const used = Math.min(have, qty);
      if (used) overlay.set(item, have - used);
      const rest = qty - used;
      if (!rest) return;
      const recipe = this.recipes[item];
      if (recipe && depth < 8) {
        if (depth === 0) crafted.push(item);
        recipe.forEach((r) => take(r.item, r.quantity * rest, depth + 1));
      } else {
        missing.set(item, (missing.get(item) ?? 0) + rest);
      }
    };
    cost.forEach((c) => take(c.item, c.quantity, 0));
    return {
      gold,
      missing: [...missing].map(([item, quantity]) => ({ item, quantity })),
      crafted,
      commit: () => overlay.forEach((v, k) => this.stock.set(k, v)),
    };
  }
}

interface Cursor {
  c: OwnedCharacter;
  level: number;
  yellow: number;
  gearTier: number;
  gearSlots: boolean[];
  abilities: Record<AbilitySlot, number>;
  isoClass?: IsoClass;
  isoLevel: number;
  /** ISO levels planned without ion balances to check against. */
  blindIso: number;
}

interface Option {
  kind: StepKind;
  title: string;
  cost: Cost;
  value: number;
  unchecked?: string;
  detail?: string;
  modeEffects?: ModeTag[];
  goalField?: keyof Target;
  apply: (cur: Cursor) => void;
}

const ABILITY_NAMES: Record<AbilitySlot, string> = { basic: 'Basic', special: 'Special', ultimate: 'Ultimate', passive: 'Passive' };
const ABILITY_VALUE: Record<AbilitySlot, number> = { ultimate: 4, special: 4, passive: 4, basic: 2 };
const UNIQUE_MAT = 'ABILITY_MATERIAL_UNIQUE_ABILITY_MAT';
const ION_PREFIX = 'ISO8-TIER-';

const VALUE = { gear: 10, stars: 8, unlock: 12, iso: 4, level: 2, levelUnlocksAbility: 4 };
/** Goal threshold steps outrank everything else, matching the agreed catch-up strategy. */
const GOAL_BOOST = 3;
/** Steps with costs the API can't check (ions, XP when tables are missing) count for less. */
const UNCHECKED_FACTOR = 0.5;

function uniqueMat(stock: Stock, inventory: ItemQuantity[], characterId: string, slot: AbilitySlot): string | undefined {
  const suffix = `_${slot.toUpperCase()}`;
  const name = characterId.toUpperCase();
  return inventory
    .map((i) => idOf(i.item) ?? '')
    .find((id) => id.startsWith(UNIQUE_MAT + '_') && id.endsWith(suffix) && name.includes(id.slice(UNIQUE_MAT.length + 1, -suffix.length)) && stock.has(id) > 0);
}

/** Training modules and gold to level from one level to another, using the biggest modules first. */
export function levelCost(upgrades: UpgradeTables, stockHas: (item: string) => number, from: number, to: number): Cost | undefined {
  const total = upgrades.characterLevelTotalXp;
  const ways = upgrades.characterXpCosts;
  if (!total?.length || !ways?.length || total[to] == null) return undefined;
  let need = (total[to] ?? 0) - (total[from] ?? 0);
  if (need <= 0) return [];
  const sorted = [...ways].filter((w) => w.xpReward > 0).sort((a, b) => b.xpReward - a.xpReward);
  const parts: Cost[] = [];
  for (const [i, w] of sorted.entries()) {
    const module = w.cost.find((c) => c.item !== GOLD);
    if (!module) continue;
    const owned = Math.floor(stockHas(module.item) / module.quantity);
    // The smallest module rounds up so the level is actually reached.
    const last = i === sorted.length - 1;
    const uses = Math.min(last ? Math.ceil(need / w.xpReward) : Math.floor(need / w.xpReward), last ? Infinity : owned);
    if (uses <= 0) continue;
    parts.push(w.cost.map((c) => ({ item: c.item, quantity: c.quantity * uses })));
    need -= uses * w.xpReward;
    if (need <= 0) break;
  }
  return sumCost(...parts);
}

function options(cur: Cursor, input: ScheduleInput, stock: Stock): Option[] {
  const { upgrades } = input;
  const id = cur.c.info.id;
  const out: Option[] = [];

  if (cur.yellow === 0) {
    const shard = idOf(cur.c.info.starItems?.[0]) ?? `SHARD_${id.toUpperCase()}`;
    const stars = cur.c.info.unlockStars ?? 1;
    const shards = upgrades.yellowStarTotalShards[stars] ?? 0;
    if (shards) {
      out.push({
        kind: 'stars', title: `Unlock at ${stars}★`, value: VALUE.unlock, goalField: 'activeYellow',
        cost: [{ item: shard, quantity: shards }, { item: GOLD, quantity: goldOf(upgrades.yellowStarTotalCosts[stars] ?? []) }],
        apply: (x) => (x.yellow = stars),
      });
    }
    return out;
  }

  // Levels, in chunks that end where an ability level opens up or on a multiple of 5.
  const reqs = upgrades.abilityLevelRequirements;
  if (cur.level < input.levelCap) {
    const unlocksAt = ABILITY_SLOTS.map((s) => reqs[s]?.[cur.abilities[s] + 1]).filter((l): l is number => !!l && l > cur.level);
    const to = Math.min(input.levelCap, Math.ceil((cur.level + 1) / 5) * 5, ...unlocksAt);
    const opens = ABILITY_SLOTS.filter((s) => (reqs[s]?.[cur.abilities[s] + 1] ?? Infinity) <= to && (reqs[s]?.[cur.abilities[s] + 1] ?? 0) > cur.level);
    const cost = levelCost(upgrades, (i) => stock.has(i), cur.level, to);
    const goalLevel = input.targets?.[id]?.target.level;
    // Without the XP tables, only suggest levels that open an ability level or meet a goal.
    if (cost || opens.length || (goalLevel && cur.level < goalLevel)) {
      out.push({
        kind: 'level', title: `Level ${cur.level} → ${to}`, cost: cost ?? [], goalField: 'level',
        value: opens.length ? VALUE.levelUnlocksAbility : VALUE.level,
        detail: opens.length ? `Opens the next ${opens.map((s) => ABILITY_NAMES[s]).join(', ')} level.` : undefined,
        unchecked: cost ? undefined : 'XP tables haven’t loaded; press Sync.',
        apply: (x) => (x.level = to),
      });
    }
  }

  // One ability level at a time, if the character's level allows it.
  const tags = input.modeTags?.[id] ?? [];
  for (const slot of ABILITY_SLOTS) {
    const next = cur.abilities[slot] + 1;
    let cost = upgrades.abilityUpgradeCosts[slot]?.[next];
    if (!cost || (reqs[slot]?.[next] ?? 0) > cur.level) continue;
    if (cost.some((x) => x.item === UNIQUE_MAT)) {
      const mat = uniqueMat(stock, input.inventory, id, slot);
      if (!mat) continue;
      cost = cost.map((x) => (x.item === UNIQUE_MAT ? { ...x, item: mat } : x));
    }
    const effects = tags.filter((t) => t.slot === slot && t.level === next);
    const modeBonus = Math.max(0, ...effects.map((t) => input.modeWeights?.[t.mode] ?? 0)) / 10;
    out.push({
      kind: 'ability', title: `${ABILITY_NAMES[slot]} ${next - 1} → ${next}`, cost,
      value: ABILITY_VALUE[slot] + modeBonus, modeEffects: effects.length ? effects : undefined,
      apply: (x) => (x.abilities[slot] = next),
    });
  }

  // Next yellow star.
  const nextStar = cur.yellow + 1;
  const shardTotals = upgrades.yellowStarTotalShards;
  if (shardTotals[nextStar] !== undefined) {
    const shard = idOf(cur.c.info.starItems?.[0]) ?? `SHARD_${id.toUpperCase()}`;
    const gold = goldOf(upgrades.yellowStarTotalCosts[nextStar] ?? []) - goldOf(upgrades.yellowStarTotalCosts[cur.yellow] ?? []);
    out.push({
      kind: 'stars', title: `Promote ${cur.yellow}★ → ${nextStar}★`, value: VALUE.stars, goalField: 'activeYellow',
      cost: [{ item: shard, quantity: shardTotals[nextStar] - (shardTotals[cur.yellow] ?? 0) }, ...(gold > 0 ? [{ item: GOLD, quantity: gold }] : [])],
      apply: (x) => (x.yellow = nextStar),
    });
  }

  // Finish the current gear tier.
  const tiers = input.gearTiers?.[id];
  const slots = tiers?.[String(cur.gearTier)]?.slots;
  if (slots?.length && tiers?.[String(cur.gearTier + 1)]) {
    const pieces = slots.filter((_, i) => !cur.gearSlots[i]).map((s) => idOf(s.piece)).filter((p): p is string => !!p);
    out.push({
      kind: 'gear', title: `Gear tier ${cur.gearTier} → ${cur.gearTier + 1}`, value: VALUE.gear, goalField: 'gearTier',
      cost: sumCost(pieces.map((item) => ({ item, quantity: 1 }))),
      apply: (x) => {
        x.gearTier += 1;
        x.gearSlots = [];
      },
    });
  }

  // Next ISO-8 class level. Ions are only checked when the inventory lists them; otherwise
  // one step goes straight to the goal level (or one level) so the list isn't flooded.
  {
    const cls = cur.isoClass ?? 'striker';
    const table = upgrades.iso8AbilityUpgradeCosts[cls] ?? {};
    const goalIso = input.targets?.[id]?.target.iso8ClassLevel ?? 0;
    const blind = !stock.holdsAny(ION_PREFIX);
    const to = blind ? Math.max(cur.isoLevel + 1, goalIso) : cur.isoLevel + 1;
    const lvls = Object.keys(table).map(Number).filter((l) => l > cur.isoLevel && l <= to);
    if (lvls.length && (!blind || cur.blindIso < 1) && table[to]) {
      out.push({
        kind: 'iso', title: `ISO-8 ${cur.isoClass ?? 'class'} ${cur.isoLevel} → ${to}`, value: VALUE.iso * lvls.length, goalField: 'iso8ClassLevel',
        cost: sumCost(...lvls.map((l) => table[l])),
        unchecked: blind ? 'Ion balances aren’t in your inventory data; check in game.' : undefined,
        detail: cur.isoClass ? undefined : 'Choose an ISO-8 class first.',
        apply: (x) => {
          x.isoLevel = to;
          if (blind) x.blindIso += 1;
        },
      });
    }
  }
  return out;
}

function cursorOf(c: OwnedCharacter): Cursor {
  const i = c.instance ?? { id: c.info.id };
  const cls = i.iso8?.active as IsoClass | undefined;
  return {
    c,
    level: i.level ?? 1,
    yellow: isUnlocked(c) ? (i.activeYellow ?? 0) : 0,
    gearTier: i.gearTier ?? 1,
    gearSlots: [...(i.gearSlots ?? [])],
    abilities: { basic: i.basic ?? 1, special: i.special ?? 1, ultimate: i.ultimate ?? 1, passive: i.passive ?? 1 },
    isoClass: cls,
    isoLevel: cls ? ((i.iso8?.[cls] as number | undefined) ?? 0) : 0,
    blindIso: 0,
  };
}

const current = (cur: Cursor, field: keyof Target): number =>
  field === 'level' ? cur.level : field === 'activeYellow' ? cur.yellow : field === 'gearTier' ? cur.gearTier : field === 'iso8ClassLevel' ? cur.isoLevel : 0;

/**
 * One ordered list of upgrades across the roster. Each round takes the step with the
 * best value for its gold: value from the step kind, the character's priority, and
 * whether it moves an unlock goal threshold. Steps short on materials wait; gold
 * spending is placed on days using gold on hand plus daily income.
 */
export function buildSchedule(input: ScheduleInput): Schedule {
  const stock = new Stock(input.inventory, input.recipes ?? {});
  const targets = input.targets ?? {};
  const cursors = input.owned
    .filter((c) => (input.priority[c.info.id] ?? 0) > 0 || targets[c.info.id])
    .map(cursorOf);
  const maxSteps = input.maxSteps ?? 120;
  const horizon = input.days ?? 7;
  const steps: ScheduledStep[] = [];
  let goldUsed = 0;
  let stoppedBy: Schedule['stoppedBy'] = 'materials';

  const dayFor = (gold: number) => {
    if (input.gold === undefined) return undefined;
    if (gold <= input.gold) return 0;
    return input.goldPerDay ? Math.ceil((gold - input.gold) / input.goldPerDay) : Infinity;
  };

  const evaluate = (cur: Cursor) => {
    const id = cur.c.info.id;
    const weight = 1 + (input.priority[id] ?? 0) / 20;
    const target = targets[id]?.target;
    return options(cur, input, stock).map((o) => {
      // Unchecked costs (ions without balances) only charge their gold.
      const trial = stock.trial(o.unchecked ? o.cost.filter((c) => c.item === GOLD) : o.cost);
      const forGoal = !!(target && o.goalField && target[o.goalField] !== undefined && current(cur, o.goalField) < (target[o.goalField] as number));
      const score =
        (o.value * weight * (forGoal ? GOAL_BOOST : 1) * (o.unchecked ? UNCHECKED_FACTOR : 1)) / (1 + trial.gold / 250_000);
      return { cur, o, trial, score, forGoal };
    });
  };

  const toStep = (e: ReturnType<typeof evaluate>[number], status: Step['status']): ScheduledStep => ({
    characterId: e.cur.c.info.id, kind: e.o.kind, title: e.o.title, detail: [e.o.detail, e.o.unchecked].filter(Boolean).join(' ') || undefined,
    cost: e.o.cost, missing: e.trial.missing, status, gold: e.trial.gold, score: e.score,
    crafted: e.trial.crafted.length ? e.trial.crafted : undefined, modeEffects: e.o.modeEffects,
    goal: e.forGoal ? targets[e.cur.c.info.id]?.why : undefined,
  });

  while (steps.length < maxSteps) {
    const doable = cursors.flatMap(evaluate).filter((e) => !e.trial.missing.length);
    if (!doable.length) break;
    const best = doable.reduce((a, b) => (b.score > a.score ? b : a));
    const day = dayFor(goldUsed + best.trial.gold);
    if (day !== undefined && day > horizon) {
      stoppedBy = 'gold';
      break;
    }
    best.trial.commit();
    best.o.apply(best.cur);
    goldUsed += best.trial.gold;
    steps.push({ ...toStep(best, best.o.unchecked ? 'unchecked' : 'ready'), day });
  }
  if (steps.length >= maxSteps) stoppedBy = 'limit';

  const blocked = cursors
    .map((cur) => evaluate(cur).filter((e) => e.trial.missing.length).sort((a, b) => b.score - a.score)[0])
    .filter((e): e is NonNullable<typeof e> => !!e)
    .sort((a, b) => b.score - a.score)
    .map((e) => toStep(e, 'short'));

  return { steps, blocked, goldUsed, stoppedBy };
}
