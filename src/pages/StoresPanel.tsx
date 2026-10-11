import { useState } from 'react';
import { newId, saveStores, useStores, type ShardOffer, type Stores } from '../data/stores';
import { compact } from '../planner/items';
import type { OwnedCharacter } from '../planner/requirements';
import { parseAmount } from '../data/wallet';

/** A number field that saves when you leave it, accepting shorthand like 12K. */
function Num({ label, value, onSave, placeholder }: { label: string; value?: number; onSave: (v: number | undefined) => void; placeholder?: string }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  return (
    <label className="amount">
      <span>{label}</span>
      <input
        inputMode="decimal" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)}
        onBlur={() => onSave(parseAmount(text))} onKeyDown={(e) => e.key === 'Enter' && onSave(parseAmount(text))}
      />
    </label>
  );
}

/**
 * Store currencies and the character shards they buy. The API has no store data, so these are
 * typed in; the plan then buys shards with currency on hand and estimates days from income.
 */
export default function StoresPanel({ owned, nameOf }: { owned: OwnedCharacter[]; nameOf: (id: string) => string }) {
  const stores = useStores();
  const update = (patch: Partial<Stores>) => saveStores({ ...stores, ...patch });
  const setCurrency = (id: string, patch: Partial<Stores['currencies'][number]>) =>
    update({ currencies: stores.currencies.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const setOffer = (id: string, patch: Partial<ShardOffer>) => update({ offers: stores.offers.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const characters = [...owned].sort((a, b) => nameOf(a.info.id).localeCompare(nameOf(b.info.id)));
  const currencyName = (id: string) => stores.currencies.find((c) => c.id === id)?.name ?? 'currency';

  return (
    <details className="card stores">
      <summary>
        <strong>Stores</strong>{' '}
        <span className="muted small">
          {stores.offers.length
            ? `${stores.offers.length} shard offer${stores.offers.length > 1 ? 's' : ''} · ${stores.currencies.map((c) => `${compact(c.have)} ${c.name}`).join(' · ')}`
            : 'add the store shards you buy, e.g. the Chapter Store'}
        </span>
      </summary>
      <p className="muted small">
        The API has no store data. Add each store currency you earn and the character shards it buys; star steps then buy shards
        with the currency you hold, and steps still short show how many days of income they need.
      </p>

      <h4>Currencies</h4>
      {stores.currencies.map((c) => (
        <div key={c.id} className="amounts store-row">
          <label className="amount">
            <span>Name</span>
            <input defaultValue={c.name} onBlur={(e) => setCurrency(c.id, { name: e.target.value || 'Store currency' })} />
          </label>
          <Num label="On hand" value={c.have} onSave={(v) => setCurrency(c.id, { have: v ?? 0 })} />
          <Num label="Earned per day" value={c.perDay} onSave={(v) => setCurrency(c.id, { perDay: v })} placeholder="optional" />
          <button className="ghost small" aria-label={`Remove ${c.name}`}
            onClick={() => update({ currencies: stores.currencies.filter((x) => x.id !== c.id), offers: stores.offers.filter((o) => o.currencyId !== c.id) })}>
            Remove
          </button>
        </div>
      ))}
      <button className="ghost small" onClick={() => update({ currencies: [...stores.currencies, { id: newId(), name: 'Chapter Store currency', have: 0 }] })}>
        Add a currency
      </button>

      {stores.currencies.length > 0 && (
        <>
          <h4>Shard offers</h4>
          {stores.offers.map((o) => (
            <div key={o.id} className="amounts store-row">
              <label className="amount">
                <span>Character</span>
                <select value={o.characterId} onChange={(e) => setOffer(o.id, { characterId: e.target.value })}>
                  {characters.map((c) => <option key={c.info.id} value={c.info.id}>{nameOf(c.info.id)}</option>)}
                </select>
              </label>
              <label className="amount">
                <span>Paid with</span>
                <select value={o.currencyId} onChange={(e) => setOffer(o.id, { currencyId: e.target.value })}>
                  {stores.currencies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <Num label="Shards per purchase" value={o.shards} onSave={(v) => setOffer(o.id, { shards: v ?? 0 })} />
              <Num label={`Price (${currencyName(o.currencyId)})`} value={o.price} onSave={(v) => setOffer(o.id, { price: v ?? 0 })} />
              <Num label="Purchases per day" value={o.perDay} onSave={(v) => setOffer(o.id, { perDay: v })} placeholder="no limit" />
              <button className="ghost small" aria-label={`Remove offer for ${nameOf(o.characterId)}`}
                onClick={() => update({ offers: stores.offers.filter((x) => x.id !== o.id) })}>
                Remove
              </button>
            </div>
          ))}
          <button className="ghost small" disabled={!characters.length}
            onClick={() => update({ offers: [...stores.offers, { id: newId(), characterId: characters[0].info.id, currencyId: stores.currencies[0].id, price: 0, shards: 0 }] })}>
            Add a shard offer
          </button>
        </>
      )}
    </details>
  );
}
