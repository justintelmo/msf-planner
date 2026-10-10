import catalog from '../data/apiParams.json';

/** One documented parameter of an API path, from the full API spec (scripts/api-params.mjs). */
export interface ParamDoc {
  name: string;
  in: 'query' | 'path';
  enum?: string[];
  default?: string | number | boolean;
  type?: string;
  required?: boolean;
  description?: string;
}

export interface PathDoc {
  summary: string;
  params: ParamDoc[];
}

export const API_PATHS = catalog as Record<string, PathDoc>;
export const TEMPLATES = Object.keys(API_PATHS).sort();

/** The documented template a concrete path matches, e.g. /game/v1/upgradeData/iso8FuseCosts → …/{fieldId}. */
export function matchTemplate(path: string): { template: string; values: Record<string, string> } | undefined {
  if (API_PATHS[path]) return { template: path, values: {} };
  for (const template of TEMPLATES) {
    const names: string[] = [];
    const re = new RegExp('^' + template.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\w+)\}/g, (_, n) => (names.push(n), '([^/]+)')) + '$');
    const m = path.match(re);
    if (m) return { template, values: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return undefined;
}

/** Fills a template's {placeholders}; unfilled ones stay as they are. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (all, n) => (values[n] ? encodeURIComponent(values[n]) : all));
}

/**
 * Settings that only drop metadata, never the data asked for: items as ids instead of objects,
 * no piece or sub-piece details, stats and traits in compact form, no translated text.
 */
const SHRINK: Record<string, string> = {
  itemFormat: 'id', pieceInfo: 'none', pieceDirectCost: 'none', pieceFlatCost: 'none', subPieceInfo: 'none',
  statsFormat: 'csv', traitFormat: 'id', lang: 'none', costumes: 'none', abilityKits: 'none',
};

/** The size-reducing settings this path documents. */
export function smallestParams(doc: PathDoc | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of doc?.params ?? []) {
    const v = SHRINK[p.name];
    if (p.in === 'query' && v && (!p.enum || p.enum.includes(v))) out[p.name] = v;
  }
  return out;
}
