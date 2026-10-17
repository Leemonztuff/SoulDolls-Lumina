/**
 * A caught creature instance ("Critters Collection" plan §5, §10): one row of a `CreatureRoster`
 * (`active` / `box`) with a mutable current HP, level and experience, drawn against the species and
 * move data of `./defs.js` and the pure formulas of `./rules.js`. No state of its own beyond the
 * contract's `CreatureRecord` fields (plus the transient `status`, which is not saved), and no
 * `Math.random()`: a fresh instance gets a deterministic id (`mintUid`) that the roster keeps
 * unique, so a save round-trips byte for byte.
 *
 * `exp` is the experience gathered towards the next level (0..`xpToNext(level)-1`, 0 at the cap);
 * `level` is derived from it on load, and `gainXp` loops the level-ups. `moves` holds up to
 * `MAX_MOVES` move ids. A loaded row is untrusted: `fromJSON` validates every field (own.js through
 * `creatureDef` / `moveDef`) and drops what it cannot read.
 *
 * @import { CreatureDef } from './defs.js'
 * @import { CreatureRecord } from './types.js'
 */
import { creatureDef, moveDef } from './defs.js';
import { statsAt, xpToNext } from './rules.js';

/** The highest level a creature reaches. */
export const MAX_LEVEL = 100;
/** The most moves a creature may know. */
export const MAX_MOVES = 4;
/** The longest nickname (a long one is trimmed, never kept whole). */
export const NICK_MAX = 24;
/** The longest instance id kept on load (an untrusted `uid`). */
const UID_MAX = 64;

/**
 * The Resonance chain of a species: the next `CREATURE_DEFS` id it grows into at `level`, or null.
 * Reads only the plain `resonates` data of `defs.js`; an unknown target id reads as none (a save
 * with a stale chain simply never resonates). A pure lookup, so the battle and a loaded roster agree.
 * @param {string} speciesId
 * @param {number} level
 * @returns {{ to: string, level: number }|null}
 */
export function resonanceOf(speciesId, level) {
  const r = creatureDef(speciesId)?.resonates;
  if (!r || typeof r.to !== 'string' || !creatureDef(r.to)) return null;
  return level >= r.level ? r : null;
}

/** A session-monotonic id: `c1`, `c2`, … The roster re-mints a collision on a load. */
let uidSeq = 0;

/**
 * A fresh instance id, unique within a session (`CreatureRoster` re-mints any that collides with a
 * loaded one). @returns {string}
 */
export function mintUid() {
  return `c${(++uidSeq).toString(36)}`;
}

/** @returns {v is Record<string, any>} */
const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** @param {unknown} v @returns {number|null} */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * @param {number} v @param {number} lo @param {number} hi @returns {number}
 */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** A level clamped to 1..`MAX_LEVEL` (an untrusted value reads as 1). @param {unknown} v */
function clampLevel(v) {
  return clamp(Math.floor(num(v) ?? 1), 1, MAX_LEVEL);
}

/** The largest `exp` a level holds before the next one (`xpToNext - 1`). */
function expCap(level, growth) {
  return Math.max(0, xpToNext(level, growth) - 1);
}

/** A nickname: trimmed, `NICK_MAX` at most, else ''. @param {unknown} v */
function nickOf(v) {
  return typeof v === 'string' ? v.trim().slice(0, NICK_MAX) : '';
}

/** A transient status id (not saved): trimmed, short, else ''. @param {unknown} v */
function statusOf(v) {
  return typeof v === 'string' ? v.trim().slice(0, 24) : '';
}

/**
 * The moves a level knows: the given ids (validated, deduped, capped), else the learnset up to
 * `level` (the last `MAX_MOVES`, in learn order).
 * @param {CreatureDef} def
 * @param {number} level
 * @param {unknown} given
 * @returns {string[]}
 */
function movesKnown(def, level, given) {
  const out = [];
  if (Array.isArray(given)) {
    for (const id of given) {
      if (typeof id !== 'string' || !moveDef(id) || out.includes(id) || out.length >= MAX_MOVES) continue;
      out.push(id);
    }
    if (out.length) return out;
  }
  for (const entry of def.learnset) {
    if (entry.level > level || !moveDef(entry.move) || out.includes(entry.move)) continue;
    if (out.length >= MAX_MOVES) out.shift();
    out.push(entry.move);
  }
  return out;
}

/**
 * What a `Creature` may be built from: any of the contract's record fields (a uid, level, exp, HP,
 * known moves and a nickname) and the transient status. Missing fields take the species defaults.
 * @typedef {object} CreatureInit
 * @property {string} [uid]
 * @property {number} [level]
 * @property {number} [exp]
 * @property {number} [hp]
 * @property {string[]} [moves]
 * @property {string} [nickname]
 * @property {string} [status]
 */

export class Creature {
  /**
   * A creature of `species` at `opts.level` (1 by default), its stats and HP derived. An unknown
   * species throws (a caller reads its id from `CREATURE_DEFS`).
   * @param {string} species a `CREATURE_DEFS` id
   * @param {CreatureInit} [opts]
   */
  constructor(species, opts = {}) {
    const def = creatureDef(species);
    if (!def) throw new Error(`Creature: unknown species "${species}"`);
    this.uid = typeof opts.uid === 'string' && opts.uid ? opts.uid.slice(0, UID_MAX) : mintUid();
    this.species = def.id;
    this.nickname = nickOf(opts.nickname);
    /** A transient battle status id (not part of the saved record). */
    this.status = statusOf(opts.status);
    this.level = clampLevel(opts.level);
    this.stats = statsAt(def, this.level);
    this.exp = this.level >= MAX_LEVEL ? 0 : clamp(Math.floor(num(opts.exp) ?? 0), 0, expCap(this.level, def.growth));
    this.hp = opts.hp === undefined ? this.stats.hp : clamp(Math.floor(num(opts.hp) ?? this.stats.hp), 0, this.stats.hp);
    /** @type {string[]} the move ids it knows (up to `MAX_MOVES`) */
    this.moves = movesKnown(def, this.level, opts.moves);
  }

  /** Its species definition (always present). @returns {CreatureDef} */
  get def() {
    return /** @type {CreatureDef} */ (creatureDef(this.species));
  }

  /** Its maximum HP at its level. */
  get maxHp() {
    return this.stats.hp;
  }

  /** Its display name: the nickname, else the species' English name. */
  get name() {
    return this.nickname || this.def.name;
  }

  /** Is it out of HP? */
  get fainted() {
    return this.hp <= 0;
  }

  /** Its HP as a 0..1 fraction (1 for a full one; 1 when the max is 0). */
  get hpRatio() {
    return this.maxHp > 0 ? clamp(this.hp / this.maxHp, 0, 1) : 1;
  }

  /** Give it a nickname (or clear it with an empty one). @param {unknown} value @returns {string} */
  setNickname(value) {
    this.nickname = nickOf(value);
    return this.nickname;
  }

  /** Set the transient status id. @param {unknown} value @returns {string} */
  setStatus(value) {
    this.status = statusOf(value);
    return this.status;
  }

  /**
   * Heal `amount` HP (default: back to full). A level-up keeps the same fraction when it raises the
   * max.
   * @param {number} [amount]
   * @returns {number} the HP actually restored
   */
  heal(amount = this.maxHp) {
    const n = Math.max(0, Math.floor(num(amount) ?? this.maxHp));
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    return this.hp - before;
  }

  /**
   * Take `amount` damage (never below 0).
   * @param {number} amount
   * @returns {number} the HP actually lost
   */
  takeDamage(amount) {
    const n = Math.max(0, Math.floor(num(amount) ?? 0));
    const before = this.hp;
    this.hp = Math.max(0, this.hp - n);
    return before - this.hp;
  }

  /**
   * Gain `amount` experience, leveling up as the curve allows (a level-up keeps the HP gained with
   * the higher max). Stops at `MAX_LEVEL` (the extra experience is dropped). Move learning is the
   * caller's business: `gainXp` names the moves learned through `learnMoves` but does not itself
   * decide which to keep. A Souldoll Resonance (the Souldolls campaign) that fires on a level-up is
   * reported as `resonated`; the species change happens in `_resonate`, keeping the uid, nickname,
   * current-HP fraction and known moves.
   * @param {number} amount
   * @returns {{ levels: number, learned: string[], resonated: { from: string, to: string }|null }}
   */
  gainXp(amount) {
    const gain = Math.max(0, Math.floor(num(amount) ?? 0));
    /** @type {string[]} */
    const learned = [];
    let levels = 0;
    /** @type {{ from: string, to: string }|null} */
    let resonated = null;
    if (gain <= 0 || this.level >= MAX_LEVEL) return { levels, learned, resonated };
    this.exp += gain;
    while (this.level < MAX_LEVEL && this.exp >= xpToNext(this.level, this.def.growth)) {
      this.exp -= xpToNext(this.level, this.def.growth);
      this._levelUp();
      levels++;
      for (const id of this.learnMoves()) learned.push(id);
      const r = this._resonate();
      if (r) resonated = r;
    }
    if (this.level >= MAX_LEVEL) this.exp = 0;
    return { levels, learned, resonated };
  }

  /** One level up: the stats follow, and the HP gained with the higher max. */
  _levelUp() {
    const before = this.maxHp;
    this.level++;
    this.stats = statsAt(this.def, this.level);
    this.hp = clamp(this.hp + (this.maxHp - before), 0, this.maxHp);
  }

  /**
   * Resonate when the species' `resonates` level is reached: the identity becomes the next souldoll
   * (its stats re-derived at the same level, its HP scaled by the same fraction), the uid, nickname
   * and known moves stay. At most one resonance per call (a chain continues on the next level-up).
   * @returns {{ from: string, to: string }|null} the species pair, or null when none fired
   */
  _resonate() {
    const r = resonanceOf(this.species, this.level);
    if (!r) return null;
    const from = this.species;
    const wasFainted = this.fainted;
    const ratio = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    this.species = r.to;
    this.stats = statsAt(this.def, this.level);
    this.hp = clamp(Math.round(this.maxHp * ratio), wasFainted ? 0 : 1, this.maxHp);
    return { from, to: r.to };
  }

  /**
   * Whether the species' level-`level` learnset teaches `move` and it is not known yet.
   * @param {unknown} move
   * @param {number} [level] the level to test (default: its own)
   * @returns {boolean}
   */
  canLearn(move, level = this.level) {
    if (typeof move !== 'string' || !moveDef(move) || this.moves.includes(move)) return false;
    return this.def.learnset.some((e) => e.move === move && e.level <= level);
  }

  /**
   * Teach any learnset moves reached at its level it does not know, forgetting the oldest to stay
   * within `MAX_MOVES`.
   * @returns {string[]} the move ids taught
   */
  learnMoves() {
    /** @type {string[]} */
    const learned = [];
    for (const entry of this.def.learnset) {
      if (entry.level > this.level || this.moves.includes(entry.move) || !moveDef(entry.move)) continue;
      if (this.moves.length >= MAX_MOVES) this.moves.shift();
      this.moves.push(entry.move);
      learned.push(entry.move);
    }
    return learned;
  }

  /** The saved row (contract `CreatureRecord`). @returns {CreatureRecord} */
  toJSON() {
    return {
      uid: this.uid,
      species: this.species,
      ...(this.nickname ? { nickname: this.nickname } : {}),
      level: this.level,
      exp: this.exp,
      hp: this.hp,
      moves: [...this.moves],
    };
  }

  /**
   * One saved row read back, or null when it cannot be read (no uid, an unknown species): every
   * field is repaired against the species and level (a level out of range clamps, an exp or HP out
   * of range clamps, unknown moves are dropped).
   * @param {unknown} data
   * @returns {Creature|null}
   */
  static fromJSON(data) {
    if (!isPlain(data)) return null;
    const def = creatureDef(data.species);
    if (!def) return null;
    if (typeof data.uid !== 'string' || !data.uid || data.uid.length > UID_MAX) return null;
    const level = clampLevel(data.level);
    const stats = statsAt(def, level);
    const hp = data.hp === undefined ? stats.hp : clamp(Math.floor(num(data.hp) ?? stats.hp), 0, stats.hp);
    const exp = level >= MAX_LEVEL ? 0 : clamp(Math.floor(num(data.exp) ?? 0), 0, expCap(level, def.growth));
    return new Creature(def.id, {
      uid: data.uid,
      level,
      exp,
      hp,
      moves: movesKnown(def, level, data.moves),
      nickname: data.nickname,
    });
  }
}
