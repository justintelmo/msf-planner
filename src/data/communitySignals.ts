/**
 * What players on r/MarvelStrikeForce say about where to spend, as planner signals.
 * Read through safereddit.com; every source is cached in msf-planner/reddit-cache/.
 * The weekly meta scan (scripts/reddit-scan.py) updates this file: add, retire or re-date signals,
 * and keep `checked` current. Each signal is weighed against game data before it counts
 * (src/planner/community.ts). Post dates known only to the month use the 1st.
 *
 * Trait ids and character names: Telmo corrects these by hand. When a scan can't confirm the game's
 * id for a trait or character, don't guess silently: ask Telmo in the reply and apply his answer.
 * Confirmed by Telmo 2026-10-13: 'UncannyAvenger', 'IronRaider', 'AmazingAvenger'.
 */

export type Stance =
  /** Worth building: works across modes. */
  | 'build'
  /** Build only as far as the content in front of you needs. */
  | 'enough'
  /** Wait: an event will reward these upgrades soon. */
  | 'hold';

export interface CommunitySource {
  url: string;
  title: string;
  /** Post date, YYYY-MM-DD. */
  date: string;
  upvotes?: number;
}

export interface CommunitySignal {
  id: string;
  stance: Stance;
  /** The team or group the advice is about, as players name it. */
  team: string;
  /** Character ids or display names (matched loosely). */
  characters?: string[];
  /** Every character with one of these traits counts. */
  traits?: string[];
  /** Members players single out as worth building anyway, for `enough` signals. */
  except?: string[];
  /** Modes the claim is about, as planner mode keys. */
  modes?: string[];
  /** What players say, in one sentence. */
  claim: string;
  sources: CommunitySource[];
  /** YYYY-MM-DD after which the signal lapses unless a scan renews it. */
  until?: string;
}

/** When the signals were last checked against Reddit. */
export const SIGNALS_CHECKED = '2026-10-19';

const R = 'https://www.reddit.com/r/MarvelStrikeForce/comments/';

export const COMMUNITY_SIGNALS: CommunitySignal[] = [
  {
    id: 'symbiote-six',
    stance: 'build',
    team: 'Symbiote Six',
    characters: ['Knull', 'Quicksilver (Symbiote)', 'Toxin', 'Riot', 'Venom'],
    modes: ['battleworld', 'war', 'crucible', 'raids'],
    claim: 'Called the strongest team in the game and strong in every mode, with 800M+ Battleworld damage reported.',
    sources: [
      { url: `${R}1vw6pct/`, title: 'Not sold on Symbiote Six?', date: '2026-08-23', upvotes: 45 },
      { url: `${R}1w0xnc0/`, title: 'Should I Fully Invest in Symbiote Six Team?', date: '2026-08-28', upvotes: 13 },
      { url: `${R}1v47gjy/`, title: 'What teams to focus on and build next?', date: '2026-07-01' },
    ],
  },
  {
    id: 'insidious-six',
    stance: 'build',
    team: 'Insidious Six',
    characters: ['Superior Spider-Man', 'Hobgoblin', 'Scorpion', 'Vulture', 'Shocker', 'Doctor Octopus'],
    modes: ['raids', 'war', 'crucible'],
    claim: 'First on the current raid-team list, useful in War and Crucible, and the core of the Blue Marvel unlock.',
    sources: [
      { url: `${R}1w67f5x/`, title: 'New player needing guidance', date: '2026-09-01' },
      { url: `${R}1wgfetv/`, title: 'What am I supposed to be focusing on?', date: '2026-09-01' },
    ],
  },
  {
    id: 'fantastic-four-mcu',
    stance: 'build',
    team: 'Fantastic Four (MCU)',
    characters: ['Franklin Richards', 'Invisible Woman (MCU)', 'Mister Fantastic (MCU)', 'The Thing', 'Human Torch'],
    modes: ['war', 'crucible', 'battleworld'],
    claim: 'A clear return on investment because it is fully farmable, and strong across PvP modes.',
    sources: [{ url: `${R}1sfaovd/`, title: 'Trying to narrow down who I’m spending on', date: '2026-04-01' }],
  },
  {
    id: 'old-stat-teams',
    stance: 'enough',
    team: 'Older teams (Astral, Orchis, Liberty, Nightstalkers, Uncanny Avengers)',
    traits: ['Astral', 'Orchis', 'Liberty', 'Nightstalker', 'UncannyAvenger'],
    except: ['Shadow King', 'Emma Frost', 'Lady Deathstrike'],
    claim: 'Newer teams have higher base stats; stop upgrading these as whole teams and keep only standouts.',
    sources: [
      { url: `${R}1q8y3r4/`, title: 'New raid teams and toons?', date: '2026-01-10' },
      { url: `${R}1tx2glp/`, title: 'What should you focus on?', date: '2026-06-01' },
    ],
  },
  {
    id: 'champions',
    stance: 'enough',
    team: 'Champions',
    traits: ['Champion'],
    modes: ['raids'],
    claim: 'Rated the weakest raid team; even at G20 it struggles on its second node, and nobody uses it elsewhere.',
    sources: [
      { url: `${R}1wtkozr/`, title: 'Champions can no longer clear their 2nd node', date: '2026-09-29', upvotes: 91 },
      { url: `${R}1sg2eqz/`, title: 'Rant - Champions are the worst Raid team by far', date: '2026-04-08', upvotes: 100 },
    ],
  },
  {
    id: 'leaderboard-featured',
    stance: 'hold',
    team: 'Amazing Avengers and Iron Raiders',
    traits: ['AmazingAvenger', 'IronRaider'],
    claim: 'The current leaderboard scores upgrading these teams and gives no credit for upgrades already done, so wait for it.',
    sources: [{ url: `${R}1x0ajrc/`, title: 'Don’t upgrade characters anymore...at least on your own schedule.', date: '2026-10-07', upvotes: 187 }],
    until: '2026-10-27',
  },
  {
    id: 'timeless-eternals-battleworld',
    stance: 'build',
    team: 'Timeless Eternals',
    characters: ['Ikaris', 'Sersi', 'Kingo'],
    modes: ['battleworld'],
    claim: 'After their mod buff, the top Destroyer team in Battleworld: 2–2.5B damage per attack reported, enough for a full kill on difficulty 4.',
    sources: [
      { url: `${R}1x7mzwb/`, title: 'Best Teams for Destroyer?', date: '2026-10-16', upvotes: 37 },
      { url: `${R}1x7qnja/`, title: 'Feedback on the Battleworld Boss.', date: '2026-10-16', upvotes: 40 },
    ],
  },
  {
    id: 'iron-raiders-battleworld',
    stance: 'build',
    team: 'Iron Raiders',
    traits: ['IronRaider'],
    modes: ['battleworld'],
    claim: 'A bonus team against Destroyer in Battleworld, doing about 1.1–1.2B on auto even when under-built; still time upgrades to the leaderboard hold above.',
    sources: [
      { url: `${R}1x7mzwb/`, title: 'Best Teams for Destroyer?', date: '2026-10-16', upvotes: 37 },
      { url: `${R}1x7qnja/`, title: 'Feedback on the Battleworld Boss.', date: '2026-10-16', upvotes: 40 },
    ],
  },
  {
    id: 'blue-marvel',
    stance: 'enough',
    team: 'Blue Marvel',
    characters: ['Blue Marvel'],
    claim: 'Seen as the least impactful Dark Dimension character so far; his gate is purple ISO-5 ions, so build nobody only for him.',
    sources: [
      { url: `${R}1rzex8v/`, title: 'Blue Marvel is 5 months old', date: '2026-03-21', upvotes: 161 },
      { url: `${R}1ufm0mz/`, title: 'Over 8 months less than 8k Blue Marvel unlocks', date: '2026-06-25', upvotes: 102 },
    ],
  },
];
