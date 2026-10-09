/** Subsets of the MSF API schemas (https://developer.marvelstrikeforce.com). */

export interface ApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    perPage?: number;
    perTotal?: number;
    asOf?: string;
    baseImgUrl?: string;
  };
}

export type Trait = string | { id: string; name?: string };
export type Item = string | { id: string; name?: string; icon?: string; characterId?: string };

export interface CharacterInfo {
  id: string;
  name?: string;
  portrait?: string;
  status?: string;
  unlockStars?: number;
  traits?: Trait[];
  invisibleTraits?: Trait[];
  /** [0] yellow-star shard item, [1-7] red star items, [8-10] diamond items. */
  starItems?: Item[];
}

/** A character in a roster. Locked characters omit most fields. */
export interface CharacterInstance {
  id: string;
  level?: number;
  activeYellow?: number;
  /** 0-7 red stars, 8-10 = 1-3 diamonds. */
  activeRed?: number;
  gearTier?: number;
  basic?: number;
  special?: number;
  ultimate?: number;
  passive?: number;
  power?: number;
  favorite?: boolean;
  iso8?: {
    matrix?: string;
    active?: string;
    striker?: number;
    fortifier?: number;
    healer?: number;
    skirmisher?: number;
    raider?: number;
  };
}

export interface ItemQuantity {
  item?: Item;
  quantity?: number;
}

export interface PlayerCard {
  name: string;
  icon?: string;
  level?: { completedTier?: number };
  tcp?: number;
  stp?: number;
  charactersCollected?: number;
}

export interface CharacterFilter {
  allTraits?: Trait[];
  anyTraits?: Trait[];
  exceptTraits?: Trait[];
  anyCharacters?: string[];
  level?: number;
  activeYellow?: number;
  activeRed?: number;
  gearTier?: number;
}

export interface Requirements {
  minCharacters?: number;
  maxCharacters?: number;
  anyCharacterFilters?: CharacterFilter[];
  specificCharacters?: string[];
  description?: string;
}

export interface Progress {
  completedTier?: number;
  goalTier?: number;
  points?: number;
  goal?: number;
  rank?: number;
}

export interface EventInfo {
  id: string;
  type: string;
  name?: string;
  subName?: string;
  details?: string;
  /** Seconds since epoch. */
  startTime: number;
  endTime: number;
  milestone?: { type?: 'solo' | 'alliance'; brackets?: { objective?: { progress?: Progress } }[] };
  blitz?: { requirements?: Requirements };
  tower?: { requirements?: Requirements };
}

export function idOf(value: Trait | Item | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.id;
}

export type AbilitySlot = 'basic' | 'special' | 'ultimate' | 'passive';
export const ABILITY_SLOTS: AbilitySlot[] = ['ultimate', 'special', 'passive', 'basic'];
export type IsoClass = 'striker' | 'fortifier' | 'healer' | 'skirmisher' | 'raider';

/** An upgrade cost as the API returns it: items with quantities (gold is item "SC"). */
export type ApiCost = { item: Item; quantity?: number }[];
export type Cost = { item: string; quantity: number }[];

/** The /game/v1/upgradeData fields the build planner uses, with item ids flattened. */
export interface UpgradeTables {
  /** Ability level → cost to reach that level. */
  abilityUpgradeCosts: Record<AbilitySlot, Record<string, Cost>>;
  /** Ability level → minimum character level. */
  abilityLevelRequirements: Record<AbilitySlot, Record<string, number>>;
  /** Yellow stars → total shards needed to reach them from zero. */
  yellowStarTotalShards: Record<string, number>;
  /** Yellow stars → total gold to reach them from zero. */
  yellowStarTotalCosts: Record<string, Cost>;
  /** ISO-8 class level → cost to reach that level. */
  iso8AbilityUpgradeCosts: Record<IsoClass, Record<string, Cost>>;
}

/** Saved squads per game mode tab (e.g. roster, blitz, raids), each a list of character ids. */
export type Squads = Record<string, string[][]>;

export interface GearSlot {
  piece?: Item & { tier?: number };
}
export type GearTiers = Record<string, { slots?: GearSlot[] }>;

export function flattenCost(cost: ApiCost | undefined): Cost {
  return (cost ?? [])
    .map((c) => ({ item: idOf(c.item) ?? '', quantity: c.quantity ?? 1 }))
    .filter((c) => c.item);
}

export interface NodeEffects {
  x?: number;
  y?: number;
  target?: boolean;
  vip?: boolean;
  boss?: boolean;
  autoPlay?: boolean;
  gearPercent?: number;
}

/** An enemy (or ally) unit in a combat wave. */
export interface CombatUnit extends CharacterInstance {
  info?: CharacterInfo;
  nodeEffects?: NodeEffects;
}

export interface CombatWave {
  onFewerThan?: number;
  maxSpawnPerTick?: number;
  turnMeter?: number;
  holdNextWaveUntil?: string;
  holdNum?: number;
  /** An array per unit only when a raid difficulty isn't specified. */
  units?: (CombatUnit | CombatUnit[])[];
}

export interface NodeCombat {
  left?: { waves?: CombatWave[] };
  right?: { waves?: CombatWave[] };
}

export interface NodeInfo {
  name?: string;
  subName?: string;
  details?: string;
  isBoss?: boolean;
  energyCost?: number;
  requirements?: Requirements | (Requirements | null)[];
  combatId?: string;
  combat?: NodeCombat;
}

export interface DarkDimension {
  id: string;
  name?: string;
  subName?: string;
  details?: string;
  rays?: string[][];
  startingRoomId?: string;
  rooms?: Record<string, NodeInfo>;
}
