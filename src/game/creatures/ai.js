/**
 * Enemy battle AI ("Critters Collection" plan §7, phase 4a): pure functions that pick a foe's move
 * (the greatest expected damage, the plain type chart included) or a beneficial switch, every roll
 * from a seeded `rng`. No state, no side effects and no `Math.random()`: a battle replays exactly
 * from its seed (rules.js). The battle machine (`CreatureBattle.js`) is the one caller in the game;
 * the functions take plain `Creature`s and touch only `defs.js` / `rules.js`, so they run in Node.
 *
 * @import { Creature } from './Creature.js'
 * @import { Rand, RngSource, FoeAction } from './types.js'
 */
import { RNG } from '../../engine/utils/math.js';
import { moveDef } from './defs.js';
import { damage } from './rules.js';

/**
 * Normalize any random source to the `Rand` interface. An `RNG` is returned as it is, so its stream
 * advances exactly once per draw and the battle stays reproducible.
 * @param {RngSource} [rng]
 * @returns {Rand}
 */
export function asRng(rng) {
  if (typeof rng === 'function') {
    const next = rng;
    return {
      next,
      int: (a, b) => a + Math.floor(next() * (b - a + 1)),
      chance: (p) => next() < p,
      pick: (arr) => arr[Math.floor(next() * arr.length)],
    };
  }
  if (rng && typeof rng.next === 'function' && typeof rng.int === 'function' && typeof rng.pick === 'function') {
    return /** @type {Rand} */ (rng);
  }
  return new RNG(1);
}

/**
 * The damage `attacker` expects from `moveId` against `defender`: the rules.js damage (STAB and the
 * type chart already applied) times the move's hit chance. 0 for an unknown move or a status move.
 * The max roll and no crit, so it is the same number every time.
 * @param {Creature} attacker
 * @param {Creature} defender
 * @param {string} moveId
 * @returns {number}
 */
export function expectedDamage(attacker, defender, moveId) {
  const move = moveDef(moveId);
  if (!move || move.power <= 0) return 0;
  const dmg = damage({
    level: attacker.level,
    power: move.power,
    attack: attacker.stats.atk,
    defense: defender.stats.def,
    attackType: move.type,
    defenderType: defender.def.type,
    stab: move.type === attacker.def.type,
    crit: false,
    roll: 1,
  });
  return dmg * (Math.max(0, Math.min(100, move.accuracy)) / 100);
}

/**
 * The best expected damage `attacker` can deal `defender` with the moves it knows (0 without one).
 * @param {Creature} attacker
 * @param {Creature} defender
 * @returns {number}
 */
export function bestScore(attacker, defender) {
  let best = 0;
  for (const id of attacker.moves) {
    const s = expectedDamage(attacker, defender, id);
    if (s > best) best = s;
  }
  return best;
}

/** Moves within this fraction of the best expected damage are treated as interchangeable. */
export const MOVE_TIE_BAND = 0.1;
/** A bench creature must promise this much more damage than the active one to be worth switching. */
export const SWITCH_GAIN = 1.5;
/** The seeded chance a beneficial switch is actually taken (the AI is not perfectly predictable). */
export const SWITCH_CHANCE = 0.6;

/**
 * Pick the move with the greatest expected damage; among near-best moves (within `MOVE_TIE_BAND`) a
 * seeded `rng` chooses, so a battle with two good options varies but stays reproducible. Returns
 * null when the creature knows no move at all.
 * @param {Creature} attacker
 * @param {Creature} defender
 * @param {RngSource} [rng]
 * @returns {string|null}
 */
export function chooseMove(attacker, defender, rng) {
  const r = asRng(rng);
  const moves = attacker.moves.filter((id) => !!moveDef(id));
  if (!moves.length) return null;
  let best = -1;
  const scores = moves.map((id) => {
    const s = expectedDamage(attacker, defender, id);
    if (s > best) best = s;
    return { id, s };
  });
  if (best <= 0) return r.pick(moves);
  const band = best * (1 - MOVE_TIE_BAND);
  const top = scores.filter((e) => e.s >= band).map((e) => e.id);
  return top.length === 1 ? top[0] : r.pick(top);
}

/**
 * The bench creature that would do best against `foe`, when it is worth a switch: its best expected
 * damage must beat the active creature's by `SWITCH_GAIN`, and a seeded coin (`SWITCH_CHANCE`)
 * decides. Null: stay in (no bench, no gain, or the coin says no).
 * @param {Creature} active
 * @param {Creature} foe
 * @param {Creature[]} [bench]
 * @param {RngSource} [rng]
 * @returns {Creature|null}
 */
export function chooseSwitch(active, foe, bench, rng) {
  const r = asRng(rng);
  const alive = (bench ?? []).filter((c) => c && c !== active && !c.fainted);
  if (!alive.length) return null;
  const stay = bestScore(active, foe);
  /** @type {Creature|null} */
  let pick = null;
  let best = stay;
  for (const c of alive) {
    const s = bestScore(c, foe);
    if (s > best) {
      best = s;
      pick = c;
    }
  }
  if (!pick || best < stay * SWITCH_GAIN) return null;
  return r.chance(SWITCH_CHANCE) ? pick : null;
}

/**
 * The foe's action this turn: a beneficial switch when one exists, else the best move.
 * @param {Creature} foe
 * @param {Creature} player
 * @param {Creature[]|null} bench
 * @param {RngSource} [rng]
 * @returns {FoeAction}
 */
export function chooseFoeAction(foe, player, bench, rng) {
  const swap = chooseSwitch(foe, player, bench ?? [], rng);
  if (swap) return { kind: 'switch', creature: swap };
  return { kind: 'move', move: chooseMove(foe, player, rng) };
}
