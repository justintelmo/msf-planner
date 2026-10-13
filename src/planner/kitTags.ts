import { EN as strings } from '../i18n/en';
import type { AbilitySlot, CharacterInstance } from '../api/types';
import type { AbilityKit } from './modeTags';

/**
 * Kit mechanics that still work when a node multiplies enemy health and damage:
 * - maxHealth: damage scaled off the target's Max Health, so it grows with health boosts
 * - lockdown: Stun, Ability Block or Disrupted, which stop energy-cheating enemies acting
 * - tempo: Speed Bar or Ability Energy taken from enemies, or Slow
 * - drain: Drain or Health Steal, which keeps a team alive while it trades
 * - sustain: Barrier, Heal, Revive, Taunt, Deflect or Protect
 * - piercing: damage that ignores armor
 */
export type KitTag = 'maxHealth' | 'lockdown' | 'tempo' | 'drain' | 'sustain' | 'piercing';

export const KIT_TAGS: KitTag[] = ['maxHealth', 'lockdown', 'tempo', 'drain', 'sustain', 'piercing'];

export const KIT_LABELS: Record<KitTag, string> = strings.kit;

/** A tag and the ability level that first gives it. */
export interface KitTagHit {
  tag: KitTag;
  slot: AbilitySlot;
  level: number;
  /** The sentence it was read from. */
  text: string;
}

// Sentences about the character's own protection ("is immune to Stun") or removing effects from allies aren't attacks.
const DEFENSIVE = /\bimmun|\bcannot be\b|\bclear\b|\bremove\b[^.]*\bfrom (?:self|allies|all allies)/i;

const PATTERNS: [KitTag, RegExp, RegExp?][] = [
  ['maxHealth', /% of (?:the |their |each |that )?(?:primary )?(?:target|enemy|enemies)(?:['’]s?)? max(?:imum)? health/i, /\b(heal|barrier)\b/i],
  ['lockdown', /\b(stun|ability block|disrupted)\b/i, DEFENSIVE],
  ['tempo', /\b(?:reduce|remove|steal|drain|lower)\b[^.]*\b(?:speed bar|ability energy)\b|\bapply (?:\+?\d+ )?slow\b/i, /^(?!.*\benem).*\b(?:self|allies|ally)\b/i],
  ['drain', /\b(drain|health steal|lifesteal)\b/i],
  ['sustain', /\b(barrier|heal|revive|taunt|deflect|protect|safeguard)\b/i],
  ['piercing', /\bpiercing\b/i],
];

const strip = (s: string) => s.replace(/<\/?[a-z]+(=[^>]*)?>/gi, '').trim();

/** Every tag in a kit, at the lowest level of each ability that has it. */
export function extractKitTags(kit: AbilityKit | undefined): KitTagHit[] {
  const hits: KitTagHit[] = [];
  for (const slot of ['basic', 'special', 'ultimate', 'passive'] as AbilitySlot[]) {
    const levels = kit?.[slot]?.levels ?? {};
    const seen = new Set<KitTag>();
    for (const level of Object.keys(levels).map(Number).sort((a, b) => a - b)) {
      const sentences = strip(levels[level]?.description ?? '').split(/\n+|(?<=\.)\s+/).map((p) => p.trim()).filter(Boolean);
      for (const s of sentences) {
        for (const [tag, re, not] of PATTERNS) {
          if (seen.has(tag) || !re.test(s) || not?.test(s)) continue;
          seen.add(tag);
          hits.push({ tag, slot, level, text: s });
        }
      }
    }
  }
  return hits;
}

/** The tags a character has at their current ability levels. */
export function activeKitTags(hits: KitTagHit[] | undefined, inst: CharacterInstance | undefined): Map<KitTag, string> {
  const out = new Map<KitTag, string>();
  for (const h of hits ?? []) {
    if ((inst?.[h.slot] ?? 0) >= h.level && !out.has(h.tag)) out.set(h.tag, h.text);
  }
  return out;
}
