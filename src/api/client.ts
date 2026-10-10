import { MSF_CONFIG } from '../config';
import type { AbilityKit } from '../planner/modeTags';
import { accessToken, logout } from '../auth/auth';
import {
  flattenCost,
  type ApiCost,
  type Cost,
  type Item,
  type ApiResponse,
  type GearTiers,
  type Squads,
  type UpgradeTables,
  type CharacterInfo,
  type DarkDimension,
  type EpisodicInfo,
  type RaidInfo,
  type NodeInfo,
  type CharacterInstance,
  type EventInfo,
  type ItemQuantity,
  type PlayerCard,
} from './types';

type Nested<T> = Record<string, Record<string, T>>;
const mapValues = <A, B>(o: Record<string, A>, f: (a: A) => B): Record<string, B> =>
  Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, f(v)]));

/** Keeps each page under the API's 472 kB response limit. */
const PAGE_SIZE = 100;
/** The inventory endpoint's itemType filter values. */
export const INVENTORY_TYPES = ['GEAR', 'ISOITEM', 'SHARD', 'RS', 'COSTUME', 'CONSUMABLE', 'ABILITY_MATERIAL'];

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<ApiResponse<T>> {
  const url = new URL(MSF_CONFIG.apiBaseUrl + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const headers: Record<string, string> = { 'x-api-key': MSF_CONFIG.apiKey };
  const token = await accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (res.status === 401) logout();
  if (!res.ok) throw new ApiError(res.status, `${path} failed (${res.status})`);
  return (await res.json()) as ApiResponse<T>;
}

/** Fetches page 1, then the remaining pages in parallel. */
async function getPaged<T>(path: string, params: Record<string, string>): Promise<ApiResponse<T[]>> {
  const page = (n: number) => get<T[]>(path, { ...params, page: String(n), perPage: String(PAGE_SIZE) });
  const first = await page(1);
  const pages = Math.ceil((first.meta?.perTotal ?? 0) / PAGE_SIZE);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => page(i + 2)));
  return { meta: first.meta, data: [first.data, ...rest.map((r) => r.data)].flat() };
}

export function resolveImg(path: string | undefined, base: string | undefined): string | undefined {
  if (!path || !base || /^https?:\/\//.test(path)) return path;
  return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

export const msfApi = {
  async card(): Promise<PlayerCard> {
    const { data, meta } = await get<PlayerCard>('/player/v1/card');
    return { ...data, icon: resolveImg(data.icon, meta?.baseImgUrl) };
  },
  async roster(): Promise<CharacterInstance[]> {
    return (await get<CharacterInstance[]>('/player/v1/roster')).data;
  },
  /**
   * Everything in the inventory. The unfiltered call leaves some types out (ions, training
   * modules), so each item type is read separately and merged by item id.
   */
  async inventory(): Promise<ItemQuantity[]> {
    const read = (itemType?: string) =>
      get<ItemQuantity[]>('/player/v1/inventory', { itemFormat: 'id', ...(itemType ? { itemType } : {}) })
        .then((r) => r.data ?? [])
        .catch(() => [] as ItemQuantity[]);
    const lists = await Promise.all([undefined, ...INVENTORY_TYPES].map(read));
    const merged = new Map<string, ItemQuantity>();
    for (const entry of lists.flat()) {
      const id = typeof entry.item === 'string' ? entry.item : entry.item?.id;
      if (!id) continue;
      const prev = merged.get(id);
      if (!prev || (entry.quantity ?? 0) > (prev.quantity ?? 0)) merged.set(id, entry);
    }
    return [...merged.values()];
  },
  async events(): Promise<EventInfo[]> {
    return (await get<EventInfo[]>('/player/v1/events', { itemFormat: 'id', pieceInfo: 'none' })).data;
  },
  /** Any GET path, unparsed, for exploring endpoints the app doesn't use yet. */
  async raw(pathWithQuery: string): Promise<unknown> {
    const url = new URL(pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`, 'https://x');
    return get<unknown>(url.pathname, Object.fromEntries(url.searchParams));
  },
  /** Full event payload, unparsed, for inspecting fields the app doesn't model yet. */
  async eventRaw(eventId: string): Promise<unknown> {
    return get<unknown>(`/player/v1/events/${encodeURIComponent(eventId)}`);
  },
  /**
   * Raw responses from the endpoints the build planner will need, so their real
   * shapes can be checked before modelling them. Failures are recorded, not thrown.
   */
  async plannerProbe(sampleCharacterId: string): Promise<Record<string, unknown>> {
    const id = encodeURIComponent(sampleCharacterId);
    const safe = async (path: string, params?: Record<string, string>) => {
      try {
        return await get<unknown>(path, params);
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    };
    // The full upgradeData response is over the size limit, so fetch each field on its own.
    const upgradeFields = [
      'characterXpCosts', 'yellowStarTotalShards', 'yellowStarTotalCosts', 'abilityLevelRequirements',
      'abilityUpgradeCosts', 'iso8MatrixLevelRequirements', 'iso8MatrixUpgradeCosts', 'iso8AbilityUpgradeCosts',
      'iso8FuseCosts',
    ];
    const character = (await safe(`/game/v1/characters/${id}`, {
      costumes: 'none', abilityKits: 'none', pieceInfo: 'full', pieceDirectCost: 'full', pieceFlatCost: 'full',
    })) as { data?: { gearTiers?: Record<string, { slots?: { piece?: { id?: string } }[] }> } };
    const tiers = character.data?.gearTiers ?? {};
    const topTier = Object.keys(tiers).map(Number).sort((a, b) => b - a)[0];
    const pieceIds = (tiers[String(topTier)]?.slots ?? []).map((s) => s.piece?.id).filter((x): x is string => !!x);
    const items = [`SHARD_${sampleCharacterId.toUpperCase()}`, ...pieceIds.slice(0, 3)];

    const [upgrades, itemDetails, card] = await Promise.all([
      Promise.all(upgradeFields.map(async (f) => [f, await safe(`/game/v1/upgradeData/${f}`)] as const)),
      Promise.all(items.map(async (i) => [i, await safe(`/game/v1/items/${encodeURIComponent(i)}`, { pieceFlatCost: 'full' })] as const)),
      safe('/player/v1/card'),
    ]);
    return {
      sampleCharacterId,
      fetchedAt: new Date().toISOString(),
      upgradeData: Object.fromEntries(upgrades),
      character,
      items: Object.fromEntries(itemDetails),
      card,
    };
  },
  /** Fetched field by field: the full upgradeData response is over the API's size limit. */
  async upgrades(): Promise<UpgradeTables> {
    const field = async <T>(name: string) =>
      (await get<T>(`/game/v1/upgradeData/${name}`, { itemFormat: 'id' })).data;
    const [abilityCosts, abilityReqs, starShards, starCosts, isoCosts, xpCosts, levelXp] = await Promise.all([
      field<Nested<ApiCost>>('abilityUpgradeCosts'),
      field<Nested<number>>('abilityLevelRequirements'),
      field<Record<string, number>>('yellowStarTotalShards'),
      field<Record<string, ApiCost>>('yellowStarTotalCosts'),
      field<Nested<ApiCost>>('iso8AbilityUpgradeCosts'),
      // Newer fields: a failure here shouldn't lose the rest.
      field<{ xpReward: number; cost: ApiCost }[]>('characterXpCosts').catch(() => undefined),
      field<(number | null)[]>('characterLevelTotalXp').catch(() => undefined),
    ]);
    return {
      abilityUpgradeCosts: mapValues(abilityCosts, (lv) => mapValues(lv, flattenCost)) as UpgradeTables['abilityUpgradeCosts'],
      abilityLevelRequirements: abilityReqs as UpgradeTables['abilityLevelRequirements'],
      yellowStarTotalShards: starShards,
      yellowStarTotalCosts: mapValues(starCosts, flattenCost),
      iso8AbilityUpgradeCosts: mapValues(isoCosts, (lv) => mapValues(lv, flattenCost)) as UpgradeTables['iso8AbilityUpgradeCosts'],
      characterXpCosts: xpCosts?.map((x) => ({ xpReward: x.xpReward, cost: flattenCost(x.cost) })),
      characterLevelTotalXp: levelXp,
    };
  },
  async squads(): Promise<Squads> {
    return (await get<{ tabs?: Squads }>('/player/v1/squads')).data.tabs ?? {};
  },
  /**
   * Crafting recipes for a gear piece and every sub-piece under it, as
   * piece id → direct cost (sub-pieces and gold). Raw materials have no entry.
   */
  async gearRecipes(itemId: string): Promise<Record<string, Cost>> {
    const { data } = await get<Item>(`/game/v1/items/${encodeURIComponent(itemId)}`, {
      pieceInfo: 'full', pieceDirectCost: 'full', pieceFlatCost: 'none', subPieceInfo: 'full', statsFormat: 'none',
    });
    const out: Record<string, Cost> = {};
    const walk = (item: Item | undefined) => {
      if (!item || typeof item === 'string' || !item.id || out[item.id]) return;
      const direct = (item as { directCost?: ApiCost }).directCost;
      if (!direct?.length) return;
      out[item.id] = flattenCost(direct);
      direct.forEach((c) => walk(c.item));
    };
    walk(data);
    return out;
  },
  /** Gear pieces for every tier, plus ability text per level, for one character. */
  async characterDetail(characterId: string): Promise<{ gearTiers: GearTiers; abilityKit?: AbilityKit }> {
    const { data } = await get<{ gearTiers?: GearTiers; abilityKit?: AbilityKit }>(
      `/game/v1/characters/${encodeURIComponent(characterId)}`,
      { itemFormat: 'id', costumes: 'none', abilityKits: 'full', gearTiers: 'full', pieceInfo: 'none' },
    );
    return { gearTiers: data.gearTiers ?? {}, abilityKit: data.abilityKit };
  },
  async darkDimensions(): Promise<DarkDimension[]> {
    return (await getPaged<DarkDimension>('/game/v1/dds', { nodeInfo: 'none' })).data;
  },
  /** The map and each room's name and requirements, without combat details. */
  async darkDimension(ddId: string): Promise<DarkDimension> {
    return (await get<DarkDimension>(`/game/v1/dds/${encodeURIComponent(ddId)}`, {
      itemFormat: 'id', traitFormat: 'id', nodeInfo: 'full', nodeReqs: 'full', nodeRewards: 'none', raidRewards: 'none',
      nodeCombat: 'none',
    })).data;
  },
  /** One room with its enemy waves, including each enemy's name and portrait. */
  async darkDimensionRoom(ddId: string, roomId: string): Promise<NodeInfo> {
    const { data, meta } = await get<NodeInfo>(`/game/v1/dds/${encodeURIComponent(ddId)}/${encodeURIComponent(roomId)}`, {
      itemFormat: 'id', traitFormat: 'id', nodeInfo: 'full', nodeReqs: 'full', nodeRewards: 'none',
      nodeCombat: 'full', charInfo: 'full',
    });
    for (const side of [data.combat?.left, data.combat?.right]) {
      for (const wave of side?.waves ?? []) {
        for (const unit of (wave.units ?? []).flat()) {
          if (unit.info) unit.info.portrait = resolveImg(unit.info.portrait, meta?.baseImgUrl);
        }
      }
    }
    return data;
  },
  /** A Dark Dimension with every room's requirements and rewards, plus completion rewards. */
  async darkDimensionUnlocks(ddId: string): Promise<DarkDimension> {
    return (await get<DarkDimension>(`/game/v1/dds/${encodeURIComponent(ddId)}`, {
      itemFormat: 'id', traitFormat: 'id', nodeInfo: 'part', nodeReqs: 'full', nodeRewards: 'full',
      raidRewards: 'full', raidInfo: 'full', raidMap: 'full', nodeCombat: 'none', pieceInfo: 'none',
    })).data;
  },
  async raids(): Promise<RaidInfo[]> {
    return (await getPaged<RaidInfo>('/game/v1/raids', { itemFormat: 'id', traitFormat: 'id', raidInfo: 'full' })).data;
  },
  /** A raid's rooms with their requirements, and every difficulty's entry requirements. */
  async raid(raidId: string): Promise<RaidInfo> {
    return (await get<RaidInfo>(`/game/v1/raids/${encodeURIComponent(raidId)}`, {
      itemFormat: 'id', traitFormat: 'id', nodeInfo: 'part', nodeReqs: 'full', nodeRewards: 'none',
      raidRewards: 'none', raidInfo: 'full', raidMap: 'full', raidDiffs: 'full', nodeCombat: 'none', pieceInfo: 'none',
    })).data;
  },
  async episodics(type: string): Promise<EpisodicInfo[]> {
    return (await getPaged<EpisodicInfo>(`/game/v1/episodics/${encodeURIComponent(type)}`, { itemFormat: 'id', traitFormat: 'id' })).data;
  },
  /** An episodic with each chapter's tiers, their requirements and rewards. */
  async episodic(type: string, id: string): Promise<EpisodicInfo> {
    return (await get<EpisodicInfo>(`/game/v1/episodics/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, {
      itemFormat: 'id', traitFormat: 'id', nodeInfo: 'part', nodeReqs: 'full', nodeRewards: 'full', pieceInfo: 'none',
    })).data;
  },
  async characters(): Promise<CharacterInfo[]> {
    const { data, meta } = await getPaged<CharacterInfo>('/game/v1/characters', {
      status: 'playable',
      itemFormat: 'id',
      traitFormat: 'id',
      costumes: 'none',
      abilityKits: 'none',
      gearTiers: 'none',
      pieceInfo: 'none',
    });
    return data.map((c) => ({ ...c, portrait: resolveImg(c.portrait, meta?.baseImgUrl) }));
  },
};
