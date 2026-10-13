/**
 * TouchControls — the on-screen D-pad and action cluster for the mobile layout
 * (docs/specs/INPUT_AND_CONTROLS.md §10, engine/core/DeviceMode.js). A sibling layer of the UI
 * root at z-index 5 (over the dialog, under the title), shown by CSS when `<html data-lu-layout=
 * "mobile">` and hidden with the HUD / title / photo-mode classes; it never sits in the art-scale
 * corner groups, so a shrunk root keeps full thumb-size buttons.
 *
 * Every button injects a **virtual gamepad code** into the page's `Input` with `setVirtualButton`
 * ('GamepadA' = confirm, 'GamepadB' = cancel, 'GamepadRT' = run, 'GamepadLB' / 'GamepadRB' = camera,
 * the d-pad 'GamepadDpad*'), so `padBindings` map them with no rebinding and combat levels can
 * extend them later. The d-pad is one element with a tracked pointer (diagonals with one thumb:
 * the dominant axis pair inside a dead zone); the action buttons are separate so two thumbs work
 * at once. `bindInput(input)` wires the page's Input; `onLayoutChange` releases every held code
 * when the layout leaves mobile. The component imports its own stylesheet and registers the
 * 'touch' string table (strings/touch.js) for the buttons' accessible names.
 */
import './touch.css';
import { t, registerStrings, hasStrings } from '../i18n/I18n.js';
import touch from '../i18n/strings/touch.js';
import { onLayoutChange } from '../core/DeviceMode.js';
import { GLYPHS } from './art/pieces.js';

/** @import { Input } from '../core/Input.js' */

/** The virtual gamepad code of each control (mapped by DEFAULT_PAD_BINDINGS). */
export const TOUCH_BUTTONS = Object.freeze({
  up: 'GamepadDpadUp',
  down: 'GamepadDpadDown',
  left: 'GamepadDpadLeft',
  right: 'GamepadDpadRight',
  confirm: 'GamepadA',
  cancel: 'GamepadB',
  run: 'GamepadRT',
  camLeft: 'GamepadLB',
  camRight: 'GamepadRB',
});

/** The d-pad's radial dead zone as a fraction of its half-size (below: no direction). */
const PAD_DEAD = 0.28;

/**
 * A GLYPHS row grid (kUp …) as an SVG path of whole pixels (same technique as HUD.js arrowPath).
 * @param {string} name a GLYPHS key ('kUp' | 'kDown' | 'kLeft' | 'kRight')
 * @returns {string}
 */
function glyphPath(name) {
  const rows = /** @type {string[]} */ (GLYPHS[name] ?? []);
  let d = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      if (row[x] !== 'o') { x++; continue; }
      let n = 1;
      while (row[x + n] === 'o') n++;
      d += `M${x} ${y}h${n}v1h-${n}z`;
      x += n;
    }
  });
  return d;
}

/** An arrow SVG of a GLYPHS grid. @param {string} name */
function arrowSvg(name) {
  return `<svg viewBox="0 0 7 7" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><path d="${glyphPath(name)}"/></svg>`;
}

/**
 * The on-screen touch layer. Created by the UI root (`ui.touch`); the page wires its Input with
 * `bindInput(engine.input)` once (Game.js). Buttons only speak to that Input — nothing else in
 * the engine knows about them.
 */
export class TouchControls {
  /**
   * @param {HTMLElement} parent the UI root (`.lu-root`)
   */
  constructor(parent) {
    if (!hasStrings('touch')) registerStrings('touch', touch);
    /** @type {Input|null} the page's Input (set by bindInput) */
    this.input = null;
    this._disposed = false;
    /** Codes currently held on screen, so a layout switch can release them. */
    this._held = new Set();
    /** @type {Map<string, HTMLButtonElement>} */
    this._btns = new Map();

    const el = document.createElement('div');
    el.className = 'lu-touch';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', t('touch.move'));
    this.element = el;

    // ---- the d-pad: one element, one tracked pointer, independent axes (diagonals) ----
    const pad = document.createElement('div');
    pad.className = 'lu-touch__pad';
    pad.setAttribute('aria-label', t('touch.move'));
    // the four sectors are visual; the code reads the pointer's offset from the centre
    for (const dir of /** @type {const} */ (['up', 'right', 'down', 'left'])) {
      const cell = document.createElement('span');
      cell.className = `lu-touch__pad-cell lu-touch__pad-cell--${dir}`;
      cell.setAttribute('aria-hidden', 'true');
      cell.innerHTML = arrowSvg({ up: 'kUp', right: 'kRight', down: 'kDown', left: 'kLeft' }[dir]);
      pad.appendChild(cell);
    }
    el.appendChild(pad);
    this._pad = pad;
    /** @type {number|null} the pointer driving the d-pad */
    this._padPointer = null;
    this._padDirs = { up: false, down: false, left: false, right: false };

    // ---- the action cluster ----
    const acts = document.createElement('div');
    acts.className = 'lu-touch__acts';
    /** face label | aria key | css modifier (size); the virtual code comes from TOUCH_BUTTONS */
    const spec = /** @type {const} */ ([
      { face: 'B', key: 'cancel', mod: 'b' },
      { face: 'A', key: 'confirm', mod: 'a' },
      { face: '«', key: 'camLeft', mod: 'cam' },
      { face: '»', key: 'camRight', mod: 'cam' },
      { face: '»»', key: 'run', mod: 'run' },
    ]);
    for (const { face, key, mod } of spec) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `lu-touch__btn lu-touch__btn--${mod}`;
      btn.setAttribute('aria-label', t(`touch.${key}`));
      btn.textContent = face;
      this._wireButton(btn, TOUCH_BUTTONS[/** @type {keyof typeof TOUCH_BUTTONS} */ (key)]);
      acts.appendChild(btn);
    }
    el.appendChild(acts);

    // long-press must never open the browser menu over the game
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    parent.appendChild(el);

    this._wirePad();

    // release every held code when the layout leaves mobile (a hot switch to desktop)
    this._offLayout = onLayoutChange((mode) => { if (mode !== 'mobile') this.releaseAll(); });
  }

  /**
   * Wire one action button: press on pointerdown (captured), release on up / cancel / leave /
   * a lost capture; a second finger on the same button is ignored (one pointer owns it).
   * @param {HTMLButtonElement} btn
   * @param {string} code the virtual gamepad code
   */
  _wireButton(btn, code) {
    this._btns.set(code, btn);
    /** @type {number|null} */
    let owner = null;
    const press = (/** @type {PointerEvent} */ e) => {
      if (owner !== null) return;
      owner = e.pointerId;
      try { btn.setPointerCapture(e.pointerId); } catch { /* capture unsupported: release on pointerup still works */ }
      e.preventDefault();
      this._press(code, btn);
    };
    const release = (/** @type {PointerEvent} */ e) => {
      if (owner !== e.pointerId) return;
      owner = null;
      try { btn.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      this._release(code, btn);
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    // a mouse press that never left the button (desktop preview of the layout)
    btn.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && owner === e.pointerId) release(e); });
    btn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this._press(code, btn); } });
    btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') this._release(code, btn); });
    btn.addEventListener('blur', () => { if (owner !== null) { owner = null; this._release(code, btn); } });
  }

  /**
   * Wire the d-pad: one pointer at a time, the offset from the centre decides the axes
   * (dead zone `PAD_DEAD`); pointermove slides a thumb between directions without lifting it.
   */
  _wirePad() {
    const pad = this._pad;
    pad.addEventListener('pointerdown', (e) => {
      if (this._padPointer !== null) return;
      this._padPointer = e.pointerId;
      try { pad.setPointerCapture(e.pointerId); } catch { /* capture unsupported */ }
      e.preventDefault();
      this._trackPad(e);
    });
    pad.addEventListener('pointermove', (e) => {
      if (this._padPointer !== e.pointerId) return;
      e.preventDefault();
      this._trackPad(e);
    });
    const end = (/** @type {PointerEvent} */ e) => {
      if (this._padPointer !== e.pointerId) return;
      this._padPointer = null;
      try { pad.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      this._clearPad();
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    pad.addEventListener('lostpointercapture', end);
  }

  /** Read the pointer's offset from the d-pad's centre and set the held directions. */
  _trackPad(e) {
    const r = this._pad.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const half = Math.min(r.width, r.height) / 2;
    const dx = (e.clientX - cx) / half;
    const dy = (e.clientY - cy) / half;
    const mag = Math.hypot(dx, dy);
    if (mag < PAD_DEAD) { this._clearPad(); return; }
    // independent axes: a diagonal needs both beyond the dead zone on their own side
    const nx = Math.abs(dx) >= PAD_DEAD ? (dx > 0 ? 'right' : 'left') : null;
    const ny = Math.abs(dy) >= PAD_DEAD ? (dy > 0 ? 'down' : 'up') : null;
    this._setPadDir('up', ny === 'up');
    this._setPadDir('down', ny === 'down');
    this._setPadDir('left', nx === 'left');
    this._setPadDir('right', nx === 'right');
  }

  /** Set one d-pad direction's virtual button. */
  _setPadDir(dir, on) {
    if (this._padDirs[dir] === on) return;
    this._padDirs[dir] = on;
    const code = TOUCH_BUTTONS[dir];
    if (on) this._press(code, null);
    else this._release(code, null);
    this._pad.classList.toggle(`is-${dir}`, on);
  }

  /** Release every d-pad direction. */
  _clearPad() {
    for (const dir of /** @type {const} */ (['up', 'down', 'left', 'right'])) this._setPadDir(dir, false);
  }

  /** @param {string} code @param {HTMLButtonElement|null} btn */
  _press(code, btn) {
    this._held.add(code);
    btn?.classList.add('is-down');
    this.input?.setVirtualButton(code, true);
  }

  /** @param {string} code @param {HTMLButtonElement|null} btn */
  _release(code, btn) {
    this._held.delete(code);
    btn?.classList.remove('is-down');
    this.input?.setVirtualButton(code, false);
  }

  /**
   * Wire the page's Input (once, from Game.js after both exist): every button writes its virtual
   * code there. Safe to call again with the same Input (no-op).
   * @param {Input} input
   */
  bindInput(input) {
    if (!input || this.input === input) return;
    this.input = input;
  }

  /** Let go of every button this layer holds (layout switch, dispose). */
  releaseAll() {
    this._clearPad();
    for (const code of [...this._held]) this._release(code, this._btns.get(code) ?? null);
    this._held.clear();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._offLayout?.();
    this.releaseAll();
    this.input = null;
    this._btns.clear();
    this.element.remove();
  }
}
