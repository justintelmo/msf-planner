import { readJson, writeJson } from '../auth/storage';
import { plainName } from '../planner/export';
import { EN } from './en';

const KEY = 'msf.traits.v1';

export interface TraitNames {
  names: Record<string, string>;
  readAt?: number;
}

let state: TraitNames = (typeof localStorage !== 'undefined' && readJson<TraitNames>(localStorage, KEY)) || { names: {} };
const listeners = new Set<() => void>();

export const traitState = () => state;
export function subscribeTraits(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function setTraitNames(names: Record<string, string>) {
  state = { names, readAt: Date.now() };
  writeJson(localStorage, KEY, state);
  listeners.forEach((l) => l());
}

/** "FantasticFourMCU" → "Fantastic Four MCU", "XMen" → "X Men": a readable fallback for unknown ids. */
export function humanize(id: string): string {
  return id
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A character's display name, or its id split into words when the game sent no name. */
export function charName(info: { id: string; name?: string } | undefined, id = info?.id ?? ''): string {
  return plainName(info?.name) || humanize(id);
}

/** A trait's display name: our override, then the game's name, then the id split into words. */
export function traitName(id: string): string {
  return EN.trait[id] ?? state.names[id] ?? humanize(id);
}
