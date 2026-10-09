import { idOf } from '../api/types';
import type { Snapshot } from '../data/store';
import { isUnlocked, ownedCharacters } from './requirements';

/** 0-7 red stars, 8-10 are diamonds 1-3. */
function stars(yellow = 0, red = 0): string {
  const base = `${yellow}Y/${Math.min(red, 7)}R`;
  return red > 7 ? `${base}+${red - 7}D` : base;
}

function iso(i: NonNullable<import('../api/types').CharacterInstance['iso8']> | undefined): string {
  if (!i?.active) return '-';
  const level = i[i.active as keyof typeof i];
  return `${i.active}${typeof level === 'number' ? ` ${level}` : ''}${i.matrix ? ` (${i.matrix})` : ''}`;
}

/** Player names can carry game markup such as <color=red>. */
export function plainName(name: unknown): string {
  if (name == null) return '';
  if (typeof name !== 'string') return typeof name === 'object' ? JSON.stringify(name) : String(name);
  return name.replace(/<\/?[a-z]+(=[^>]*)?>/gi, '').trim();
}

/**
 * A compact plain-text roster summary that can be pasted into a chat for strategy help.
 * One line per unlocked character, strongest first.
 */
export function rosterExport(s: Snapshot): string {
  const rows = ownedCharacters(s)
    .filter(isUnlocked)
    .sort((a, b) => (b.instance?.power ?? 0) - (a.instance?.power ?? 0));

  const header = [
    `MSF roster export · ${plainName(s.card.name)} · ${new Date(s.syncedAt).toISOString().slice(0, 10)}`,
    `TCP ${(s.card.tcp ?? 0).toLocaleString('en-US')} · ${rows.length} unlocked`,
    'name | power | stars | gear | level | abilities B/S/U/P | iso-8 | traits',
  ];
  const lines = rows.map(({ info, instance: i }) =>
    [
      info.name ?? info.id,
      (i?.power ?? 0).toLocaleString('en-US'),
      stars(i?.activeYellow, i?.activeRed),
      `G${i?.gearTier ?? 0}`,
      `L${i?.level ?? 0}`,
      `${i?.basic ?? 0}/${i?.special ?? 0}/${i?.ultimate ?? 0}/${i?.passive ?? 0}`,
      iso(i?.iso8),
      (info.traits ?? []).map(idOf).join(','),
    ].join(' | '),
  );
  return [...header, ...lines].join('\n');
}
