import './ui.css';
import './creature.css';
import { pal } from './art/palette.js';
import { art, copyCanvas } from './art/painter.js';
import { bar, band, hairline, btn } from './art/pieces.js';
import { icon as creatureIcon, TYPE_ICONS } from './art/icons/creature.js';
import { txt, measure, fit, lines, cjk, FONT } from './layout/type.js';
import { box, put, win, key, capW } from './layout/layout.js';
import { onScale, currentScale } from './UiScale.js';
import { currentFonts } from './FontLoader.js';

/**
 * CreatureBattleHUD — the turn-based creature battle screen ("Critters Collection" phase 4b), drawn
 * after mockup G (docs/specs/PIXEL_UI.md §5): a full-screen overlay with the foe's framed stat
 * panel and the player's, the two 32 × 32 sprites, the log band and the action menu (a 2 × 2 grid of
 * buttons, or a 2 × n grid for the party). Created by `creatureUIClasses()` and enabled through
 * `UI.enableCreature()`.
 *
 * It is a *view*: it owns no battle rules and, like every engine UI module, must not import
 * `src/game/` (the caller inlines the state and the translated strings). The caller pushes in what
 * to show — `setState(battle.state(), { player, foe })`, `setLog(strings)`, `setMenu({ items,
 * cursor, cols })`, `setCursor(i)`, `setSprites({ player, foe })` — and receives `onSelect(i)` /
 * `onCancel`. Every setter is cheap: it writes the DOM only when its signature changes.
 *
 * The battle fills the room it is given (`_layout`): every box is measured in art px of the
 * screen's own `artW` × `artH` and can never leave it. The screen is three bands down its height —
 * the **scene** (58%), the **log** (14%) and the **actions** (28%) — so the same reading holds on a
 * 640 × 360 desktop and a 200 × 400 phone. In the scene the foe's panel sits above the field and the
 * player's below it, with the two souldolls standing on the diagonal between them (the foe upper
 * right, the player lower left), each scaled to the field.
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
 * @property {number} itemGap
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
   * The battle's geometry for a screen of `artW` × `artH` art px, guaranteed to stay inside it. The
   * screen is three bands down its height: **the scene** (58% — the foe's panel above the field and
   * the player's below it, the two souldolls standing on the diagonal, the foe upper right, the
   * player lower left), **the log** (14%, a caption band) and **the actions** (28%, the button grid,
   * the keycap hints along its foot). The bands hold at any ratio, so a 640 × 360 screen and a
   * 200 × 400 phone both read the same; only the widths and the souldoll scale change.
   * @param {number} artW
   * @param {number} artH
   * @returns {BattleLayout}
   */
  _layout(artW, artH) {
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const pad = clamp(Math.floor(Math.min(artW, artH) * 0.045), 6, 16);
    const gap = Math.max(3, Math.round(pad * 0.45));
    const wide = artW >= 380 && artW >= artH;
    const contentW = Math.max(80, Math.min(artW - pad * 2, 560));
    const cx = Math.round(artW / 2);
    const left = Math.max(0, Math.round((artW - contentW) / 2));

    const m = this._menu;
    const cols = /** @type {1|2} */ (m?.cols === 1 ? 1 : 2);
    const items = m?.items?.length || 0;
    const canBack = !!m && m.back !== false;
    const menuRows = items > 0 ? Math.ceil(items / cols) : 0;
    const menuPad = Math.max(4, Math.round(pad * 0.6));
    const itemGap = 3;
    const menuW = Math.min(contentW, cols === 1 ? 340 : 400);

    // the three bands: the scene (58%), the log (14%) and the actions (28%)
    const sceneH = Math.round(artH * 0.58);
    const logH = Math.round(artH * 0.14);
    const actH = Math.max(0, artH - sceneH - logH);

    // the scene: the foe's panel over the field, the player's under it, the two souldolls on the
    // diagonal between them — scaled to the field and kept apart (never over a panel or each other)
    const panelH = clamp(Math.round(sceneH * 0.18), 30, 46);
    const panelW = clamp(Math.round(contentW * 0.62), 120, 244);
    const foe = { x: left, y: pad, w: panelW, h: panelH };
    const player = { x: left + contentW - panelW, y: sceneH - pad - panelH, w: panelW, h: panelH };
    const fieldTop = foe.y + foe.h + gap;
    const fieldBot = player.y - gap;
    const field = Math.max(24, fieldBot - fieldTop);
    const k = clamp(Math.min(Math.floor(field / 32), Math.floor((contentW * 0.42) / 32)), 1, 4);
    const step = clamp(Math.floor((field - 32 * k) / 2), 0, 18);
    const mid = Math.round((fieldTop + fieldBot) / 2);
    const foeSprite = { x: left + Math.round(contentW * 0.70), y: mid - step, k };
    const playerSprite = { x: left + Math.round(contentW * 0.28), y: mid + step, k };

    const log = { x: left, y: sceneH, w: contentW, h: logH };

    // the actions band: the button grid centred in it, the keycap hints along the foot
    const hints = items > 0 && artH >= 260;
    const hintH = hints ? clamp(Math.round(artH * 0.035), 11, 15) : 0;
    const actInner = Math.max(0, actH - (hints ? hintH + gap : 0));
    const itemH = menuRows ? clamp(Math.floor((actInner - 2 * menuPad - (menuRows - 1) * itemGap) / menuRows), 20, 42) : 0;
    const gridH = menuRows ? menuRows * itemH + (menuRows - 1) * itemGap : 0;
    const menuOuterH = gridH + 2 * menuPad;
    const menu = {
      x: cx - Math.round(menuW / 2),
      y: sceneH + logH + Math.max(0, Math.round((actInner - menuOuterH) / 2)),
      w: menuW,
      h: menuOuterH,
    };
    const hint = hints ? { x: left, y: sceneH + logH + actInner + gap, w: contentW, h: hintH } : null;

    return { artW, artH, mode: wide ? 'wide' : 'tall', pad, gap, cols, menuPad, itemH, itemGap, canBack, hint,
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
    const side = (s) => (s ? `${s.uid}|${s.name}|${s.level}|${s.hp}|${s.maxHp}|${s.hpRatio ?? ''}|${s.fainted ? 1 : 0}` : '');
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
   * The two framed stat panels: the name and the level on the top line (the type icon at the right),
   * the HP track — with the player's numbers — on the second. Kept short so the field keeps the room.
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

      const iconName = info.type ? TYPE_ICON[info.type] : null;
      const nameY = p.y + 6;
      const rowY = p.y + Math.max(18, p.h - 16);
      const maxNameW = Math.max(24, p.w - (iconName && p.w >= 150 ? 74 : 50));
      txt(el, fit(this._name(side, info), 'name', maxNameW), p.x + 10, nameY, { font: 'name', color: k.tx1, ol: true, drop: true });
      txt(el, `Lv ${info.level}`, p.x + p.w - (iconName && p.w >= 150 ? 30 : 10), nameY + 1, { font: 'num', color: k.g5, align: 'right', drop: true });
      if (iconName && p.w >= 150) put(el, creatureIcon(iconName), p.x + p.w - 22, p.y + 5, 1, 'lu-creature__type');

      txt(el, 'HP', p.x + 10, rowY, { font: 'tiny', color: k.g4, drop: true });
      const numText = `${info.hp}/${info.maxHp}`;
      const numW = side === 'player' ? Math.round(measure(numText, 'num')) + 8 : 0;
      const bx = p.x + 26, bw = Math.max(20, p.w - 26 - numW - 12), bh = 8;
      const ratio = typeof info.hpRatio === 'number' ? info.hpRatio : info.maxHp > 0 ? info.hp / info.maxHp : 0;
      const track = box(el, bx, rowY, bw, bh, 'lu-creature__track');
      put(track, art(bw, bh, (pp) => bar(pp, bw, bh, ratio, [k.hp0, k.hp1, k.hp2, k.hp3], { ring: k.dm1 })), bx, rowY);
      if (side === 'player') txt(el, numText, p.x + p.w - 10, rowY, { font: 'num', color: k.tx1, align: 'right', drop: true });
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
   * The log: a lower-third band (no frame — navy fading out to the right under a gilt rule) with the
   * last row or two of the log's lines, so it reads like a caption and recedes into the scene.
   * @param {Element} stage
   * @param {ReturnType<typeof pal>} k
   * @param {BattleLayout} layout
   */
  _renderLog(stage, k, layout) {
    const lb = layout.log;
    const el = box(stage, lb.x, lb.y, lb.w, lb.h, 'lu-creature__log');
    put(el, band(lb.w, lb.h), lb.x, lb.y);
    put(el, hairline(lb.w), lb.x, lb.y);
    /** @type {string[]} */
    const rows = [];
    for (const ln of this._log) for (const w of lines(String(ln ?? ''), 'line', lb.w - 18)) rows.push(w);
    const pitch = cjk() ? FONT.line.L : 16 * FONT.line.unit;
    const show = Math.max(1, Math.min(2, Math.floor((lb.h - 6) / pitch)));
    const blockH = 11 + (show - 1) * pitch;
    const y0 = lb.y + Math.max(3, Math.round((lb.h - blockH) / 2));
    rows.slice(-show).forEach((r, i) => {
      txt(el, r, lb.x + 9, y0 + i * pitch, { font: 'line', color: k.tx1, ol: true });
    });
  }

  /**
   * The action menu: each row a raised button (a 2 × 2 grid, or a vertical list), the cursor one lit.
   * A row may carry a type icon (a move's type), a right-aligned note (its power) and an
   * effectiveness marker.
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
    const itemGap = layout.itemGap;
    const itemW = Math.floor((bx.w - 2 * pad - itemGap * (cols - 1)) / cols);
    const el = box(stage, bx.x, bx.y, bx.w, bx.h, 'lu-creature__menu');
    const cursor = Number.isInteger(m.cursor) ? /** @type {number} */ (m.cursor) : 0;
    const ty = Math.max(0, Math.round((itemH - 9) / 2));
    m.items.forEach((it, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const ix = bx.x + pad + c * (itemW + itemGap);
      const iy = bx.y + pad + r * (itemH + itemGap);
      const on = i === cursor;
      const row = box(el, ix, iy, itemW, itemH, 'lu-creature__item');
      row.dataset.index = String(i);
      if (on) row.classList.add('is-sel');
      if (it.disabled) row.classList.add('is-disabled');
      put(row, btn(itemW, itemH, { sel: on }), ix, iy);

      let tx = ix + 9;
      const iconName = it.type ? TYPE_ICON[it.type] : null;
      if (iconName) {
        put(row, creatureIcon(iconName), ix + 7, iy + Math.max(0, Math.round((itemH - 16) / 2)), 1, 'lu-creature__type');
        tx = ix + 7 + 16 + 4;
      }
      txt(row, String(it.label ?? ''), tx, iy + ty, { font: 'line', color: on ? k.sel : k.tx1, ol: true });

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
    if (!h || h.h <= 0) return;
    const keys = ['↑', '↓', '←', '→', 'Space'];
    if (layout.canBack) keys.push('Esc');
    const total = keys.reduce((a, name) => a + capW(name) + 4, -4);
    const el = box(stage, h.x, h.y, h.w, h.h, 'lu-creature__hints');
    const ky = h.y + Math.max(0, Math.floor((h.h - 11) / 2));
    let x = h.x + Math.max(0, Math.round((h.w - total) / 2));
    for (const name of keys) x += key(el, name, x, ky, { dim: true }) + 4;
  }
}
