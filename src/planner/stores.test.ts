import { describe, expect, it } from 'vitest';
import type { Stores } from '../data/stores';
import { storeRecipes } from './stores';

const stores: Stores = {
  currencies: [{ id: 'ch', name: 'Chapter Store', have: 1000, perDay: 600 }],
  offers: [
    { id: '1', characterId: 'A', currencyId: 'ch', price: 200, shards: 5, perDay: 2 },
    { id: '2', characterId: 'B', currencyId: 'ch', price: 100, shards: 2 },
  ],
};

describe('stores', () => {
  it('prices shards in store currency', () => {
    expect(storeRecipes(stores, [{ id: 'A', starItems: ['SHARD_A'] }, { id: 'B' }])).toEqual({
      SHARD_A: [{ item: 'STORE_CURRENCY_ch', quantity: 40 }],
      SHARD_B: [{ item: 'STORE_CURRENCY_ch', quantity: 50 }],
    });
  });

});
