import './ui.css';
import './creature.css';
import { pal } from './art/palette.js';
import { art, copyCanvas } from './art/painter.js';
import { bar } from './art/pieces.js';
import { icon as creatureIcon, TYPE_ICONS } from './art/icons/creature.js';
import { txt, measure, lines, cjk, FONT } from './layout/type.js';
import { box, group, put, win } from './layout/layout.js';
import { onScale } from './UiScale.js';
import { currentFonts } from './FontLoader.js';

/**
 * CreatureBattleHUD — the turn-based creature battle screen ("Critters Collection" phase 4b), drawn
 * after mockup G (docs/specs/PIXEL_UI.md §5): a full-screen overlay with the foe's framed stat
 * panel (top-left) and the player's (bottom-right), the two 32 × 32 sprites (foe top-right, player
 * bottom-left), the log window along the foot and the action menu (a 2 × 2 grid, or a vertical list
 * for the party) beside it. Created by `creatureUIClasses()` and enabled through `UI.enableCreature()`.
 *
 * It is a *view*: it owns no battle rules and, like every engine UI module, must not import
 * `src/game/` (the caller inlines the state and the translated strings). The caller pushes in what
 * to show — `setState(battle.state(), { player, foe })`, `setLog(strings)`, `setMenu({ items,
 * cursor, cols })`, `setCursor(i)`, `setSprites({ player, foe })` — and receives `onSelect(i)` /
 * `onCancel`. Every setter is cheap: it writes the DOM only when its signature changes.
 *
 * Sizes are art px of G's 640 × 360 frame (`--px`, layout/layout.js); the whole screen is one
 * centred group, laid out again when the root's scale changes or the fonts arrive. Sprites come in
 * already cropped (e.g. `createSpeciesSheet(id, { pose: 'front' })` frame 0, 32 × 32) and are copied,
 * so the caller keeps its canvas.
 */

/** The framed stat panels (art px of the 640 × 360 frame). */
const PANEL = Object.freeze({
  foe: Object.freeze({ x: 24, y: 24, w: 250, h: 48 }),
  player: Object.freeze({ x: 366, y: 166, w: 250, h: 48 }),
});
/** The log window along the foot. */
const LOG = Object.freeze({ x: 16, y: 302, w: 388, h: 46 });
/** The action menu's box (a 2 × 2 grid, or a vertical list that grows upward from the foot). */
const MENU = Object.freeze({ w: 208, right: 624, bottom: 348, pad: 6, itemH: 18 });
/** Where the two sprites stand (art px) and how many art px each of their canvas px takes. */
const SPRITE = Object.freeze({
  foe: Object.freeze({ x: 404, y: 56, k: 2 }),
  player: Object.freeze({ x: 96, y: 184, k: 2 }),
});

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
 * @property {BattleSideView} player
 * @property {BattleSideView} foe
 */

/**
 * A menu item (`setMenu`): `label` the shown text (translated by the caller), `sub` an optional
 * right-aligned note (a move's power), `disabled` a refused row.
 * @typedef {object} MenuItem
 * @property {string} label
 * @property {string} [sub]
 * @property {boolean} [disabled]
 */

/**
 * A menu (`setMenu`): `items` in reading order, `cols` 2 for the 2 × 2 grid (the main menu, moves)
 * or 1 for the vertical list (the party), `cursor` the selected index.
 * @typedef {object} BattleMenu
 * @property {MenuItem[]} items
 * @property {number} [cursor]
 * @property {1|2} [cols]
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
    this._sig = '\u0000';
    this._visible = false;

    this.element.addEventListener('pointerdown', (e) => {
      const el = e.target instanceof Element ? e.target.closest('.lu-creature__item') : null;
      if (!el || el.classList.contains('is-disabled')) return;
      const i = Number(el instanceof HTMLElement ? el.dataset.index : NaN);
      if (Number.isInteger(i)) this.onSelect?.(i);
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
  // Rendering (a full rebuild on a change; cheap while nothing moves)
  // --------------------------------------------------------------------------------------------

  /** The change key: a rebuild happens only when it differs (`_render(true)` forces one). @param {boolean} [force] */
  _render(force = false) {
    if (this._disposed) return;
    const sig = this._signature();
    if (!force && sig === this._sig) return;
    this._sig = sig;

    const k = pal();
    this.element.textContent = '';
    const back = document.createElement('div');
    back.className = 'lu-creature__backdrop';
    this.element.append(back);
    const stage = group(this.element, 'mc', 0, 0, 640, 360, 'lu-creature__stage');

    const st = this._state;
    if (st) {
      this._renderPanels(stage, st, k);
      this._renderSprites(stage, st);
      this._renderLog(stage, k);
      this._renderMenu(stage, k);
    }
  }

  /** @returns {string} */
  _signature() {
    const st = this._state;
    const m = this._menu;
    const side = (s) => (s ? `${s.uid}|${s.name}|${s.level}|${s.hp}|${s.maxHp}|${s.hpRatio ?? ''}|${s.fainted ? 1 : 0}` : '');
    return [
      st ? `${st.phase ?? ''}|${side(st.player)}|${side(st.foe)}` : '',
      this._display.player ?? '',
      this._display.foe ?? '',
      m ? `${m.cursor ?? 0}|${m.cols ?? 2}|${m.items.map((it) => `${it.label ?? ''}~${it.sub ?? ''}~${it.disabled ? 1 : 0}`).join('\u001f')}` : '',
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
   * The two framed stat panels: the name and (right) the type icon, then Lv and the HP track; the
   * player's panel adds the HP numbers.
   * @param {Element} stage
   * @param {BattleView} st
   * @param {ReturnType<typeof pal>} k
   */
  _renderPanels(stage, st, k) {
    for (const side of /** @type {('foe'|'player')[]} */ (['foe', 'player'])) {
      const info = side === 'foe' ? st.foe : st.player;
      const p = PANEL[side];
      const el = box(stage, p.x, p.y, p.w, p.h, `lu-creature__panel lu-creature__panel--${side}`);
      win(el, { size: 'M', beads: true }, p.x, p.y, p.w, p.h);
      if (info.fainted) el.classList.add('is-fainted');
      txt(el, this._name(side, info), p.x + 9, p.y + 6, { font: 'name', color: k.tx1, ol: true, drop: true });
      const t = info.type ? TYPE_ICON[info.type] : null;
      if (t) put(el, creatureIcon(t), p.x + p.w - 25, p.y + 4, 1, 'lu-creature__type');
      txt(el, `Lv${info.level}`, p.x + 9, p.y + 25, { font: 'num', color: k.g5, drop: true });
      const bx = p.x + 34, bw = p.w - 34 - 9, by = p.y + 26, bh = 7;
      const ratio = typeof info.hpRatio === 'number' ? info.hpRatio : info.maxHp > 0 ? info.hp / info.maxHp : 0;
      const track = box(el, bx, by, bw, bh, 'lu-creature__track');
      put(track, art(bw, bh, (pp) => bar(pp, bw, bh, ratio, [k.hp0, k.hp1, k.hp2, k.hp3], { ring: k.dm1 })), bx, by);
      if (side === 'player') txt(el, `${info.hp}/${info.maxHp}`, p.x + p.w - 9, p.y + 36, { font: 'num', color: k.tx1, align: 'right', drop: true });
    }
  }

  /**
   * The two sprites (already-cropped canvases, shown at 2 art px a canvas px).
   * @param {Element} stage
   * @param {BattleView} st
   */
  _renderSprites(stage, st) {
    for (const side of /** @type {('foe'|'player')[]} */ (['foe', 'player'])) {
      const c = this._sprites[side];
      if (!c) continue;
      const s = SPRITE[side];
      const fainted = !!(side === 'foe' ? st.foe.fainted : st.player.fainted);
      put(stage, c, s.x, s.y, s.k, `lu-creature__sprite lu-creature__sprite--${side}${fainted ? ' is-fainted' : ''}`);
    }
  }

  /**
   * The log window: the last two wrapped rows of the log's lines.
   * @param {Element} stage
   * @param {ReturnType<typeof pal>} k
   */
  _renderLog(stage, k) {
    const el = box(stage, LOG.x, LOG.y, LOG.w, LOG.h, 'lu-creature__log');
    win(el, { size: 'M', beads: true }, LOG.x, LOG.y, LOG.w, LOG.h);
    /** @type {string[]} */
    const rows = [];
    for (const ln of this._log) for (const w of lines(String(ln ?? ''), 'line', LOG.w - 20)) rows.push(w);
    const pitch = cjk() ? FONT.line.L : 16 * FONT.line.unit;
    rows.slice(-2).forEach((r, i) => {
      txt(el, r, LOG.x + 10, LOG.y + 9 + i * pitch, { font: 'line', color: k.tx1, ol: true });
    });
  }

  /**
   * The action menu (a 2 × 2 grid, or a vertical list), anchored to the foot's right.
   * @param {Element} stage
   * @param {ReturnType<typeof pal>} k
   */
  _renderMenu(stage, k) {
    const m = this._menu;
    if (!m || !m.items.length) return;
    const cols = m.cols === 1 ? 1 : 2;
    const rows = Math.ceil(m.items.length / cols);
    const w = MENU.w;
    const itemW = Math.floor((w - 2 * MENU.pad) / cols);
    const mh = 2 * MENU.pad + rows * MENU.itemH;
    const mx = MENU.right - w;
    const my = MENU.bottom - mh;
    const el = box(stage, mx, my, w, mh, 'lu-creature__menu');
    win(el, { size: 'M', beads: true }, mx, my, w, mh);
    const cursor = Number.isInteger(m.cursor) ? /** @type {number} */ (m.cursor) : 0;
    m.items.forEach((it, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const ix = mx + MENU.pad + c * itemW;
      const iy = my + MENU.pad + r * MENU.itemH;
      const row = box(el, ix, iy, itemW, MENU.itemH, 'lu-creature__item');
      row.dataset.index = String(i);
      if (i === cursor) row.classList.add('is-sel');
      if (it.disabled) row.classList.add('is-disabled');
      txt(row, String(it.label ?? ''), ix + 7, iy + 5, { font: 'line', color: i === cursor ? k.sel : k.tx1, ol: true });
      if (it.sub != null) txt(row, String(it.sub), ix + itemW - 4, iy + 6, { font: 'tiny', color: k.g4, align: 'right' });
    });
  }
}
