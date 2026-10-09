import { idOf, type CharacterFilter, type CharacterInfo, type CharacterInstance, type Requirements } from '../api/types';

export interface OwnedCharacter {
  info: CharacterInfo;
  instance?: CharacterInstance;
}

export function isUnlocked(c: OwnedCharacter): boolean {
  return (c.instance?.activeYellow ?? 0) > 0;
}

function traitIds(info: CharacterInfo): Set<string> {
  return new Set(
    [...(info.traits ?? []), ...(info.invisibleTraits ?? [])].map(idOf).filter((t): t is string => !!t),
  );
}

/** Mirrors the API's CharacterFilter: a character must satisfy every field present. */
export function matchesFilter(c: OwnedCharacter, f: CharacterFilter): boolean {
  const traits = traitIds(c.info);
  const has = (t: unknown) => traits.has(idOf(t as string) ?? '');
  const i = c.instance ?? { id: c.info.id };
  if (f.allTraits && !f.allTraits.every(has)) return false;
  if (f.anyTraits && !f.anyTraits.some(has)) return false;
  if (f.exceptTraits && f.exceptTraits.some(has)) return false;
  if (f.anyCharacters && !f.anyCharacters.includes(c.info.id)) return false;
  if (f.level && (i.level ?? 0) < f.level) return false;
  if (f.activeYellow && (i.activeYellow ?? 0) < f.activeYellow) return false;
  if (f.activeRed && (i.activeRed ?? 0) < f.activeRed) return false;
  if (f.gearTier && (i.gearTier ?? 0) < f.gearTier) return false;
  return true;
}

/** Characters on the roster that can enter an event with these requirements. */
export function eligibleCharacters(roster: OwnedCharacter[], req: Requirements | undefined): OwnedCharacter[] {
  const unlocked = roster.filter(isUnlocked);
  if (!req) return unlocked;
  return unlocked.filter((c) => {
    if (req.specificCharacters?.length && !req.specificCharacters.includes(c.info.id)) return false;
    if (req.anyCharacterFilters?.length && !req.anyCharacterFilters.some((f) => matchesFilter(c, f))) {
      return false;
    }
    return true;
  });
}

export interface RequirementCheck {
  eligible: OwnedCharacter[];
  needed: number;
  met: boolean;
}

export function checkRequirements(roster: OwnedCharacter[], req: Requirements | undefined): RequirementCheck {
  const eligible = eligibleCharacters(roster, req).sort(
    (a, b) => (b.instance?.power ?? 0) - (a.instance?.power ?? 0),
  );
  const needed = req?.specificCharacters?.length || req?.minCharacters || 5;
  return { eligible, needed, met: eligible.length >= needed };
}
