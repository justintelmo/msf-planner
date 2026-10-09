import { MSF_CONFIG } from '../config';
import { accessToken, logout } from '../auth/auth';
import type {
  ApiResponse,
  CharacterInfo,
  CharacterInstance,
  EventInfo,
  ItemQuantity,
  PlayerCard,
} from './types';

/** Keeps each page under the API's 472 kB response limit. */
const PAGE_SIZE = 100;

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
  async inventory(): Promise<ItemQuantity[]> {
    return (await get<ItemQuantity[]>('/player/v1/inventory', { itemFormat: 'id' })).data;
  },
  async events(): Promise<EventInfo[]> {
    return (await get<EventInfo[]>('/player/v1/events', { itemFormat: 'id', pieceInfo: 'none' })).data;
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
