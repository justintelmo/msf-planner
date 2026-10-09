import { useMemo, useState } from 'react';
import { msfApi } from '../api/client';
import type { EventInfo, Requirements } from '../api/types';
import type { Snapshot } from '../data/store';
import { saveJson } from '../util/download';
import { plainName } from '../planner/export';
import { checkRequirements, ownedCharacters } from '../planner/requirements';

function timeLeft(e: EventInfo): string {
  const now = Date.now() / 1000;
  if (e.startTime > now) return `starts in ${formatSpan(e.startTime - now)}`;
  if (e.endTime < now) return 'ended';
  return `${formatSpan(e.endTime - now)} left`;
}

function formatSpan(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

function requirementsOf(e: EventInfo): Requirements | undefined {
  return e.blitz?.requirements ?? e.tower?.requirements;
}

/** Downloads the full API payload for one event so unmodelled fields (nodes, enemies) can be inspected. */
function RawDataButton({ event, live }: { event: EventInfo; live: boolean }) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const download = async () => {
    setState('loading');
    try {
      const data = live ? await msfApi.eventRaw(event.id) : { data: event, note: 'demo data' };
      saveJson(`msf-event-${event.id}.json`, data);
      setState('idle');
    } catch {
      setState('error');
    }
  };
  return (
    <button className="ghost small" onClick={() => void download()} disabled={state === 'loading'}>
      {state === 'loading' ? 'Fetching…' : state === 'error' ? 'Failed, retry' : 'Download raw data'}
    </button>
  );
}

export default function Events({ snapshot }: { snapshot: Snapshot }) {
  const roster = useMemo(() => ownedCharacters(snapshot), [snapshot]);
  const events = [...snapshot.events]
    .filter((e) => e.endTime * 1000 > Date.now())
    .sort((a, b) => a.endTime - b.endTime);

  if (events.length === 0) return <p className="muted">No live or scheduled events.</p>;

  return (
    <section className="events">
      {events.map((e) => {
        const req = requirementsOf(e);
        const check = req ? checkRequirements(roster, req) : null;
        const progress = e.milestone?.brackets?.[0]?.objective?.progress;
        return (
          <article key={e.id} className="card">
            <header>
              <span className="pill">{e.type}</span>
              <h3>{e.name ?? e.id}</h3>
              <span className="muted small">{timeLeft(e)}</span>
            </header>
            <p className="muted small">id: {e.id}</p>
            {e.subName && <p className="muted">{e.subName}</p>}
            {req?.description && <p>Requirement: {plainName(req.description)}</p>}
            {check && (
              <p className={check.met ? 'ok' : 'warn'}>
                {check.met ? '✓' : '✗'} {check.eligible.length} eligible of {check.needed} needed
                {check.eligible.length > 0 &&
                  `: ${check.eligible.slice(0, 5).map((c) => c.info.name ?? c.info.id).join(', ')}`}
              </p>
            )}
            {progress && (
              <p className="muted">
                Milestone tier {progress.completedTier ?? 0} of {progress.goalTier ?? '?'}
                {progress.points !== undefined && ` · ${progress.points.toLocaleString()} points`}
              </p>
            )}
            <p>
              <RawDataButton event={e} live={snapshot.source === 'live'} />
            </p>
          </article>
        );
      })}
    </section>
  );
}
