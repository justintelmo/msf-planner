import { useMemo, useState } from 'react';
import type { CharacterInfo } from '../api/types';
import { readJson, writeJson } from '../auth/storage';
import type { Catalog } from '../data/unlocks';
import { useStores } from '../data/stores';
import { parseAmount, POWER_CORES_ID, useWallet } from '../data/wallet';
import { DEFAULT_CORE_COSTS, farmOptions, refreshCost, type CoreCosts } from '../planner/farming';
import { compact } from '../planner/items';
import { isUnlocked, type OwnedCharacter } from '../planner/requirements';
import { shardOf } from '../planner/stores';
import { CharName } from './Details';

const KEY = 'msf.cores.v1';
const round = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

function Field({ label, value, onSave, placeholder }: { label: string; value?: number; onSave: (v?: number) => void; placeholder?: string }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  return (
    <label className="amount">
      <span>{label}</span>
      <input inputMode="decimal" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={() => onSave(parseAmount(text))} />
    </label>
  );
}

/**
 * Where to farm the shards the plan is waiting on: campaign nodes by energy per shard, store
 * offers, and what each costs in cores when energy or the store is refreshed with cores.
 */
export default function FarmPanel({ blocked, owned, characters, catalog }: {
  blocked: { missing: { item: string; quantity: number }[] }[];
  owned: OwnedCharacter[];
  characters: CharacterInfo[];
  catalog: Catalog | null;
}) {
  const stores = useStores();
  const wallet = useWallet();
  const [costs, setCosts] = useState<CoreCosts>(() => ({ ...DEFAULT_CORE_COSTS, ...readJson<Partial<CoreCosts>>(localStorage, KEY) }));
  const save = (patch: Partial<CoreCosts>) => {
    const next = { ...costs, ...patch };
    setCosts(next);
    writeJson(localStorage, KEY, next);
  };

  const byShard = useMemo(() => new Map(characters.map((c) => [shardOf(c), c.id])), [characters]);
  const wanted = useMemo(() => {
    const need = new Map<string, number>();
    for (const b of blocked) for (const m of b.missing) {
      const id = byShard.get(m.item);
      if (id) need.set(id, (need.get(id) ?? 0) + m.quantity);
    }
    return [...need].map(([characterId, n]) => ({ characterId, need: n }));
  }, [blocked, byShard]);
  const options = useMemo(() => farmOptions(wanted, catalog?.sources ?? [], stores.offers, costs), [wanted, catalog, stores.offers, costs]);
  // Every character any campaign node drops, for a full picture beyond what the plan needs now.
  const everyone = useMemo(() => {
    const ids = new Set((catalog?.sources ?? []).flatMap((x) => x.nodes.flatMap((n) => (n.drops ?? []).map((d) => d.characterId))));
    return farmOptions([...ids].map((characterId) => ({ characterId, need: 0 })), catalog?.sources ?? [], stores.offers, costs)
      .filter((o) => o.nodes.length)
      .sort((a, b) => (a.nodes[0].energyPerShard ?? Infinity) - (b.nodes[0].energyPerShard ?? Infinity));
  }, [catalog, stores.offers, costs]);
  const unlocked = new Set(owned.filter(isUnlocked).map((c) => c.info.id));
  const cores = wallet.amounts[POWER_CORES_ID];
  const hasEnergy = catalog?.sources.some((s) => s.nodes.some((n) => n.energy));

  if (!wanted.length && !everyone.length) return null;
  return (
    <section className="farm">
      <h3>Where to farm those shards</h3>
      <p className="muted small">
        Campaign nodes that drop each character’s shards, cheapest energy per shard first, next to their store offers.
        The game data gives node energy and what drops, but not the odds of a “chance” drop, campaign energy, or what
        refreshes cost in cores, so those come from what you enter below.
        {!hasEnergy && ' Refresh unlock content on the Goals tab to read node energy costs.'}
      </p>

      <details className="card cores">
        <summary>
          <strong>Core refresh costs</strong>{' '}
          <span className="muted small">{cores !== undefined ? `${compact(cores)} cores on hand · ` : ''}energy refresh {costs.energyRefresh}, store refresh {costs.storeRefresh}</span>
        </summary>
        <div className="amounts">
          <Field label="Cores per energy refresh" value={costs.energyRefresh} onSave={(v) => save({ energyRefresh: v ?? DEFAULT_CORE_COSTS.energyRefresh })} />
          <Field label="Energy per refresh" value={costs.energyPerRefresh} onSave={(v) => save({ energyPerRefresh: v })} placeholder="from the game" />
          <Field label="Refreshes before it doubles" value={costs.energyFlatRefreshes} onSave={(v) => save({ energyFlatRefreshes: v || 1 })} />
          <Field label="Cores per store refresh" value={costs.storeRefresh} onSave={(v) => save({ storeRefresh: v ?? DEFAULT_CORE_COSTS.storeRefresh })} />
          <Field label="“Chance” drops land (%)" value={costs.chanceRate === undefined ? undefined : Math.round(costs.chanceRate * 100)}
            onSave={(v) => save({ chanceRate: v === undefined ? undefined : Math.min(100, v) / 100 })} placeholder="your estimate" />
        </div>
        <p className="muted small">
          Today’s refreshes cost{' '}
          {[1, 2, 3, 4].map((n) => refreshCost(costs.energyRefresh, n, costs.energyFlatRefreshes)).join(', ')}… cores for energy and{' '}
          {[1, 2, 3, 4].map((n) => refreshCost(costs.storeRefresh, n)).join(', ')}… for a store. Only the first ones are
          compared below; later ones cost more per shard.
        </p>
      </details>

      <ul className="farm-list">
        {options.map((o) => {
          const best = o.nodes[0];
          return (
            <li key={o.characterId} className="card">
              <p>
                <CharName id={o.characterId} portrait /> <span className="muted small">needs {compact(o.need)} shards{unlocked.has(o.characterId) ? '' : ' · not unlocked'}</span>
              </p>
              {!o.nodes.length && !o.store.length && <p className="small muted">No campaign node or store offer you entered gives these shards.</p>}
              {o.nodes.slice(0, 3).map((n, i) => (
                <p key={i} className="small">
                  <strong>{n.label}</strong> <span className="muted">{n.source}</span>
                  {' · '}{n.energy ? `${n.energy} energy` : 'energy not read'}
                  {' · '}{n.perWin !== undefined ? `${round(n.perWin)} shards a win${n.estimated ? ' (your chance estimate)' : ''}` : `${n.drop.min === n.drop.max ? n.drop.max : `${n.drop.min}-${n.drop.max}`} shards by chance, odds not in game data`}
                  {n.energyPerShard ? ` · ${round(n.energyPerShard)} energy a shard` : ''}
                  {n.coresPerShard ? ` · ≈${round(n.coresPerShard)} cores a shard` : ''}
                  {n.limit ? ` · ${n.limit} limited wins` : ''}
                </p>
              ))}
              {o.store.slice(0, 2).map(({ offer, coresPerShard }) => (
                <p key={offer.id} className="small">
                  <strong>Store</strong> <span className="muted">{stores.currencies.find((c) => c.id === offer.currencyId)?.name}</span>
                  {' · '}{offer.shards} shards for {compact(offer.price)}, {offer.perDay || 4} buys a day · a core refresh is ≈{round(coresPerShard)} cores a shard
                </p>
              ))}
              {best?.coresPerShard && o.store[0] && (
                <p className="small ok">
                  With cores, {best.coresPerShard < o.store[0].coresPerShard ? `campaign energy on ${best.label}` : 'a store refresh'} is cheaper per shard
                  ({round(Math.min(best.coresPerShard, o.store[0].coresPerShard))} vs {round(Math.max(best.coresPerShard, o.store[0].coresPerShard))} cores).
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {everyone.length > 0 && (
        <details className="card">
          <summary><strong>Every character campaigns drop</strong> <span className="muted small">{everyone.length}, cheapest energy per shard first</span></summary>
          <ul className="small">
            {everyone.map((o) => {
              const n = o.nodes[0];
              return (
                <li key={o.characterId}>
                  <CharName id={o.characterId} />{unlocked.has(o.characterId) ? '' : <span className="pill"> not unlocked</span>}: {n.label}{' '}
                  <span className="muted">{n.source}</span>
                  {n.energyPerShard ? ` · ${round(n.energyPerShard)} energy a shard` : n.energy ? ` · ${n.energy} energy, ${n.perWin === undefined ? 'chance drop' : `${round(n.perWin)} a win`}` : ''}
                  {o.nodes.length > 1 ? <span className="muted"> · {o.nodes.length} nodes</span> : null}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
