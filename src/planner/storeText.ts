import { parseAmount } from '../data/wallet';
import type { ShardOffer } from '../data/stores';
import type { OwnedCharacter } from './requirements';

/**
 * Store offers as plain text, one per line, so a whole store can be typed or pasted at once:
 *   Shadow King, 5, 400        5 shards for 400
 *   Shadow King, 5, 400, 2/day same, at most 2 purchases a day
 *   Knull, red star, 1500      one red star for 1,500 (a fourth field is purchases a day)
 * Fields split on commas, tabs or "|"; amounts take shorthand like 1.5K.
 */
export interface ParsedLine {
  line: number;
  offer?: Omit<ShardOffer, 'id' | 'currencyId'>;
  error?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const RED = /^(red|red ?stars?|rs)$/i;

export function offersToText(offers: ShardOffer[], nameOf: (id: string) => string): string {
  return offers
    .map((o) => {
      const tail = o.perDay ? `, ${o.perDay}` : '';
      return o.kind === 'redStar'
        ? `${nameOf(o.characterId)}, red star, ${o.price}${tail}`
        : `${nameOf(o.characterId)}, ${o.shards}, ${o.price}${tail}`;
    })
    .join('\n');
}

export function parseOffers(text: string, owned: OwnedCharacter[], nameOf: (id: string) => string): ParsedLine[] {
  const index = new Map<string, string>();
  for (const c of owned) {
    for (const n of [c.info.id, c.info.name ?? '', nameOf(c.info.id)]) if (n) index.set(norm(n), c.info.id);
  }
  const out: ParsedLine[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim() || raw.trim().startsWith('#')) return;
    const fields = raw.split(/[,\t|]/).map((f) => f.trim()).filter(Boolean);
    // "Knull red star, 1500" works as well as "Knull, red star, 1500".
    let name = fields.shift() ?? '';
    let red = fields.some((f) => RED.test(f));
    const suffix = /\s+red(?: ?stars?)?$/i.exec(name);
    if (suffix) {
      red = true;
      name = name.slice(0, suffix.index);
    }
    const characterId = index.get(norm(name));
    if (!characterId) return out.push({ line, error: `no character called “${name}”` });
    const nums = fields.filter((f) => !RED.test(f)).map((f) => parseAmount(f.replace(/\s*(?:\/\s*day|(?:per|a) day)$/i, '')));
    if (nums.some((n) => n === undefined || n < 0)) return out.push({ line, error: 'amounts must be numbers, like 400 or 1.5K' });
    const [a, b, c] = nums as number[];
    if (red) {
      if (!a) return out.push({ line, error: 'add the price, e.g. “Knull, red star, 1500”' });
      out.push({ line, offer: { characterId, kind: 'redStar', shards: 1, price: a, perDay: b || undefined } });
    } else {
      if (!a || !b) return out.push({ line, error: 'add shards and price, e.g. “Shadow King, 5, 400”' });
      out.push({ line, offer: { characterId, kind: 'shards', shards: a, price: b, perDay: c || undefined } });
    }
  });
  return out;
}
