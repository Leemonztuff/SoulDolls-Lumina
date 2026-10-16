import './ui.css';
import './creature.css';
import { pal } from './art/palette.js';
import { art, copyCanvas } from './art/painter.js';
import { bar } from './art/pieces.js';
import { icon as creatureIcon, TYPE_ICONS } from './art/icons/creature.js';
import { txt, measure, fit, lines, cjk, FONT } from './layout/type.js';
import { box, put, win, key } from './layout/layout.js';
import { onScale, currentScale } from './UiScale.js';
import { currentFonts } from './FontLoader.js';

/**
 * CreatureBattleHUD — the turn-based creature battle screen ("Critters Collection" phase 4b), drawn
 * after mockup G (docs/specs/PIXEL_UI.md §5): a full-screen overlay with the foe's framed stat
 * panel and the player's, the two 32 × 32 sprites, the log window and the action menu (a 2 × 2 grid,
 * or a vertical list for the party). Created by `creatureUIClasses()` and enabled through
 * `UI.enableCreature()`.
 *
 * It is a *view*: it owns no battle rules and, like every engine UI module, must not import
 * `src/game/` (the caller inlines the state and the translated strings). The caller pushes in what
 * to show — `setState(battle.state(), { player, foe })`, `setLog(strings)`, `setMenu({ items,
 * cursor, cols })`, `setCursor(i)`, `setSprites({ player, foe })` — and receives `onSelect(i)` /
 * `onCancel`. Every setter is cheap: it writes the DOM only when its signature changes.
 *
 * The battle fills the room it is given (`_layout`): every box is measured in art px of the
 * screen's own `artW` × `artH` and can never leave it. Two arrangements — **wide** (the diagonal
 * stage: the foe's panel top-left, the player's bottom-right, the sprites between them, the log and
 * the menu along the foot) and **tall** (a single centred column: foe panel, foe sprite, player
 * sprite, player panel, log, menu) for portrait and small screens. Nothing is placed at a fixed
 * size that the screen cannot hold, so a 640 × 360 screen and a 400 × 800 phone both fit.
 *
 * Sprites come in already cropped (e.g. `createSpeciesSheet(id, { pose: 'front' })` frame 0,
 * 32 × 32) and are copied, so the caller keeps its canvas.
 */

/** The type icons as an indexable record (the ids are checked against TYPE_ICONS at use). */
const TYPE_ICON = /** @type {Record<string, string>} */ (TYPE_ICONS);

/**
 * One side of a battle as the HUD reads it (a subset of BattleCreatureInfo, no `src/game` import).
 * @typedef {object} BattleSideView
 * @property {string} uid
 * @property {string} name
 * @property {string} [type]
 * @property {number} level
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} [hpRatio] HP as a 0..1 fraction (computed from hp / maxHp when absent)
 * @property {boolean} [fainted]
 * @property {Record<string, string|number>} [parts]
 * @property {Record<string, string|number>} [paperdoll]
 */

/**
 * A battle snapshot as the HUD reads it (a subset of BattleState, no `src/game` import).
 * @typedef {object} BattleView
 * @property {string} [phase]
 * @property {string} [terrain]
 * @property {BattleSideView} player
 * @property {BattleSideView} foe
 */

/**
 * A menu item (`setMenu`): `label` the shown text (translated by the caller), `sub` an optional
 * right-aligned note (a move's power), `type` an optional `CreatureType` id (a move's type icon),
 * `eff` an optional effectiveness against the foe (1 super effective, -1 not very; a marker is
 * drawn), `disabled` a refused row.
 * @typedef {object} MenuItem
 * @property {string} label
 * @property {string} [sub]
 * @property {string} [type]
 * @property {number} [eff]
 * @property {boolean} [disabled]
 */

/**
 * A menu (`setMenu`): `items` in reading order, `cols` 2 for the 2 × 2 grid (the main menu, moves)
 * or 1 for the vertical list (the party), `cursor` the selected index, `back` whether a cancel
 * returns to the previous menu (a Back keycap and a backdrop tap call `onCancel`).
 * @typedef {object} BattleMenu
 * @property {MenuItem[]} items
 * @property {number} [cursor]
 * @property {1|2} [cols]
 * @property {boolean} [back]
 */

/**
 * The battle's geometry for a screen of `artW` × `artH` art px (every box is a part of it). The
 * boxes are `{ x, y, w, h }`, the sprite anchors a centre `{ x, y, k }` (`k` art px per canvas px).
 * @typedef {object} BattleLayout
 * @property {number} artW
 * @property {number} artH
 * @property {'wide'|'tall'} mode
 * @property {number} pad
 * @property {number} gap
 * @property {1|2} cols
 * @property {number} menuPad
 * @property {number} itemH
 * @property {boolean} canBack
 * @property {{ x: number, y: number, w: number, h: number } | null} hint
 * @property {{ x: number, y: number, w: number, h: number }} foe
 * @property {{ x: number, y: number, w: number, h: number }} player
 * @property {{ x: number, y: number, w: number, h: number }} log
 * @property {{ x: number, y: number, w: number, h: number }} menu
 * @property {{ x: number, y: number, k: number }} foeSprite
 * @property {{ x: number, y: number, k: number }} playerSprite
 */

export class CreatureBattleHUD {
  /**
   * @param {HTMLElement} parent the UI root (the HUD appends its overlay to it)
   * @param {{ onSelect?: ((index: number) => void) | null, onCancel?: (() => void) | null }} [o]
   */
  constructor(parent, { onSelect = null, onCancel = null } = {}) {
    this.parent = parent;
    this.onSelect = onSelect;
    this.onCancel = onCancel;
    this._disposed = false;

    this.element = document.createElement('div');
    this.element.className = 'lu-creature';
    parent.append(this.element);

    /** @type {BattleView|null} */
    this._state = null;
    /** @type {{ player?: string, foe?: string }} */
    this._display = {};
    /** @type {{ player: HTMLCanvasElement|null, foe: HTMLCanvasElement|null }} */
    this._sprites = { player: null, foe: null };
    this._spriteV = 0;
    /** @type {string[]} */
    this._log = [];
    /** @type {BattleMenu|null} */
    this._menu = null;
    /** The backdrop of the current build (a tap that misses every control cancels the menu). */
    /** @type {HTMLElement|null} */
    this._backdrop = null;
    this._sig = '\u0000';
    this._visible = false;

    this.element.addEventListener('pointerdown', (e) => {
      const el = e.target instanceof Element ? e.target.closest('.lu-creature__item') : null;
      if (el) {
        if (el.classList.contains('is-disabled')) return;
        const i = Number(el instanceof HTMLElement ? el.dataset.index : NaN);
        if (Number.isInteger(i)) this.onSelect?.(i);
        return;
      }
      // a tap that misses every control falls on the backdrop: cancel the current menu
      if (e.target === this._backdrop && this._menu && this._menu.back !== false) this.onCancel?.();
    });

    this._offScale = onScale(this.element, () => this._render(true));
    currentFonts()?.ready.then(() => { if (!this._disposed) this._render(true); });
  }

  /** Whether the overlay is shown. */
  get visible() { return this._visible; }

  /**
   * Show the battle snapshot (kept; re-rendered only when it changes).
   * @param {BattleView|null} state
   * @param {{ player?: string, foe?: string }} [display] translated names (default: the state's)
   */
  setState(state, display = {}) {
    this._state = state;
    this._display = display || {};
    this._render();
  }

  /**
   * The two already-cropped sprite canvases (copied; null hides that side).
   * @param {{ player?: HTMLCanvasElement|null, foe?: HTMLCanvasElement|null }} [o]
   */
  setSprites({ player = null, foe = null } = {}) {
    this._sprites = { player: player ? copyCanvas(player) : null, foe: foe ? copyCanvas(foe) : null };
    this._spriteV++;
    this._render();
  }

  /**
   * The log's lines, newest at the bottom (already-translated strings; at most two rows show).
   * @param {string[]} [lines_] the lines
   */
  setLog(lines_ = []) {
    this._log = Array.isArray(lines_) ? lines_.map(String) : [];
    this._render();
  }

  /**
   * The action menu, or null to close it.
   * @param {BattleMenu|null} [menu]
   */
  setMenu(menu = null) {
    this._menu = menu && Array.isArray(menu.items) ? menu : null;
    this._render();
  }

  /** Move the menu cursor (ignored without a menu). @param {number} index */
  setCursor(index) {
    if (!this._menu) return;
    this._menu = { ...this._menu, cursor: index };
    this._render();
  }

  /** Show the overlay. */
  show() {
    if (this._visible) return;
    this._visible = true;
    this.element.classList.add('is-on');
  }

  /** Hide the overlay. */
  hide() {
    if (!this._visible) return;
    this._visible = false;
    this.element.classList.remove('is-on');
  }

  dispose() {
    this._disposed = true;
    this._offScale?.();
    this.element.remove();
  }

  // --------------------------------------------------------------------------------------------
  // Geometry (the battle fills the room it is given; nothing may leave it)
  // --------------------------------------------------------------------------------------------

  /**
   * The battle's geometry for a screen of `artW` × `artH` art px, guaranteed to stay inside it.
   * **wide**: the diagonal stage (foe panel top-left, player panel bottom-right, the sprites in the
   * band between them, the log and the menu along the foot). **tall**: a single centred column
   * (foe panel, foe sprite, player sprite, player panel, log, menu) for portrait and small screens.
   * The foot stack (menu + log + hint strip) is built bottom-up; the tallest block that cannot fit
   * is shrunk until the column fits.
   * @param {number} artW
   * @param {number} artH
   * @returns {BattleLayout}
   */
  _layout(artW, artH) {
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const pad = clamp(Math.floor(Math.min(artW, artH) * 0.045), 6, 16);
    const gap = Math.max(3, Math.round(pad * 0.45));
    // wide needs two panels' width and a little more height than a phone
    const wide = artW >= 380 && artW >= artH;
    const contentW = Math.max(80, Math.min(artW - pad * 2, 560));
    const cx = Math.round(artW / 2);
    const left = Math.max(0, Math.round((artW - contentW) / 2));

    const m = this._menu;
    const cols = /** @type {1|2} */ (m?.cols === 1 ? 1 : 2);
    const items = m?.items?.length || 0;
    const menuPad = Math.max(4, Math.round(pad * 0.6));
    const menuRows = items > 0 ? Math.ceil(items / cols) : 0;
    const menuW = Math.min(contentW, cols === 1 ? 340 : 400);
    const logW = Math.min(contentW, 400);
    const canBack = !!m && m.back !== false;

    if (wide) {
      const panelH = clamp(Math.round(artH * 0.13), 44, 54);
      const panelW = Math.min(328, contentW);
      const itemH = clamp(Math.round(artH * 0.07), 20, 28);
      const menuH = items > 0 ? menuPad * 2 + menuRows * itemH : 0;
      const logH = clamp(Math.round(artH * 0.13), 26, 48);
      const hints = items > 0 && artH >= 260;
      const hintH = hints ? clamp(Math.round(artH * 0.04), 12, 16) : 0;
      const footGap = hints ? gap : 0;

      const menuY = artH - pad - hintH - footGap - menuH;
      const menu = { x: cx - Math.round(menuW / 2), y: menuY, w: menuW, h: menuH };
      const log = { x: cx - Math.round(logW / 2), y: menuY - (menuH > 0 ? gap : 0) - logH, w: logW, h: logH };
      const player = { x: left + contentW - panelW, y: log.y - gap - panelH, w: panelW, h: panelH };
      const foe = { x: left, y: pad, w: panelW, h: panelH };
      // the band between the panels: both sprites stand on one line (foe right, player left),
      // scaled to fit it — never over the frames
      const bandTop = foe.y + foe.h + gap;
      const bandBot = Math.max(bandTop + 20, player.y - gap);
      const k = clamp(Math.floor((bandBot - bandTop) / 32), 1, 4);
      const spriteY = Math.round((bandTop + bandBot) / 2);
      const foeSprite = { x: left + Math.round(contentW * 0.70), y: spriteY, k };
      const playerSprite = { x: left + Math.round(contentW * 0.30), y: spriteY, k };
      const hint = hints ? { x: left, y: artH - pad - hintH, w: contentW, h: hintH } : null;
      return { artW, artH, mode: 'wide', pad, gap, cols, menuPad, itemH, canBack, hint,
        foe, player, log, menu, foeSprite, playerSprite };
    }

    // tall: one centred column (foe panel, foe sprite, player sprite, player panel, log, menu),
    // shrunk until the column fits the screen
    const panelW = Math.min(contentW, 340);
    let panelH = clamp(Math.round(artH * 0.11), 40, 54);
    let logH = clamp(Math.round(artH * 0.15), 24, 56);
    let itemH = clamp(Math.round(artH * 0.07), 18, 26);
    let k = clamp(Math.floor((artH * 0.22) / 32), 1, 3);
    let g = gap;
    const menuH = () => (items > 0 ? menuPad * 2 + menuRows * itemH : 0);
    const avail = artH - pad * 2;
    const total = () => panelH * 2 + k * 32 * 2 + logH + menuH() + g * 5;
    for (let pass = 0; pass < 60 && total() > avail; pass++) {
      if (k > 1) k--;
      else if (panelH > 34) panelH -= 2;
      else if (logH > 20) logH -= 2;
      else if (itemH > 18) itemH -= 2;
      else if (g > 2) g--;
      else break;
    }
    const colX = Math.max(0, Math.round((artW - panelW) / 2));
    let y = pad + Math.max(0, Math.round((avail - total()) / 2));
    const foe = { x: colX, y, w: panelW, h: panelH };
    y += panelH + g;
    const foeSprite = { x: cx, y: y + k * 16, k };
    y += k * 32 + g;
    const playerSprite = { x: cx, y: y + k * 16, k };
    y += k * 32 + g;
    const player = { x: colX, y, w: panelW, h: panelH };
    y += panelH + g;
    const log = { x: colX, y, w: panelW, h: logH };
    y += logH + g;
    const menu = { x: Math.max(0, Math.round((artW - menuW) / 2)), y, w: menuW, h: menuH() };
    return { artW, artH, mode: 'tall', pad, gap: g, cols, menuPad, itemH, canBack, hint: null,
      foe, player, log, menu, foeSprite, playerSprite };
  }

  // --------------------------------------------------------------------------------------------
  // Rendering (a full rebuild on a change; cheap while nothing moves)
  // --------------------------------------------------------------------------------------------

  /** The change key: a rebuild happens only when it differs (`_render(true)` forces one). @param {boolean} [force] */
  _render(force = false) {
    if (this._disposed) return;

    const sc = currentScale(this.element);
    const fbW = Math.floor((this.element.clientWidth || window.innerWidth) / (sc?.cssPx || 2)) || 640;
    const fbH = Math.floor((this.element.clientHeight || window.innerHeight) / (sc?.cssPx || 2)) || 360;
    const artW = Math.max(1, Math.round(sc?.artW || fbW));
    const artH = Math.max(1, Math.round(sc?.artH || fbH));

    const sig = this._signature(artW, artH);
    if (!force && sig === this._sig) return;
    this._sig = sig;

    const k = pal();
    this.element.textContent = '';
    const back = document.createElement('div');
    back.className = 'lu-creature__backdrop';
    this._backdrop = back;
    this.element.append(back);

    const stage = box(this.element, 0, 0, artW, artH, 'lu-creature__stage');
    const layout = this._layout(artW, artH);

    const st = this._state;
    if (st) {
      this._renderBackground(stage, st, k, layout);
      this._renderPanels(stage, st, k, layout);
      this._renderSprites(stage, st, layout);
      this._renderLog(stage, k, layout);
      if (layout.menu.h > 0) this._renderMenu(stage, k, layout);
      if (layout.hint) this._renderHints(stage, k, layout);
    }
  }

  /**
   * Render dynamic 2D battle scene background and ground platforms across the whole stage.
   * @param {Element} stage
   * @param {BattleView} st
   * @param {ReturnType<typeof pal>} k
   * @param {BattleLayout} layout
   */
  _renderBackground(stage, st, k, layout) {
    const artW = layout.artW, artH = layout.artH;
    const foeCx = layout.foeSprite.x, foeCy = layout.foeSprite.y;
    const playerCx = layout.playerSprite.x, playerCy = layout.playerSprite.y;
    const foeR = 18 * layout.foeSprite.k, playerR = 20 * layout.playerSprite.k;

    const terrain = (st.terrain || st.foe?.type || 'heath').toLowerCase();
    const horizonY = Math.max(1, Math.round(foeCy + (playerCy - foeCy) * 0.4));

    const bgCanvas = art(artW, artH, (p) => {
      if (terrain.includes('fen') || terrain.includes('water') || terrain.includes('shore')) {
        // --- Fen / Swamp / Water Environment ---
        for (let y = 0; y < horizonY; y++) {
          const ratio = y / horizonY;
          const r = Math.round(10 + ratio * 15);
          const g = Math.round(25 + ratio * 35);
          const b = Math.round(40 + ratio * 35);
          p.hline(0, y, artW, `rgb(${r},${g},${b})`);
        }
        for (let x = 0; x < artW; x++) {
          const h = Math.sin(x * 0.01) * 15 + Math.cos(x * 0.025) * 8 + (horizonY - 20);
          p.vline(x, Math.floor(h), horizonY - Math.floor(h), '#133a3a');
        }
        for (let y = horizonY; y < artH; y++) {
          const ratio = (y - horizonY) / Math.max(1, artH - horizonY);
          const r = Math.round(12 + ratio * 8);
          const g = Math.round(38 + ratio * 20);
          const b = Math.round(48 + ratio * 25);
          p.hline(0, y, artW, `rgb(${r},${g},${b})`);
        }

        p.circle(foeCx, foeCy, foeR, '#0f2928');
        p.circle(foeCx, foeCy - 2, foeR - 4, '#18423f');
        p.circle(foeCx, foeCy - 4, foeR - 8, '#235955');

        p.circle(playerCx, playerCy, playerR, '#0f2928');
        p.circle(playerCx, playerCy - 3, playerR - 4, '#18423f');
        p.circle(playerCx, playerCy - 6, playerR - 8, '#235955');

      } else if (terrain.includes('cavern') || terrain.includes('earth') || terrain.includes('iron') || terrain.includes('mountains')) {
        // --- Cavern / Subterranean Environment ---
        for (let y = 0; y < artH; y++) {
          const ratio = y / Math.max(1, artH);
          const r = Math.round(15 + ratio * 15);
          const g = Math.round(18 + ratio * 18);
          const b = Math.round(28 + ratio * 28);
          p.hline(0, y, artW, `rgb(${r},${g},${b})`);
        }

        p.circle(foeCx, foeCy, foeR, '#0f172a');
        p.circle(foeCx, foeCy - 2, foeR - 4, '#1e293b');
        p.circle(foeCx, foeCy - 4, foeR - 8, '#334155');

        p.circle(playerCx, playerCy, playerR, '#0f172a');
        p.circle(playerCx, playerCy - 3, playerR - 4, '#1e293b');
        p.circle(playerCx, playerCy - 6, playerR - 8, '#334155');

      } else if (terrain.includes('tide') || terrain.includes('sand')) {
        // --- Tide / Coastal Sands Environment ---
        for (let y = 0; y < horizonY; y++) {
          const ratio = y / horizonY;
          const r = Math.round(30 + ratio * 50);
          const g = Math.round(30 + ratio * 30);
          const b = Math.round(70 + ratio * 40);
          p.hline(0, y, artW, `rgb(${r},${g},${b})`);
        }
        for (let y = horizonY; y < artH; y++) {
          const ratio = (y - horizonY) / Math.max(1, artH - horizonY);
          const r = Math.round(15 + ratio * 20);
          const g = Math.round(60 + ratio * 40);
          const b = Math.round(90 + ratio * 40);
          p.hline(0, y, artW, `rgb(${r},${g},${b})`);
        }

        p.circle(foeCx, foeCy, foeR, '#1e3a8a');
        p.circle(foeCx, foeCy - 2, foeR - 4, '#854d0e');
        p.circle(foeCx, foeCy - 4, foeR - 8, '#eab308');

        p.circle(playerCx, playerCy, playerR, '#1e3a8a');
        p.circle(playerCx, playerCy - 3, playerR - 4, '#854d0e');
        p.circle(playerCx, playerCy - 6, playerR - 8, '#eab308');

      } else {
        // --- Heath / Grassland / Forest Environment (Default) ---
        for (let y = 0; y < horizonY; y++) {
          const ratio = y / horizonY;
          const r = Math.round(20 + ratio * 20);
          const g = Math.round(20 + ratio * 30);
          const b = Math.round(45 + ratio * 35);
          p.hline(0, y, artW, `rgb(${r},${g},${b})`);
        }
        for (let x = 0; x < artW; x++) {
          const h1 = Math.sin(x * 0.008) * 20 + Math.cos(x * 0.015) * 12 + (horizonY - 20);
          p.vline(x, Math.floor(h1), horizonY - Math.floor(h1), '#14382c');
        }
        for (let y = horizonY; y < artH; y++) {
          const ratio = (y - horizonY) / Math.max(1, artH - horizonY);
          const r = Math.round(15 + ratio * 15);
          const g = Math.round(45 + ratio * 30);
          const b = Math.round(30 + ratio * 20);
          p.hline(0, y, artW, `rgb(${r},${g},${b})`);
        }

        p.circle(foeCx, foeCy, foeR, '#092d1f');
        p.circle(foeCx, foeCy - 2, foeR - 4, '#115e3b');
        p.circle(foeCx, foeCy - 4, foeR - 8, '#16a34a');

        p.circle(playerCx, playerCy, playerR, '#092d1f');
        p.circle(playerCx, playerCy - 3, playerR - 4, '#115e3b');
        p.circle(playerCx, playerCy - 6, playerR - 8, '#16a34a');
      }
    });

    put(stage, bgCanvas, 0, 0, 1, 'lu-creature__bg');
  }

  /** @returns {string} */
  _signature(artW = 360, artH = 640) {
    const st = this._state;
    const m = this._menu;
    const side = (s) => (s ? `${s.uid}|${s.name}|${s.level}|${s.hp}|${s.maxHp}|${s.hpRatio ?? ''}|${s.fainted ? 1 : 0}|${JSON.stringify(s.parts || s.paperdoll || '')}` : '');
    return [
      `${artW}x${artH}`,
      st ? `${st.phase ?? ''}|${st.terrain ?? ''}|${side(st.player)}|${side(st.foe)}` : '',
      this._display.player ?? '',
      this._display.foe ?? '',
      m ? `${m.cursor ?? 0}|${m.cols ?? 2}|${m.back === false ? 0 : 1}|${m.items.map((it) => `${it.label ?? ''}~${it.sub ?? ''}~${it.disabled ? 1 : 0}~${it.type ?? ''}~${it.eff ?? ''}`).join('\u001f')}` : '',
      this._log.join('\u001e'),
      String(this._spriteV),
    ].join('\u0000');
  }

  /**
   * A side's displayed name (the caller's translation, else the state's).
   * @param {'player'|'foe'} side
   * @param {BattleSideView} info
   */
  _name(side, info) {
    const v = side === 'foe' ? this._display.foe : this._display.player;
    return typeof v === 'string' && v ? v : info.name;
  }

  /**
   * Render paperdoll body part status icon (head, torso, arms, legs) for a creature.
   * Status colors: green = healthy, yellow = damaged, red = broken.
   * @param {BattleSideView} info
   * @returns {HTMLCanvasElement}
   */
  _drawPaperdoll(info) {
    const ratio = typeof info.hpRatio === 'number' ? info.hpRatio : (info.maxHp > 0 ? info.hp / info.maxHp : 0);
    const partsInput = info.parts || info.paperdoll || {};

    /**
     * @param {string|number|undefined} val
     * @param {() => string} fallbackHpCheck
     */
    const getColor = (val, fallbackHpCheck) => {
      if (val === 'red' || val === 'broken' || val === 2) return '#ef4444';
      if (val === 'yellow' || val === 'damaged' || val === 1) return '#eab308';
      if (val === 'green' || val === 'healthy' || val === 0) return '#22c55e';
      return fallbackHpCheck();
    };

    const headCol = getColor(partsInput.head, () => (ratio > 0.35 ? '#22c55e' : ratio > 0 ? '#eab308' : '#ef4444'));
    const torsoCol = getColor(partsInput.torso, () => (ratio > 0.5 ? '#22c55e' : ratio > 0.2 ? '#eab308' : '#ef4444'));
    const armsCol = getColor(partsInput.arms, () => (ratio > 0.65 ? '#22c55e' : ratio > 0.35 ? '#eab308' : '#ef4444'));
    const legsCol = getColor(partsInput.legs, () => (ratio > 0.75 ? '#22c55e' : ratio > 0.4 ? '#eab308' : '#ef4444'));

    return art(38, 26, (p) => {
      p.rect(0, 0, 38, 26, '#0f172a');
      p.box(0, 0, 38, 26, '#334155');

      // Head
      p.rect(17, 2, 5, 5, headCol);
      p.box(17, 2, 5, 5, '#020617');

      // Torso
      p.rect(16, 8, 7, 8, torsoCol);
      p.box(16, 8, 7, 8, '#020617');

      // Arms
      p.rect(12, 8, 3, 7, armsCol);
      p.box(12, 8, 3, 7, '#020617');
      p.rect(24, 8, 3, 7, armsCol);
      p.box(24, 8, 3, 7, '#020617');

      // Legs
      p.rect(16, 17, 3, 7, legsCol);
      p.box(16, 17, 3, 7, '#020617');
      p.rect(20, 17, 3, 7, legsCol);
      p.box(20, 17, 3, 7, '#020617');

      // Mini status indicator dots at left side
      p.rect(2, 3, 3, 3, headCol);
      p.rect(2, 8, 3, 3, torsoCol);
      p.rect(2, 13, 3, 3, armsCol);
      p.rect(2, 18, 3, 3, legsCol);
    });
  }

  /**
   * The two framed stat panels: the name and (right) the type icon, then Lv and the HP track; the
   * player's panel adds the HP numbers. A narrow panel drops the paperdoll and shortens the name so
   * its rows never collide.
   * @param {Element} stage
   * @param {BattleView} st
   * @param {ReturnType<typeof pal>} k
   * @param {BattleLayout} layout
   */
  _renderPanels(stage, st, k, layout) {
    for (const side of /** @type {('foe'|'player')[]} */ (['foe', 'player'])) {
      const info = side === 'foe' ? st.foe : st.player;
      const p = side === 'foe' ? layout.foe : layout.player;
      const el = box(stage, p.x, p.y, p.w, p.h, `lu-creature__panel lu-creature__panel--${side}`);
      win(el, { size: 'M', beads: true }, p.x, p.y, p.w, p.h);
      if (info.fainted) el.classList.add('is-fainted');

      const compact = p.w < 236;
      const showDoll = !compact && p.h >= 46;
      const nameY = p.y + 6;
      const rowHp = p.y + Math.round(p.h * 0.44);
      const rowNum = p.y + p.h - 14;

      const maxNameW = Math.max(24, p.w - (compact ? 58 : 112));
      const nameText = fit(this._name(side, info), 'name', maxNameW);
      txt(el, nameText, p.x + 10, nameY, { font: 'name', color: k.tx1, ol: true, drop: true });

      txt(el, `Lv ${info.level}`, p.x + p.w - (compact ? 46 : 78), nameY + 1, { font: 'num', color: k.g5, drop: true });

      const t = info.type ? TYPE_ICON[info.type] : null;
      if (t && p.w >= 150) put(el, creatureIcon(t), p.x + p.w - 24, p.y + 5, 1, 'lu-creature__type');

      txt(el, 'HP', p.x + 10, rowHp, { font: 'tiny', color: k.g4, drop: true });

      const bx = p.x + 26, bw = Math.max(24, p.w - 26 - (showDoll ? 56 : 10)), bh = 8;
      const ratio = typeof info.hpRatio === 'number' ? info.hpRatio : info.maxHp > 0 ? info.hp / info.maxHp : 0;
      const track = box(el, bx, rowHp, bw, bh, 'lu-creature__track');
      put(track, art(bw, bh, (pp) => bar(pp, bw, bh, ratio, [k.hp0, k.hp1, k.hp2, k.hp3], { ring: k.dm1 })), bx, rowHp);

      if (showDoll) put(el, this._drawPaperdoll(info), p.x + p.w - 48, rowHp - 2, 1, 'lu-creature__paperdoll');

      txt(el, `${info.hp}/${info.maxHp}`, p.x + 26, rowNum, { font: 'num', color: side === 'player' ? k.tx1 : k.g4, drop: true });
    }
  }

  /**
   * The two sprites (already-cropped canvases), each centred on its layout anchor.
   * @param {Element} stage
   * @param {BattleView} st
   * @param {BattleLayout} layout
   */
  _renderSprites(stage, st, layout) {
    for (const side of /** @type {('foe'|'player')[]} */ (['foe', 'player'])) {
      const c = this._sprites[side];
      if (!c) continue;
      const s = side === 'foe' ? layout.foeSprite : layout.playerSprite;
      const fainted = !!(side === 'foe' ? st.foe.fainted : st.player.fainted);
      put(stage, c, s.x - (c.width * s.k) / 2, s.y - (c.height * s.k) / 2, s.k, `lu-creature__sprite lu-creature__sprite--${side}${fainted ? ' is-fainted' : ''}`);
    }
  }

  /**
   * The log window: the last two wrapped rows of the log's lines (one on a short window).
   * @param {Element} stage
   * @param {ReturnType<typeof pal>} k
   * @param {BattleLayout} layout
   */
  _renderLog(stage, k, layout) {
    const lb = layout.log;
    const el = box(stage, lb.x, lb.y, lb.w, lb.h, 'lu-creature__log');
    win(el, { size: 'M', beads: true }, lb.x, lb.y, lb.w, lb.h);
    /** @type {string[]} */
    const rows = [];
    for (const ln of this._log) for (const w of lines(String(ln ?? ''), 'line', lb.w - 20)) rows.push(w);
    const pitch = cjk() ? FONT.line.L : 16 * FONT.line.unit;
    const show = lb.h < 34 ? 1 : 2;
    rows.slice(-show).forEach((r, i) => {
      txt(el, r, lb.x + 10, lb.y + 9 + i * pitch, { font: 'line', color: k.tx1, ol: true });
    });
  }

  /**
   * The action menu (a 2 × 2 grid, or a vertical list), anchored to the foot. A row may carry a
   * type icon (a move's type), a right-aligned note (its power) and an effectiveness marker.
   * @param {Element} stage
   * @param {ReturnType<typeof pal>} k
   * @param {BattleLayout} layout
   */
  _renderMenu(stage, k, layout) {
    const m = this._menu;
    if (!m || !m.items.length) return;
    const cols = layout.cols;
    const bx = layout.menu;
    const pad = layout.menuPad;
    const itemH = layout.itemH;
    const itemW = Math.floor((bx.w - 2 * pad) / cols);
    const el = box(stage, bx.x, bx.y, bx.w, bx.h, 'lu-creature__menu');
    win(el, { size: 'M', beads: true }, bx.x, bx.y, bx.w, bx.h);
    const cursor = Number.isInteger(m.cursor) ? /** @type {number} */ (m.cursor) : 0;
    const ty = Math.max(0, Math.round((itemH - 9) / 2));
    m.items.forEach((it, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const ix = bx.x + pad + c * itemW;
      const iy = bx.y + pad + r * itemH;
      const row = box(el, ix, iy, itemW, itemH, 'lu-creature__item');
      row.dataset.index = String(i);
      if (i === cursor) row.classList.add('is-sel');
      if (it.disabled) row.classList.add('is-disabled');

      let tx = ix + 7;
      const iconName = it.type ? TYPE_ICON[it.type] : null;
      if (iconName) {
        put(row, creatureIcon(iconName), ix + 5, iy + Math.max(0, Math.round((itemH - 16) / 2)), 1, 'lu-creature__type');
        tx = ix + 5 + 16 + 4;
      }
      txt(row, String(it.label ?? ''), tx, iy + ty, { font: 'line', color: i === cursor ? k.sel : k.tx1, ol: true });

      const subStr = it.sub != null ? String(it.sub) : '';
      if (it.eff) {
        const subW = subStr ? measure(subStr, 'tiny') + 6 : 0;
        txt(row, it.eff > 0 ? '↑' : '↓', ix + itemW - 6 - subW, iy + ty, { font: 'line', color: it.eff > 0 ? k.mint : k.hp2, ol: true, align: 'right' });
      }
      if (subStr) txt(row, subStr, ix + itemW - 6, iy + ty, { font: 'tiny', color: k.g4, align: 'right' });
    });
  }

  /**
   * The keycap hints along the foot (language-neutral key names): the movement keys, Pick, and a
   * Back keycap when the menu may be cancelled.
   * @param {Element} stage
   * @param {ReturnType<typeof pal>} k
   * @param {BattleLayout} layout
   */
  _renderHints(stage, k, layout) {
    const h = layout.hint;
    if (!h) return;
    const el = box(stage, h.x, h.y, h.w, h.h, 'lu-creature__hints');
    const keys = ['↑', '↓', '←', '→', 'Space'];
    if (layout.canBack) keys.push('Esc');
    const ky = h.y + Math.max(0, Math.floor((h.h - 11) / 2));
    let x = h.x + 2;
    for (const name of keys) x += key(el, name, x, ky, { dim: true }) + 4;
  }
}
