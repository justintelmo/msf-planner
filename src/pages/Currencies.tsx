import { useEffect, useId, useState } from 'react';
import { idOf, type ItemQuantity, type UpgradeTables } from '../api/types';
import { GOLD_ID, parseAmount, POWER_CORES_ID, setAmount, setGoldPerDay, useWallet } from '../data/wallet';
import { compact } from '../planner/items';

/** A number field that accepts the game's shorthand (5.2M, 36.8K) and saves as you type. */
function AmountInput({ label, value, onChange, placeholder }: {
  label: string; value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    if (parseAmount(text) !== value) setText(value === undefined ? '' : String(value));
    // Only follow outside changes; typing is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const parsed = parseAmount(text);
  const invalid = text.trim() !== '' && parsed === undefined;
  return (
    <div className="amount">
      <label htmlFor={id}>{label}</label>
      <input
        id={id} inputMode="decimal" placeholder={placeholder ?? 'e.g. 5.2M'} value={text} aria-invalid={invalid}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseAmount(e.target.value);
          if (e.target.value.trim() === '' || v !== undefined) onChange(v);
        }}
      />
      {parsed !== undefined && parsed >= 1000 && <span className="muted small">{compact(parsed)}</span>}
      {invalid && <span className="warn small">Use a number like 5200000 or 5.2M</span>}
    </div>
  );
}

/** Ion ids the ISO-8 cost tables use, lowest tier first. */
function ionIds(upgrades: UpgradeTables): string[] {
  const ids = new Set<string>();
  Object.values(upgrades.iso8AbilityUpgradeCosts ?? {}).forEach((levels) =>
    Object.values(levels).forEach((cost) => cost.forEach((c) => c.item.startsWith('ISO8-') && ids.add(c.item))),
  );
  return [...ids].sort();
}

/**
 * Currencies the API doesn't report. Gold and ions feed the plan; power cores are kept
 * for reference. Ions the inventory does report are shown read-only.
 */
export default function Currencies({ inventory, upgrades, label }: {
  inventory: ItemQuantity[]; upgrades: UpgradeTables; label: (id: string) => string;
}) {
  const wallet = useWallet();
  const fromGame = new Map(inventory.map((i) => [idOf(i.item) ?? '', i.quantity ?? 0]));
  const ions = ionIds(upgrades);
  const reported = ions.filter((id) => fromGame.has(id));
  const typed = ions.filter((id) => !fromGame.has(id) && wallet.amounts[id] !== undefined);
  const gold = wallet.amounts[GOLD_ID];
  const cores = wallet.amounts[POWER_CORES_ID];

  return (
    <details className="card currencies" open={gold === undefined}>
      <summary>
        <strong>Currencies</strong>{' '}
        <span className="muted small">
          {gold === undefined ? 'enter your gold' : `${compact(gold)} gold`}
          {wallet.goldPerDay ? ` (+${compact(wallet.goldPerDay)}/day)` : ''}
          {cores !== undefined ? ` · ${compact(cores)} power cores` : ''}
          {' · '}ions: {reported.length ? `${reported.length} from the game` : `${typed.length} of ${ions.length} typed in`}
        </span>
      </summary>
      <p className="muted small">
        The API doesn’t report these, so type them from the top of the game screen. Shorthand like 5.2M or 36.8K works.
        {wallet.updatedAt && ` Last updated ${new Date(wallet.updatedAt).toLocaleString()}.`}
      </p>
      <div className="amounts">
        <AmountInput label="Gold on hand" value={gold} onChange={(v) => setAmount(GOLD_ID, v)} />
        <AmountInput label="Gold per day" value={wallet.goldPerDay} onChange={setGoldPerDay} placeholder="e.g. 1.5M" />
        <AmountInput label="Power cores (for reference)" value={cores} onChange={(v) => setAmount(POWER_CORES_ID, v)} placeholder="e.g. 36.8K" />
      </div>
      <h4>Ions</h4>
      {reported.length === ions.length ? (
        <p className="muted small">Your inventory reports every ion type, so ISO-8 steps use the game’s numbers.</p>
      ) : (
        <p className="muted small">
          Ions your inventory doesn’t report. Fill these in and ISO-8 steps are checked against them instead of saying
          “check in game”.
        </p>
      )}
      <div className="amounts ions">
        {ions.map((id) =>
          fromGame.has(id) ? (
            <div key={id} className="amount">
              <span>{label(id)}</span>
              <span className="muted small">{compact(fromGame.get(id)!)} from the game</span>
            </div>
          ) : (
            <AmountInput key={id} label={label(id)} value={wallet.amounts[id]} onChange={(v) => setAmount(id, v)} placeholder="0" />
          ),
        )}
      </div>
    </details>
  );
}

/** The inventory with typed-in amounts added for items the API left out. */
export function withTypedAmounts(inventory: ItemQuantity[], amounts: Record<string, number>): ItemQuantity[] {
  const have = new Set(inventory.map((i) => idOf(i.item)));
  const extra = Object.entries(amounts)
    .filter(([id]) => id.startsWith('ISO8-') && !have.has(id))
    .map(([item, quantity]) => ({ item, quantity }));
  return extra.length ? [...inventory, ...extra] : inventory;
}
