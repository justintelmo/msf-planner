import type { Target } from '../planner/gaps';
import { BATTLEWORLD_PRESETS, battleworldTarget, difficultyName, raidFamily, raidTarget, raidTier, setModeGoals, useModeGoals } from '../data/modeGoals';
import type { Catalog, RaidSource } from '../data/unlocks';

/** Raids gathered by type, newest first within each type. */
function raidTypes(catalog: Catalog): { name: string; raids: RaidSource[] }[] {
  const types = new Map<string, { name: string; raids: RaidSource[] }>();
  for (const r of catalog.raids ?? []) {
    const f = raidFamily(r, catalog);
    const t = types.get(f.key) ?? { name: f.name, raids: [] };
    t.raids.push(r);
    types.set(f.key, t);
  }
  return [...types.values()].map((t) => ({ ...t, raids: t.raids.sort((a, b) => raidTier(b) - raidTier(a)) }));
}

const BW_FIELDS: { key: keyof Target; label: string }[] = [
  { key: 'gearTier', label: 'Gear tier' },
  { key: 'level', label: 'Level' },
  { key: 'activeYellow', label: 'Yellow stars' },
  { key: 'activeRed', label: 'Red stars (8+ = diamonds)' },
  { key: 'iso8ClassLevel', label: 'ISO-8 class level' },
];

/** Target difficulty per raid, and Battleworld's thresholds, which the API doesn't have. */
export default function ModeTargets({ catalog }: { catalog: Catalog | null }) {
  const goals = useModeGoals();
  const bw = goals.battleworld ?? { difficulty: 7, characters: 15, target: {} };
  const setBw = (patch: Partial<typeof bw>) => setModeGoals({ ...goals, battleworld: { ...bw, ...patch } });
  const num = (v: string) => (v.trim() ? Number(v) : undefined);

  return (
    <article className="card mode-targets">
      <h3>Mode targets</h3>
      <p className="muted small">
        The Plan treats these like unlock goals: it finds the cheapest characters to bring up to each bar and puts those
        upgrades near the top of the priority list.
      </p>

      <h4>Raids</h4>
      {!catalog?.raids ? (
        <p className="muted small">Press refresh above to read raids and their difficulties.</p>
      ) : catalog.raids.length === 0 ? (
        <p className="muted small">The API didn’t list any raids.</p>
      ) : (
        <>
          <p className="muted small">
            By default only the newest raid of each type is targeted, at its highest difficulty. Open a type to change that.
          </p>
          {raidTypes(catalog).map(({ name, raids }) => (
            <details key={name} className="raid-type">
              <summary className="small">
                <strong>{name}</strong>{' '}
                <span className="muted">
                  {raids.filter((r) => raidTarget(goals, r, catalog) >= 0).map((r) => `${r.name} (${difficultyName(r, raidTarget(goals, r, catalog))})`).join(', ') || 'skipped'}
                </span>
              </summary>
              <ul className="raid-targets">
                {raids.map((r) => {
                  const value = raidTarget(goals, r, catalog);
                  const max = r.maxDifficulty ?? 0;
                  const diff = value > 0 ? r.difficulties[String(value)] : undefined;
                  return (
                    <li key={r.id} className="small">
                      <strong>{r.name}</strong>{r.subName ? <span className="muted"> · {r.subName}</span> : null}{' '}
                      <select
                        value={value}
                        onChange={(e) => setModeGoals({ ...goals, raids: { ...(goals.raids ?? {}), [r.id]: Number(e.target.value) } })}
                      >
                        <option value={-1}>Skip</option>
                        {Array.from({ length: max + 1 }, (_, d) => (
                          <option key={d} value={d}>{difficultyName(r, d)}{d === max && max > 0 ? ' (highest)' : ''}</option>
                        ))}
                      </select>
                      {diff?.recommendations && <span className="muted"> · {diff.recommendations}</span>}
                      {value >= 0 && r.rooms.length === 0 && <span className="warn"> · press refresh above to read its rooms</span>}
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </>
      )}

      <h4>Battleworld</h4>
      <p className="muted small">
        Battleworld isn’t in the API. Difficulties 6 to 9 use the game’s minimum power recommendations (red stars 10 = 3
        diamonds, ISO-8 15 = tier 3 level 5); type a number to override one. Your saved Battleworld squads must all meet
        it; the rest of the count is filled with your cheapest characters to upgrade.
      </p>
      <div className="bw-form small">
        <label>
          Difficulty{' '}
          <input type="number" min={1} value={bw.difficulty} style={{ width: 60 }} onChange={(e) => setBw({ difficulty: Number(e.target.value) || 1, target: {} })} />
        </label>
        <label>
          Characters needed{' '}
          <input type="number" min={1} value={bw.characters} style={{ width: 60 }} onChange={(e) => setBw({ characters: Number(e.target.value) || 1 })} />
        </label>
        {BW_FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}{' '}
            <input
              type="number" min={0} placeholder="any" style={{ width: 70 }}
              value={(battleworldTarget(bw)[f.key] as number | undefined) ?? ''}
              onChange={(e) => setBw({ target: { ...battleworldTarget(bw), [f.key]: num(e.target.value) } })}
            />
          </label>
        ))}
      </div>
      {BATTLEWORLD_PRESETS[bw.difficulty] && (
        <button className="ghost small" onClick={() => setBw({ target: {} })}>Reset to the game’s difficulty {bw.difficulty} numbers</button>
      )}
    </article>
  );
}
