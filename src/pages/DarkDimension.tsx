import { useEffect, useMemo, useState } from 'react';
import { msfApi } from '../api/client';
import type { CombatUnit, CombatWave, DarkDimension as DD, NodeInfo, Requirements } from '../api/types';
import type { Snapshot } from '../data/store';
import { plainName } from '../planner/export';
import { checkRequirements, ownedCharacters } from '../planner/requirements';
import { saveJson } from '../util/download';

/** Rooms in map order: ray by ray, shallow to deep. */
function roomOrder(dd: DD): string[] {
  const ids = (dd.rays ?? []).flat().filter(Boolean);
  const rest = Object.keys(dd.rooms ?? {}).filter((id) => !ids.includes(id));
  return [...new Set([...ids, ...rest])];
}

function requirementsOf(node: NodeInfo | undefined): Requirements | undefined {
  const r = node?.requirements;
  return Array.isArray(r) ? (r[0] ?? undefined) : r;
}

const HOLD: Record<string, string> = {
  OwnDeadThisWave: 'after N of this wave die',
  AllOwnDeadThisWave: 'after this whole wave dies',
  AllOwnDeadThisCombat: 'after every enemy is dead',
  AnyVipKilled: 'after any VIP is killed',
  AllOwnVipKilled: 'after every VIP is killed',
  OwnActionsThisWave: 'after N enemy actions this wave',
  OwnActionsThisCombat: 'after N enemy actions',
  EnemyActionsThisCombat: 'after N of your actions',
};

function waveTrigger(w: CombatWave, i: number): string {
  if (i === 0) return 'Starts on the field';
  const parts = [w.onFewerThan ? `Arrives when fewer than ${w.onFewerThan} enemies remain` : 'Arrives next'];
  if (w.holdNextWaveUntil) parts.push(`holds the next wave ${(HOLD[w.holdNextWaveUntil] ?? w.holdNextWaveUntil).replace('N', String(w.holdNum ?? 'N'))}`);
  if (w.turnMeter) parts.push(`spawns with ${Math.round(w.turnMeter / 10)}% turn meter`);
  return parts.join('; ');
}

function Unit({ u }: { u: CombatUnit }) {
  const name = plainName(u.info?.name ?? u.id);
  const flags = [u.nodeEffects?.boss && 'Boss', u.nodeEffects?.vip && 'VIP', u.nodeEffects?.target && 'Target'].filter(Boolean);
  return (
    <li className="unit">
      {u.info?.portrait ? <img src={u.info.portrait} alt="" /> : <span className="ph" />}
      <div>
        <strong>{name}</strong>
        {flags.length > 0 && <span className="pill short"> {flags.join(' · ')}</span>}
        <div className="muted small">
          L{u.level ?? '?'} · G{u.gearTier ?? '?'}{u.nodeEffects?.gearPercent ? `+${u.nodeEffects.gearPercent}%` : ''} ·{' '}
          {u.activeYellow ?? '?'}★{u.activeRed ? `/${u.activeRed}R` : ''}
          {u.power ? ` · ${u.power.toLocaleString()} power` : ''}
        </div>
      </div>
    </li>
  );
}

function Waves({ title, waves }: { title: string; waves?: CombatWave[] }) {
  if (!waves?.some((w) => w.units?.length)) return null;
  return (
    <div>
      <h3>{title}</h3>
      {waves.map((w, i) => (
        <div key={i} className="wave">
          <p className="small"><strong>Wave {i + 1}.</strong> <span className="muted">{waveTrigger(w, i)}</span></p>
          <ul className="units">
            {(w.units ?? []).map((u, j) => <Unit key={j} u={Array.isArray(u) ? u[0] : u} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function DarkDimension({ snapshot }: { snapshot: Snapshot }) {
  const live = snapshot.source === 'live';
  const roster = useMemo(() => ownedCharacters(snapshot), [snapshot]);
  const [list, setList] = useState<DD[] | null>(null);
  const [ddId, setDdId] = useState<string>('');
  const [dd, setDd] = useState<DD | null>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [room, setRoom] = useState<NodeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!live) return;
    msfApi.darkDimensions()
      .then((l) => {
        setList(l);
        setDdId((cur) => cur || l[l.length - 1]?.id || '');
      })
      .catch((e) => setError(String(e)));
  }, [live]);

  useEffect(() => {
    if (!ddId) return;
    setDd(null);
    setRoom(null);
    setRoomId('');
    msfApi.darkDimension(ddId).then(setDd).catch((e) => setError(String(e)));
  }, [ddId]);

  useEffect(() => {
    if (!ddId || !roomId) return;
    setRoom(null);
    msfApi.darkDimensionRoom(ddId, roomId).then(setRoom).catch((e) => setError(String(e)));
  }, [ddId, roomId]);

  const downloadAll = async () => {
    if (!dd) return;
    const rooms: Record<string, NodeInfo | { error: string }> = {};
    const ids = roomOrder(dd);
    for (let i = 0; i < ids.length; i++) {
      setBusy(`Fetching room ${i + 1} of ${ids.length}…`);
      rooms[ids[i]] = await msfApi.darkDimensionRoom(dd.id, ids[i]).catch((e) => ({ error: String(e) }));
    }
    setBusy(null);
    saveJson(`msf-dd-${dd.id}.json`, { ...dd, rooms });
  };

  if (!live) return <p className="muted">Log in with your Scopely account to see Dark Dimension rooms.</p>;
  if (error) return <p className="error">{error}</p>;
  if (!list) return <p className="muted">Loading Dark Dimensions…</p>;

  const req = requirementsOf(room ?? dd?.rooms?.[roomId]);
  const check = req ? checkRequirements(roster, req) : null;

  return (
    <section className="dd">
      <div className="toolbar">
        <select value={ddId} onChange={(e) => setDdId(e.target.value)}>
          {list.map((d) => (
            <option key={d.id} value={d.id}>{plainName(d.name ?? d.id)}{d.subName ? ` · ${plainName(d.subName)}` : ''}</option>
          ))}
        </select>
        {dd && (
          <button className="ghost" onClick={() => void downloadAll()} disabled={!!busy}>
            {busy ?? 'Download all rooms (JSON)'}
          </button>
        )}
      </div>
      {!dd ? (
        <p className="muted">Loading map…</p>
      ) : (
        <div className="dd-layout">
          <ol className="rooms">
            {roomOrder(dd).map((id) => {
              const node = dd.rooms?.[id];
              return (
                <li key={id}>
                  <button className={id === roomId ? 'room active' : 'room'} onClick={() => setRoomId(id)}>
                    <span className="muted small">{id}</span> {plainName(node?.name ?? 'Room')}
                    {node?.isBoss && <span className="pill short"> Boss</span>}
                    {requirementsOf(node)?.description && (
                      <span className="muted small"> · {plainName(requirementsOf(node)!.description!)}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="room-detail">
            {!roomId ? (
              <p className="muted">Pick a room to see its requirements and enemy waves.</p>
            ) : !room ? (
              <p className="muted">Loading room…</p>
            ) : (
              <>
                <h2>{plainName(room.name ?? roomId)}{room.subName ? ` · ${plainName(room.subName)}` : ''}</h2>
                {room.details && <p className="muted small">{plainName(room.details)}</p>}
                {check && (
                  <div className="card">
                    <p className="small"><strong>Requirement:</strong> {plainName(req?.description ?? 'see in game')}</p>
                    <p className={`small ${check.met ? 'ok' : 'warn'}`}>
                      {check.eligible.length} of your characters qualify{check.met ? '' : `, ${check.needed} needed`}.
                    </p>
                    {check.eligible.length > 0 && (
                      <p className="muted small">
                        Strongest: {check.eligible.slice(0, 10).map((c) => plainName(c.info.name ?? c.info.id)).join(', ')}
                      </p>
                    )}
                  </div>
                )}
                <Waves title="Enemies" waves={room.combat?.right?.waves} />
                <Waves title="Your side (preset units)" waves={room.combat?.left?.waves} />
                {!room.combat && <p className="muted small">This room has no combat details.</p>}
                <button className="ghost small" onClick={() => saveJson(`msf-dd-${ddId}-${roomId}.json`, room)}>Download room JSON</button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
