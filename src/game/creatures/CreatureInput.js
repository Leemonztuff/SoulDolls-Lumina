/**
 * CreatureInput — battle menu navigation ("Critters Collection" plan §6): turns the battle bindings
 * (or a test's virtual presses) into a small buffered action set and moves a menu cursor, the shape
 * of CombatInput (src/game/combat/CombatInput.js) without the combat guards. It reads the engine
 * `Input` only through its own bindings, so it holds no DOM or renderer and a battle can be scripted
 * exactly: a seeded `rng` plus fixed presses give the same turn every time.
 *
 * The battle UI registers the bindings with `input.addBindings(CREATURE_BINDINGS)` when a battle
 * opens (the names are declared in ExtraActions, ./types.d.ts); a peaceful level never sees them.
 *
 * @import { Input } from '../../engine/core/Input.js'
 */

/** Battle keyboard bindings (ExtraActions). Registered by the battle UI when a battle opens. */
export const CREATURE_BINDINGS = Object.freeze({
  creatureBattleUp: ['KeyW', 'ArrowUp'],
  creatureBattleDown: ['KeyS', 'ArrowDown'],
  creatureBattleLeft: ['KeyA', 'ArrowLeft'],
  creatureBattleRight: ['KeyD', 'ArrowRight'],
  creatureBattleConfirm: ['Space', 'Enter', 'KeyF'],
  creatureBattleCancel: ['Escape', 'Backspace'],
});

/** Hotkeys for creature UI (e.g. roster) */
export const CREATURE_HOTKEY_BINDINGS = Object.freeze({
  creatureRoster: ['KeyC'],
});

/** The battle menu actions, in binding order. @type {readonly string[]} */
export const CREATURE_BATTLE_ACTIONS = Object.freeze(Object.keys(CREATURE_BINDINGS));

/** Seconds a pressed edge waits in the buffer. */
export const BUFFER = 0.12;

export class CreatureInput {
  /** @param {Input} input */
  constructor(input) {
    /** The engine input (its battle bindings). */
    this.input = input;
    /**
     * Buffered seconds by action.
     * @type {Record<string, number>}
     */
    this.buffer = {};
    for (const a of CREATURE_BATTLE_ACTIONS) this.buffer[a] = 0;
    /** The menu cursor (the UI reads and clamps it). */
    this.index = 0;
    /** @type {'keyboard'|'gamepad'|null} the device of the latest edge, for tests. */
    this.lastDevice = null;
    /** @type {{ action: string, frames: number, started: boolean }[]} the virtual input queue. */
    this._virtual = [];
  }

  /**
   * A test's press: one edge now, the action held `frames` frames.
   * @param {string} action
   * @param {number} [frames]
   * @returns {boolean} false: not a battle action
   */
  press(action, frames = 1) {
    if (!CREATURE_BATTLE_ACTIONS.includes(action)) return false;
    this._virtual.push({ action, frames: Math.max(1, frames | 0), started: false });
    return true;
  }

  /**
   * The pressed edge of `action` this frame from real input (keyboard or pad).
   * @param {string} action
   * @returns {boolean}
   */
  _pressed(action) {
    const keys = this.input.bindings[action];
    if (keys) {
      for (let i = 0; i < keys.length; i++) if (this.input.wasPressed(keys[i])) return true;
    }
    const pad = this.input.padBindings[action];
    if (pad) {
      for (let i = 0; i < pad.length; i++) if (this.input.wasPressed(pad[i])) return true;
    }
    return false;
  }

  /** Once per frame, before reading: buffer the edges and age the virtual presses. */
  collect() {
    for (let i = 0; i < CREATURE_BATTLE_ACTIONS.length; i++) {
      const a = CREATURE_BATTLE_ACTIONS[i];
      if (this._pressed(a)) {
        this.buffer[a] = BUFFER;
        this.lastDevice = this.input.lastDevice === 'gamepad' ? 'gamepad' : 'keyboard';
      }
    }
    for (let i = this._virtual.length - 1; i >= 0; i--) {
      const v = this._virtual[i];
      if (!v.started) {
        v.started = true;
        if (this.buffer[v.action] <= 0) this.buffer[v.action] = BUFFER;
      }
      v.frames--;
      if (v.frames <= 0) this._virtual.splice(i, 1);
    }
  }

  /** Age the buffer (call once per frame). @param {number} dt */
  tick(dt) {
    for (let i = 0; i < CREATURE_BATTLE_ACTIONS.length; i++) {
      const a = CREATURE_BATTLE_ACTIONS[i];
      if (this.buffer[a] > 0) this.buffer[a] = Math.max(0, this.buffer[a] - dt);
    }
  }

  /** Is `action` waiting in the buffer? @param {string} action */
  has(action) {
    return (this.buffer[action] ?? 0) > 0;
  }

  /** Consume a buffered action. @param {string} action */
  take(action) {
    if ((this.buffer[action] ?? 0) <= 0) return false;
    this.buffer[action] = 0;
    return true;
  }

  /**
   * Move the cursor by the buffered vertical / horizontal edges, wrapped within `count`. Consumes
   * the edges it uses.
   * @param {number} count the number of items in the menu
   * @returns {boolean} whether the cursor moved
   */
  navigate(count) {
    if (count <= 0) return false;
    let moved = false;
    if (this.take('creatureBattleUp') || this.take('creatureBattleLeft')) {
      this.index = (this.index - 1 + count) % count;
      moved = true;
    }
    if (this.take('creatureBattleDown') || this.take('creatureBattleRight')) {
      this.index = (this.index + 1) % count;
      moved = true;
    }
    return moved;
  }

  /** Drop every buffered press. */
  clear() {
    for (let i = 0; i < CREATURE_BATTLE_ACTIONS.length; i++) this.buffer[CREATURE_BATTLE_ACTIONS[i]] = 0;
  }

  /** Everything back to a fresh state. */
  reset() {
    this.clear();
    this._virtual.length = 0;
    this.index = 0;
    this.lastDevice = null;
  }
}
