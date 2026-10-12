import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { idOf } from '../api/types';
import { msfApi } from '../api/client';
import { readJson } from '../auth/storage';
import { useItemInfo, useLoadItemInfo } from '../data/itemInfo';
import { SAMPLE_UPGRADES } from '../data/sample';
import type { Snapshot } from '../data/store';
import { useStores } from '../data/stores';
import { setGoals, useUnlocks, withLiveEvents } from '../data/unlocks';
import { plainName } from '../planner/export';
import { compact, itemLabel } from '../planner/items';
import { isoClassLevel, isUnlocked, ownedCharacters } from '../planner/requirements';
import { shardProgress } from '../planner/shards';
import type { Recipes } from '../planner/schedule';

type Target = { kind: 'character' | 'item'; id: string };

interface DetailApi {
  open: (t: Target) => void;
  nameOf: (id: string) => string;
  portraitOf: (id: string) => string | undefined;
  itemName: (id: string) => string;
  iconOf: (id: string) => string | undefined;
  /** The character a shard item belongs to. */
  shardOwner: (id: string) => string | undefined;
}

const Ctx = createContext<DetailApi | null>(null);

/** Opens character and item popups from anywhere; names and icons come from the latest sync. */
export function useDetails(): DetailApi | null {
  return useContext(Ctx);
}

export function DetailProvider({ snapshot, children }: { snapshot: Snapshot | null; children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const items = useItemInfo();
  const live = snapshot?.source === 'live';
  useLoadItemInfo(target?.kind === 'item' ? [target.id] : [], live);

  const chars = useMemo(() => new Map((snapshot?.characters ?? []).map((c) => [c.id, c])), [snapshot]);
  const shards = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of snapshot?.characters ?? []) {
      m.set(`SHARD_${c.id.toUpperCase()}`, c.id);
      const own = idOf(c.starItems?.[0]);
      if (own) m.set(own, c.id);
    }
    return m;
  }, [snapshot]);
  const api = useMemo<DetailApi>(() => {
    const nameOf = (id: string) => plainName(chars.get(id)?.name ?? id);
    return {
      open: (t) => {
        setTarget(t);
        dialog.current?.showModal();
      },
      nameOf,
      portraitOf: (id) => chars.get(id)?.portrait,
      itemName: (id) => plainName(items[id]?.name) || itemLabel(id, (k) => {
        const c = [...chars.values()].find((x) => x.id.toUpperCase() === k.toUpperCase());
        return c ? plainName(c.name ?? c.id) : undefined;
      }),
      iconOf: (id) => items[id]?.icon,
      shardOwner: (id) => shards.get(id),
    };
  }, [chars, items, shards]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <dialog ref={dialog} className="sheet detail" onClose={() => setTarget(null)} onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        <div className="sheet-head">
          <span />
          <button className="ghost" onClick={() => dialog.current?.close()}>Done</button>
        </div>
        {snapshot && target?.kind === 'character' && <CharacterDetail id={target.id} snapshot={snapshot} api={api} />}
        {snapshot && target?.kind === 'item' && <ItemDetail id={target.id} snapshot={snapshot} api={api} />}
      </dialog>
    </Ctx.Provider>
  );
}

function CharacterDetail({ id, snapshot, api }: { id: string; snapshot: Snapshot; api: DetailApi }) {
  const c = useMemo(() => ownedCharacters(snapshot).find((x) => x.info.id === id), [snapshot, id]);
  const { catalog: saved, goals } = useUnlocks();
  const catalog = useMemo(() => withLiveEvents(saved, snapshot.events, snapshot.characters), [saved, snapshot]);
  const stores = useStores();
  if (!c) return <p className="muted">No character with id {id}.</p>;
  const inst = c.instance;
  const owned = isUnlocked(c);
  const sp = shardProgress(c, snapshot.inventory, (snapshot.upgrades ?? SAMPLE_UPGRADES).yellowStarTotalShards);
  const sources = (catalog?.sources ?? []).filter((s) => s.rewards.includes(id));
  const offers = stores.offers.filter((o) => o.characterId === id);
  const red = inst?.activeRed ?? 0;
  const isGoal = goals.includes(id);

  return (
    <div className="detail-body">
      <header className="detail-head">
        {api.portraitOf(id) ? <img className="portrait-lg" src={api.portraitOf(id)} alt="" /> : <span className="portrait-lg ph" />}
        <div>
          <h2>{api.nameOf(id)}</h2>
          <span className={`pill ${owned ? 'ready' : 'short'}`}>{owned ? 'Unlocked' : 'Locked'}</span>
        </div>
      </header>
      {owned && inst && (
        <dl className="stats">
          <div><dt>Stars</dt><dd>{inst.activeYellow ?? 0}★{red ? ` · ${red > 7 ? `7 red, ${red - 7} diamond${red > 8 ? 's' : ''}` : `${red} red`}` : ''}</dd></div>
          <div><dt>Level</dt><dd>{inst.level ?? 0}</dd></div>
          <div><dt>Gear</dt><dd>G{inst.gearTier ?? 0}{inst.gearSlots ? ` (${inst.gearSlots.filter(Boolean).length}/6)` : ''}</dd></div>
          <div><dt>ISO-8</dt><dd>{isoClassLevel(inst) || '–'}{inst.iso8?.active ? ` ${inst.iso8.active}` : ''}</dd></div>
          <div><dt>Abilities</dt><dd>{[inst.basic, inst.special, inst.ultimate, inst.passive].map((n) => n ?? 0).join(' / ')}</dd></div>
          {inst.power ? <div><dt>Power</dt><dd>{compact(inst.power)}</dd></div> : null}
        </dl>
      )}
      {sp && (
        <p className="small">
          <meter min={0} max={sp.need} value={Math.min(sp.have, sp.need)} aria-label="Shards" />{' '}
          {sp.have.toLocaleString()} / {sp.need.toLocaleString()} shards {sp.unlock ? `to unlock at ${sp.stars}★` : `to ${sp.stars}★`}
        </p>
      )}
      <h3 className="small">Where shards come from</h3>
      {sources.length || offers.length ? (
        <ul className="small">
          {sources.map((s) => <li key={s.id}>{s.subName ? `${s.name}: ${s.subName}` : s.name} <span className="muted">· {s.kind}</span></li>)}
          {offers.map((o) => {
            const cur = stores.currencies.find((x) => x.id === o.currencyId);
            return <li key={o.id}>{cur?.name ?? 'Store'}: {o.shards} for {o.price.toLocaleString()} <span className="muted">· store</span></li>;
          })}
        </ul>
      ) : (
        <p className="muted small">{catalog ? 'Nothing in your saved content or stores. Orbs and new events may still have them.' : 'Load unlock content on Goals to see.'}</p>
      )}
      <div className="toolbar">
        <button className={isGoal ? 'ghost' : 'primary'} onClick={() => setGoals(isGoal ? goals.filter((g) => g !== id) : [...goals, id])}>
          {isGoal ? 'Remove goal' : 'Add as goal'}
        </button>
      </div>
    </div>
  );
}

function ItemDetail({ id, snapshot, api }: { id: string; snapshot: Snapshot; api: DetailApi }) {
  const items = useItemInfo();
  const info = items[id];
  const have = snapshot.inventory.find((i) => idOf(i.item) === id)?.quantity ?? 0;
  const recipe = (readJson<Recipes>(localStorage, 'msf.recipes.v1') ?? {})[id];
  const [users, setUsers] = useState<string[] | null>(null);
  const live = snapshot.source === 'live';
  const isGear = id.startsWith('GEAR_');
  useEffect(() => {
    setUsers(null);
    if (!live || !isGear) return;
    let off = false;
    msfApi.itemCharacters(id).then((u) => !off && setUsers(u)).catch(() => !off && setUsers([]));
    return () => {
      off = true;
    };
  }, [id, live, isGear]);

  return (
    <div className="detail-body">
      <header className="detail-head">
        {info?.icon ? <img className="icon-lg" src={info.icon} alt="" /> : <span className="icon-lg ph" />}
        <div>
          <h2>{api.itemName(id)}</h2>
          <span className="muted small">You have {have.toLocaleString()}</span>
        </div>
      </header>
      {info?.description && <p className="small">{plainName(info.description)}</p>}
      {recipe?.length ? (
        <>
          <h3 className="small">Crafted from</h3>
          <div className="chips">{recipe.map((r) => <ItemChip key={r.item} id={r.item} quantity={r.quantity} />)}</div>
        </>
      ) : null}
      {users && users.length > 0 && (
        <>
          <h3 className="small">Used by {users.length} characters</h3>
          <div className="chips">{users.slice(0, 40).map((u) => <CharName key={u} id={u} portrait />)}</div>
        </>
      )}
    </div>
  );
}

/** A character's name that opens their popup; with `portrait`, a small portrait leads it. */
export function CharName({ id, portrait, label }: { id: string; portrait?: boolean; label?: string }) {
  const d = useDetails();
  if (!d) return <strong>{label ?? id}</strong>;
  const src = portrait ? d.portraitOf(id) : undefined;
  return (
    <button type="button" className="char-name" onClick={(e) => { e.stopPropagation(); e.preventDefault(); d.open({ kind: 'character', id }); }}>
      {portrait && (src ? <img src={src} alt="" loading="lazy" /> : <span className="ph" />)}
      <strong>{label ?? d.nameOf(id)}</strong>
    </button>
  );
}

/** Just the portrait as a button, for rows where tapping the name already does something else. */
export function CharPortrait({ id }: { id: string }) {
  const d = useDetails();
  if (!d) return null;
  const src = d.portraitOf(id);
  return (
    <button type="button" className="char-name" aria-label={`About ${d.nameOf(id)}`}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); d.open({ kind: 'character', id }); }}>
      {src ? <img src={src} alt="" loading="lazy" /> : <span className="ph" />}
    </button>
  );
}

/** An item as icon and amount (name in the popup); falls back to the name when there's no icon yet. */
export function ItemChip({ id, quantity, named, label }: { id: string; quantity?: number; named?: boolean; label?: string }) {
  const d = useDetails();
  if (!d) return <span>{quantity !== undefined ? `${compact(quantity)} ` : ''}{label ?? id}</span>;
  // Shards show their character's portrait and open the character.
  const owner = d.shardOwner(id);
  const icon = d.iconOf(id) ?? (owner ? d.portraitOf(owner) : undefined);
  const name = label ?? d.itemName(id);
  return (
    <button type="button" className={`item-chip${owner ? ' shard' : ''}`} title={name} aria-label={`${quantity !== undefined ? `${compact(quantity)} ` : ''}${name}`}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); d.open(owner ? { kind: 'character', id: owner } : { kind: 'item', id }); }}>
      {icon && <img src={icon} alt="" loading="lazy" />}
      {quantity !== undefined && <span>{compact(quantity)}</span>}
      {(named || !icon) && <span className="item-name">{name}</span>}
    </button>
  );
}

/** A cost as item chips, with gold as plain text at the end. */
export function CostChips({ cost, label }: { cost: { item: string; quantity: number }[]; label?: (id: string) => string }) {
  const gold = cost.filter((c) => c.item === 'SC').reduce((n, c) => n + c.quantity, 0);
  return (
    <span className="cost-chips">
      {cost.filter((c) => c.item !== 'SC').map((c) => <ItemChip key={c.item} id={c.item} quantity={c.quantity} label={label?.(c.item)} />)}
      {gold > 0 && <span className="muted small">{compact(gold)} gold</span>}
    </span>
  );
}
