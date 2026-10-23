import type { Reason } from './priority';
import { GOAL_BOOST, type ScheduledStep } from './schedule';

/** A plain-language case for a step's place in the priority list. */
export interface StepCase {
  /** One or two sentences: the short answer. */
  summary: string;
  /** What makes the step itself worth doing. */
  worth: string;
  /** Why this character gets materials before others, strongest reason first. */
  character: Reason[];
  /** What it costs, in gold and in scarce materials. */
  cost: string;
  /** Why it sits above the step after it, when there is one. */
  versus?: string;
}

const BASE_ABILITY: Record<string, number> = { Basic: 2, Special: 4, Ultimate: 4, Passive: 4 };

function worthOf(s: ScheduledStep): string {
  const v = s.why.value;
  switch (s.kind) {
    case 'gear':
      return `Gear tiers are the biggest single stat jump a character can take (worth ${v}, the most of any regular step).`;
    case 'stars':
      return s.title.startsWith('Unlock')
        ? `Unlocking adds a character to your roster (worth ${v}, the most of any step).`
        : `A yellow star raises every stat and the cap on everything else (worth ${v}).`;
    case 'ability': {
      const base = BASE_ABILITY[s.title.split(' ')[0]] ?? v;
      const modes = s.modeEffects?.map((t) => t.text) ?? [];
      return v > base && modes.length
        ? `This ability level adds an effect in a mode you play: “${modes[0]}” That lifts it from ${base} to ${v}.`
        : `Ability levels add damage or effects to the kit (worth ${v}${base === 2 ? '; basics count least' : ''}).`;
    }
    case 'iso':
      return `ISO-8 levels add steady stats (worth ${v} for these levels).`;
    case 'level':
      return v > 2
        ? `This level opens the next ability level, so it's worth ${v} instead of 2.`
        : `Levels are cheap but small on their own (worth ${v}).`;
    default:
      return `Worth ${v}.`;
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const money = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

/**
 * Explains a step from the parts of its score: what the step is worth, how much its character
 * matters, whether it moves an unlock goal, and what it costs. The list is built one pick at a
 * time, each the best value you could afford at that point, so it's compared with the next step.
 */
export function explainStep(
  s: ScheduledStep,
  rank: number,
  reasons: Reason[] | undefined,
  nameOf: (id: string) => string,
  itemName: (id: string) => string,
  next?: ScheduledStep,
): StepCase {
  const w = s.why;
  const character = [...(reasons ?? [])].sort((a, b) => b.weight - a.weight);
  const who = nameOf(s.characterId);
  const top = character[0]?.label;

  const days = w.incomeDays && w.incomeDays >= 0.5 ? `about ${w.incomeDays >= 10 ? Math.round(w.incomeDays) : Math.round(w.incomeDays * 10) / 10} days of your ${itemName(w.scarcest!)} income` : undefined;
  const scarce = w.scarcest && w.share >= 0.05 ? days ?? `${pct(Math.min(1, w.share))} of your ${itemName(w.scarcest)}` : undefined;
  const cost = [
    s.gold ? `${money(s.gold)} gold` : w.unchecked ? 'No gold, but ions or other costs the game data doesn’t show, so check them in game' : 'No gold',
    scarce ? `and ${scarce}` : s.uses?.some((u) => u.item !== 'SC') ? 'and only a small share of any one material' : '',
    s.crafted?.length ? `(crafts ${s.crafted.length} ${s.kind === 'iso' ? 'crystal' : 'piece'}${s.crafted.length > 1 ? 's' : ''} from what you hold)` : '',
  ].filter(Boolean).join(' ') + '.';

  const parts = [
    w.goal && s.goal ? `it moves ${who} toward the bar ${s.goal.replace(/^For /, 'for ')}, which counts nine times over` : '',
    top ? `${who} ranks high for “${top}”${character.length > 1 ? ` and ${character.length - 1} more reason${character.length > 2 ? 's' : ''}` : ''}` : '',
    w.price < 1.3 ? 'it’s cheap for what it gives' : '',
  ].filter(Boolean);
  const summary = `#${rank} because ${parts.length ? parts.join(', and ') : `it was the best value for its cost when it was picked`}.`
    + (w.unchecked ? ' Part of its cost can’t be checked from the game data, so it counts half until you confirm it in game.' : '');

  let versus: string | undefined;
  if (next) {
    const n = next.why;
    const worth = (x: typeof w) => x.value * (x.goal ? GOAL_BOOST : 1) * (x.unchecked ? 0.5 : 1);
    const ratios: [string, number][] = [
      [n.goal && !w.goal ? '' : w.goal && !n.goal ? 'it moves an unlock goal and that one doesn’t' : 'the step itself is worth more', worth(w) / worth(n)],
      [`${who} matters more to your plan than ${nameOf(next.characterId)}`, w.weight / n.weight],
      ['it costs less for what it gives', n.price / w.price],
    ];
    const best = ratios.filter(([t]) => t).sort((a, b) => b[1] - a[1])[0];
    const nextName = `${nameOf(next.characterId)}: ${next.title}`;
    versus = best && best[1] > 1.05
      ? `Above ${nextName} mainly because ${best[0]}.`
      : `About level with ${nextName}. They're close in value, so either order works.`;
  }

  return { summary, worth: worthOf(s), character, cost, versus };
}
