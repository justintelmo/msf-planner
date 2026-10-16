import { describe, expect, it } from 'vitest';
import { offersToText, parseOffers } from './storeText';
import type { OwnedCharacter } from './requirements';

const owned: OwnedCharacter[] = [
  { info: { id: 'ShadowKing', name: 'Shadow King' } },
  { info: { id: 'Knull', name: 'Knull' } },
  { info: { id: 'OldManLogan', name: 'Old Man Logan' } },
];
const nameOf = (id: string) => owned.find((c) => c.info.id === id)?.info.name ?? id;

describe('parseOffers', () => {
  it('reads shard and red star lines, with shorthand and daily limits', () => {
    const lines = parseOffers('Shadow King, 5, 400\nKnull, red star, 1.5K, 1/day\nold man logan red star\t2000\n\n# a note', owned, nameOf);
    expect(lines.map((l) => l.offer)).toEqual([
      { characterId: 'ShadowKing', kind: 'shards', shards: 5, price: 400, perDay: undefined },
      { characterId: 'Knull', kind: 'redStar', shards: 1, price: 1500, perDay: 1 },
      { characterId: 'OldManLogan', kind: 'redStar', shards: 1, price: 2000, perDay: undefined },
    ]);
  });

  it('points at lines it cannot read', () => {
    const lines = parseOffers('Shadwo King, 5, 400\nKnull, 5', owned, nameOf);
    expect(lines.map((l) => [l.line, !!l.error])).toEqual([[1, true], [2, true]]);
  });

  it('round-trips through text', () => {
    const offers = [{ id: 'a', currencyId: 'c', characterId: 'Knull', kind: 'redStar' as const, shards: 1, price: 1500, perDay: 1 }];
    expect(parseOffers(offersToText(offers, nameOf), owned, nameOf)[0].offer).toMatchObject({ characterId: 'Knull', kind: 'redStar', price: 1500, perDay: 1 });
  });
});
