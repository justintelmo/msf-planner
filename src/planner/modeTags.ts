import type { AbilitySlot } from '../api/types';

/** An ability effect that only applies in one game mode, and the level that adds or changes it. */
export interface ModeTag {
  slot: AbilitySlot;
  level: number;
  mode: string;
  text: string;
}

export interface AbilityKit {
  [slot: string]: { levels?: Record<string, { description?: string }> } | undefined;
}

const MODE_PATTERNS: [string, RegExp][] = [
  ['raids', /\braids?\b/i],
  // "War" alone also matches character names like War Machine, so require mode phrasing.
  ['war', /\b(in|during|on) war\b|\bwar (offense|defense)\b/i],
  ['crucible', /\bcrucible\b/i],
  ['blitz', /\bblitz\b/i],
  ['arena', /\barena\b/i],
  ['tower', /\btower\b/i],
  ['battleworld', /\bbattleworld\b/i],
  ['dark dimension', /\bdark dimension\b/i],
  ['incursion', /\bincursion\b/i],
];

const strip = (s: string) => s.replace(/<\/?[a-z]+(=[^>]*)?>/gi, '').trim();

/**
 * Finds mode-specific paragraphs in each ability's level text and records the level
 * where each one first appears or changes, so an upgrade to that level can be tagged.
 */
export function extractModeTags(kit: AbilityKit | undefined): ModeTag[] {
  const tags: ModeTag[] = [];
  for (const slot of ['basic', 'special', 'ultimate', 'passive'] as AbilitySlot[]) {
    const levels = kit?.[slot]?.levels ?? {};
    const keys = Object.keys(levels).map(Number).sort((a, b) => a - b);
    let previous = new Set<string>();
    for (const level of keys) {
      const paragraphs = strip(levels[level]?.description ?? '').split(/\n+/).map((p) => p.trim()).filter(Boolean);
      const current = new Set<string>();
      for (const p of paragraphs) {
        for (const [mode, re] of MODE_PATTERNS) {
          if (!re.test(p)) continue;
          current.add(p);
          if (!previous.has(p) && level > 1) tags.push({ slot, level, mode, text: p });
        }
      }
      previous = current;
    }
  }
  return tags;
}
