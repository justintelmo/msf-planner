import { useEffect, useMemo, useState } from 'react';
import { readJson, writeJson } from '../auth/storage';
import type { Snapshot } from '../data/store';
import { readHistory } from '../data/syncHistory';
import type { Target } from '../planner/gaps';
import type { Ranked } from '../planner/priority';
import type { OwnedCharacter } from '../planner/requirements';
import { reviewSync, type Verdict } from '../planner/review';

const SEEN_KEY = 'msf.review.seen';
const SHOWN = 8;
const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  good: { label: 'Good', cls: 'ready' },
  ok: { label: 'Fine', cls: '' },
  questionable: { label: 'Rethink', cls: 'short' },
};
const MOOD_CLASS = { great: 'ok', good: 'ok', mixed: 'warn', 'off-plan': 'warn', none: 'muted' } as const;

/**
 * What changed since the previous sync and whether the resources went to the right places.
 * Opens by itself once after each sync that brought something new.
 */
export default function SyncReview({ snapshot, owned, ranked, targets, targetsFor, nameOf }: {
  snapshot: Snapshot;
  owned: OwnedCharacter[];
  ranked: Ranked[];
  targets: Record<string, { target: Target; why: string }>;
  /** Goal targets for another version of the roster (the previous sync's). */
  targetsFor: (owned: OwnedCharacter[]) => Record<string, { target: Target; why: string }>;
  nameOf: (id: string) => string;
}) {
  const before = useMemo(() => {
    const history = readHistory().filter((h) => h.source === snapshot.source);
    // The latest entry is this snapshot; compare with the one before it.
    return history.length >= 2 ? history[history.length - 2] : undefined;
  }, [snapshot]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!before || readJson<number>(localStorage, SEEN_KEY) === snapshot.syncedAt) return;
    setOpen(true);
    writeJson(localStorage, SEEN_KEY, snapshot.syncedAt);
  }, [before, snapshot.syncedAt]);
  const [showAll, setShowAll] = useState(false);

  const review = useMemo(() => {
    if (!before) return undefined;
    const byId = new Map(owned.map((c) => [c.info.id, c]));
    const prevOwned = before.roster.flatMap((i) => (byId.has(i.id) ? [{ info: byId.get(i.id)!.info, instance: i }] : []));
    const inventory: Record<string, number> = {};
    snapshot.inventory.forEach(({ item, quantity }) => {
      const id = typeof item === 'string' ? item : item?.id;
      if (id) inventory[id] = (inventory[id] ?? 0) + (quantity ?? 0);
    });
    return reviewSync({
      before, owned, inventory, events: snapshot.events, ranked, targets, prevTargets: targetsFor(prevOwned), nameOf,
      trainingIds: new Set((snapshot.upgrades?.characterXpCosts ?? []).flatMap((w) => w.cost.map((c) => c.item))),
    });
    // targetsFor and nameOf change identity each render; the data they read is covered by the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [before, owned, snapshot, ranked, targets]);

  if (!before) {
    return (
      <p className="muted small card">
        <strong>Since your last sync:</strong> after your next Sync, this shows what you upgraded and whether it fit the plan.
      </p>
    );
  }
  if (!review) return null;
  const list = showAll ? review.characters : review.characters.slice(0, SHOWN);
  const counts = (v: Verdict) => review.characters.filter((c) => c.verdict === v).length;

  return (
    <details className="card review" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        <strong>Since your last sync</strong>{' '}
        <span className={`small ${MOOD_CLASS[review.mood]}`}>{review.headline}</span>
      </summary>
      <p className="muted small">
        Compared with your sync on {new Date(review.since).toLocaleString()}.
        {review.characters.length > 0 &&
          ` ${review.characters.length} characters upgraded: ${counts('good')} good, ${counts('ok')} fine, ${counts('questionable')} to rethink.`}
      </p>
      {list.length > 0 && (
        <ul className="review-list">
          {list.map((c) => (
            <li key={c.characterId}>
              <span className={`pill ${VERDICT[c.verdict].cls}`}>{VERDICT[c.verdict].label}</span>{' '}
              <strong>{nameOf(c.characterId)}</strong>: {c.changes.join(', ')}
              <div className="muted small">{c.why.join('. ')}.</div>
            </li>
          ))}
        </ul>
      )}
      {review.characters.length > SHOWN && (
        <button className="ghost small" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show all ${review.characters.length}`}
        </button>
      )}
      {review.missed.length > 0 && (
        <p className="small warn">Still short for your goals and not upgraded: {review.missed.join(', ')}.</p>
      )}
      {review.eventsEnded.length > 0 && <p className="small">Ended since then: {review.eventsEnded.join(', ')}.</p>}
      {review.eventsStarted.length > 0 && <p className="small">Started since then: {review.eventsStarted.join(', ')}.</p>}
      {review.materials.length > 0 && <p className="muted small">Materials: {review.materials.join(' · ')}.</p>}
    </details>
  );
}
