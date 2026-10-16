/**
 * Creature battle UI sandbox — the turn-based battle screen of `UI.enableCreature()`
 * (src/engine/ui/CreatureBattleHUD.js + src/game/creatures/creatureUI.js, the "Critters Collection"
 * phase 4b) driven by a real `CreatureBattle` (src/game/creatures/CreatureBattle.js) over the pixel
 * UI: the two framed stat panels, the 32 × 32 front sprites, the log window and the 2 × 2 action
 * menu / 2 × 2 moves / 1 · n party list, under the real `CreatureInput` bindings
 * (CREATURE_BINDINGS). A wild battle with three orbs against a Leafling: fight (emberpuff ×2 wins),
 * bag (throw an orb, catch or break free), party (switch to the level-7 Rippling), run.
 *
 * The page also proves the chunking: before `enableCreature()` there is no `.lu-creature` DOM (the
 * creature CSS is loaded only with the creature UI module). `?lang=` picks the language; the names,
 * menus and log lines then come from the 'creature' strings.
 *
 * Keys: WASD / arrows move the cursor · Space / Enter / F choose · Esc / Backspace cancel · 1 the
 * current action (Fight) · 2 Orbs (Bag) · 3 Party · 4 Run (when the menu is open) · G a canonical
 * scripted fight (no menu) · R a new battle · O auto on / off · H hide the overlay · C the self-test.
 * Handles for scripted checks (a `sandbox/creature_battle.json` may read them): window.__ui,
 * window.__creature.
 */
import { UI } from '../src/engine/ui/UI.js';
import { creatureUIClasses } from '../src/game/creatures/creatureUI.js';
import { Creature } from '../src/game/creatures/Creature.js';
import { CreatureRoster } from '../src/game/creatures/CreatureRoster.js';
import { CreatureBattle } from '../src/game/creatures/CreatureBattle.js';
import { CreatureInput, CREATURE_BINDINGS } from '../src/game/creatures/CreatureInput.js';
import { moveDef } from '../src/game/creatures/defs.js';
import { typeMultiplier } from '../src/game/creatures/rules.js';
import { ct } from '../src/game/creatures/strings.js';
import { createSpeciesSheet } from '../src/engine/pixel/CreatureSprites.js';
import { RNG } from '../src/engine/utils/math.js';

/**
 * @import { CreatureBattleHUD } from '../src/engine/ui/CreatureBattleHUD.js'
 * @import { BattleAction, BattleEvent, BattleState, BattleMenu, BattleMenuItem } from '../src/game/creatures/types.js'
 */

/** Seconds an automatic phase waits before it advances. */
const STEP = 0.55;
/** The phases that wait for a menu choice. */
const MENU_PHASES = ['action', 'moveSelect', 'switch'];
/** The main menu in reading order. @type {BattleAction[]} */
const ACTIONS = ['fight', 'bag', 'pokemon', 'run'];

// ---------------------------------------------------------------------------------------------
// Input: the part of the engine Input that CreatureInput reads (pressed edges, the bindings)
// ---------------------------------------------------------------------------------------------
class StubInput {
  constructor() {
    /** @type {Record<string, string[]>} */
    this.bindings = { ...CREATURE_BINDINGS };
    /** @type {Record<string, string[]>} */
    this.padBindings = {};
    /** @type {'keyboard'|'gamepad'} */
    this.lastDevice = 'keyboard';
    this._pressed = new Set();
    this._onDown = (/** @type {KeyboardEvent} */ e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this._pressed.add(e.code);
    };
    window.addEventListener('keydown', this._onDown);
  }
  /** @param {string} code */
  wasPressed(code) { return this._pressed.has(code); }
  endFrame() { this._pressed.clear(); }
}

// ---------------------------------------------------------------------------------------------
// UI + the creature overlay (proves the CSS is loaded only with the creature UI module)
// ---------------------------------------------------------------------------------------------
const ui = new UI(document.body);
/** `.lu-creature` nodes before the creature UI is enabled (must be 0; creature.css is a chunk). */
const nodesBefore = document.querySelectorAll('.lu-creature').length;
const input = new StubInput();
// the stub satisfies only what CreatureInput reads (its constructor is typed with the engine Input)
const ci = new CreatureInput(/** @type {any} */ (input));

UI.useCreatureUI(creatureUIClasses());
ui.enableCreature();
const hud = /** @type {CreatureBattleHUD} */ (ui.creature.hud);
// the overlay also drives the battle by click: a row picks, a tap on the backdrop cancels
hud.onSelect = (i) => choose(i);
hud.onCancel = () => { if (battle.phase !== 'action') battle.cancel(); };

// ---------------------------------------------------------------------------------------------
// A roster and the demo creatures (the play-test key; nothing is saved)
// ---------------------------------------------------------------------------------------------
const roster = new CreatureRoster({ test: true });
const partner = new Creature('rippling', { level: 7, hp: 18, nickname: 'Brook' });
const starter = new Creature('emberling', { level: 5 });
roster.active = [starter, partner];

const state = {
  orbs: 3,
  auto: true,
  stepT: 0,
  /** the phase seen last frame (a change resets the cursor) */
  phase: '',
  pSprite: '',
  fSprite: '',
  /** @type {number} */
  wins: 0,
  /** @type {number} */
  caught: 0,
  /** @type {number} */
  fled: 0,
  /** @type {number} */
  selections: 0,
  ready: false,
};

/** A new wild battle against a level-5 Leafling (seeded: deterministic). */
function newBattle() {
  const leader = roster.active.find((c) => !c.fainted) ?? roster.active[0] ?? null;
  if (leader) leader.heal();
  const b = new CreatureBattle({
    player: leader ?? new Creature('emberling', { level: 5 }),
    foe: new Creature('leafling', { level: 5 }),
    roster,
    capture: true,
    rng: new RNG(7),
    orbCount: () => state.orbs,
    onOrb: () => { state.orbs = Math.max(0, state.orbs - 1); },
  });
  b.begin();
  return b;
}
let battle = newBattle();

/** The 32 × 32 front-sheet frame 0, cached per species. @type {Map<string, HTMLCanvasElement>} */
const spriteCache = new Map();
/** @param {string} id */
function spriteOf(id) {
  let c = spriteCache.get(id);
  if (!c) {
    const sheet = createSpeciesSheet(id, { pose: 'front' });
    c = document.createElement('canvas');
    c.width = sheet.frameWidth;
    c.height = sheet.frameHeight;
    const g = c.getContext('2d');
    if (g) g.drawImage(sheet.canvas, 0, 0, sheet.frameWidth, sheet.frameHeight, 0, 0, c.width, c.height);
    spriteCache.set(id, c);
  }
  return c;
}

/** The display name of a creature (`nickname` else the translated species name). */
function displayName(c) {
  const nick = /** @type {{ nickname?: string }} */ (c).nickname;
  return (typeof nick === 'string' && nick ? nick : '') || ct(`species.${c.species}`, c.name);
}
/** @param {unknown} uid */
function nameOfUid(uid) {
  if (typeof uid !== 'string') return '';
  const c = roster.find(uid) ?? (battle.foe.uid === uid ? battle.foe : null);
  return c ? displayName(c) : '';
}
/** @param {unknown} id */
function moveName(id) {
  const m = typeof id === 'string' ? moveDef(id) : null;
  return ct(`move.${id}`, m ? m.name : String(id));
}

// ---------------------------------------------------------------------------------------------
// Menus / log (translated through the 'creature' strings; the HUD stays pure)
// ---------------------------------------------------------------------------------------------
/** @param {BattleState} st @returns {BattleMenu} */
function actionMenu(st) {
  /** @type {BattleMenuItem[]} */
  const items = [
    { label: ct('battle.fight', 'Fight') },
    { label: ct('battle.bag', 'Orbs') },
    { label: ct('battle.party', 'Party'), disabled: st.bench.length === 0 },
    { label: ct('battle.run', 'Run') },
  ];
  return { items, cursor: 0, cols: 2, back: false };
}
/** @returns {BattleMenu} */
function moveMenu() {
  const foeType = battle.foe.def.type;
  /** @type {BattleMenuItem[]} */
  const items = battle.player.moves.slice(0, 4).map((id) => {
    const m = moveDef(id);
    const mult = m ? typeMultiplier(m.type, foeType) : 1;
    return {
      label: ct(`move.${id}`, m ? m.name : id),
      sub: m ? String(m.power) : '',
      type: m && m.type !== 'neutral' ? m.type : undefined,
      eff: mult > 1 ? 1 : mult < 1 ? -1 : 0,
    };
  });
  return { items, cursor: 0, cols: 2, back: true };
}
/** @param {BattleState} st @returns {BattleMenu} */
function switchMenu(st) {
  /** @type {BattleMenuItem[]} */
  const items = st.bench.map((c) => ({
    label: ct(`species.${c.species}`, c.name),
    sub: ct('roster.level', 'Lv {n}', { n: c.level }),
  }));
  return { items, cursor: 0, cols: 1, back: true };
}

/** The translated log lines, newest at the bottom. @param {BattleEvent[]} events */
function logLines(events) {
  /** @type {string[]} */
  const out = [];
  const sideName = (side) => (side === 'player' ? displayName(battle.player) : displayName(battle.foe));
  for (const ev of events) {
    switch (ev.kind) {
      case 'move':
        out.push(ct('battle.used', '{name} used {move}!', { name: sideName(ev.side), move: moveName(ev.move) }));
        if (ev.crit) out.push(ct('battle.crit', 'A critical hit!'));
        if (typeof ev.effectiveness === 'number' && ev.effectiveness !== 1) {
          out.push(ev.effectiveness > 1 ? ct('battle.super', 'It’s super effective!') : ct('battle.weak', 'It’s not very effective…'));
        }
        break;
      case 'miss':
        out.push(ct('battle.miss', '{name}’s attack missed!', { name: sideName(ev.side) }));
        break;
      case 'switch':
        out.push(ct(ev.side === 'player' ? 'battle.go' : 'battle.foeIn',
          ev.side === 'player' ? 'Go, {name}!' : 'The wild {name} appeared!', { name: nameOfUid(ev.uid) }));
        break;
      case 'faint':
        out.push(ct('battle.fainted', '{name} fainted!', { name: nameOfUid(ev.uid) || sideName(ev.side) }));
        break;
      case 'capture':
        out.push(ev.caught
          ? ct('ui.caught', '{name} was caught!', { name: nameOfUid(ev.uid) || displayName(battle.foe) })
          : ct('battle.brokeFree', '{name} broke free!', { name: displayName(battle.foe) }));
        break;
      case 'run':
        out.push(ev.success ? ct('battle.gotAway', 'Got away safely!') : ct('battle.cantEscape', 'Couldn’t get away!'));
        break;
      case 'noOrb':
        out.push(ct('ui.noOrb', 'No orb'));
        break;
      case 'xp':
        out.push(ct('battle.xp', '{name} gained {n} EXP.', { name: displayName(battle.player), n: ev.xp ?? 0 }));
        break;
      default:
        break;
    }
  }
  return out;
}

/** The cursor's action at the current phase. @param {number} i */
function choose(i) {
  const st = battle.state();
  state.stepT = 0;
  if (battle.phase === 'action') {
    const action = ACTIONS[i];
    if (action) { battle.chooseAction(action); state.selections++; }
  } else if (battle.phase === 'moveSelect') {
    const id = battle.player.moves[i];
    if (id) { battle.chooseMove(id); state.selections++; }
  } else if (battle.phase === 'switch') {
    const info = st.bench[i];
    if (info) { battle.chooseSwitch(info.uid); state.selections++; }
  }
}

/** The sprites change only when a side's species does (setSprites copies). */
function syncSprites() {
  const ps = battle.player.species;
  const fs = battle.foe.species;
  if (ps !== state.pSprite || fs !== state.fSprite) {
    state.pSprite = ps;
    state.fSprite = fs;
    hud.setSprites({ player: spriteOf(ps), foe: spriteOf(fs) });
  }
}

// ---------------------------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------------------------
function tick(dt) {
  ci.collect();
  const st = battle.state();
  if (st.phase !== state.phase) {
    state.phase = st.phase;
    ci.index = 0;
    state.stepT = 0;
    if (st.outcome === 'win') state.wins++;
    if (st.outcome === 'caught') state.caught++;
    if (st.outcome === 'fled') state.fled++;
  }

  /** @type {BattleMenu|null} */
  let m = null;
  if (battle.phase === 'action') m = actionMenu(st);
  else if (battle.phase === 'moveSelect') m = moveMenu();
  else if (battle.phase === 'switch') m = switchMenu(st);
  if (m) {
    if (battle.phase !== 'action' && ci.take('creatureBattleCancel') && battle.cancel()) {
      // a cancel only ever steps back to `action`
      state.phase = battle.phase;
      ci.index = 0;
      m = actionMenu(st);
    }
    ci.navigate(m.items.length, { cols: m.cols, enabled: (i) => !m?.items[i]?.disabled });
    m = /** @type {BattleMenu} */ ({ ...m, cursor: ci.index });
    if (ci.take('creatureBattleConfirm')) { choose(ci.index); m = null; }
  } else if (battle.phase !== 'end' && state.auto) {
    state.stepT += dt;
    if (state.stepT >= STEP) { state.stepT = 0; battle.advance(); }
  }
  ci.tick(dt);

  // the page's own keys (R / O / H / C / G are not battle actions)
  if (input.wasPressed('KeyR')) { battle = newBattle(); hud.show(); }
  if (input.wasPressed('KeyO')) state.auto = !state.auto;
  if (input.wasPressed('KeyH')) { if (hud.visible) hud.hide(); else hud.show(); }
  if (input.wasPressed('KeyC')) console.table(checks());
  if (input.wasPressed('KeyG')) scriptedFight();

  syncSprites();
  const s = battle.state();
  hud.setState(s, { player: displayName(s.player), foe: displayName(s.foe) });
  hud.setLog(logLines(s.events));
  hud.setMenu(m);
}

/** The canonical deterministic fight (no menu): fight → emberpuff until it ends. @returns {string} */
function scriptedFight() {
  const b = new CreatureBattle({
    player: new Creature('emberling', { level: 5 }),
    foe: new Creature('leafling', { level: 5 }),
    capture: false,
    rng: new RNG(7),
  });
  b.begin();
  let guard = 0;
  while (b.phase !== 'end' && guard++ < 80) {
    if (b.phase === 'action') b.chooseAction('fight');
    else if (b.phase === 'moveSelect') b.chooseMove('emberpuff');
    else b.advance();
  }
  return String(b.outcome ?? b.phase);
}

let last = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tick(dt);
  input.endFrame();
}
requestAnimationFrame(frame);

const help = document.getElementById('help');
if (help) help.textContent = 'WASD / arrows move · Space / Enter / F pick · Esc cancel · G scripted fight · R new battle · O auto · H hide · C self-test';

ui.fontsReady.then(() => { state.ready = true; });
hud.show();

// ---------------------------------------------------------------------------------------------
// Readouts and self-test (the harness reads them via window.__creature)
// ---------------------------------------------------------------------------------------------
/**
 * Compare for a scripted check: a mismatch throws a page error (the harness exits 1).
 * @param {unknown} actual @param {unknown} expected @param {string} label @returns {string}
 */
function expect(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) return `ok ${label}: ${a}`;
  setTimeout(() => { throw new Error(`[creature_battle] ${label}: got ${a}, expected ${e}`); });
  return `FAIL ${label}: got ${a}, expected ${e}`;
}

/** DOM / battle summary for scripted checks. */
function info() {
  const r = (/** @type {string} */ sel) => document.querySelector(sel)?.getBoundingClientRect();
  const box = (/** @type {DOMRect|undefined} */ b) => (b ? [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] : null);
  return {
    visible: hud.visible,
    phase: battle.phase,
    outcome: battle.outcome,
    orbs: state.orbs,
    bench: battle.state().bench.length,
    menuItems: document.querySelectorAll('.lu-creature__item').length,
    selItems: document.querySelectorAll('.lu-creature__item.is-selected, .lu-creature__item.is-sel').length,
    disabledItems: document.querySelectorAll('.lu-creature__item.is-disabled').length,
    panes: document.querySelectorAll('.lu-creature__panel').length,
    spriteCount: document.querySelectorAll('.lu-creature__sprite').length,
    backdrop: !!document.querySelector('.lu-creature__backdrop'),
    hints: document.querySelectorAll('.lu-creature__hints .key').length,
    pane: box(r('.lu-creature__panel--player')),
    foePane: box(r('.lu-creature__panel--foe')),
    log: box(r('.lu-creature__log')),
    menu: box(r('.lu-creature__menu')),
    sprites: [...document.querySelectorAll('.lu-creature__sprite')].map((e) => `${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`).join(','),
    ...fitReport(),
    wins: state.wins, caught: state.caught, fled: state.fled, selections: state.selections,
  };
}

/**
 * Whether every battle box stays inside the screen's own art rectangle (the Fase 6 fit check): the
 * art size in art px (from `--px`) and the boxes that leave it.
 * @returns {{ artW: number, artH: number, inside: boolean, overflow: string[] }}
 */
function fitReport() {
  const root = document.querySelector('.lu-root');
  const stage = document.querySelector('.lu-creature__stage')?.getBoundingClientRect();
  const px = root ? parseFloat(getComputedStyle(root).getPropertyValue('--px')) || 1 : 1;
  if (!stage) return { artW: 0, artH: 0, inside: false, overflow: ['no stage'] };
  const artW = Math.round(stage.width / px), artH = Math.round(stage.height / px);
  const tol = 2;
  const inside = (/** @type {DOMRect} */ b) => b.left >= stage.left - tol && b.top >= stage.top - tol && b.right <= stage.right + tol && b.bottom <= stage.bottom + tol;
  /** @type {string[]} */
  const overflow = [];
  const named = {
    foePanel: '.lu-creature__panel--foe', playerPanel: '.lu-creature__panel--player',
    log: '.lu-creature__log', menu: '.lu-creature__menu',
  };
  for (const [name, sel] of Object.entries(named)) {
    const el = document.querySelector(sel);
    if (el && !inside(el.getBoundingClientRect())) overflow.push(name);
  }
  document.querySelectorAll('.lu-creature__sprite').forEach((el) => { if (!inside(el.getBoundingClientRect())) overflow.push('sprite'); });
  return { artW, artH, inside: overflow.length === 0, overflow };
}

/** The self-test: chunking, the drawn screen, and a deterministic scripted win. @returns {string[]} */
function checks() {
  /** @type {string[]} */
  const out = [];
  const add = (cond, label) => out.push(`${cond ? 'ok' : 'FAIL'} ${label}`);
  add(state.ready, 'fonts ready');
  add(nodesBefore === 0 && document.querySelectorAll('.lu-creature').length === 1, 'creature CSS/DOM only after enableCreature');
  const root = document.querySelector('.lu-creature');
  add(!!root && getComputedStyle(root).visibility === 'visible', 'overlay shown');
  add(document.querySelectorAll('.lu-creature__panel').length === 2, 'two stat panels');
  add(document.querySelectorAll('.lu-creature__sprite').length === 2, 'two sprites');
  add(document.querySelectorAll('.lu-creature__log').length === 1, 'the log window');
  const st = battle.state();
  add(st.phase === 'action' || st.phase === 'end', `a fresh battle waits at the menu (${st.phase})`);
  const fight = scriptedFight();
  add(fight === 'win', `scripted fire vs grass wins (${fight})`);
  // cancel(): `moveSelect` / `switch` step back to `action`, but `action` itself is not cancellable
  const cb = new CreatureBattle({
    player: new Creature('emberling', { level: 5 }),
    foe: new Creature('leafling', { level: 5 }),
    rng: new RNG(7),
  });
  cb.begin();
  const atAction = cb.phase;
  const backOnAction = cb.cancel();
  cb.chooseAction('fight');
  const atMoves = cb.phase;
  const backOnMoves = cb.cancel();
  const atActionAgain = cb.phase;
  add(atAction === 'action' && backOnAction === false, 'cancel is a no-op on the action menu');
  add(atMoves === 'moveSelect' && backOnMoves === true && atActionAgain === 'action', 'cancel steps moveSelect -> action');
  return out;
}

const handle = {
  battle, roster, ci, hud, state, info, checks, expect, scriptedFight, newBattle,
  displayName, moveName, logLines, moveDef, CREATURE_BINDINGS,
  Creature, CreatureBattle, RNG,
};

window.__ui = ui;
/** @type {typeof handle} */
Object.assign(window, { __creature: handle });