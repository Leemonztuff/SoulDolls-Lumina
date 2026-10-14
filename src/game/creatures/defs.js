/**
 * Creature definitions ("Critters Collection"): the 12 species and the 8 moves, as plain data
 * shared by the game, the editor and the Node tools. Import-free and Node-safe (the i18n check and
 * the tools import this module in Node), so the shipped runtime copies under
 * `public/data/creatures/` (`species.json`, `moves.json`) mirror it byte for byte in meaning; the
 * tools read this file when they need an identity without a fetch, and the game will load the JSON
 * through `import.meta.env.BASE_URL` at runtime.
 *
 * English identities live here; the display names are translated at draw time through the
 * `creature.species.<id>` / `creature.move.<id>` / `creature.type.<id>` keys of
 * `src/game/creatures/strings.js` (docs/specs/I18N.md). The battle and encounter logic lives in
 * `./rules.js` (pure formulas) and `./Creature.js` (instances); this module only describes.
 *
 * Balance table (the plan's §3): base stats at level 1, two moves each (the first learned at level
 * 1, the second at level 5, so a starter met at level 5 has both). The three starters are
 * `STARTER_IDS`. `growth` names the XP curve in `rules.js` (all 'medium' for now).
 */

/**
 * The three creature types and the one move type that is neutral to all of them.
 * @typedef {'grass'|'fire'|'water'} CreatureType
 */

/**
 * A move's type: the three creature types plus 'neutral', which the type chart always leaves at ×1.
 * @typedef {'neutral'|'grass'|'fire'|'water'} MoveType
 */

/**
 * Whether a move is a contact hit (physical) or an energy hit (special); display only for now.
 * @typedef {'physical'|'special'} MoveCategory
 */

/**
 * The four base-stat keys. `spd` is speed (turn order), not special defence; damage uses ATK/DEF.
 * @typedef {'hp'|'atk'|'def'|'spd'} CreatureStatKey
 */

/** A creature's base stats: every key of `CreatureStatKey`. @typedef {Record<CreatureStatKey, number>} CreatureStats */

/**
 * One learnset row: the move learned when the creature reaches `level` (a creature may learn
 * several at the same level; the order here is the order learned).
 * @typedef {object} LearnsetEntry
 * @property {number} level           the level the move is learned at (1 = known from the start)
 * @property {string} move            the `MOVE_DEFS` id
 */

/**
 * One `CREATURE_DEFS` entry: a species. Base stats are at level 1.
 * @typedef {object} CreatureDef
 * @property {string} id              the species identity (English, stable; the `creature` object's `species`)
 * @property {string} name            the English display identity (translated at display)
 * @property {CreatureType} type      the species type
 * @property {CreatureStats} baseStats   HP / ATK / DEF / SPD at level 1 (scaled by `statsAt`)
 * @property {string} growth          the XP-curve id of `rules.js` ('medium' = medium-fast)
 * @property {number} catchRate       the catch base (1..255; higher is easier), see `rules.js` `catchChance`
 * @property {number} baseExp         the experience granted on the kill at level 1 (`rules.js` `expYield`)
 * @property {LearnsetEntry[]} learnset   the moves and their levels
 * @property {string} sprite          the sprite id passed to the engine's `createSpeciesSheet`
 * @property {boolean} starter        one of the three starter species
 */

/**
 * One `MOVE_DEFS` entry: a move.
 * @typedef {object} MoveDef
 * @property {string} id              the move identity (English, stable)
 * @property {string} name            the English display identity (translated at display)
 * @property {MoveType} type          the move's type ('neutral' is always ×1)
 * @property {MoveCategory} category  physical or special (display only: damage uses ATK/DEF)
 * @property {number} power           the damage base (0 for a status move; none ship yet)
 * @property {number} accuracy        the hit chance in per cent (100 = always)
 * @property {number} pp              power points at full
 * @property {number} priority        turn-order priority (higher goes first; all 0 for now)
 * @property {string|null} effect     a named secondary effect id, or null
 */

/**
 * The creature types, in type-chart / display order.
 * @type {readonly CreatureType[]}
 */
export const CREATURE_TYPE_IDS = Object.freeze(['grass', 'fire', 'water']);

/**
 * The move types (the creature types plus 'neutral').
 * @type {readonly MoveType[]}
 */
export const MOVE_TYPE_IDS = Object.freeze(['neutral', 'grass', 'fire', 'water']);

/**
 * Every species by id. The key order is the `species.json` order and the roster's display order.
 * @type {Record<string, CreatureDef>}
 */
export const CREATURE_DEFS = {
  leafling: {
    id: 'leafling', name: 'Leafling', type: 'grass',
    baseStats: { hp: 45, atk: 49, def: 49, spd: 45 },
    growth: 'medium', catchRate: 45, baseExp: 64,
    learnset: [{ level: 1, move: 'nudge' }, { level: 5, move: 'leafcut' }],
    sprite: 'leafling', starter: true,
  },
  emberling: {
    id: 'emberling', name: 'Emberling', type: 'fire',
    baseStats: { hp: 44, atk: 52, def: 43, spd: 50 },
    growth: 'medium', catchRate: 45, baseExp: 62,
    learnset: [{ level: 1, move: 'nudge' }, { level: 5, move: 'emberpuff' }],
    sprite: 'emberling', starter: true,
  },
  rippling: {
    id: 'rippling', name: 'Rippling', type: 'water',
    baseStats: { hp: 46, atk: 48, def: 50, spd: 47 },
    growth: 'medium', catchRate: 45, baseExp: 63,
    learnset: [{ level: 1, move: 'nudge' }, { level: 5, move: 'splashjet' }],
    sprite: 'rippling', starter: true,
  },
  mossling: {
    id: 'mossling', name: 'Mossling', type: 'grass',
    baseStats: { hp: 55, atk: 45, def: 55, spd: 30 },
    growth: 'medium', catchRate: 190, baseExp: 65,
    learnset: [{ level: 1, move: 'nudge' }, { level: 5, move: 'leafcut' }],
    sprite: 'mossling', starter: false,
  },
  sparrowling: {
    id: 'sparrowling', name: 'Sparrowling', type: 'grass',
    baseStats: { hp: 40, atk: 55, def: 40, spd: 65 },
    growth: 'medium', catchRate: 190, baseExp: 60,
    learnset: [{ level: 1, move: 'peck' }, { level: 5, move: 'gust' }],
    sprite: 'sparrowling', starter: false,
  },
  stoneling: {
    id: 'stoneling', name: 'Stoneling', type: 'fire',
    baseStats: { hp: 60, atk: 50, def: 65, spd: 25 },
    growth: 'medium', catchRate: 120, baseExp: 70,
    learnset: [{ level: 1, move: 'nudge' }, { level: 5, move: 'cinderroll' }],
    sprite: 'stoneling', starter: false,
  },
  voltling: {
    id: 'voltling', name: 'Voltling', type: 'fire',
    baseStats: { hp: 42, atk: 58, def: 40, spd: 60 },
    growth: 'medium', catchRate: 120, baseExp: 60,
    learnset: [{ level: 1, move: 'spark' }, { level: 5, move: 'emberpuff' }],
    sprite: 'voltling', starter: false,
  },
  slitherling: {
    id: 'slitherling', name: 'Slitherling', type: 'water',
    baseStats: { hp: 48, atk: 44, def: 48, spd: 52 },
    growth: 'medium', catchRate: 190, baseExp: 62,
    learnset: [{ level: 1, move: 'nudge' }, { level: 5, move: 'splashjet' }],
    sprite: 'slitherling', starter: false,
  },
  buzzling: {
    id: 'buzzling', name: 'Buzzling', type: 'grass',
    baseStats: { hp: 41, atk: 50, def: 42, spd: 58 },
    growth: 'medium', catchRate: 190, baseExp: 58,
    learnset: [{ level: 1, move: 'peck' }, { level: 5, move: 'leafcut' }],
    sprite: 'buzzling', starter: false,
  },
  shadeling: {
    id: 'shadeling', name: 'Shadeling', type: 'fire',
    baseStats: { hp: 50, atk: 56, def: 45, spd: 48 },
    growth: 'medium', catchRate: 75, baseExp: 68,
    learnset: [{ level: 1, move: 'nudge' }, { level: 5, move: 'emberpuff' }],
    sprite: 'shadeling', starter: false,
  },
  frostling: {
    id: 'frostling', name: 'Frostling', type: 'water',
    baseStats: { hp: 52, atk: 47, def: 52, spd: 40 },
    growth: 'medium', catchRate: 120, baseExp: 64,
    learnset: [{ level: 1, move: 'nudge' }, { level: 5, move: 'splashjet' }],
    sprite: 'frostling', starter: false,
  },
  aurorling: {
    id: 'aurorling', name: 'Aurorling', type: 'water',
    baseStats: { hp: 47, atk: 51, def: 46, spd: 55 },
    growth: 'medium', catchRate: 75, baseExp: 66,
    learnset: [{ level: 1, move: 'spark' }, { level: 5, move: 'splashjet' }],
    sprite: 'aurorling', starter: false,
  },
  peatling: {
    id: 'peatling', name: 'Peatling', type: 'grass',
    baseStats: { hp: 46, atk: 50, def: 48, spd: 44 },
    growth: 'medium', catchRate: 190, baseExp: 63,
    learnset: [{ level: 1, move: 'nudge' }, { level: 5, move: 'leafcut' }],
    sprite: 'peatling', starter: true,
  },
  mossmote: {
    id: 'mossmote', name: 'Mossmote', type: 'grass',
    baseStats: { hp: 52, atk: 44, def: 56, spd: 32 },
    growth: 'medium', catchRate: 190, baseExp: 64,
    learnset: [{ level: 1, move: 'nudge' }, { level: 5, move: 'leafcut' }],
    sprite: 'mossmote', starter: false,
  },
  boggart: {
    id: 'boggart', name: 'Boggart', type: 'grass',
    baseStats: { hp: 44, atk: 54, def: 42, spd: 58 },
    growth: 'medium', catchRate: 120, baseExp: 62,
    learnset: [{ level: 1, move: 'peck' }, { level: 5, move: 'gust' }],
    sprite: 'boggart', starter: false,
  },
  lanternfly: {
    id: 'lanternfly', name: 'Lanternfly', type: 'fire',
    baseStats: { hp: 42, atk: 55, def: 40, spd: 62 },
    growth: 'medium', catchRate: 120, baseExp: 61,
    learnset: [{ level: 1, move: 'spark' }, { level: 5, move: 'emberpuff' }],
    sprite: 'lanternfly', starter: false,
  },
  gloamwing: {
    id: 'gloamwing', name: 'Gloamwing', type: 'fire',
    baseStats: { hp: 45, atk: 52, def: 44, spd: 51 },
    growth: 'medium', catchRate: 45, baseExp: 64,
    learnset: [{ level: 1, move: 'nudge' }, { level: 5, move: 'emberpuff' }],
    sprite: 'gloamwing', starter: true,
  },
  cinderbound: {
    id: 'cinderbound', name: 'Cinderbound', type: 'fire',
    baseStats: { hp: 58, atk: 52, def: 60, spd: 28 },
    growth: 'medium', catchRate: 90, baseExp: 68,
    learnset: [{ level: 1, move: 'nudge' }, { level: 5, move: 'cinderroll' }],
    sprite: 'cinderbound', starter: false,
  },
  cavernmite: {
    id: 'cavernmite', name: 'Cavernmite', type: 'fire',
    baseStats: { hp: 50, atk: 58, def: 48, spd: 46 },
    growth: 'medium', catchRate: 120, baseExp: 66,
    learnset: [{ level: 1, move: 'spark' }, { level: 5, move: 'cinderroll' }],
    sprite: 'cavernmite', starter: false,
  },
  murkfin: {
    id: 'murkfin', name: 'Murkfin', type: 'water',
    baseStats: { hp: 50, atk: 46, def: 52, spd: 48 },
    growth: 'medium', catchRate: 120, baseExp: 64,
    learnset: [{ level: 1, move: 'nudge' }, { level: 5, move: 'splashjet' }],
    sprite: 'murkfin', starter: false,
  },
  shellskimmer: {
    id: 'shellskimmer', name: 'Shellskimmer', type: 'water',
    baseStats: { hp: 55, atk: 42, def: 62, spd: 35 },
    growth: 'medium', catchRate: 120, baseExp: 65,
    learnset: [{ level: 1, move: 'nudge' }, { level: 5, move: 'splashjet' }],
    sprite: 'shellskimmer', starter: false,
  },
  saltling: {
    id: 'saltling', name: 'Saltling', type: 'water',
    baseStats: { hp: 48, atk: 48, def: 50, spd: 50 },
    growth: 'medium', catchRate: 190, baseExp: 62,
    learnset: [{ level: 1, move: 'spark' }, { level: 5, move: 'splashjet' }],
    sprite: 'saltling', starter: false,
  },
  hollowwisp: {
    id: 'hollowwisp', name: 'Hollowwisp', type: 'water',
    baseStats: { hp: 44, atk: 54, def: 42, spd: 56 },
    growth: 'medium', catchRate: 90, baseExp: 66,
    learnset: [{ level: 1, move: 'nudge' }, { level: 5, move: 'splashjet' }],
    sprite: 'hollowwisp', starter: false,
  },
  tidewisp: {
    id: 'tidewisp', name: 'Tidewisp', type: 'water',
    baseStats: { hp: 46, atk: 48, def: 50, spd: 48 },
    growth: 'medium', catchRate: 45, baseExp: 64,
    learnset: [{ level: 1, move: 'nudge' }, { level: 5, move: 'splashjet' }],
    sprite: 'tidewisp', starter: true,
  },
};

/**
 * Every move by id.
 * @type {Record<string, MoveDef>}
 */
export const MOVE_DEFS = {
  nudge: { id: 'nudge', name: 'Nudge', type: 'neutral', category: 'physical', power: 35, accuracy: 100, pp: 35, priority: 0, effect: null },
  peck: { id: 'peck', name: 'Peck', type: 'neutral', category: 'physical', power: 35, accuracy: 100, pp: 35, priority: 0, effect: null },
  spark: { id: 'spark', name: 'Spark', type: 'neutral', category: 'special', power: 40, accuracy: 100, pp: 30, priority: 0, effect: null },
  leafcut: { id: 'leafcut', name: 'Leafcut', type: 'grass', category: 'physical', power: 45, accuracy: 100, pp: 25, priority: 0, effect: null },
  emberpuff: { id: 'emberpuff', name: 'Emberpuff', type: 'fire', category: 'special', power: 45, accuracy: 100, pp: 25, priority: 0, effect: null },
  splashjet: { id: 'splashjet', name: 'Splashjet', type: 'water', category: 'special', power: 45, accuracy: 100, pp: 25, priority: 0, effect: null },
  gust: { id: 'gust', name: 'Gust', type: 'neutral', category: 'special', power: 40, accuracy: 100, pp: 35, priority: 0, effect: null },
  cinderroll: { id: 'cinderroll', name: 'Cinderroll', type: 'fire', category: 'physical', power: 50, accuracy: 95, pp: 20, priority: 0, effect: null },
};

/**
 * Every species id, in `CREATURE_DEFS` order.
 * @type {readonly string[]}
 */
export const CREATURE_IDS = Object.freeze(Object.keys(CREATURE_DEFS));

/**
 * The three starter species (`starters.json`): Grass, Fire, Water.
 * @type {readonly string[]}
 */
export const STARTER_IDS = Object.freeze(['leafling', 'emberling', 'rippling']);

/**
 * A `CreatureDef` by id, or null for an unknown / inherited key.
 * @param {unknown} id
 * @returns {CreatureDef|null}
 */
export function creatureDef(id) {
  return typeof id === 'string' && Object.hasOwn(CREATURE_DEFS, id) ? CREATURE_DEFS[id] : null;
}

/**
 * A `MoveDef` by id, or null for an unknown / inherited key.
 * @param {unknown} id
 * @returns {MoveDef|null}
 */
export function moveDef(id) {
  return typeof id === 'string' && Object.hasOwn(MOVE_DEFS, id) ? MOVE_DEFS[id] : null;
}
