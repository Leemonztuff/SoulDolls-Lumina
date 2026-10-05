import * as THREE from 'three';
import { RNG } from '../utils/math.js';
import './ui.css';
import './combat.css';

/**
 * WorldLabels — world-anchored combat labels in one DOM layer (`.lu-worldfx`, COMBAT.md §13.2):
 * floating damage numbers (pool 40), enemy HP bars / aggro pips (32 slots), off-screen edge arrows
 * (8 slots), the '!' alert (pool 8) and the lock-on reticle. Not depth-occluded (by design: 0 draw
 * calls, crisp, not DOF-blurred). Created by `UI.enableCombat()` on combat levels only.
 *
 * Performance rules: every element is created once in the constructor (pools); `update(dt,
 * camera)` projects the live labels with one view-projection matrix per frame and writes
 * `translate3d` only when the rounded pixel changes; bars fill with `transform: scaleX()` plus a
 * lagging second fill; CSS animations restart by toggling between two identical keyframe names;
 * no layout reads in the frame loop (the viewport size is cached by a ResizeObserver).
 *
 * Anchors are read live: `anchor(vec3, offsetY)` / `alert(vec3, offsetY)` / `reticle(vec3,
 * offsetY)` keep the vector (not a copy) and add `offsetY` world units to its y every frame (like
 * `InteractPrompt` and the enemy defs' `labelY`). World-art pixel scale: `--lu-px` =
 * max(1, round(viewport height / 450)) (2 at 900 px).
 *
 * HUD panels (COMBAT-07): the layer sits under the HUD, so `setPanels()` (called by
 * `UI.enableCombat()` with the location plate, clock, minimap, controls legend, vitals, skill bar
 * and boss bar) makes every label keep out of the panels that are shown (6 px clear; panels less
 * than 48 px apart whose union box is not much bigger than the two — plate + vitals, clock +
 * minimap — count as one zone; the legend and the boss bar stay two): a number, bar, pip,
 * alert or the reticle that would overlap one is moved just outside it (the smallest move that
 * stays on screen and clear of the other zones), and an edge arrow slides inward along its ray
 * until it clears the zone (it still points at its enemy). The panel rects are read in a ResizeObserver callback
 * (after layout — re-armed by a class / style change, a transition's end or a viewport resize),
 * never in the frame loop; still no depth occlusion (D9).
 */

const NUMBER_POOL = 40;
const BAR_POOL = 32;
const EDGE_POOL = 8;
const ALERT_POOL = 8;
/** Lifetimes in ms (wall clock, matching the CSS animations). */
const NUMBER_MS = 800;
const ALERT_MS = 800;
/** Edge arrows sit this far (CSS px) inside the viewport border. */
const EDGE_INSET = 24;
/** Clearance (CSS px) between a label and a HUD panel it keeps out of (COMBAT-07). */
const PANEL_GAP = 6;
/**
 * Shown panels closer than this (CSS px) across one axis while overlapping along the other form one
 * keep-out zone (the location plate + vitals, the clock + minimap): a label never bounces between
 * two panels through a gap it does not fit in — but only when their union box is at most
 * ZONE_MERGE_AREA × the two boxes' areas (plate + vitals ≈ 1.2, clock + minimap ≈ 1.1). The union of
 * the controls legend and the boss bar (≈ 3.1) covered the open lower middle of the screen in
 * every boss fight and pushed labels there up beside the player; kept apart, a label between them
 * still clears both (`_clear` only takes a move that is clear of the other zones).
 */
const ZONE_MERGE = 48;
const ZONE_MERGE_AREA = 1.5;
/** ±px of seeded scatter on a new number. */
const SCATTER = 12;
/**
 * Stacking: a number spawned within STACK_MS of another at the same anchor (±0.8 u) — a combo's
 * hits, a hit's 'Guard' — starts one line higher per earlier one and alternates sides by
 * STACK_SIDE px (they used to fuse: "23" + "19" read "2319", "Guard" sat on "19").
 */
const STACK_MS = 520;
const STACK_SIDE = 18;
const NUMBER_KINDS = new Set(['dmg', 'crit', 'hurt', 'heal', 'mp', 'guard', 'perfect']);
/** Kinds with a fixed text. */
const NUMBER_TEXT = { guard: 'Guard', perfect: 'Perfect!' };

// ---- pixel art ------------------------------------------------------------------------------

/**
 * Pixel-art SVG from a char map (one `<rect>` per horizontal run of a colour; '.' = empty), like the
 * interaction prompt's bubble. `shape-rendering: crispEdges`, so integer scales stay sharp.
 * @param {string[]} rows
 * @param {Record<string, string>} colors
 * @returns {string} SVG markup
 */
export function pixelSvg(rows, colors) {
  const w = rows[0].length;
  const h = rows.length;
  let body = '';
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      if (ch !== '.' && colors[ch]) body += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${colors[ch]}"/>`;
      x += run;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
}

/** CSS `url()` value of an SVG string (for background images set through custom properties). */
export function svgUrl(svg) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// aggro pip: a 4×4 px red diamond inside a 1 px dark outline
const PIP = [
  '..OO..',
  '.OHRO.',
  'ORHRRO',
  'ORRRDO',
  '.ODDO.',
  '..OO..',
];
const PIP_COLORS = { O: '#1a0b08', R: '#e8483a', H: '#ff9c86', D: '#a8231c' };

// '!' alert (telegraph red-orange)
const ALERT = [
  '..OOO..',
  '.OHYYO.',
  '.OYYYO.',
  '.OYYDO.',
  '..OYO..',
  '..OYO..',
  '..ODO..',
  '...O...',
  '..OOO..',
  '.OHYYO.',
  '.ODDDO.',
  '..OOO..',
];
const ALERT_COLORS = { O: '#1a0b08', Y: '#ff7a3c', H: '#ffd6a8', D: '#c03d1c' };

// lock-on reticle: one corner (top-left) — a gold diamond with two bracket arms; the other three
// corners are this quadrant mirrored
const RETICLE = [
  '...O........',
  '..OHO.......',
  '.OHGGOOOOOO.',
  'OHGGGDGGGGGO',
  '.OGGDOOOOOO.',
  '..ODO.......',
  '..OGO.......',
  '..OGO.......',
  '..OGO.......',
  '..OGO.......',
  '..ODO.......',
  '...O........',
];
const RETICLE_COLORS = { O: '#1a1206', H: '#fff4d0', G: '#e8cf8a', D: '#8c6a32' };

// off-screen edge arrow (vector: it rotates freely), pointing +x
const EDGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M3.5 4.2 21 12 3.5 19.8 7.4 12z" fill="#ff6a3a" stroke="#1a0b08" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M6.2 6.9 16.6 11.6 8.6 11.6z" fill="#ffd0a8" opacity=".75"/>
</svg>`;

/** Handle returned for an out-of-range slot (does nothing). */
const NOOP_HANDLE = Object.freeze({
  anchor() { return this; },
  set() { return this; },
  show() { return this; },
  hide() { return this; },
});

// ---- slot handles -----------------------------------------------------------------------------

/** One enemy bar slot (bar or aggro pip). */
class BarSlot {
  constructor(layer) {
    const el = document.createElement('div');
    el.className = 'lu-ebar';
    el.innerHTML = '<div class="lu-ebar__in"><div class="lu-ebar__name"><span class="lu-ebar__lv"></span></div>'
      + '<div class="lu-ebar__frame"><i class="lu-ebar__lag"></i><i class="lu-ebar__fill"></i></div>'
      + '<i class="lu-ebar__pip"></i></div>';
    layer.appendChild(el);
    this.el = el;
    /** @type {HTMLElement} */
    this._fill = el.querySelector('.lu-ebar__fill');
    /** @type {HTMLElement} */
    this._lag = el.querySelector('.lu-ebar__lag');
    this._lvText = document.createTextNode('');
    el.querySelector('.lu-ebar__lv').appendChild(this._lvText);
    this._nameText = document.createTextNode('');
    el.querySelector('.lu-ebar__name').appendChild(this._nameText);
    /** @type {{ x: number, y: number, z: number }|null} anchor, read live (Vector3 or any xyz) */
    this.ref = null;
    this.oy = 0;
    this.on = false;
    this.out = false;
    this.x = NaN;
    this.y = NaN;
    this._q = -1;
    this._pip = false;
    this._elite = false;
    this._lv = -1;
    this._name = '';
    this._snap = true;
    this._snapClass = false;
  }

  /**
   * Follow a world point (read live every frame) plus `offsetY` world units.
   * @param {THREE.Vector3|{x:number,y:number,z:number}|null} vec3
   * @param {number} [offsetY]
   */
  anchor(vec3, offsetY = 0) {
    if (vec3 !== this.ref) { this.ref = vec3 ?? null; this._snap = true; this.x = NaN; }
    this.oy = +offsetY || 0;
    return this;
  }

  /**
   * @param {number} frac HP fraction 0..1
   * @param {{ elite?: boolean, level?: number, name?: string, pip?: boolean }} [opts]
   *   pip: only the small red diamond (aggroed, undamaged); elite: gold frame + "Lv N name"
   */
  set(frac, opts) {
    // a slot that just changed enemy (or was hidden) jumps its lag fill instead of draining it
    if (this._snap) {
      this._snap = false;
      if (!this._snapClass) { this._snapClass = true; this._lag.classList.add('is-snap'); }
    } else if (this._snapClass) {
      this._snapClass = false;
      this._lag.classList.remove('is-snap');
    }
    const f = frac > 0 ? (frac < 1 ? frac : 1) : 0;
    const q = Math.round(f * 1000);
    if (q !== this._q) {
      this._q = q;
      const s = `scaleX(${q / 1000})`;
      this._fill.style.transform = s;
      this._lag.style.transform = s;
    }
    const pip = !!(opts && opts.pip);
    if (pip !== this._pip) { this._pip = pip; this.el.classList.toggle('is-pip', pip); }
    const elite = !!(opts && opts.elite);
    if (elite !== this._elite) { this._elite = elite; this.el.classList.toggle('is-elite', elite); }
    if (elite) {
      const lv = opts.level | 0;
      if (lv !== this._lv) { this._lv = lv; this._lvText.nodeValue = lv > 0 ? `Lv ${lv} ` : ''; }
      const name = opts.name ? String(opts.name) : '';
      if (name !== this._name) { this._name = name; this._nameText.nodeValue = name; }
    }
    return this;
  }

  show() {
    if (!this.on) {
      this.on = true;
      this._snap = true;
      this.x = NaN;
      this.el.classList.add('is-on');
    }
    return this;
  }

  hide() {
    if (this.on) { this.on = false; this.el.classList.remove('is-on'); }
    return this;
  }
}

/** One off-screen edge-arrow slot. */
class EdgeSlot {
  constructor(layer) {
    const el = document.createElement('div');
    el.className = 'lu-edge';
    el.innerHTML = '<i class="lu-edge__glow"></i><i class="lu-edge__a"></i>';
    layer.appendChild(el);
    this.el = el;
    /** @type {{ x: number, y: number, z: number }|null} anchor, read live (Vector3 or any xyz) */
    this.ref = null;
    this.oy = 0;
    this.on = false;
    this.inside = false;
    this.x = NaN;
    this.y = NaN;
    this.a = NaN;
    this._windup = false;
  }

  /**
   * @param {THREE.Vector3|{x:number,y:number,z:number}|null} vec3 read live
   * @param {number} [offsetY] world units
   */
  anchor(vec3, offsetY = 0) {
    this.ref = vec3 ?? null;
    this.oy = +offsetY || 0;
    return this;
  }

  /** @param {{ windup?: boolean }} [opts] windup: the enemy telegraphs an attack (the arrow pulses) */
  set(opts) {
    const w = !!(opts && opts.windup);
    if (w !== this._windup) { this._windup = w; this.el.classList.toggle('is-windup', w); }
    return this;
  }

  show() {
    if (!this.on) { this.on = true; this.x = NaN; this.el.classList.add('is-on'); }
    return this;
  }

  hide() {
    if (this.on) { this.on = false; this.el.classList.remove('is-on'); }
    return this;
  }
}

// ---- component ------------------------------------------------------------------------------

/**
 * A HUD panel given to `setPanels` as a wrapper: `shown` says whether it counts right now.
 * @typedef {{ el: HTMLElement, shown?: () => boolean }} PanelSpec
 */

export class WorldLabels {
  /** @param {HTMLElement} root the UI root (`#lumina-ui`) */
  constructor(root) {
    this.root = root;
    const el = document.createElement('div');
    el.className = 'lu-worldfx';
    el.setAttribute('aria-hidden', 'true');
    el.style.setProperty('--lu-ico-pip', svgUrl(pixelSvg(PIP, PIP_COLORS)));
    el.style.setProperty('--lu-ico-alert', svgUrl(pixelSvg(ALERT, ALERT_COLORS)));
    el.style.setProperty('--lu-ico-ret', svgUrl(pixelSvg(RETICLE, RETICLE_COLORS)));
    el.style.setProperty('--lu-ico-edge', svgUrl(EDGE_SVG));
    // under the interaction prompt (same z-index, earlier in the DOM)
    root.insertBefore(el, root.querySelector(':scope > .lu-prompt') ?? root.firstChild);
    this.element = el;

    // paint order inside the layer: bars, edge arrows, alerts, reticle, numbers on top
    /** @type {BarSlot[]} */
    this._bars = [];
    for (let i = 0; i < BAR_POOL; i++) this._bars.push(new BarSlot(el));
    /** @type {EdgeSlot[]} */
    this._edges = [];
    for (let i = 0; i < EDGE_POOL; i++) this._edges.push(new EdgeSlot(el));

    this._alerts = [];
    for (let i = 0; i < ALERT_POOL; i++) {
      const a = document.createElement('div');
      a.className = 'lu-alert';
      a.innerHTML = '<i class="lu-alert__i"></i>';
      el.appendChild(a);
      this._alerts.push({ el: a, ref: null, oy: 0, end: 0, live: false, flip: false, out: false, x: NaN, y: NaN });
    }
    this._alertNext = 0;

    const ret = document.createElement('div');
    ret.className = 'lu-reticle';
    ret.innerHTML = '<i class="lu-reticle__c lu-reticle__c--tl"></i><i class="lu-reticle__c lu-reticle__c--tr"></i>'
      + '<i class="lu-reticle__c lu-reticle__c--bl"></i><i class="lu-reticle__c lu-reticle__c--br"></i>';
    el.appendChild(ret);
    this._reticle = { el: ret, ref: null, oy: 0, on: false, out: false, x: NaN, y: NaN };

    this._nums = [];
    for (let i = 0; i < NUMBER_POOL; i++) {
      const n = document.createElement('div');
      n.className = 'lu-num';
      const t = document.createElement('span');
      t.className = 'lu-num__t';
      const text = document.createTextNode('');
      t.appendChild(text);
      n.appendChild(t);
      el.appendChild(n);
      this._nums.push({ el: n, text, str: '', em: 1.2, pop: false, live: false, end: 0, flip: false, wx: 0, wy: 0, wz: 0, dx: 0, dy: 0, out: false, x: NaN, y: NaN });
    }
    this._numNext = 0;
    /** Visual-only scatter RNG (never the combat RNG). */
    this._rng = new RNG(0x6d6e);

    this._vp = new THREE.Matrix4();
    this._m = this._vp.elements;
    this._ready = false;
    this._cx = 0;
    this._cy = 0;
    this._cw = 1;
    this._sx = 0;
    this._sy = 0;
    this._w = root.clientWidth || window.innerWidth;
    this._h = root.clientHeight || window.innerHeight;
    this._px = 0;
    this._applyScale();
    this._ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      this._w = root.clientWidth || window.innerWidth;
      this._h = root.clientHeight || window.innerHeight;
      this._applyScale();
      this._invalidate();
    }) : null;
    this._ro?.observe(root);

    /**
     * HUD panels the labels keep out of (`setPanels`): { el, shown, on, has, l, t, r, b } — rect in
     * root pixels, measured after layout.
     */
    this._panels = [];
    this._panelOn = 0;
    /** Keep-out zones of this frame: the shown panels' rects grown by PANEL_GAP, near ones merged. */
    this._zones = [];
    for (let i = 0; i < 8; i++) this._zones.push({ l: 0, t: 0, r: 0, b: 0 });
    this._zoneN = 0;
    this._panelRo = null;
    this._panelMo = null;
    this._onPanelEnd = (e) => {
      for (const p of this._panels) {
        if (e.target === p.el) { this._remeasurePanels(); return; }
      }
    };
  }

  /**
   * HUD panels the labels stay out of (COMBAT-07; `UI.enableCombat()` passes the HUD's). A number,
   * bar, pip, alert or the reticle that would overlap a shown panel is moved just outside it (the
   * smallest move that stays on screen); an edge arrow slides inward along its ray until it clears
   * it. Replaces the previous list; `[]` turns it off.
   * @param {(HTMLElement | PanelSpec)[]} list shown: whether the panel counts right now (read
   *   once per frame, no DOM reads; default: while it has a box)
   */
  setPanels(list) {
    this._disconnectPanels();
    this._panels = [];
    for (const item of list ?? []) {
      // casts: the `typeof Element` guard keeps TS from narrowing `item` to the wrapper
      const el = typeof Element !== 'undefined' && item instanceof Element ? item : /** @type {PanelSpec} */ (item)?.el;
      if (!el) continue;
      const shown = el === item ? null : /** @type {PanelSpec} */ (item).shown ?? null;
      this._panels.push({ el, shown, on: false, has: false, l: 0, t: 0, r: 0, b: 0 });
    }
    if (!this._panels.length || typeof ResizeObserver !== 'function') return;
    // measured in the observer's callback (after layout: no forced layout); observing the root too
    // gives a callback to re-arm (an element's first observation always reports while it renders)
    this._panelRo = new ResizeObserver(() => this._measurePanels());
    this._panelRo.observe(this.root);
    this._panelMo = typeof MutationObserver === 'function' ? new MutationObserver(() => this._remeasurePanels()) : null;
    for (const p of this._panels) {
      this._panelRo.observe(p.el);
      this._panelMo?.observe(p.el, { attributes: true, attributeFilter: ['class', 'style'] });
      p.el.addEventListener('transitionend', this._onPanelEnd);
      p.el.addEventListener('animationend', this._onPanelEnd);
    }
  }

  /**
   * A floating number at a world point (rises ~24 px and fades over 0.8 s; seeded ±12 px scatter;
   * numbers spawned in quick succession at the same anchor stack upward, alternating sides).
   * The oldest number is reused when all 40 are live.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {string|number} text ignored for 'guard' ('Guard') and 'perfect' ('Perfect!')
   * @param {'dmg'|'crit'|'hurt'|'heal'|'mp'|'guard'|'perfect'} [kind]
   */
  number(x, y, z, text, kind = 'dmg') {
    const k = NUMBER_KINDS.has(kind) ? kind : 'dmg';
    const n = this._nums[this._numNext];
    this._numNext = (this._numNext + 1) % NUMBER_POOL;
    const now = performance.now();
    // earlier numbers at the same anchor that are still young: stack above them
    let stack = 0;
    for (let i = 0; i < NUMBER_POOL; i++) {
      const o = this._nums[i];
      if (o === n || !o.live || o.end - now < NUMBER_MS - STACK_MS) continue;
      if (Math.abs(o.wx - x) < 0.8 && Math.abs(o.wz - z) < 0.8 && Math.abs(o.wy - y) < 1.2) stack++;
    }
    n.wx = x;
    n.wy = y;
    n.wz = z;
    const sx = this._rng.range(-SCATTER, SCATTER);
    const sy = this._rng.range(-SCATTER, SCATTER);
    if (stack === 0) {
      n.dx = sx;
      n.dy = sy;
    } else {
      // one line (≈ the number's font size, --lu-fs-md × 1.2; a crit's is 1.5×) per earlier number
      const line = (k === 'crit' ? 1.5 : 1.05) * 1.2 * Math.min(28, Math.max(14, 0.0112 * this._w));
      n.dx = (stack % 2 ? STACK_SIDE : -STACK_SIDE) + sx * 0.25;
      n.dy = -stack * line + sy * 0.2;
    }
    n.end = now + NUMBER_MS;
    n.live = true;
    n.em = k === 'crit' ? 1.8 : k === 'perfect' ? 1.35 : k === 'guard' ? 1.05 : 1.2;
    n.pop = k === 'crit' || k === 'perfect';
    const str = NUMBER_TEXT[k] ?? String(text ?? '');
    if (str !== n.str) { n.str = str; n.text.nodeValue = str; }
    n.flip = !n.flip;
    n.el.className = `lu-num lu-num--${k} ${n.flip ? 'is-a' : 'is-b'}`;
    n.out = false;
    n.x = NaN;
    if (this._ready) this._placeNumber(n);
  }

  /**
   * Enemy bar slot (0..31): `{ anchor(vec3, offsetY), set(frac, { elite, level, name, pip }), show(), hide() }`.
   * The handle is persistent (same object for the same slot); an out-of-range slot returns a no-op handle.
   * @param {number} slot
   */
  bar(slot) {
    return this._bars[slot] ?? NOOP_HANDLE;
  }

  /**
   * Off-screen edge-arrow slot (0..7): `{ anchor(vec3, offsetY), set({ windup }), show(), hide() }`.
   * The arrow sits on the viewport border (inset 24 px) on the line from the screen centre to the
   * anchor and points at it; it hides itself while the anchor is inside that inset rectangle.
   * @param {number} slot
   */
  edge(slot) {
    return this._edges[slot] ?? NOOP_HANDLE;
  }

  /**
   * '!' above a world point for 0.8 s, following it (pool 8; the oldest is reused).
   * @param {THREE.Vector3|{x:number,y:number,z:number}} vec3 read live
   * @param {number} [offsetY] world units
   */
  alert(vec3, offsetY = 0) {
    if (!vec3) return;
    const a = this._alerts[this._alertNext];
    this._alertNext = (this._alertNext + 1) % ALERT_POOL;
    a.ref = vec3;
    a.oy = +offsetY || 0;
    a.end = performance.now() + ALERT_MS;
    a.live = true;
    a.flip = !a.flip;
    a.out = false;
    a.x = NaN;
    a.el.className = `lu-alert ${a.flip ? 'is-a' : 'is-b'}`;
    if (this._ready) this._placeAlert(a);
  }

  /**
   * Lock-on reticle on a world point (read live), or null to hide it.
   * @param {THREE.Vector3|{x:number,y:number,z:number}|null} vec3
   * @param {number} [offsetY] world units
   */
  reticle(vec3, offsetY = 0) {
    const r = this._reticle;
    r.oy = +offsetY || 0;
    const on = !!vec3;
    if (vec3 !== r.ref) { r.ref = vec3 ?? null; r.x = NaN; }
    if (on !== r.on) { r.on = on; r.el.classList.toggle('is-on', on); }
  }

  /**
   * Project every live label (one `camera.updateMatrixWorld()` and one matrix multiply per frame).
   * `UI.update` calls it after the interaction prompt.
   * @param {number} dt
   * @param {THREE.Camera} camera
   */
  update(dt, camera) {
    if (!camera) return;
    camera.updateMatrixWorld();
    this._vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._ready = true;
    const now = performance.now();

    // the keep-out zones of this frame (panel rects are cached; `shown` reads JS / class state)
    const on = this._buildZones();

    const bars = this._bars;
    const px = this._px;
    for (let i = 0; i < BAR_POOL; i++) {
      const b = bars[i];
      if (!b.on) continue;
      const r = b.ref;
      const vis = !!r && this._screen(r.x, r.y + b.oy, r.z);
      this._setOut(b, !vis);
      if (!vis) continue;
      if (on) {
        // the bar hangs above its anchor: 34 × 4 art px (an elite adds its name line), a pip 6 × 6
        let hw = 17 * px + 1;
        let up = 4 * px + 2;
        if (b._pip) { hw = 3 * px + 1; up = 6 * px + 1; } else if (b._elite) {
          const fs = Math.min(23, Math.max(12, 0.0092 * this._w));
          hw = Math.max(hw, (b._name.length + (b._lv > 0 ? 5 : 0)) * 0.32 * fs + 2);
          up += fs + 2 * px;
        }
        this._clear(this._sx, this._sy, hw, up, 2);
      }
      this._move(b, this._sx, this._sy);
    }

    const edges = this._edges;
    for (let i = 0; i < EDGE_POOL; i++) {
      const e = edges[i];
      if (e.on) this._placeEdge(e);
    }

    const alerts = this._alerts;
    for (let i = 0; i < ALERT_POOL; i++) {
      const a = alerts[i];
      if (!a.live) continue;
      if (now >= a.end) {
        a.live = false;
        a.ref = null;
        a.el.className = 'lu-alert';
        continue;
      }
      this._placeAlert(a);
    }

    const r = this._reticle;
    if (r.on) {
      const p = r.ref;
      const vis = this._screen(p.x, p.y + r.oy, p.z);
      this._setOut(r, !vis);
      if (vis) {
        if (on) this._clear(this._sx, this._sy, 20 * px + 1, 20 * px + 1, 20 * px + 1);
        this._move(r, this._sx, this._sy);
      }
    }

    const nums = this._nums;
    for (let i = 0; i < NUMBER_POOL; i++) {
      const n = nums[i];
      if (!n.live) continue;
      if (now >= n.end) {
        n.live = false;
        n.el.className = 'lu-num';
        continue;
      }
      this._placeNumber(n);
    }
  }

  /** Hide every label (numbers, bars, pips, edge arrows, alerts and the reticle). */
  clear() {
    for (const n of this._nums) {
      if (!n.live) continue;
      n.live = false;
      n.el.className = 'lu-num';
    }
    for (const b of this._bars) b.hide();
    for (const e of this._edges) e.hide();
    for (const a of this._alerts) {
      if (!a.live) continue;
      a.live = false;
      a.ref = null;
      a.el.className = 'lu-alert';
    }
    this.reticle(null);
  }

  /** Number of live floating numbers (tests). */
  get liveNumbers() {
    let c = 0;
    for (const n of this._nums) if (n.live) c++;
    return c;
  }

  dispose() {
    this._ro?.disconnect();
    this._disconnectPanels();
    this._panels = [];
    this.element.remove();
  }

  // ------------------------------------------------------------------------------------------

  /** Clip coordinates of a world point with the cached view-projection matrix. */
  _clip(x, y, z) {
    const m = this._m;
    this._cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    this._cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    this._cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  }

  /**
   * Screen position (CSS px) into `_sx`, `_sy`.
   * @returns {boolean} false when behind the camera or well outside the view
   */
  _screen(x, y, z) {
    this._clip(x, y, z);
    const w = this._cw;
    if (!(w > 1e-4)) return false;
    const nx = this._cx / w;
    const ny = this._cy / w;
    if (nx < -1.25 || nx > 1.25 || ny < -1.25 || ny > 1.35) return false;
    this._sx = (nx * 0.5 + 0.5) * this._w;
    this._sy = (0.5 - ny * 0.5) * this._h;
    return true;
  }

  _move(rec, x, y) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx !== rec.x || ry !== rec.y) {
      rec.x = rx;
      rec.y = ry;
      rec.el.style.transform = `translate3d(${rx}px,${ry}px,0)`;
    }
  }

  _setOut(rec, out) {
    if (out !== rec.out) {
      rec.out = out;
      rec.el.classList.toggle('is-out', out);
    }
  }

  _placeNumber(n) {
    const vis = this._screen(n.wx, n.wy, n.wz);
    this._setOut(n, !vis);
    if (!vis) return;
    let x = this._sx + n.dx;
    let y = this._sy + n.dy;
    if (this._panelOn) {
      // centred text (Pixelify digits ≈ 0.9 em + the 2 px outline) that pops in (a crit from
      // 1.9 ×) and rises 24 px as it fades
      const f = Math.min(28, Math.max(14, 0.0112 * this._w)) * n.em;
      this._clear(x, y, n.str.length * 0.5 * f + 4, f * 1.1 + 24, n.pop ? f : f * 0.7);
      x = this._sx;
      y = this._sy;
    }
    this._move(n, x, y);
  }

  _placeAlert(a) {
    const p = a.ref;
    const vis = this._screen(p.x, p.y + a.oy, p.z);
    this._setOut(a, !vis);
    if (!vis) return;
    // the '!' pops up from 4 art px below its anchor (scale 0.4 → 1.2)
    if (this._panelOn) this._clear(this._sx, this._sy, 4.5 * this._px + 1, 15 * this._px, 4 * this._px + 1);
    this._move(a, this._sx, this._sy);
  }

  /**
   * Build this frame's keep-out zones from the shown panels (grown by PANEL_GAP; panels within
   * ZONE_MERGE of each other merged when their union is compact, ZONE_MERGE_AREA). Returns the
   * number of shown panels.
   */
  _buildZones() {
    const P = this._panels;
    const Z = this._zones;
    let on = 0;
    let n = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.on = p.has && (!p.shown || !!p.shown());
      if (!p.on) continue;
      on++;
      if (n >= Z.length) Z.push({ l: 0, t: 0, r: 0, b: 0 });
      const z = Z[n++];
      z.l = p.l - PANEL_GAP;
      z.t = p.t - PANEL_GAP;
      z.r = p.r + PANEL_GAP;
      z.b = p.b + PANEL_GAP;
    }
    // merge near neighbours (≤ 7 panels: a few passes of a tiny pairwise loop)
    for (let merged = true; merged;) {
      merged = false;
      for (let a = 0; a < n && !merged; a++) {
        for (let b = a + 1; b < n; b++) {
          const A = Z[a];
          const B = Z[b];
          const gapX = Math.max(A.l, B.l) - Math.min(A.r, B.r);
          const gapY = Math.max(A.t, B.t) - Math.min(A.b, B.b);
          if (!((gapX < 0 && gapY < ZONE_MERGE) || (gapY < 0 && gapX < ZONE_MERGE))) continue;
          const union = (Math.max(A.r, B.r) - Math.min(A.l, B.l)) * (Math.max(A.b, B.b) - Math.min(A.t, B.t));
          if (union > ZONE_MERGE_AREA * ((A.r - A.l) * (A.b - A.t) + (B.r - B.l) * (B.b - B.t))) continue;
          A.l = Math.min(A.l, B.l);
          A.t = Math.min(A.t, B.t);
          A.r = Math.max(A.r, B.r);
          A.b = Math.max(A.b, B.b);
          const last = Z[--n];
          Z[n] = B;
          Z[b] = last;
          merged = true;
          break;
        }
      }
    }
    this._zoneN = n;
    this._panelOn = on;
    return on;
  }

  /** Does the box overlap a keep-out zone other than `skip`? */
  _hitsZone(x, y, hw, up, down, skip) {
    const Z = this._zones;
    for (let i = 0; i < this._zoneN; i++) {
      if (i === skip) continue;
      const z = Z[i];
      if (x + hw > z.l && x - hw < z.r && y + down > z.t && y - up < z.b) return true;
    }
    return false;
  }

  /**
   * Move a label box (anchor x, y; half width `hw`, `up` above and `down` below the anchor, CSS px)
   * out of the keep-out zones into `_sx`, `_sy`: for an overlapped zone the smallest of the four
   * moves (left, right, above, below) that keeps the box on screen along that axis and clear of the
   * other zones (else the smallest on-screen one). Three passes at most.
   */
  _clear(x, y, hw, up, down) {
    const Z = this._zones;
    const W = this._w;
    const H = this._h;
    for (let pass = 0; pass < 3; pass++) {
      let k = -1;
      for (let i = 0; i < this._zoneN; i++) {
        const z = Z[i];
        if (x + hw > z.l && x - hw < z.r && y + down > z.t && y - up < z.b) { k = i; break; }
      }
      if (k < 0) break;
      const z = Z[k];
      let best = Infinity;
      let fall = Infinity;
      let bx = x;
      let by = y;
      let fx = x;
      let fy = y;
      for (let c = 0; c < 4; c++) {
        let nx = x;
        let ny = y;
        if (c === 0) { nx = z.l - hw; if (nx - hw < 0) continue; } else if (c === 1) { nx = z.r + hw; if (nx + hw > W) continue; } else if (c === 2) { ny = z.t - down; if (ny - up < 0) continue; } else { ny = z.b + up; if (ny + down > H) continue; }
        const d = Math.abs(nx - x) + Math.abs(ny - y);
        if (d < fall) { fall = d; fx = nx; fy = ny; }
        if (d < best && !this._hitsZone(nx, ny, hw, up, down, k)) { best = d; bx = nx; by = ny; }
      }
      if (best < Infinity) { x = bx; y = by; } else if (fall < Infinity) { x = fx; y = fy; } else break;
    }
    this._sx = x;
    this._sy = y;
  }

  /** Measure the panels (ResizeObserver callback: after layout, so no forced layout). */
  _measurePanels() {
    const root = this.root.getBoundingClientRect();
    for (const p of this._panels) {
      const r = p.el.getBoundingClientRect();
      p.has = r.width > 0 && r.height > 0 && p.el.isConnected;
      p.l = r.left - root.left;
      p.t = r.top - root.top;
      p.r = r.right - root.left;
      p.b = r.bottom - root.top;
    }
    for (const n of this._nums) n.x = NaN;
    for (const b of this._bars) b.x = NaN;
    for (const e of this._edges) e.x = NaN;
    for (const a of this._alerts) a.x = NaN;
    this._reticle.x = NaN;
  }

  /** Ask for a new measurement after the next layout (re-observing the root reports it once). */
  _remeasurePanels() {
    const ro = this._panelRo;
    if (!ro) return;
    ro.unobserve(this.root);
    ro.observe(this.root);
  }

  _disconnectPanels() {
    this._panelRo?.disconnect();
    this._panelMo?.disconnect();
    this._panelRo = null;
    this._panelMo = null;
    for (const p of this._panels) {
      p.el.removeEventListener('transitionend', this._onPanelEnd);
      p.el.removeEventListener('animationend', this._onPanelEnd);
      p.on = false;
    }
    this._panelOn = 0;
    this._zoneN = 0;
  }

  _placeEdge(e) {
    const p = e.ref;
    if (!p) { this._setInside(e, true); return; }
    this._clip(p.x, p.y + e.oy, p.z);
    const W = this._w;
    const H = this._h;
    const cx = W * 0.5;
    const cy = H * 0.5;
    const hw = Math.max(1, cx - EDGE_INSET);
    const hh = Math.max(1, cy - EDGE_INSET);
    const w = this._cw;
    let dx;
    let dy;
    if (w > 1e-4) {
      dx = (this._cx / w) * cx;
      dy = -(this._cy / w) * cy;
      // on screen (inside the inset rectangle): no arrow
      if (Math.abs(dx) <= hw && Math.abs(dy) <= hh) { this._setInside(e, true); return; }
    } else {
      // behind the camera: the clip x / y keep the lateral direction (symmetric frustum)
      dx = this._cx * cx;
      dy = -this._cy * cy;
      if (dx === 0 && dy === 0) dy = 1;
    }
    this._setInside(e, false);
    let t = Math.min(hw / (Math.abs(dx) || 1e-9), hh / (Math.abs(dy) || 1e-9));
    if (this._panelOn) t = this._edgeClear(cx, cy, dx, dy, t, 9 * this._px + 1);
    const x = Math.round(cx + dx * t);
    const y = Math.round(cy + dy * t);
    const a = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
    if (x !== e.x || y !== e.y || a !== e.a) {
      e.x = x;
      e.y = y;
      e.a = a;
      e.el.style.transform = `translate3d(${x}px,${y}px,0) rotate(${a}deg)`;
    }
  }

  /**
   * Slide an edge arrow (radius `rad`) inward along its ray from the screen centre (cx, cy) in
   * direction (dx, dy) until it clears every shown HUD panel: returns the new ray parameter.
   */
  _edgeClear(cx, cy, dx, dy, t, rad) {
    const Z = this._zones;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let i = 0; i < this._zoneN; i++) {
        const z = Z[i];
        // slab test of the ray against the zone grown by the arrow's radius: [s0, s1] inside
        let s0 = 0;
        let s1 = Infinity;
        if (Math.abs(dx) < 1e-9) {
          if (cx < z.l - rad || cx > z.r + rad) continue;
        } else {
          const a = (z.l - rad - cx) / dx;
          const b = (z.r + rad - cx) / dx;
          s0 = Math.max(s0, Math.min(a, b));
          s1 = Math.min(s1, Math.max(a, b));
        }
        if (Math.abs(dy) < 1e-9) {
          if (cy < z.t - rad || cy > z.b + rad) continue;
        } else {
          const a = (z.t - rad - cy) / dy;
          const b = (z.b + rad - cy) / dy;
          s0 = Math.max(s0, Math.min(a, b));
          s1 = Math.min(s1, Math.max(a, b));
        }
        if (s0 > s1 || t < s0 || t > s1 || s0 <= 0) continue;
        t = s0 - 1e-3;
        moved = true;
      }
      if (!moved) break;
    }
    return t;
  }

  _setInside(e, inside) {
    if (inside !== e.inside) {
      e.inside = inside;
      e.el.classList.toggle('is-in', inside);
    }
  }

  /** Force a transform write for everything on the next update (after a resize). */
  _invalidate() {
    for (const n of this._nums) n.x = NaN;
    for (const b of this._bars) b.x = NaN;
    for (const e of this._edges) e.x = NaN;
    for (const a of this._alerts) a.x = NaN;
    this._reticle.x = NaN;
  }

  _applyScale() {
    // whole-number pixel-art scale (bars, pips, alert, reticle stay crisp and even)
    const px = Math.max(1, Math.round(this._h / 450));
    if (px !== this._px) {
      this._px = px;
      this.element.style.setProperty('--lu-px', String(px));
    }
  }
}
