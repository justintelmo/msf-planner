import type { CharacterFilter, Requirements } from '../api/types';
import { isoClassLevel, isUnlocked, matchesFilter, type OwnedCharacter } from './requirements';

/** Thresholds a character must reach; omitted fields don't matter. */
export interface Target {
  level?: number;
  activeYellow?: number;
  activeRed?: number;
  gearTier?: number;
  iso8ClassLevel?: number;
  iso8Class?: string;
}

export interface Pick {
  character: OwnedCharacter;
  /** What's still missing; empty when the character already qualifies. */
  gap: Target;
  /** Rough upgrade effort, used to pick the cheapest team. */
  effort: number;
}

export interface RequirementPlan {
  needed: number;
  picks: Pick[];
  ready: number;
  met: boolean;
  /** Locked characters the requirement names specifically. */
  locked: OwnedCharacter[];
}

const THRESHOLDS = ['level', 'activeYellow', 'activeRed', 'gearTier', 'iso8ClassLevel', 'iso8Class'] as const;

function looseFilter(f: CharacterFilter): CharacterFilter {
  const loose = { ...f };
  THRESHOLDS.forEach((k) => delete loose[k]);
  return loose;
}

/** Missing thresholds for one filter, and a rough effort score (gear tiers and stars weigh most). */
export function gapFor(c: OwnedCharacter, f: CharacterFilter): { gap: Target; effort: number } {
  const i = c.instance ?? { id: c.info.id };
  const gap: Target = {};
  let effort = 0;
  if (f.level && (i.level ?? 0) < f.level) {
    gap.level = f.level;
    effort += (f.level - (i.level ?? 0)) / 5;
  }
  if (f.activeYellow && (i.activeYellow ?? 0) < f.activeYellow) {
    gap.activeYellow = f.activeYellow;
    effort += (f.activeYellow - (i.activeYellow ?? 0)) * 6;
  }
  if (f.activeRed && (i.activeRed ?? 0) < f.activeRed) {
    gap.activeRed = f.activeRed;
    effort += (f.activeRed - (i.activeRed ?? 0)) * 6;
  }
  if (f.gearTier && (i.gearTier ?? 0) < f.gearTier) {
    gap.gearTier = f.gearTier;
    effort += (f.gearTier - (i.gearTier ?? 0)) * 4;
  }
  if (f.iso8Class && i.iso8?.active !== f.iso8Class) {
    gap.iso8Class = f.iso8Class;
    effort += 3;
  }
  if (f.iso8ClassLevel && isoClassLevel(i) < f.iso8ClassLevel) {
    gap.iso8ClassLevel = f.iso8ClassLevel;
    effort += (f.iso8ClassLevel - isoClassLevel(i)) * 2;
  }
  return { gap, effort };
}

/**
 * Picks the team that's cheapest to make eligible: every character that fits the
 * traits, ranked by how little they still need, then by power.
 */
export function planRequirement(roster: OwnedCharacter[], req: Requirements): RequirementPlan {
  const filters = req.anyCharacterFilters?.length ? req.anyCharacterFilters : [{}];
  const specific = req.specificCharacters ?? [];
  const needed = specific.length || req.minCharacters || 5;
  const locked = roster.filter((c) => specific.includes(c.info.id) && !isUnlocked(c));

  const candidates: Pick[] = [];
  for (const c of roster.filter(isUnlocked)) {
    if (specific.length && !specific.includes(c.info.id)) continue;
    let best: { gap: Target; effort: number } | undefined;
    for (const f of filters) {
      if (!matchesFilter(c, looseFilter(f))) continue;
      const g = gapFor(c, f);
      if (!best || g.effort < best.effort) best = g;
    }
    if (best) candidates.push({ character: c, ...best });
  }
  candidates.sort((a, b) => a.effort - b.effort || (b.character.instance?.power ?? 0) - (a.character.instance?.power ?? 0));
  const picks = candidates.slice(0, needed);
  const ready = candidates.filter((p) => p.effort === 0).length;
  return { needed, picks, ready, met: ready >= needed && locked.length === 0, locked };
}

/** Combines targets for a character from several requirements, keeping the highest bar. */
export function mergeTargets(a: Target, b: Target): Target {
  const out: Target = { ...a };
  for (const k of ['level', 'activeYellow', 'activeRed', 'gearTier', 'iso8ClassLevel'] as const) {
    if (b[k] !== undefined) out[k] = Math.max(out[k] ?? 0, b[k]!);
  }
  if (b.iso8Class) out.iso8Class = b.iso8Class;
  return out;
}

export function describeGap(c: OwnedCharacter, gap: Target): string[] {
  const i = c.instance ?? { id: c.info.id };
  return [
    gap.gearTier && `gear ${i.gearTier ?? 0} → ${gap.gearTier}`,
    gap.activeYellow && `${i.activeYellow ?? 0}★ → ${gap.activeYellow}★`,
    gap.activeRed && `${i.activeRed ?? 0} → ${gap.activeRed} red stars`,
    gap.level && `level ${i.level ?? 0} → ${gap.level}`,
    gap.iso8Class && `switch ISO-8 to ${gap.iso8Class}`,
    gap.iso8ClassLevel && `ISO-8 ${isoClassLevel(i)} → ${gap.iso8ClassLevel}`,
  ].filter((x): x is string => !!x);
}
