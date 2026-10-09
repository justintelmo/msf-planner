import { useMemo, useState } from 'react';
import { idOf } from '../api/types';
import { ownedCharacters, type Snapshot } from '../data/store';
import { isUnlocked, type OwnedCharacter } from '../planner/requirements';

type SortKey = 'name' | 'power' | 'activeYellow' | 'activeRed' | 'gearTier' | 'level';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Character' },
  { key: 'power', label: 'Power' },
  { key: 'activeYellow', label: 'Stars' },
  { key: 'activeRed', label: 'Red' },
  { key: 'gearTier', label: 'Gear' },
  { key: 'level', label: 'Level' },
];

function sortValue(c: OwnedCharacter, key: SortKey): number | string {
  if (key === 'name') return (c.info.name ?? c.info.id).toLowerCase();
  return c.instance?.[key] ?? 0;
}

/** 0-7 red stars, 8-10 are diamonds. */
export function redLabel(red = 0): string {
  return red > 7 ? `7 + ${red - 7}◆` : String(red);
}

export default function Roster({ snapshot }: { snapshot: Snapshot }) {
  const all = useMemo(() => ownedCharacters(snapshot), [snapshot]);
  const [query, setQuery] = useState('');
  const [showLocked, setShowLocked] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'power', desc: true });

  const unlocked = all.filter(isUnlocked);
  const rows = all
    .filter((c) => showLocked || isUnlocked(c))
    .filter((c) => {
      if (!query) return true;
      const q = query.toLowerCase();
      const traits = (c.info.traits ?? []).map((t) => idOf(t)?.toLowerCase() ?? '');
      return (c.info.name ?? c.info.id).toLowerCase().includes(q) || traits.some((t) => t.includes(q));
    })
    .sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.desc ? -cmp : cmp;
    });

  const tcp = unlocked.reduce((sum, c) => sum + (c.instance?.power ?? 0), 0);

  return (
    <section>
      <div className="tiles">
        <Tile label="Unlocked" value={`${unlocked.length} / ${all.length}`} />
        <Tile label="Collection power" value={(snapshot.card.tcp ?? tcp).toLocaleString()} />
        <Tile label="7 yellow stars" value={String(unlocked.filter((c) => c.instance?.activeYellow === 7).length)} />
        <Tile label="Gear 18+" value={String(unlocked.filter((c) => (c.instance?.gearTier ?? 0) >= 18).length)} />
      </div>

      <div className="toolbar">
        <input placeholder="Search name or trait (e.g. Mutant)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label>
          <input type="checkbox" checked={showLocked} onChange={(e) => setShowLocked(e.target.checked)} /> Show locked
        </label>
        <span className="muted">{rows.length} shown</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => setSort((s) => ({ key: col.key, desc: s.key === col.key ? !s.desc : col.key !== 'name' }))}
                  className={sort.key === col.key ? 'sorted' : ''}
                >
                  {col.label}
                  {sort.key === col.key && (sort.desc ? ' ▾' : ' ▴')}
                </th>
              ))}
              <th>Traits</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.info.id} className={isUnlocked(c) ? '' : 'locked'}>
                <td>
                  <span className="name">
                    {c.info.portrait && <img src={c.info.portrait} alt="" loading="lazy" />}
                    {c.info.name ?? c.info.id}
                  </span>
                </td>
                <td className="num">{isUnlocked(c) ? (c.instance?.power ?? 0).toLocaleString() : 'Locked'}</td>
                <td className="num">{c.instance?.activeYellow ?? 0}</td>
                <td className="num">{redLabel(c.instance?.activeRed)}</td>
                <td className="num">{c.instance?.gearTier ?? '–'}</td>
                <td className="num">{c.instance?.level ?? '–'}</td>
                <td className="traits">{(c.info.traits ?? []).map((t) => idOf(t)).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
