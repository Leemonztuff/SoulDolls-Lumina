/**
 * Creature roster UI sandbox ("Critters Collection" phase 6) — the party / box panel of
 * `UI.enableCreature()` (src/engine/ui/CreatureRosterUI.js) wired to a real `CreatureRoster`
 * through the game adapter (src/game/creatures/rosterUI.js), over the pixel UI. No engine, no level:
 * the panel is a pure overlay driven by the same `UI.update` the game page runs.
 *
 * A roster with a party of one and a box of two; open with C, move with WASD / arrows, left / right
 * switch the party / box columns, Space confirms (a boxed creature opens Swap / Release, a party
 * member opens a release confirm), Esc backs out. Handles for scripted checks (a
 * `sandbox/creature_roster.json` reads them): window.__ui, window.__roster.
 */
import { UI } from '../src/engine/ui/UI.js';
import { DEFAULT_BINDINGS } from '../src/engine/core/Input.js';
import { creatureUIClasses } from '../src/game/creatures/creatureUI.js';
import { Creature } from '../src/game/creatures/Creature.js';
import { CreatureRoster } from '../src/game/creatures/CreatureRoster.js';
import { createRosterController } from '../src/game/creatures/rosterUI.js';

/**
 * The part of the engine Input that `UI.update` / the panel read: edge-pressed keys resolved to the
 * default action names. `consumeAction` (what the panel prefers) clears the matched keys.
 */
class StubInput {
  constructor() {
    /** @type {Set<string>} */
    this._pressed = new Set();
    /** @type {Record<string, readonly string[]>} */
    this._actions = DEFAULT_BINDINGS;
    this._onDown = (/** @type {KeyboardEvent} */ e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this._pressed.add(e.code);
    };
    window.addEventListener('keydown', this._onDown);
  }
  /** @param {string} name */
  actionPressed(name) {
    const codes = this._actions[name];
    return !!codes && codes.some((c) => this._pressed.has(c));
  }
  /** @param {string} name */
  consumeAction(name) {
    const was = this.actionPressed(name);
    if (was) for (const c of this._actions[name] ?? []) this._pressed.delete(c);
    return was;
  }
  /** @param {string} code */
  wasPressed(code) { return this._pressed.has(code); }
  endFrame() { this._pressed.clear(); }
}

const ui = new UI(document.body);
/** `.lu-creature-roster` nodes before the creature UI is enabled (must be 0; creature.css is a chunk). */
const nodesBefore = document.querySelectorAll('.lu-creature-roster').length;
const input = new StubInput();

UI.useCreatureUI(creatureUIClasses());
const { roster: panel } = ui.enableCreature();
if (!panel) throw new Error('creature_roster: no roster panel (UI.enableCreature)');

const roster = new CreatureRoster({ test: true });
roster.active = [new Creature('emberling', { level: 5, nickname: 'Cinder' })];
roster.box = [new Creature('leafling', { level: 3 }), new Creature('rippling', { level: 7, hp: 18, nickname: 'Brook' })];

/** How many swap / release actions the adapter applied. */
let changed = 0;
const controller = createRosterController({
  roster,
  panel,
  onChanged: () => { changed++; },
  onSound: () => {},
});

// ---------------------------------------------------------------------------------------------
// Loop: run the panel through the same `UI.update` the game page does
// ---------------------------------------------------------------------------------------------
let last = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // the free roster hotkey (the panel itself reads only cancel / directions / confirm)
  if (input.wasPressed('KeyC')) { if (panel.isOpen) controller.close(); else controller.open(); }
  ui.update(dt, { input });
  input.endFrame();
}
requestAnimationFrame(frame);

ui.fontsReady.then(() => { controller.open(); });

// ---------------------------------------------------------------------------------------------
// Readouts and self-test (the harness reads them via window.__roster)
// ---------------------------------------------------------------------------------------------
/**
 * Compare for a scripted check: a mismatch throws a page error (the harness exits 1).
 * @param {unknown} actual @param {unknown} expected @param {string} label @returns {string}
 */
function expect(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) return `ok ${label}: ${a}`;
  setTimeout(() => { throw new Error(`[creature_roster] ${label}: got ${a}, expected ${e}`); });
  return `FAIL ${label}: got ${a}, expected ${e}`;
}

/** DOM / roster summary for scripted checks. */
function info() {
  const root = document.querySelector('.lu-creature-roster');
  return {
    visible: !!root && getComputedStyle(root).visibility === 'visible',
    open: panel.isOpen,
    active: roster.active.length,
    box: roster.box.length,
    rows: document.querySelectorAll('.lu-creature-roster__row').length,
    emptyRows: document.querySelectorAll('.lu-creature-roster__row--empty').length,
    sprites: document.querySelectorAll('.lu-creature-roster__sprite').length,
    selRows: document.querySelectorAll('.lu-creature-roster__row.is-sel').length,
    modals: document.querySelectorAll('.lu-creature-roster__modal').length,
    changed,
  };
}

/** The self-test: chunking, the drawn panel, and the two columns. @returns {string[]} */
function checks() {
  /** @type {string[]} */
  const out = [];
  const add = (cond, label) => out.push(`${cond ? 'ok' : 'FAIL'} ${label}`);
  add(nodesBefore === 0 && document.querySelectorAll('.lu-creature-roster').length === 1, 'creature CSS/DOM only after enableCreature');
  add(panel.isOpen, 'the panel is open');
  add(document.querySelectorAll('.lu-creature-roster__sprite').length >= 3, 'a sprite per creature');
  add(document.querySelectorAll('.lu-creature-roster__row.is-sel').length === 1, 'exactly one selected row');
  add(document.querySelectorAll('.lu-creature-roster__modal').length === 0, 'no modal in the list state');
  return out;
}

const handle = {
  ui, roster, panel, controller, input, expect, info, checks,
  open: () => controller.open(),
  close: () => controller.close(),
  state: () => ({ open: panel.isOpen, ...info() }),
};

window.__ui = ui;
/** @type {typeof handle} */
Object.assign(window, { __roster: handle });
