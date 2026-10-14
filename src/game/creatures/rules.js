/**
 * Creature battle rules: the type chart and the pure damage / catch / experience formulas. No state,
 * no imports with side effects and no `Math.random()` — every roll takes a seeded `rng` (a function
 * returning a number in [0, 1), e.g. `RNG.next` from src/engine/utils/math.js), so a battle,
 * an encounter or a capture replays exactly from its seed ("Critters Collection" plan §8, §15).
 *
 * The species and move data live in `./defs.js`; this module only computes. Damage follows the
 * plan's formula, with STAB (a move of the attacker's own type), the type chart, a critical hit and
 * a seeded [0.85, 1] roll. Capture is the classic HP-ratio curve with an orb-tier multiplier and the
 * species' `catchRate`. Experience is the medium-fast curve (total `level³`).
 *
 * @import { CreatureDef, CreatureType, MoveType } from './defs.js'
 */

/** ×1.5 when the move's type matches the attacker's species type. */
export const STAB_MULT = 1.5;
/** ×1.5 on a critical hit. */
export const CRIT_MULT = 1.5;
/** The critical-hit chance (0.0625 ≈ 1/16), rolled by the battle, not here. */
export const CRIT_CHANCE = 0.0625;
/** The seeded damage roll's lower bound (the plan's [0.85, 1.0]). */
export const DAMAGE_ROLL_MIN = 0.85;

/**
 * The type chart ("Critters Collection" plan §3): a type's multiplier against another. The three
 * creature types beat the next in the cycle (Grass→Water, Water→Fire, Fire→Grass) for ×2, lose to
 * the previous for ×0.5, and are neutral against themselves. The 'neutral' move type is ×1
 * everywhere. An unknown string is ×1 (the checker cannot follow data, so this is the guard).
 * @type {Record<string, Record<string, number>>}
 */
export const TYPE_CHART = Object.freeze({
  grass: Object.freeze({ grass: 1, fire: 0.5, water: 2, neutral: 1 }),
  fire: Object.freeze({ grass: 2, fire: 1, water: 0.5, neutral: 1 }),
  water: Object.freeze({ grass: 0.5, fire: 2, water: 1, neutral: 1 }),
  neutral: Object.freeze({ grass: 1, fire: 1, water: 1, neutral: 1 }),
});

/**
 * The chart's multiplier of an attack type against a defender type (2, 0.5 or 1).
 * @param {string} attackType   a move type (MoveType)
 * @param {string} defenderType a species type (CreatureType)
 * @returns {number} 2, 0.5 or 1 (1 for an unknown type)
 */
export function typeMultiplier(attackType, defenderType) {
  const row = TYPE_CHART[attackType];
  if (!row) return 1;
  const m = row[defenderType];
  return typeof m === 'number' ? m : 1;
}

/**
 * Options of `damage`.
 * @typedef {object} DamageOptions
 * @property {number} level        the attacker's level
 * @property {number} power        the move's power (0 = no damage)
 * @property {number} attack       the attacker's ATK
 * @property {number} defense      the defender's DEF
 * @property {string} attackType   the move's type (MoveType)
 * @property {string} defenderType the defender's species type (CreatureType)
 * @property {boolean} [stab]      the move's type matches the attacker's (STAB)
 * @property {boolean} [crit]      a critical hit
 * @property {number} [roll]       the seeded damage roll [0.85, 1] (missing = 1, the max)
 */

/**
 * The plan's damage formula: `floor(((2L/5 + 2) · power · A / D) / 50 + 2)` × STAB × type × crit ×
 * roll, floored once at the end and never below 1. A move with `power <= 0` deals 0.
 * @param {DamageOptions} o
 * @returns {number} the damage dealt (an integer)
 */
export function damage(o) {
  const power = Number(o.power) || 0;
  if (power <= 0) return 0;
  const level = Math.max(1, o.level | 0);
  const atk = Math.max(1, Number(o.attack) || 1);
  const def = Math.max(1, Number(o.defense) || 1);
  let dmg = ((2 * level) / 5 + 2) * power * (atk / def) / 50 + 2;
  if (o.stab) dmg *= STAB_MULT;
  dmg *= typeMultiplier(o.attackType, o.defenderType);
  if (o.crit) dmg *= CRIT_MULT;
  const roll = o.roll === undefined ? 1 : clamp(o.roll, DAMAGE_ROLL_MIN, 1);
  dmg *= roll;
  return Math.max(1, Math.floor(dmg));
}

/**
 * The seeded damage roll, drawn once per hit: `0.85 + 0.15 · rng()`.
 * @param {() => number} rng a seeded RNG (its `next`, returning [0, 1))
 * @returns {number} a number in [0.85, 1]
 */
export function damageRoll(rng) {
  return DAMAGE_ROLL_MIN + (1 - DAMAGE_ROLL_MIN) * clamp(rng(), 0, 1);
}

/**
 * The capture chance for one throw: the classic HP-ratio curve with the orb-tier multiplier,
 * divided by 255 and clamped to [0, 1]. `hpRatio` is the wild creature's current HP over its max.
 * @param {number} hpRatio     current HP / max HP (0..1; lower is easier)
 * @param {number} catchRate   the species' catch base (1..255; higher is easier)
 * @param {number} [orbTier]   the orb's multiplier (1 = a basic orb); 0 disables the throw
 * @returns {number} the chance in [0, 1]
 */
export function catchChance(hpRatio, catchRate, orbTier = 1) {
  const rate = Math.max(0, Number(catchRate) || 0);
  const tier = Math.max(0, Number(orbTier) || 0);
  if (rate <= 0 || tier <= 0) return 0;
  const r = clamp(hpRatio, 0, 1);
  return clamp((((3 - 2 * r) * rate * tier) / 3) / 255, 0, 1);
}

/**
 * Roll a capture with a seeded RNG: true when it catches.
 * @param {number} hpRatio
 * @param {number} catchRate
 * @param {number} orbTier
 * @param {() => number} rng
 * @returns {boolean}
 */
export function catchRoll(hpRatio, catchRate, orbTier, rng) {
  return clamp(rng(), 0, 1) < catchChance(hpRatio, catchRate, orbTier);
}

/** The XP-curve exponents (medium-fast = total `level³`). @type {Record<string, number>} */
export const GROWTH_POWERS = Object.freeze({ medium: 3 });

/**
 * Total experience needed to reach `level` on a curve (medium-fast: `level³`).
 * @param {number} level
 * @param {string} [growth]
 * @returns {number}
 */
export function expForLevel(level, growth = 'medium') {
  const p = GROWTH_POWERS[growth] ?? 3;
  return Math.max(0, level | 0) ** p;
}

/**
 * The experience still needed to reach the next level.
 * @param {number} level
 * @param {string} [growth]
 * @returns {number}
 */
export function xpToNext(level, growth = 'medium') {
  const l = Math.max(1, level | 0);
  return expForLevel(l + 1, growth) - expForLevel(l, growth);
}

/**
 * The level a total experience reaches on a curve (1..100).
 * @param {number} exp
 * @param {string} [growth]
 * @returns {number}
 */
export function levelFromExp(exp, growth = 'medium') {
  const p = GROWTH_POWERS[growth] ?? 3;
  const l = Math.floor(Math.max(0, exp) ** (1 / p));
  return clamp(l, 1, 100) | 0;
}

/**
 * The experience a defeated creature grants: `floor(baseExp · level / 7)`, at least 1.
 * @param {number} baseExp
 * @param {number} level
 * @returns {number}
 */
export function expYield(baseExp, level) {
  return Math.max(1, Math.floor((Number(baseExp) || 1) * Math.max(1, level | 0) / 7));
}

/**
 * A species' stats at a level (HP uses the classic `+level+10`, the others `+5`). Integers.
 * @param {CreatureDef} def
 * @param {number} level
 * @returns {{hp: number, atk: number, def: number, spd: number}}
 */
export function statsAt(def, level) {
  const L = Math.max(1, level | 0);
  const b = def.baseStats;
  const calc = (base, bonus) => Math.floor((2 * base * L) / 100) + bonus;
  return {
    hp: calc(b.hp, L + 10),
    atk: calc(b.atk, 5),
    def: calc(b.def, 5),
    spd: calc(b.spd, 5),
  };
}

/**
 * Clamp `v` into [lo, hi].
 * @param {number} v @param {number} lo @param {number} hi @returns {number}
 */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The creature types, re-exported for callers that only import `rules.js`. @type {readonly CreatureType[]} */
export const TYPES = Object.freeze(['grass', 'fire', 'water']);

/** The move types, re-exported for callers that only import `rules.js`. @type {readonly MoveType[]} */
export const MOVE_TYPES = Object.freeze(['neutral', 'grass', 'fire', 'water']);
