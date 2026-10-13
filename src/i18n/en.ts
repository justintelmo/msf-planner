/**
 * English strings used in more than one place. Fix a wrong label here and it changes everywhere.
 * Trait names come from the game when you're logged in; `trait` overrides them (or fills gaps).
 */
export const EN = {
  mode: {
    raids: 'Raids', war: 'War', crucible: 'Crucible', blitz: 'Blitz', arena: 'Arena', tower: 'Tower',
    battleworld: 'Battleworld', roster: 'Roster',
  } as Record<string, string>,
  stepStatus: { ready: 'Do now', short: 'Short', unchecked: 'Check in game' },
  verdict: { good: 'Good', ok: 'Fine', questionable: 'Rethink' },
  ability: { basic: 'Basic', special: 'Special', ultimate: 'Ultimate', passive: 'Passive' },
  kit: {
    maxHealth: '% Max Health', lockdown: 'Stun/Block', tempo: 'Speed/Energy', drain: 'Drain', sustain: 'Sustain', piercing: 'Piercing',
  },
  /** Trait id → name, where the game's own name is missing or reads badly. */
  trait: {
    FantasticFourMCU: 'Fantastic Four (MCU)',
    XMen: 'X-Men',
    Xmen: 'X-Men',
    Xforce: 'X-Force',
    XForce: 'X-Force',
    XFactor: 'X-Factor',
    XTreme: 'X-Treme X-Men',
    AForce: 'A-Force',
    SpiderVerse: 'Spider-Verse',
    SpiderSociety: 'Spider-Society',
    ShieldTrait: 'S.H.I.E.L.D.',
    Shield: 'S.H.I.E.L.D.',
    AIM: 'A.I.M.',
    Hydra: 'HYDRA',
    MCU: 'MCU',
  } as Record<string, string>,
};
