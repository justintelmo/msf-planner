import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth/auth', () => ({ accessToken: async () => 'token', logout: () => {} }));
vi.mock('../config', () => ({ MSF_CONFIG: { apiBaseUrl: 'https://api.test', apiKey: 'k' } }));

const { msfApi } = await import('./client');

const reply = (status: number, data?: unknown) =>
  ({ ok: status === 200, status, json: async () => ({ data }) }) as Response;

describe('msfApi.raid', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads a raid too large for one call in pieces and merges them', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: URL) => {
      const u = new URL(url);
      const q = u.searchParams;
      calls.push(`${u.pathname}?map=${q.get('raidMap')}&diffs=${q.get('raidDiffs')}&nodeInfo=${q.get('nodeInfo')}&d=${q.get('difficulty') ?? ''}`);
      if (u.pathname.endsWith('/raid_big/A1')) return reply(200, { requirements: { minCharacters: 5, anyCharacterFilters: [{ allTraits: ['City'] }] } });
      if (u.pathname.endsWith('/raid_big/B1')) return reply(200, { requirements: { minCharacters: 5 } });
      if (q.get('raidMap') === 'full' && q.get('raidDiffs') === 'full') return reply(472);
      if (q.get('raidDiffs') === 'full' && !q.get('difficulty')) return reply(472);
      if (q.get('raidDiffs') === 'full') return reply(200, { difficulties: { [q.get('difficulty')!]: { name: `D${q.get('difficulty')}` } } });
      if (q.get('raidMap') === 'full') return reply(200, { rays: [['A1', 'B1', '']] });
      return reply(200, { id: 'raid_big', name: 'Big', maxDifficulty: 2 });
    });
    const raid = await msfApi.raid('raid_big');
    expect(raid.name).toBe('Big');
    expect(Object.keys(raid.difficulties ?? {})).toEqual(['1', '2']);
    expect(Object.keys(raid.rooms ?? {})).toEqual(['A1', 'B1']);
    expect(raid.rooms?.A1.requirements).toMatchObject({ minCharacters: 5 });
    expect(calls.filter((c) => c.includes('/A1') || c.includes('/B1'))).toHaveLength(2);
  });
});

describe('msfApi.darkDimensionRoom', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the combat by id when the room refuses it inline', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: URL) => {
      const u = new URL(url);
      calls.push(`${u.pathname}?nodeCombat=${u.searchParams.get('nodeCombat') ?? ''}`);
      if (u.pathname.startsWith('/game/v1/nodeCombats/')) {
        return reply(200, { right: { waves: [{ units: [{ id: 'Magik', info: { portrait: 'p.png' } }] }] } });
      }
      if (u.searchParams.get('nodeCombat') === 'full') {
        return { ok: false, status: 422, json: async () => ({ error: { code: 422, subcode: 'PROHIBITED_VALUE', field: 'nodeCombat' } }) } as Response;
      }
      return reply(200, { name: 'Room', combatId: 'combat_1' });
    });
    const room = await msfApi.darkDimensionRoom('dd_x', 'B4');
    expect(room.combat?.right?.waves?.[0].units).toHaveLength(1);
    expect(calls).toEqual(['/game/v1/dds/dd_x/B4?nodeCombat=full', '/game/v1/dds/dd_x/B4?nodeCombat=none', '/game/v1/nodeCombats/combat_1?nodeCombat=']);
  });

  it('says which field the API refused', async () => {
    vi.stubGlobal('fetch', async () =>
      ({ ok: false, status: 404, json: async () => ({ error: { subcode: 'NOT_FOUND', message: 'Not Found', field: 'ddId' } }) }) as Response);
    await expect(msfApi.darkDimensionRoom('insanity_limbo', 'B4')).rejects.toMatchObject({ status: 404, field: 'ddId' });
  });
});
