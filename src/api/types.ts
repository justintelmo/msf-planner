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
