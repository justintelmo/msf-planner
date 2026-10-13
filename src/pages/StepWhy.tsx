import { forwardRef } from 'react';
import { explainStep } from '../planner/explain';
import type { Reason } from '../planner/priority';
import type { ScheduledStep } from '../planner/schedule';
import { CharPortrait, CostChips, useDetails } from './Details';

export interface WhyTarget {
  step: ScheduledStep;
  rank: number;
  next?: ScheduledStep;
}

/** A sheet explaining why one upgrade sits where it does in the priority list. */
const StepWhy = forwardRef<HTMLDialogElement, { target: WhyTarget | null; reasons?: Reason[]; onClose: () => void }>(
  function StepWhy({ target, reasons, onClose }, ref) {
    const d = useDetails();
    const close = () => (ref && typeof ref === 'object' ? ref.current?.close() : undefined);
    const nameOf = d?.nameOf ?? ((id: string) => id);
    const c = target && explainStep(target.step, target.rank, reasons, nameOf, d?.itemName ?? ((id) => id), target.next);
    const s = target?.step;
    return (
      <dialog
        ref={ref} className="sheet why-sheet" aria-labelledby="why-title" onClose={onClose}
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <div className="sheet-head">
          <h2 id="why-title">Why this upgrade</h2>
          <button className="ghost" onClick={close}>Done</button>
        </div>
        {s && c && (
          <div className="why-body">
            <header className="why-step">
              <CharPortrait id={s.characterId} />
              <div>
                <strong>{nameOf(s.characterId)}: {s.title}</strong>
                <div className="muted small">#{target.rank} in your list{s.day !== undefined ? ` · ${s.day === 0 ? 'today' : `day ${s.day}`}` : ''}</div>
              </div>
            </header>
            <p className="why-summary">{c.summary}</p>
            <div className="why-grid">
              <section>
                <h3 className="small">The step</h3>
                <p className="small">{c.worth}</p>
              </section>
              <section>
                <h3 className="small">The character</h3>
                {c.character.length ? (
                  <ul className="why-reasons small">
                    {c.character.map((r) => <li key={r.label}><span>{r.label}</span><span className="muted">+{r.weight}</span></li>)}
                  </ul>
                ) : <p className="small muted">Here for an unlock goal only.</p>}
              </section>
              <section>
                <h3 className="small">The cost</h3>
                <p className="small">{c.cost}</p>
                {(() => {
                  // What it takes from your inventory; pieces it crafts show as their materials.
                  const mats = (s.uses ?? s.cost).filter((x) => x.item !== 'SC' && !s.crafted?.includes(x.item));
                  return mats.length ? <CostChips cost={mats} /> : null;
                })()}
                {s.detail && <p className="muted small">{s.detail}</p>}
              </section>
              {c.versus && (
                <section>
                  <h3 className="small">Compared with the next step</h3>
                  <p className="small">{c.versus}</p>
                </section>
              )}
            </div>
            <p className="muted small">
              Each pick is the best value for its cost among the steps you can afford at that point, so the list shifts as materials get used.
            </p>
          </div>
        )}
      </dialog>
    );
  },
);

export default StepWhy;
