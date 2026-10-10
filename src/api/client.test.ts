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
