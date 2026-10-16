/**
 * CreatureBattle — the turn-based battle machine ("Critters Collection" plan §7, phase 4a). Pure
 * logic: no renderer, no DOM, no three.js, so a battle runs and replays in Node from a seeded `rng`
 * (`RNG`/`hash2` of src/engine/utils/math.js — never `Math.random()`). Damage, STAB, the type chart,
 * crits, accuracy, capture and experience all come from `./rules.js`; the enemy's choices from
 * `./ai.js`; the creatures from `./Creature.js`.
 *
 * The phases follow the plan: `intro → action → moveSelect → turnOrder → resolve → faint / capture
 * / switch → xp → levelUp → end`. `advance()` runs the work of the current phase and sets the next;
 * the menu phases (`action`, `moveSelect`, `switch`) wait for a choice. `hooks` exposes getters and
 * actions for tests (the shape of src/game/combat/hooks.js), without an engine or a clock:
 * `state()`, `chooseAction()`, `chooseMove()`, `chooseSwitch()`, `cancel()`, `forceFoeMove()`.
 *
 * A wild battle (`capture: true`) may be fled from and captured; an orb is spent through `onOrb()`
 * and counted by `orbCount()` (0 → the `noOrb` phase). Without a roster, switching is unavailable.
 *
 * @import { Creature } from './Creature.js'
 * @import { CreatureRoster } from './CreatureRoster.js'
 * @import { BattleOptions, BattlePhase, BattleAction, BattleState, BattleSide, BattleEvent, BattleOutcome, BattleHooks, BattleCreatureInfo, FoeAction, RngSource, Rand } from './types.js'
 */
import { moveDef } from './defs.js';
import { damage, damageRoll, catchChance, catchRoll, expYield, typeMultiplier, CRIT_CHANCE } from './rules.js';
import { asRng, chooseFoeAction } from './ai.js';

/**
 * The seeded chance to flee a wild battle: speed-based, rising with each failed attempt.
 * @param {Creature} player
 * @param {Creature} foe
 * @param {number} attempts
 * @returns {number} 0.1 .. 0.95
 */
export function runChance(player, foe, attempts = 1) {
  const ps = Math.max(1, player.stats.spd);
  const fs = Math.max(1, foe.stats.spd);
  const base = 0.4 + (ps - fs) / 200 + (attempts - 1) * 0.1;
  return base < 0.1 ? 0.1 : base > 0.95 ? 0.95 : base;
}

/**
 * A creature as a test / UI reads it.
 * @param {Creature} c
 * @returns {BattleCreatureInfo}
 */
export function creatureInfo(c) {
  return {
    uid: c.uid,
    species: c.species,
    name: c.name,
    type: c.def.type,
    level: c.level,
    hp: c.hp,
    maxHp: c.maxHp,
    hpRatio: c.hpRatio,
    fainted: c.fainted,
    moves: c.moves.slice(),
  };
}

export class CreatureBattle {
  /** @param {BattleOptions} opts */
  constructor({ player, foe, roster = null, capture = false, rng = null, orbCount = null, onOrb = null }) {
    if (!player || !foe) throw new Error('CreatureBattle: player and foe are required');
    /** The player's active creature. */
    this.player = player;
    /** The foe's active creature. */
    this.foe = foe;
    /** The player's party (switching and captures), or null. */
    this.roster = roster ?? null;
    /** Wild battle: capture and flee are unlocked. */
    this.capture = !!capture;
    /** @type {Rand} */
    this._rng = asRng(/** @type {RngSource} */ (rng));
    /** Remaining orbs, or null when uncounted (an unlimited throw). */
    this.orbCount = typeof orbCount === 'function' ? orbCount : null;
    /** Spends one orb when a throw happens. */
    this.onOrb = typeof onOrb === 'function' ? onOrb : null;
    /** The orb's capture multiplier. */
    this.orbTier = 1;
    /** @type {Creature[]|null} an optional enemy bench (trainer battles; a wild foe has none). */
    this.foeBench = null;

    /** @type {BattlePhase} */
    this.phase = 'intro';
    /** Turns resolved. */
    this.turn = 0;
    /** @type {BattleOutcome} */
    this.outcome = null;
    /** @type {string|null} the player's chosen move this turn. */
    this.playerMove = null;
    /** @type {string|null} the foe's chosen move this turn. */
    this.foeMove = null;
    /** @type {'move'|'switch'|null} what the foe does this turn. */
    this.foeAction = null;
    /** @type {string|null} the creature the foe switches in. */
    this.foeSwitchUid = null;
    /** @type {BattleSide[]} the sides that act this resolve, in order. */
    this.order = [];
    /** @type {BattleEvent[]} the whole battle log. */
    this.events = [];
    /** Experience the win granted. */
    this.xpGained = 0;
    /** Levels the win granted. */
    this.levelsGained = 0;
    /** @type {string[]} the moves learned on the win. */
    this.learned = [];
    /** @type {Creature|null} the creature captured. */
    this.caught = null;
    /** Orbs spent. */
    this.orbsUsed = 0;
    /** Flee attempts made. */
    this.runAttempts = 0;
    /** @type {string|null} a forced foe move (`forceFoeMove`), bypassing the AI. */
    this._forcedFoeMove = null;
    /** The current menu phase is a forced switch (a fainted active: the switch is free). */
    this._forced = false;
    /** Resolve this turn with the foe alone (after a switch, a failed run or a failed capture). */
    this._foeOnly = false;

    /** @type {BattleHooks} */
    this.hooks = makeHooks(this);
  }

  /** The seeded roll in [0, 1). */
  _next() {
    return this._rng.next();
  }

  /** @param {BattleEvent} ev */
  _event(ev) {
    this.events.push(ev);
  }

  /** The player's living party members other than the active one, in slot order. @returns {Creature[]} */
  _bench() {
    const active = this.roster ? this.roster.active : null;
    if (!active) return [];
    return active.filter((c) => c !== this.player && !c.fainted);
  }

  /** `intro → action`. @returns {BattleState} */
  begin() {
    if (this.phase === 'intro') this.phase = 'action';
    return this.state();
  }

  /**
   * Choose the player's menu action (`action` phase only). 'capture' and 'bag' both throw an orb;
   * a wild battle without orbs goes to `noOrb`. 'run' and 'capture' need `capture` (a wild foe).
   * @param {BattleAction} action
   * @returns {boolean} false: not now, or the action is not available
   */
  chooseAction(action) {
    if (this.phase !== 'action') return false;
    switch (action) {
      case 'fight':
        this.phase = 'moveSelect';
        return true;
      case 'pokemon':
        this._forced = false;
        this.phase = 'switch';
        return true;
      case 'run':
        if (!this.capture) return false;
        this.phase = 'run';
        return true;
      case 'capture':
      case 'bag':
        if (!this.capture) return false;
        if (this.orbCount && this.orbCount() <= 0) {
          this._event({ kind: 'noOrb' });
          this.phase = 'noOrb';
          return true;
        }
        this.phase = 'capture';
        return true;
      default:
        return false;
    }
  }

  /**
   * Choose the player's move (`moveSelect` phase only) and let the foe pick its action. Moves to
   * `turnOrder`.
   * @param {string} moveId
   * @returns {boolean} false: not now, or the creature does not know that move
   */
  chooseMove(moveId) {
    if (this.phase !== 'moveSelect') return false;
    if (typeof moveId !== 'string' || !moveDef(moveId) || !this.player.moves.includes(moveId)) return false;
    this.playerMove = moveId;
    this._pickFoeAction();
    this.phase = 'turnOrder';
    return true;
  }

  /**
   * Switch the player's active creature (`switch` phase only). A voluntary switch gives the foe its
   * turn; a switch after a faint is free and returns to `action`.
   * @param {string} uid
   * @returns {boolean} false: not now, or no such living party member
   */
  chooseSwitch(uid) {
    if (this.phase !== 'switch') return false;
    const next = this._bench().find((c) => c.uid === uid) ?? null;
    if (!next) return false;
    const from = this.player.uid;
    this.player = next;
    this._event({ kind: 'switch', side: 'player', uid: next.uid, from });
    if (this._forced) {
      this._forced = false;
      this.phase = 'action';
      return true;
    }
    this._pickFoeAction();
    this._foeOnly = true;
    this.phase = 'turnOrder';
    return true;
  }

  /**
   * Step back one menu (`moveSelect` → `action`, `switch` → `action`). A forced switch (the active
   * creature fainted and another must come in) cannot be cancelled. The battle menus are a stack of
   * at most two, so a plain return to `action` is the whole of it.
   * @returns {boolean} false: not a cancellable menu, or a forced switch
   */
  cancel() {
    if (this.phase === 'moveSelect') {
      this.phase = 'action';
      return true;
    }
    if (this.phase === 'switch') {
      if (this._forced) return false;
      this.phase = 'action';
      return true;
    }
    return false;
  }

  /**
   * Force the foe's move for the next resolve (tests). Passing null clears the force and returns to
   * the AI.
   * @param {string|null} moveId
   * @returns {boolean} false: the foe does not know that move
   */
  forceFoeMove(moveId) {
    if (moveId === null || moveId === undefined) {
      this._forcedFoeMove = null;
      return true;
    }
    if (typeof moveId !== 'string' || !moveDef(moveId) || !this.foe.moves.includes(moveId)) return false;
    this._forcedFoeMove = moveId;
    return true;
  }

  /**
   * Run the work of the current phase and set the next one. The menu phases (`action`,
   * `moveSelect`, `switch`) and `end` wait and do nothing.
   * @returns {BattleState}
   */
  advance() {
    switch (this.phase) {
      case 'intro':
        this.phase = 'action';
        break;
      case 'noOrb':
        this.phase = 'action';
        break;
      case 'turnOrder':
        this._planOrder();
        this.phase = 'resolve';
        break;
      case 'resolve':
        this._resolve();
        break;
      case 'faint':
        this._faint();
        break;
      case 'capture':
        this._capture();
        break;
      case 'run':
        this._run();
        break;
      case 'xp':
        this.phase = this.levelsGained > 0 ? 'levelUp' : 'end';
        if (this.phase === 'end') this._event({ kind: 'end', outcome: this.outcome });
        break;
      case 'levelUp':
        this.phase = 'end';
        this._event({ kind: 'end', outcome: this.outcome });
        break;
      default:
        break;
    }
    return this.state();
  }

  /** The foe's move, or a beneficial switch, this turn. */
  _pickFoeAction() {
    if (this._forcedFoeMove) {
      this.foeAction = 'move';
      this.foeMove = this._forcedFoeMove;
      this.foeSwitchUid = null;
      return;
    }
    const act = /** @type {FoeAction} */ (chooseFoeAction(this.foe, this.player, this.foeBench, this._rng));
    if (act.kind === 'switch') {
      this.foeAction = 'switch';
      this.foeSwitchUid = act.creature.uid;
      this.foeMove = null;
    } else {
      this.foeAction = 'move';
      this.foeMove = act.move;
      this.foeSwitchUid = null;
    }
  }

  /** Apply the foe's switch (the new active creature). @returns {boolean} */
  _foeSwap() {
    const next = (this.foeBench ?? []).find((c) => c.uid === this.foeSwitchUid) ?? null;
    if (!next) return false;
    const from = this.foe.uid;
    this.foe = next;
    this._event({ kind: 'switch', side: 'foe', uid: next.uid, from });
    return true;
  }

  /** Decide this turn's acting order (switches happen before attacks). */
  _planOrder() {
    const playerActs = !this._foeOnly && !!this.playerMove && !this.player.fainted;
    const foeAttacks = this.foeAction !== 'switch' && !!this.foeMove;
    /** @type {BattleSide[]} */
    const acts = [];
    if (playerActs) acts.push('player');
    if (foeAttacks) acts.push('foe');
    if (acts.length <= 1) {
      this.order = acts;
      return;
    }
    const pm = moveDef(this.playerMove);
    const fm = moveDef(this.foeMove);
    const pp = pm ? pm.priority : 0;
    const fp = fm ? fm.priority : 0;
    if (pp !== fp) {
      this.order = pp > fp ? ['player', 'foe'] : ['foe', 'player'];
      return;
    }
    const ps = this.player.stats.spd;
    const fs = this.foe.stats.spd;
    if (ps !== fs) {
      this.order = ps > fs ? ['player', 'foe'] : ['foe', 'player'];
      return;
    }
    this.order = this._next() < 0.5 ? ['player', 'foe'] : ['foe', 'player'];
  }

  /** Resolve the planned turn, then move to `faint` or back to `action`. */
  _resolve() {
    this.turn++;
    if (this.foeAction === 'switch') this._foeSwap();
    for (const side of this.order) {
      if (this.player.fainted || this.foe.fainted) break;
      if (side === 'player') {
        if (this.playerMove) this._useMove('player', this.playerMove);
      } else if (this.foeMove) {
        this._useMove('foe', this.foeMove);
      }
    }
    this._foeOnly = false;
    this._forced = false;
    this.playerMove = null;
    this.foeMove = null;
    this.foeAction = null;
    this.foeSwitchUid = null;
    this.phase = this.player.fainted || this.foe.fainted ? 'faint' : 'action';
  }

  /**
   * One creature uses a move: accuracy, crit and the seeded damage roll, all from `rules.js`.
   * @param {BattleSide} side
   * @param {string} moveId
   */
  _useMove(side, moveId) {
    const attacker = side === 'player' ? this.player : this.foe;
    const defender = side === 'player' ? this.foe : this.player;
    const move = moveDef(moveId);
    if (!move) return;
    if (move.accuracy < 100 && this._next() * 100 >= move.accuracy) {
      this._event({ kind: 'miss', side, move: moveId });
      return;
    }
    const stab = move.type === attacker.def.type;
    const crit = this._next() < CRIT_CHANCE;
    const roll = damageRoll(() => this._next());
    const effectiveness = typeMultiplier(move.type, defender.def.type);
    const dmg = damage({
      level: attacker.level,
      power: move.power,
      attack: attacker.stats.atk,
      defense: defender.stats.def,
      attackType: move.type,
      defenderType: defender.def.type,
      stab,
      crit,
      roll,
    });
    const dealt = defender.takeDamage(dmg);
    this._event({ kind: 'move', side, move: moveId, damage: dealt, crit, effectiveness, defender: defender.uid });
  }

  /** A faint: award the win, or switch to a living party member, or lose. */
  _faint() {
    const side = /** @type {BattleSide} */ (this.foe.fainted ? 'foe' : 'player');
    this._event({ kind: 'faint', side, uid: this.foe.fainted ? this.foe.uid : this.player.uid });
    if (this.foe.fainted) {
      this.outcome = 'win';
      this._awardXp();
      this.phase = 'xp';
      return;
    }
    if (this._bench().length) {
      this._forced = true;
      this.phase = 'switch';
      return;
    }
    this.outcome = 'lose';
    this._event({ kind: 'end', outcome: 'lose' });
    this.phase = 'end';
  }

  /** Give the player's active creature the foe's experience. */
  _awardXp() {
    const xp = expYield(this.foe.def.baseExp, this.foe.level);
    const res = this.player.gainXp(xp);
    this.xpGained = xp;
    this.levelsGained = res.levels;
    this.learned = res.learned;
    this._event({ kind: 'xp', xp, levels: res.levels, learned: res.learned });
  }

  /** Throw an orb (phase `capture`): spend it, roll, catch or give the foe its turn. */
  _capture() {
    if (this.orbCount && this.orbCount() <= 0) {
      this._event({ kind: 'noOrb' });
      this.phase = 'noOrb';
      return;
    }
    if (this.onOrb) this.onOrb();
    this.orbsUsed++;
    const chance = catchChance(this.foe.hpRatio, this.foe.def.catchRate, this.orbTier);
    const caught = catchRoll(this.foe.hpRatio, this.foe.def.catchRate, this.orbTier, () => this._next());
    if (caught) {
      this.caught = this.foe;
      if (this.roster) this.roster.add(this.foe);
      this.outcome = 'caught';
      this._event({ kind: 'capture', caught: true, chance });
      this._event({ kind: 'end', outcome: 'caught' });
      this.phase = 'end';
      return;
    }
    this._event({ kind: 'capture', caught: false, chance });
    this._pickFoeAction();
    this._foeOnly = true;
    this._planOrder();
    this.phase = 'resolve';
  }

  /** Try to flee (phase `run`): end on success, give the foe its turn on a failure. */
  _run() {
    this.runAttempts++;
    const chance = runChance(this.player, this.foe, this.runAttempts);
    if (this._next() < chance) {
      this.outcome = 'fled';
      this._event({ kind: 'run', success: true, chance });
      this._event({ kind: 'end', outcome: 'fled' });
      this.phase = 'end';
      return;
    }
    this._event({ kind: 'run', success: false, chance });
    this._pickFoeAction();
    this._foeOnly = true;
    this._planOrder();
    this.phase = 'resolve';
  }

  /** A snapshot for tests and UI. @returns {BattleState} */
  state() {
    return {
      phase: this.phase,
      turn: this.turn,
      outcome: this.outcome,
      player: creatureInfo(this.player),
      foe: creatureInfo(this.foe),
      order: this.order.slice(),
      events: this.events.slice(),
      xp: this.xpGained,
      levels: this.levelsGained,
      learned: this.learned.slice(),
      canCapture: this.capture,
      canRun: this.capture,
      orbs: this.orbCount ? this.orbCount() : null,
      caught: this.caught ? this.caught.uid : null,
      bench: this._bench().map((c) => creatureInfo(c)),
    };
  }
}

/**
 * `battle.hooks`, the test-facing surface of one battle (the shape of src/game/combat/hooks.js).
 * @param {CreatureBattle} battle
 * @returns {BattleHooks}
 */
export function makeHooks(battle) {
  return {
    state: () => battle.state(),
    phase: () => battle.phase,
    begin: () => battle.begin(),
    advance: () => battle.advance(),
    chooseAction: (action) => battle.chooseAction(action),
    chooseMove: (move) => battle.chooseMove(move),
    chooseSwitch: (uid) => battle.chooseSwitch(uid),
    cancel: () => battle.cancel(),
    forceFoeMove: (move) => battle.forceFoeMove(move),
    player: () => creatureInfo(battle.player),
    foe: () => creatureInfo(battle.foe),
    events: () => battle.events.slice(),
    system: battle,
  };
}
