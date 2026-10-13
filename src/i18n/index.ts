import { useEffect, useSyncExternalStore } from 'react';
import { msfApi } from '../api/client';
import { setTraitNames, subscribeTraits, traitState } from './names';

export { EN as strings } from './en';
export { charName, humanize, traitName } from './names';

/** Trait names barely change; read them again after this long. */
const STALE_MS = 30 * 24 * 3600 * 1000;

/** Re-renders when trait names arrive. */
export function useTraitNames(): Record<string, string> {
  return useSyncExternalStore(subscribeTraits, () => traitState().names);
}

let loading = false;

/** Reads the game's trait names once a month while logged in. */
export function useLoadTraitNames(live: boolean) {
  useEffect(() => {
    const { readAt } = traitState();
    if (!live || loading || (readAt && Date.now() - readAt < STALE_MS)) return;
    loading = true;
    msfApi.traits()
      .then((list) => setTraitNames(Object.fromEntries(list.filter((t) => t.name).map((t) => [t.id, t.name!]))))
      .catch(() => undefined)
      .finally(() => {
        loading = false;
      });
  }, [live]);
}
