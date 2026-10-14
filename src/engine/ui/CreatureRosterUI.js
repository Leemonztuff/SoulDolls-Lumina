import './ui.css';
import './creature.css';
import { pal } from './art/palette.js';
import { art } from './art/painter.js';
import { bar, selBand, hairline } from './art/pieces.js';
import { txt, measure } from './layout/type.js';
import { box, group, put, win, keyHints, section } from './layout/layout.js';
import { onScale } from './UiScale.js';
import { currentFonts } from './FontLoader.js';
import { t } from '../i18n/I18n.js';

/**
 * CreatureRosterUI — the creature roster panel ("Critters Collection" phase 6, docs/specs/
 * PIXEL_UI.md §5), drawn after mockup G like its sibling CreatureBattleHUD: a full-screen modal
 * window with the battle party (`active`, a column on the left, one row per slot) and the storage
 * box (`box`, a scrolling column on the right). It is created by `creatureUIClasses()` and reached
 * through `UI.enableCreature()` as `ui.creature.roster`; `UI.update` calls `update(dt, input)` while
 * `isOpen` (before the dialog's, like the journal and the tactics panel).
 *
 * It is a *view*: it owns no roster rules and, like every engine UI module, must not import
 * `src/game/` (the caller — the adapter `src/game/creatures/rosterUI.js` — passes the rows in and
 * performs the swap / release the panel asks for). `open(opts)` brings the rows in; the panel emits
 * `onSound(name)` ('menuOpen' | 'menuClose' | 'menuMove' | 'menuSelect'), `onClose()`,
 * `onSwap(uid, slot)` and `onRelease(uid)`.
 *
 * Input (the panel's own, since no key of its own is bound): `up` / `down` move within the focused
 * column, `left` / `right` move between the party (left) and the box (right), `confirm` picks,
 * `cancel` backs out one level (a sub-menu → the list → closed). A boxed row's confirm opens its
 * Swap / Release menu; an active row's confirm asks to release it; releasing always asks first. A
 * click outside the window closes (reported by the next `update`).
 *
 * Laid out in art px of G's 640 × 360 frame; the whole screen is one centred group, laid out again
 * when the root's scale changes or the fonts arrive (a CJK species name needs its slices).
 */

/** The window (art px) and the two columns inside it. */
const WIN = Object.freeze({ x: 40, y: 28, w: 560, h: 308 });
const PAD = 16;
const HEAD_Y = 13;
const SEC_Y = WIN.y + 40;
const ROW0 = WIN.y + 53;
const ROW = 34;
const SPR = 32;
const COL_GAP = 16;
const LW = 250;
const RX = WIN.x + PAD + LW + COL_GAP;
const RW = WIN.x + WIN.w - PAD - RX;
/** Box rows shown at once (the rest scroll into view with the focus). */
const BOX_VIS = 7;

/** The panel's UI sounds → the game's SFX (the adapter / system maps them to AudioSystem). */
const SOUNDS = Object.freeze(['menuOpen', 'menuClose', 'menuMove', 'menuSelect']);

/**
 * One roster row as the panel reads it (a subset of the game's CreatureRecord, no `src/game`
 * import). `sprite` is an already-cropped, square canvas (the species' front pose, 32 × 32),
 * owned by the caller.
 * @typedef {object} CreatureRosterRowView
 * @property {string} uid
 * @property {string} name the display name (nickname else the translated species)
 * @property {string} [species]
 * @property {number} level
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} [hpRatio] HP as a 0..1 fraction (computed from hp / maxHp when absent)
 * @property {boolean} [fainted]
 * @property {HTMLCanvasElement|null} [sprite]
 */

/**
 * What `open(opts)` brings in.
 * @typedef {object} CreatureRosterOpts
 * @property {CreatureRosterRowView[]} active the battle party (slot order)
 * @property {CreatureRosterRowView[]} box the storage box
 * @property {number} [maxActive]
 * @property {number} [maxBox]
 * @property {(uid: string) => boolean} [canRelease]
 * @property {string} [closeKey] the key that closes it (a hint only; Esc always works)
 */

export class CreatureRosterUI {
  /** @param {HTMLElement} parent the UI root (the overlay is appended to it) */
  constructor(parent) {
    this.parent = parent;
    /** @type {(() => void) | null} the panel closed (any way: Esc, a click outside, `close()`) */
    this.onClose = null;
    /** @type {((uid: string, slot: number) => void) | null} a boxed creature swapped into a party slot */
    this.onSwap = null;
    /** @type {((uid: string) => void) | null} a creature released (already confirmed) */
    this.onRelease = null;
    /** @type {((name: string) => void) | null} 'menuOpen' | 'menuClose' | 'menuMove' | 'menuSelect' */
    this.onSound = null;
    this._disposed = false;

    this.element = document.createElement('div');
    this.element.className = 'lu-creature-roster';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.setAttribute('data-input-ignore', '');
    parent.append(this.element);

    this._open = false;
    this._closeQueued = false;
    /** @type {CreatureRosterRowView[]} */
    this._active = [];
    /** @type {CreatureRosterRowView[]} */
    this._box = [];
    this._maxActive = 6;
    this._maxBox = 240;
    /** @type {(uid: string) => boolean} */
    this._canRelease = () => true;
    this._closeKey = '';
    /** @type {'list'|'action'|'swap'|'release'} the sub-state */
    this._state = 'list';
    /** 0: the party (left), 1: the box (right) */
    this._col = 0;
    this._ia = 0;
    this._ib = 0;
    /** The box's first shown row (its scroll). */
    this._boxTop = 0;
    /** @type {string|null} the row a sub-menu acts on */
    this._selUid = null;
    /** The action menu's cursor (0: Swap, 1: Release). */
    this._act = 0;
    /** The swap picker's target party slot. */
    this._swapTarget = 0;
    /** The release confirmation's cursor (true: yes). */
    this._releaseYes = true;
    this._sig = '\u0000';

    this._onClick = (/** @type {MouseEvent} */ e) => {
      if (!this._open) return;
      const tg = e.target instanceof Element ? e.target : null;
      if (!tg || tg === this.element || tg.classList.contains('lu-creature-roster__backdrop')) {
        this._closeQueued = true;
      }
    };
    this.element.addEventListener('click', this._onClick);

    this._offScale = onScale(this.element, () => this._render(true));
    currentFonts()?.ready.then(() => { if (!this._disposed) this._render(true); });
  }

  /** Whether the panel is shown. */
  get visible() { return this._open; }
  /** Whether it is open (`UI.update` reads it, like the journal's and the tactics panel's). */
  get isOpen() { return this._open; }

  /**
   * Open the panel on the given rows (or refill it while open).
   * @param {CreatureRosterOpts} opts
   */
  open(opts) {
    const o = opts && typeof opts === 'object' ? opts : /** @type {CreatureRosterOpts} */ ({ active: [], box: [] });
    this._closeQueued = false;
    this._active = Array.isArray(o.active) ? o.active.slice() : [];
    this._box = Array.isArray(o.box) ? o.box.slice() : [];
    this._maxActive = Number.isInteger(o.maxActive) ? /** @type {number} */ (o.maxActive) : 6;
    this._maxBox = Number.isInteger(o.maxBox) ? /** @type {number} */ (o.maxBox) : 240;
    this._canRelease = typeof o.canRelease === 'function' ? o.canRelease : () => true;
    this._closeKey = typeof o.closeKey === 'string' ? o.closeKey : '';
    const wasOpen = this._open;
    this._state = 'list';
    this._selUid = null;
    this._ia = Math.max(0, Math.min(this._ia, this._active.length - 1));
    this._ib = Math.max(0, Math.min(this._ib, this._box.length - 1));
    if (!this._active.length) this._col = 1;
    this._scroll();
    if (!wasOpen) {
      this._open = true;
      this.element.classList.add('is-on');
      this.element.setAttribute('aria-hidden', 'false');
      this._sound('menuOpen');
    }
    this._render(true);
  }

  /** Close the panel; `onClose` runs when it was open. */
  close() {
    this._closeQueued = false;
    if (!this._open) return;
    this._open = false;
    this.element.classList.remove('is-on');
    this.element.setAttribute('aria-hidden', 'true');
    this._sound('menuClose');
    if (this.onClose) this.onClose();
  }

  /**
   * Read the panel's actions; once per frame while open (`UI.update` does).
   * @param {number} dt seconds (unused)
   * @param {{ actionPressed(name: string): boolean, consumeAction?(name: string): boolean }} [input]
   * @returns {boolean} true when the panel closed itself this update
   */
  update(dt, input) {
    if (!this._open) return false;
    const pressed = (/** @type {string} */ name) => !!input
      && (typeof input.consumeAction === 'function' ? input.consumeAction(name) : input.actionPressed(name));
    if (this._closeQueued) { this.close(); return true; }
    const st = this._state;
    if (st === 'list') {
      if (pressed('cancel')) { this.close(); return true; }
      if (pressed('left')) { if (this._col === 1 && this._active.length) { this._col = 0; this._sound('menuMove'); } }
      else if (pressed('right')) { if (this._col === 0 && this._box.length) { this._col = 1; this._sound('menuMove'); } }
      else if (pressed('up')) this._move(-1);
      else if (pressed('down')) this._move(1);
      else if (pressed('confirm')) this._confirm();
    } else if (st === 'action') {
      if (pressed('cancel')) { this._state = 'list'; this._selUid = null; this._sound('menuSelect'); }
      else if (pressed('up') || pressed('down') || pressed('left') || pressed('right')) { this._act = this._act ? 0 : 1; this._sound('menuMove'); }
      else if (pressed('confirm')) {
        this._sound('menuSelect');
        if (this._act === 0) { this._state = 'swap'; this._swapTarget = 0; }
        else { this._state = 'release'; this._releaseYes = true; }
      }
    } else if (st === 'swap') {
      if (pressed('cancel')) { this._state = 'action'; this._sound('menuSelect'); }
      else if (pressed('up') || pressed('left')) { this._swapTarget = (this._swapTarget - 1 + this._maxActive) % this._maxActive; this._sound('menuMove'); }
      else if (pressed('down') || pressed('right')) { this._swapTarget = (this._swapTarget + 1) % this._maxActive; this._sound('menuMove'); }
      else if (pressed('confirm')) {
        const uid = this._selUid;
        this._state = 'list';
        this._selUid = null;
        this._sound('menuSelect');
        if (uid) this.onSwap?.(uid, this._swapTarget);
      }
    } else if (st === 'release') {
      if (pressed('cancel')) { this._state = this._col === 1 ? 'action' : 'list'; this._sound('menuSelect'); }
      else if (pressed('up') || pressed('down') || pressed('left') || pressed('right')) { this._releaseYes = !this._releaseYes; this._sound('menuMove'); }
      else if (pressed('confirm')) {
        const uid = this._selUid;
        const yes = this._releaseYes;
        this._state = 'list';
        this._selUid = null;
        this._sound('menuSelect');
        if (yes && uid && this._canRelease(uid)) this.onRelease?.(uid);
      }
    }
    this._render();
    return false;
  }

  dispose() {
    this._disposed = true;
    this._offScale?.();
    this.element.removeEventListener('click', this._onClick);
    this.element.remove();
    this._open = false;
  }

  // --------------------------------------------------------------------------------------------
  // Input helpers
  // --------------------------------------------------------------------------------------------

  /** @param {number} dir -1 up, 1 down */
  _move(dir) {
    if (this._col === 0) {
      const n = this._active.length;
      if (n < 1) return;
      this._ia = (this._ia + dir + n) % n;
      this._sound('menuMove');
    } else {
      const n = this._box.length;
      if (n < 1) return;
      this._ib = (this._ib + dir + n) % n;
      this._scroll();
      this._sound('menuMove');
    }
  }

  /** The confirm of the list state: open the row's menu. */
  _confirm() {
    if (this._col === 0) {
      const r = this._active[this._ia];
      if (!r) return;
      this._selUid = r.uid;
      this._state = 'release';
      this._releaseYes = true;
    } else {
      const r = this._box[this._ib];
      if (!r) return;
      this._selUid = r.uid;
      this._act = 0;
      this._state = 'action';
    }
    this._sound('menuSelect');
  }

  /** Keep the box's focused row inside the shown window. */
  _scroll() {
    const max = Math.max(0, this._box.length - BOX_VIS);
    if (this._ib < this._boxTop) this._boxTop = this._ib;
    else if (this._ib >= this._boxTop + BOX_VIS) this._boxTop = this._ib - BOX_VIS + 1;
    this._boxTop = Math.max(0, Math.min(max, this._boxTop));
  }

  /** @param {string} name */
  _sound(name) { if (this.onSound && SOUNDS.includes(name)) this.onSound(name); }

  // --------------------------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------------------------

  /** @param {boolean} [force] */
  _render(force = false) {
    if (this._disposed || !this._open) return;
    const sig = this._signature();
    if (!force && sig === this._sig) return;
    this._sig = sig;

    const k = pal();
    this.element.textContent = '';
    const back = document.createElement('div');
    back.className = 'lu-creature-roster__backdrop';
    this.element.append(back);
    const stage = group(this.element, 'mc', 0, 0, 640, 360, 'lu-creature-roster__stage');

    this._renderWindow(stage, k);
    if (this._state === 'action') this._renderAction(stage, k);
    else if (this._state === 'swap') this._renderSwap(stage, k);
    else if (this._state === 'release') this._renderRelease(stage, k);
  }

  /** @returns {string} */
  _signature() {
    /** @param {CreatureRosterRowView} r */
    const row = (r) => `${r.uid}|${r.name}|${r.species ?? ''}|${r.level}|${r.hp}|${r.maxHp}|${r.fainted ? 1 : 0}`;
    return [
      this._active.map(row).join('\u001f'),
      this._box.map(row).join('\u001f'),
      this._maxActive, this._maxBox, this._col, this._ia, this._ib, this._boxTop,
      this._state, this._selUid ?? '', this._act, this._swapTarget, this._releaseYes ? 1 : 0,
      this._closeKey,
    ].join('\u0000');
  }

  /**
   * The window frame, its header and the two columns.
   * @param {Element} stage
   * @param {ReturnType<typeof pal>} k
   */
  _renderWindow(stage, k) {
    const w = box(stage, WIN.x, WIN.y, WIN.w, WIN.h, 'lu-creature-roster__window');
    w.setAttribute('role', 'dialog');
    win(w, { size: 'L', beads: 6 }, WIN.x, WIN.y, WIN.w, WIN.h);

    txt(w, t('creature.roster.title'), WIN.x + PAD, WIN.y + HEAD_Y, { font: 'head', color: k.g4, drop: true });
    const hints = /** @type {{keys: string[], label: string}[]} */ ([
      { keys: ['Space'], label: t('creature.roster.swap') },
      { keys: this._closeKey && this._closeKey.toLowerCase() !== 'esc' ? ['Esc', this._closeKey] : ['Esc'], label: t('creature.roster.cancel') },
    ]);
    keyHints(w, hints, WIN.x + WIN.w - PAD, WIN.y + HEAD_Y - 1, { align: 'right', color: k.tx2, drop: true });
    put(w, hairline(WIN.w - 2 * PAD, 'both'), WIN.x + PAD, WIN.y + 27);

    // the party column (left)
    section(w, t('creature.roster.active'), WIN.x + PAD, WIN.x + PAD + LW, SEC_Y, `${this._active.length}/${this._maxActive}`, 'num');
    for (let i = 0; i < this._maxActive; i++) {
      const r = this._active[i];
      const y = ROW0 + i * ROW;
      if (r) this._renderRow(w, WIN.x + PAD, y, LW, this._active[i], this._col === 0 && i === this._ia, k);
      else this._renderEmpty(w, WIN.x + PAD, y, LW, t('creature.roster.empty'), k);
    }

    // the box column (right)
    section(w, t('creature.roster.box'), RX, RX + RW, SEC_Y, `${this._box.length}/${this._maxBox}`, 'num');
    if (!this._box.length) {
      this._renderEmpty(w, RX, ROW0, RW, t('creature.roster.emptyBox'), k);
    } else {
      for (let i = 0; i < Math.min(BOX_VIS, this._box.length); i++) {
        const idx = this._boxTop + i;
        const r = this._box[idx];
        if (!r) break;
        this._renderRow(w, RX, ROW0 + i * ROW, RW, r, this._col === 1 && idx === this._ib, k);
      }
      if (this._box.length > BOX_VIS) this._renderScrollbar(w, k);
    }
  }

  /**
   * One creature row: the selection band, the sprite, the name, the level and the HP bar; a fainted
   * row is dimmed.
   * @param {Element} parent @param {number} x @param {number} y @param {number} w
   * @param {CreatureRosterRowView} r @param {boolean} sel @param {ReturnType<typeof pal>} k
   */
  _renderRow(parent, x, y, w, r, sel, k) {
    const el = box(parent, x, y, w, ROW, 'lu-creature-roster__row');
    if (r.fainted) el.classList.add('is-fainted');
    if (sel) {
      el.classList.add('is-sel');
      put(el, selBand(w, ROW, { lines: 'gilt' }), x, y);
    }
    const sx = x + 1;
    if (r.sprite) put(el, r.sprite, sx, y + Math.round((ROW - SPR) / 2), 1, 'lu-creature-roster__sprite');
    const tx = sx + SPR + 5;
    const tw = w - (tx - x) - 4;
    txt(el, r.name || '', tx, y + 8, { font: 'name', color: r.fainted ? k.tx3 : k.tx1, maxW: tw - 24, drop: true });
    txt(el, t('creature.roster.level', { n: r.level }), x + w - 4, y + 9, { font: 'num', color: k.g5, align: 'right', drop: true });
    const ratio = typeof r.hpRatio === 'number' ? r.hpRatio : r.maxHp > 0 ? r.hp / r.maxHp : 0;
    const barW = Math.max(8, tw);
    put(el, art(barW, 5, (p) => bar(p, barW, 5, ratio, [k.hp0, k.hp1, k.hp2, k.hp3], { ring: k.dm1 })), tx, y + ROW - 11);
  }

  /**
   * An empty slot's label (dim, centred in its row).
   * @param {Element} parent @param {number} x @param {number} y @param {number} w
   * @param {string} label @param {ReturnType<typeof pal>} k
   */
  _renderEmpty(parent, x, y, w, label, k) {
    const el = box(parent, x, y, w, ROW, 'lu-creature-roster__row lu-creature-roster__row--empty');
    txt(el, label, x + Math.round(w / 2), y + 14, { font: 'small', color: k.tx3, align: 'center' });
  }

  /** A slim scroll indicator for the box. @param {Element} parent @param {ReturnType<typeof pal>} k */
  _renderScrollbar(parent, k) {
    const x = RX + RW - 7, y = ROW0;
    const h = BOX_VIS * ROW;
    put(parent, art(1, h, (p) => p.vline(0, 0, h, k.dm2)), x, y);
    const track = h - 12;
    const knobH = Math.max(8, Math.round(track * (BOX_VIS / this._box.length)));
    const at = Math.round(track * (this._boxTop / Math.max(1, this._box.length - BOX_VIS)));
    put(parent, art(3, knobH, (p) => p.rect(0, 0, 3, knobH, k.g4)), x - 1, y + 6 + Math.min(track - knobH, at));
  }

  /** The box row's action menu (Swap / Release). @param {Element} stage @param {ReturnType<typeof pal>} k */
  _renderAction(stage, k) {
    const w = 180, h = 74;
    const x = Math.floor((640 - w) / 2), y = Math.floor((360 - h) / 2);
    const el = box(stage, x, y, w, h, 'lu-creature-roster__modal');
    win(el, { size: 'S', beads: true }, x, y, w, h);
    section(el, t('creature.roster.swapTitle'), x + 10, x + w - 10, y + 12, null);
    const items = [t('creature.roster.swap'), t('creature.roster.release')];
    items.forEach((label, i) => {
      const iy = y + 22 + i * 20;
      if (i === this._act) put(el, selBand(w - 20, 18, { lines: 'gilt' }), x + 10, iy - 4);
      txt(el, label, x + 14, iy, { font: 'body', color: i === this._act ? k.sel : k.tx1, drop: true });
    });
  }

  /** The swap picker (a party slot to swap the chosen boxed creature into). @param {Element} stage @param {ReturnType<typeof pal>} k */
  _renderSwap(stage, k) {
    const w = 220;
    const rows = this._maxActive;
    const h = 40 + rows * 18;
    const x = Math.floor((640 - w) / 2), y = Math.floor((360 - h) / 2);
    const el = box(stage, x, y, w, h, 'lu-creature-roster__modal');
    win(el, { size: 'S', beads: true }, x, y, w, h);
    txt(el, t('creature.roster.swapTitle'), x + 10, y + 10, { font: 'small', track: 1, color: k.g4, drop: true });
    for (let i = 0; i < rows; i++) {
      const iy = y + 24 + i * 18;
      const target = this._active[i];
      const label = target ? target.name : t('creature.roster.emptySlot');
      if (i === this._swapTarget) put(el, selBand(w - 20, 16, { lines: 'gilt' }), x + 10, iy - 4);
      txt(el, `${i + 1}. ${label}`, x + 14, iy, {
        font: 'line', color: i === this._swapTarget ? k.sel : (target ? k.tx1 : k.tx3), drop: true,
      });
    }
    txt(el, t('creature.roster.swapHint'), x + w - 10, y + h - 12, { font: 'line', color: k.tx2, align: 'right' });
  }

  /** The release confirmation (Yes / No). @param {Element} stage @param {ReturnType<typeof pal>} k */
  _renderRelease(stage, k) {
    const w = 300, h = 70;
    const x = Math.floor((640 - w) / 2), y = Math.floor((360 - h) / 2);
    const el = box(stage, x, y, w, h, 'lu-creature-roster__modal');
    win(el, { size: 'S', beads: true }, x, y, w, h);
    const r = this._active.find((c) => c.uid === this._selUid) ?? this._box.find((c) => c.uid === this._selUid);
    const name = r ? r.name : '';
    txt(el, t('creature.roster.releaseTitle'), x + 10, y + 9, { font: 'small', track: 1, color: k.g4, drop: true });
    const msg = r ? t('creature.roster.releaseConfirm', { name }) : t('creature.roster.releaseConfirm', { name: '' });
    txt(el, msg, x + 10, y + 22, { font: 'body', color: k.tx1, maxW: w - 20, drop: true });
    const opts = [t('creature.roster.release'), t('creature.roster.cancel')];
    let ox = x + w - 10;
    for (let i = opts.length - 1; i >= 0; i--) {
      const yes = i === 0;
      const on = yes === this._releaseYes;
      const label = opts[i];
      const tw = measure(label, 'body');
      ox -= tw;
      txt(el, label, ox, y + h - 15, { font: 'body', color: on ? k.sel : k.tx2, drop: true });
      if (on) put(el, art(tw, 1, (p) => p.hline(0, 0, tw, k.g4)), ox, y + h - 4);
      ox -= 14;
    }
  }
}
