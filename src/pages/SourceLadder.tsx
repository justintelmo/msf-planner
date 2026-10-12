import type { Trait } from '../api/types';
import type { GoalReport, GoalSourceReport } from '../data/unlocks';
import { plainName } from '../planner/export';

const CHAPTER_NAMES: Record<string, string> = { SHADOWKING: 'Shadow King', DARKXAVIER: 'Dark Xavier' };
const TIER_NAMES: Record<string, string> = { XTREME: 'X-Treme', 'X-TREME': 'X-Treme' };

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export interface Chapter {
  key: string;
  name: string;
  tiers: GoalSourceReport[];
}

/**
 * Groups a goal's sources into chapters in the order they unlock, e.g. SAGA_XAVIER_NIMROD_HARD, _HEROIC and
 * _XTREME become one "Nimrod" chapter. Sources with no siblings stay a chapter of their own.
 */
export function chaptersOf(r: GoalReport): Chapter[] {
  const keyOf = (s: GoalSourceReport) => s.source.id.replace(/_[^_]+$/, '');
  const counts = new Map<string, number>();
  r.sources.forEach((s) => counts.set(keyOf(s), (counts.get(keyOf(s)) ?? 0) + 1));
  const out = new Map<string, Chapter>();
  for (const s of r.sources) {
    const grouped = (counts.get(keyOf(s)) ?? 0) > 1;
    const key = grouped ? keyOf(s) : s.source.id;
    const seg = key.split('_').pop() ?? key;
    const name = grouped ? CHAPTER_NAMES[seg] ?? title(seg) : s.source.subName ? `${s.source.name}: ${s.source.subName}` : s.source.name;
    if (!out.has(key)) out.set(key, { key, name, tiers: [] });
    out.get(key)!.tiers.push(s);
  }
  return [...out.values()];
}

export const tierName = (s: GoalSourceReport) => TIER_NAMES[s.source.name] ?? title(s.source.name);
export const tierMet = (s: GoalSourceReport) => s.checks.every((c) => c.plan.met);

/** "3 of 5" for the first requirement the roster can't field yet. */
function tierProgress(s: GoalSourceReport): string {
  const open = s.checks.find((c) => !c.plan.met);
  return open ? `${open.plan.ready} of ${open.plan.needed}` : '✓';
}

/** The game's wording of the first requirement a tier's roster doesn't meet yet, or one built from its filters. */
export function requirementText(s: GoalSourceReport, nameOf: (id: string) => string = (id) => id): string {
  const req = (s.checks.find((c) => !c.plan.met) ?? s.checks[0])?.requirements;
  if (!req) return '';
  const said = plainName(req.description).replace(/\.$/, '');
  if (said) return said;
  const f = req.anyCharacterFilters?.[0];
  const bits = [
    f?.gearTier && `gear ${f.gearTier}`,
    f?.level && `level ${f.level}`,
    f?.activeYellow && `${f.activeYellow}★`,
    f?.activeRed && `${f.activeRed} red stars`,
    f?.iso8ClassLevel && `ISO-8 ${f.iso8ClassLevel}`,
  ].filter(Boolean);
  const t = (x: Trait) => (typeof x === 'string' ? x : x.name ?? x.id);
  const traits = [...(f?.allTraits ?? []).map(t), ...(f?.anyTraits?.length ? [f.anyTraits.map(t).join(' or ')] : [])].join(' ');
  const who = `${req.minCharacters ?? 5} ${traits ? `${traits} ` : ''}characters${bits.length ? ` at ${bits.join(', ')}` : ''}`;
  const named = req.specificCharacters?.map(nameOf).join(', ');
  return named ? `${who}, plus ${named}` : who;
}

/** One line per chapter, tiers in unlock order, each marked ready (✓) or with how many characters are ready. */
export default function SourceLadder({ report, nameOf }: { report: GoalReport; nameOf?: (id: string) => string }) {
  const chapters = chaptersOf(report);
  if (chapters.length < 2 && chapters.every((c) => c.tiers.length < 2)) return null;
  return (
    <ol className="ladder small">
      {chapters.map((ch) => {
        const next = ch.tiers.find((t) => !tierMet(t));
        return (
          <li key={ch.key}>
            <strong>{ch.name}</strong>{' '}
            {ch.tiers.map((t, i) => (
              <span key={t.source.id} className={`rung ${tierMet(t) ? 'met' : 'open'}`}>
                {i > 0 && ' · '}
                {tierName(t)} {tierProgress(t)}
              </span>
            ))}
            {next && <div className="muted">Next: {tierName(next)} needs {requirementText(next, nameOf)}</div>}
          </li>
        );
      })}
    </ol>
  );
}
