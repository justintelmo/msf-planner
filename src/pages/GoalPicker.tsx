import { useId, useMemo, useState } from 'react';
import type { Catalog } from '../data/unlocks';
import { isUnlocked, type OwnedCharacter } from '../planner/requirements';

const LIMIT = 8;

interface Option {
  id: string;
  name: string;
  locked: boolean;
  /** Content in the catalog that rewards them, e.g. "Dark Dimension 8". */
  from?: string;
}

/**
 * Search box for adding goals. Suggestions open on focus, locked characters first (those some content
 * rewards ahead of the rest), then owned ones.
 */
export default function GoalPicker({ roster, goals, catalog, nameOf, onPick }: {
  roster: OwnedCharacter[];
  goals: string[];
  catalog: Catalog | null;
  nameOf: (id: string) => string;
  onPick: (id: string) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const options = useMemo(() => {
    const from = new Map<string, string>();
    for (const s of catalog?.sources ?? []) {
      for (const id of s.rewards) if (!from.has(id)) from.set(id, s.subName && s.kind !== 'Dark Dimension' ? s.subName : s.name);
    }
    const rank = (o: Option) => (o.locked ? 0 : 2) + (o.from ? 0 : 1);
    return roster
      .filter((c) => !goals.includes(c.info.id))
      .map((c): Option => ({ id: c.info.id, name: nameOf(c.info.id), locked: !isUnlocked(c), from: from.get(c.info.id) }))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [roster, goals, catalog, nameOf]);

  const q = query.trim().toLowerCase();
  const shown = (q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options).slice(0, LIMIT);
  const expanded = open && shown.length > 0;

  const pick = (o: Option) => {
    onPick(o.id);
    setQuery('');
    setActive(0);
    setOpen(false);
  };

  return (
    <div className="picker">
      <input
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? `${listId}-${active}` : undefined}
        placeholder="Add a character, e.g. Odin"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, shown.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && expanded) {
            e.preventDefault();
            pick(shown[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {expanded && (
        <ul id={listId} role="listbox" className="picker-list">
          {!q && <li className="picker-hint muted small" aria-hidden="true">Locked characters first</li>}
          {shown.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              // Mouse down, not click, so the pick lands before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{o.name}</span>
              <span className="muted small">
                {o.locked ? 'locked' : 'owned'}{o.from ? ` · ${o.from}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
