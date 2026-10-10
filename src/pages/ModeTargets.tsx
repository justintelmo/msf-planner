import type { Target } from '../planner/gaps';
import { difficultyName, raidTarget, setModeGoals, useModeGoals } from '../data/modeGoals';
import type { Catalog } from '../data/unlocks';

const BW_FIELDS: { key: keyof Target; label: string }[] = [
  { key: 'gearTier', label: 'Gear tier' },
  { key: 'level', label: 'Level' },
  { key: 'activeYellow', label: 'Yellow stars' },
  { key: 'activeRed', label: 'Red stars' },
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
        <ul className="raid-targets">
          {catalog.raids.map((r) => {
            const value = raidTarget(goals, r);
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
              </li>
            );
          })}
        </ul>
      )}

      <h4>Battleworld</h4>
      <p className="muted small">
        Battleworld isn’t in the API. Enter what your alliance difficulty asks for from the in-game screen. Your saved
        Battleworld squads must all meet it; the rest of the count is filled with your cheapest characters to upgrade.
      </p>
      <div className="bw-form small">
        <label>
          Difficulty{' '}
          <input type="number" min={1} value={bw.difficulty} style={{ width: 60 }} onChange={(e) => setBw({ difficulty: Number(e.target.value) || 1 })} />
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
              value={(bw.target[f.key] as number | undefined) ?? ''}
              onChange={(e) => setBw({ target: { ...bw.target, [f.key]: num(e.target.value) } })}
            />
          </label>
        ))}
      </div>
    </article>
  );
}
