import './ui.css';

/**
 * Map UI for big levels: a small ornate HUD minimap (top-right, below the clock) and a
 * full-screen world map overlay. Both draw a pre-rendered map image (e.g. LevelMap.renderLevelMap:
 * `{ canvas, pixelsPerTile, width, depth }`, world (x, z) ↦ canvas (x · ppt, z · ppt)) — the
 * minimap only pans and crops it every frame — plus live markers: the player arrow (turned to the
 * facing, with the camera's view wedge), villagers and points of interest.
 *
 * Markers passed to `update()`:
 *   { player: {x, z}, facing: {x, z}, view?: {x, z} (camera look direction on the ground),
 *     npcs?: {x, z}[], markers?: {x, z, kind: 'sign'|'door'|'well'|'fire'|'object'|'waystone'|'chest'|'boss'}[],
 *     enemies?: {x, z}[] (combat levels: red dots) }
 * `markers` and `enemies` are read on every draw, so a game may push into / splice those arrays
 * at runtime.
 */

/**
 * A world-map region name with the layout state kept on the element: `_inside` (fallback anchors,
 * fractions of the map), `_box` (its placed box relative to the map; null = not placed) and `_dim`
 * (faded because it lies over the player arrow).
 * @typedef WorldMapLabel
 * @type {HTMLDivElement & { _inside?: number[][], _dim?: boolean,
 *   _box?: { left: number, right: number, top: number, bottom: number }|null }}
 */

const TAU = Math.PI * 2;
const DEFAULT_FACING = Object.freeze({ x: 0, z: 1 });
/**
 * Fallback anchors of a world-map region name inside its rect (fractions of its width / depth),
 * nearest the centre first: a 5 × 5 grid without the centre itself.
 */
const INSIDE_SPOTS = (() => {
  const f = [0.2, 0.35, 0.5, 0.65, 0.8];
  const out = [];
  for (const u of f) for (const v of f) if (u !== 0.5 || v !== 0.5) out.push([u, v]);
  return out.sort((a, b) => (Math.hypot(a[0] - 0.5, a[1] - 0.5) - Math.hypot(b[0] - 0.5, b[1] - 0.5)) || (a[1] - b[1]) || (a[0] - b[0]));
})();
const MARKER_COLORS = {
  fire: '#ff9a3c', door: '#e9d49a', sign: '#f2d27a', well: '#9cc8f0', object: '#f2d27a',
  // combat levels (COMBAT.md §13.3)
  waystone: '#7fe3ff', chest: '#e8cf8a', boss: '#e0674f',
};
/** Enemy dots (combat levels). */
const ENEMY_COLOR = '#e0674f';

function drawArrow(ctx, x, y, angle, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.72, size * 0.78);
  ctx.lineTo(0, size * 0.38);
  ctx.lineTo(-size * 0.72, size * 0.78);
  ctx.closePath();
  ctx.fillStyle = '#fff4d2';
  ctx.strokeStyle = '#2a1a08';
  ctx.lineWidth = Math.max(1.5, size * 0.22);
  ctx.stroke();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.72, size * 0.78);
  ctx.lineTo(0, size * 0.38);
  ctx.closePath();
  ctx.fillStyle = '#e0b85c';
  ctx.fill();
  ctx.restore();
}

function drawDiamond(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fillStyle = '#1a1206';
  ctx.fill();
  ctx.beginPath();
  const k = r * 0.62;
  ctx.moveTo(x, y - k);
  ctx.lineTo(x + k, y);
  ctx.lineTo(x, y + k);
  ctx.lineTo(x - k, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawDot(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r + Math.max(1, r * 0.45), 0, TAU);
  ctx.fillStyle = 'rgba(20, 14, 6, 0.9)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** CSS colour of the map image's top-left pixel (the level's border), for margins past the map. */
function edgeColour(map) {
  try {
    const d = map?.canvas?.getContext?.('2d')?.getImageData(0, 0, 1, 1).data;
    return d ? `rgb(${d[0]}, ${d[1]}, ${d[2]})` : null;
  } catch {
    return null;
  }
}

/** Canvas backing-store sizing that follows the element's CSS size (ResizeObserver, no layout reads per frame). */
class CanvasSizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this._ro = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
      const r = entries[entries.length - 1].contentRect;
      this._set(r.width, r.height);
    }) : null;
    this._ro?.observe(canvas);
  }

  _set(w, h) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, Math.round(w * this.dpr));
    this.h = Math.max(1, Math.round(h * this.dpr));
    if (this.canvas.width !== this.w || this.canvas.height !== this.h) {
      this.canvas.width = this.w;
      this.canvas.height = this.h;
    }
  }

  /** Read the size now (after a display change, when the observer has not reported yet). */
  measure() {
    const r = this.canvas.getBoundingClientRect();
    if (r.width > 0) this._set(r.width, r.height);
  }

  dispose() {
    this._ro?.disconnect();
  }
}

/**
 * HUD minimap: a gold-framed window onto the map around the player, north up.
 */
export class Minimap {
  /**
   * @param {HTMLElement} parent (the HUD element, so it hides with the HUD)
   * @param {{ anchor?: HTMLElement|null }} [opts] anchor: the minimap sits just below this element
   *   (the HUD clock), following its size
   */
  constructor(parent, { anchor = null } = {}) {
    const el = document.createElement('div');
    el.className = 'lu-minimap lu-panel is-empty';
    el.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    canvas.className = 'lu-minimap__canvas';
    const north = document.createElement('div');
    north.className = 'lu-minimap__north';
    north.textContent = 'N';
    el.append(canvas, north);
    parent.appendChild(el);
    this.element = el;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._sizer = new CanvasSizer(canvas);
    this.map = null;
    /** World units across the minimap window. */
    this.view = 34;
    this._enabled = true;
    // below the anchor (the clock plate): its height depends on the fonts and the viewport
    this._anchor = anchor;
    this._place = () => {
      const a = this._anchor;
      if (!a || !a.isConnected || !a.offsetHeight) return;
      el.style.setProperty('--lu-mm-top', `${a.offsetTop + a.offsetHeight}px`);
    };
    this._anchorRo = anchor && typeof ResizeObserver === 'function' ? new ResizeObserver(this._place) : null;
    this._anchorRo?.observe(anchor);
    window.addEventListener('resize', this._place);
  }

  /**
   * @param {{ canvas: HTMLCanvasElement, pixelsPerTile: number, width: number, depth: number }|null} map
   * @param {{ view?: number }} [opts] view: world units across the window
   */
  setMap(map, { view } = {}) {
    this.map = map;
    if (view) this.view = view;
    this._edge = edgeColour(map);
    this._apply();
  }

  /** Shown when there is a map and the level allows it (environment.minimap). */
  get enabled() { return this._enabled; }
  set enabled(v) {
    this._enabled = !!v;
    this._apply();
  }

  get visible() { return !!this.map && this._enabled; }

  _apply() {
    this.element.classList.toggle('is-empty', !this.visible);
    if (this.visible) requestAnimationFrame(() => { this._place(); this._sizer.measure(); });
  }

  /** Redraw around the player (cheap: one drawImage of the cached map + a few markers). */
  update(s) {
    if (!this.visible || !s?.player) return;
    const { ctx } = this;
    const sz = this._sizer;
    if (!sz.w) sz.measure();
    const w = sz.w;
    const h = sz.h;
    if (w < 4 || h < 4) return;
    const map = this.map;
    const ppt = map.pixelsPerTile;
    const scale = w / this.view; // canvas px per world unit
    const viewW = this.view;
    const viewD = (this.view * h) / w;
    // the window stays over the map — no empty strip past the level edge (the 3D view shows the
    // forest and meadows continuing there); near an edge the arrow moves off the centre instead
    const cx = map.width > viewW ? Math.min(Math.max(s.player.x, viewW / 2), map.width - viewW / 2) : map.width / 2;
    const cz = map.depth > viewD ? Math.min(Math.max(s.player.z, viewD / 2), map.depth - viewD / 2) : map.depth / 2;
    const toX = (x) => (x - cx) * scale + w / 2;
    const toY = (z) => (z - cz) * scale + h / 2;
    // the map image is finer than the window: smooth downscaling
    ctx.imageSmoothingEnabled = scale < ppt * 0.9;
    ctx.imageSmoothingQuality = 'high';
    // (only a map smaller than the window leaves a margin: it takes the colour of the map's edge)
    ctx.fillStyle = this._edge ?? '#0c0e1a';
    ctx.fillRect(0, 0, w, h);
    // the visible part of the map image (clipped to the image; drawImage of an out-of-range
    // source rectangle is not portable)
    const vx0 = cx - viewW / 2;
    const vz0 = cz - viewD / 2;
    const vx1 = vx0 + viewW;
    const vz1 = vz0 + viewD;
    const sx0 = Math.max(0, vx0);
    const sz0 = Math.max(0, vz0);
    const sx1 = Math.min(map.width, vx1);
    const sz1 = Math.min(map.depth, vz1);
    if (sx1 > sx0 && sz1 > sz0) {
      ctx.drawImage(map.canvas, sx0 * ppt, sz0 * ppt, (sx1 - sx0) * ppt, (sz1 - sz0) * ppt,
        toX(sx0), toY(sz0), (sx1 - sx0) * scale, (sz1 - sz0) * scale);
    }
    const r = Math.max(2, w * 0.016);
    // points of interest, villagers
    for (const m of s.markers ?? []) {
      const x = toX(m.x);
      const y = toY(m.z);
      if (x < -r || y < -r || x > w + r || y > h + r) continue;
      if (m.kind === 'fire') drawDot(ctx, x, y, r * 0.9, MARKER_COLORS.fire);
      else drawDiamond(ctx, x, y, r * (m.kind === 'boss' ? 2.1 : 1.5), MARKER_COLORS[m.kind] ?? MARKER_COLORS.object);
    }
    for (const n of s.npcs ?? []) {
      const x = toX(n.x);
      const y = toY(n.z);
      if (x < -r || y < -r || x > w + r || y > h + r) continue;
      drawDot(ctx, x, y, r, '#8fd0ff');
    }
    // enemies (combat levels; indexed loop, no per-frame allocation)
    const en = s.enemies;
    if (en) {
      for (let i = 0; i < en.length; i++) {
        const x = toX(en[i].x);
        const y = toY(en[i].z);
        if (x < -r || y < -r || x > w + r || y > h + r) continue;
        drawDot(ctx, x, y, r * 0.85, ENEMY_COLOR);
      }
    }
    // camera view wedge + the player arrow (at the player: off the centre near the map edges)
    const cw = w / 2;
    const ch = h / 2;
    const px = toX(s.player.x);
    const py = toY(s.player.z);
    // (gradients depend on the canvas size only: made once per size round the canvas centre and
    // translated to the player, no per-frame garbage)
    let gr = this._grads;
    if (!gr || gr.w !== w || gr.h !== h) {
      const wedge = ctx.createRadialGradient(cw, ch, 0, cw, ch, w * 0.36);
      wedge.addColorStop(0, 'rgba(255, 240, 200, 0.32)');
      wedge.addColorStop(1, 'rgba(255, 240, 200, 0)');
      const vignette = ctx.createRadialGradient(cw, ch, w * 0.3, cw, ch, w * 0.72);
      vignette.addColorStop(0, 'rgba(6, 8, 18, 0)');
      vignette.addColorStop(1, 'rgba(6, 8, 18, 0.5)');
      gr = this._grads = { w, h, wedge, vignette };
    }
    if (s.view && (s.view.x || s.view.z)) {
      const a = Math.atan2(s.view.z, s.view.x);
      ctx.save();
      ctx.translate(px - cw, py - ch);
      ctx.beginPath();
      ctx.moveTo(cw, ch);
      ctx.arc(cw, ch, w * 0.36, a - 0.42, a + 0.42);
      ctx.closePath();
      ctx.fillStyle = gr.wedge;
      ctx.fill();
      ctx.restore();
    }
    const f = s.facing ?? DEFAULT_FACING;
    drawArrow(ctx, px, py, Math.atan2(f.x, -f.z), Math.max(5, w * 0.05));
    // soft vignette into the frame
    ctx.fillStyle = gr.vignette;
    ctx.fillRect(0, 0, w, h);
  }

  dispose() {
    this._sizer.dispose();
    this._anchorRo?.disconnect();
    window.removeEventListener('resize', this._place);
    this.element.remove();
  }
}

/**
 * Full-screen world map: the whole level, region names, the player, villagers and points of
 * interest, with a legend. `open()` / `close()` fade it in / out; the game pauses gameplay input
 * while `isOpen`.
 */
export class WorldMap {
  /** @param {HTMLElement} parent (the UI root) */
  constructor(parent) {
    const el = document.createElement('div');
    el.className = 'lu-worldmap';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="lu-worldmap__window lu-panel">
        <header class="lu-worldmap__head">
          <span class="lu-worldmap__kicker">World Map</span>
          <span class="lu-worldmap__title"></span>
          <span class="lu-worldmap__sub"></span>
        </header>
        <div class="lu-worldmap__body">
          <div class="lu-worldmap__frame"><div class="lu-worldmap__map"><canvas class="lu-worldmap__canvas"></canvas><div class="lu-worldmap__labels"></div></div></div>
          <aside class="lu-worldmap__legend">
            <div class="lu-worldmap__legend-title">Legend</div>
            <ul>
              <li><i class="lu-wm-key lu-wm-key--player"></i>You</li>
              <li><i class="lu-wm-key lu-wm-key--npc"></i>Villager</li>
              <li><i class="lu-wm-key lu-wm-key--poi"></i>Sign · door · well</li>
              <li><i class="lu-wm-key lu-wm-key--fire"></i>Campfire</li>
              <li><i class="lu-wm-key lu-wm-key--house"></i>Building</li>
              <li><i class="lu-wm-key lu-wm-key--road"></i>Road</li>
              <li><i class="lu-wm-key lu-wm-key--water"></i>Water</li>
              <li><i class="lu-wm-key lu-wm-key--forest"></i>Forest</li>
            </ul>
            <div class="lu-worldmap__here"><span>You are in</span><b class="lu-worldmap__region"></b></div>
          </aside>
        </div>
        <footer class="lu-worldmap__foot"><span class="lu-key">N</span><span class="lu-key lu-key--wide">Tab</span><span class="lu-key lu-key--wide">Esc</span> Close</footer>
      </div>`;
    parent.appendChild(el);
    this.element = el;
    /** @type {HTMLCanvasElement} */
    this.canvas = el.querySelector('.lu-worldmap__canvas');
    this.ctx = this.canvas.getContext('2d');
    /** @type {HTMLElement} */
    this._mapBox = el.querySelector('.lu-worldmap__map');
    this._labels = el.querySelector('.lu-worldmap__labels');
    this._title = el.querySelector('.lu-worldmap__title');
    this._sub = el.querySelector('.lu-worldmap__sub');
    this._region = el.querySelector('.lu-worldmap__region');
    this._legendFire = el.querySelector('.lu-worldmap__legend .lu-wm-key--fire').parentElement;
    /** @type {HTMLElement[]} combat legend rows (created by setMap(…, { combat: true }) only) */
    this._combatRows = [];
    this._sizer = new CanvasSizer(this.canvas);
    this.map = null;
    this._open = false;
    this._pulse = 0;
  }

  get isOpen() { return this._open; }

  /**
   * @param {{ canvas: HTMLCanvasElement, pixelsPerTile: number, width: number, depth: number }|null} map
   * @param {{ title?: string, subtitle?: string, regions?: {name: string, minX: number, maxX: number, minZ: number, maxZ: number}[],
   *           combat?: boolean }} [info] combat: extra legend rows (Enemy, Waystone, Chest); without it the legend is unchanged
   */
  setMap(map, { title = '', subtitle = '', regions = [], combat = false } = {}) {
    this.map = map;
    this._setCombatLegend(!!combat);
    this._title.textContent = title;
    this._sub.textContent = subtitle;
    this._labels.replaceChildren();
    if (!map) return;
    // the frame takes the level's aspect ratio
    this._mapBox.style.setProperty('--lu-wm-ar', String(map.width / map.depth));
    // one label per region name; a region that holds another region's centre is an "area"
    // (larger, airier type, placed after the places inside it)
    const list = [];
    const seen = new Set();
    for (const r of regions) {
      const name = String(r?.name ?? '').trim();
      if (!name || seen.has(name) || ![r.minX, r.maxX, r.minZ, r.maxZ].every(Number.isFinite)) continue;
      seen.add(name);
      list.push({ name, r, x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2, size: Math.abs((r.maxX - r.minX) * (r.maxZ - r.minZ)) });
    }
    for (const a of list) {
      a.area = list.some((b) => b !== a && b.size < a.size && b.x > a.r.minX && b.x < a.r.maxX && b.z > a.r.minZ && b.z < a.r.maxZ);
    }
    // placement priority: places (smallest first), then areas (largest first)
    list.sort((a, b) => (a.area - b.area) || (a.area ? b.size - a.size : a.size - b.size));
    this._labelList = list.map((it) => {
      /** @type {WorldMapLabel} */
      const label = document.createElement('div');
      label.className = `lu-worldmap__label${it.area ? ' lu-worldmap__label--area' : ''}`;
      label.textContent = it.name;
      const x = Math.min(Math.max(it.x, 0), map.width);
      const z = Math.min(Math.max(it.z, 0), map.depth);
      label.style.left = `${(x / map.width) * 100}%`;
      label.style.top = `${(z / map.depth) * 100}%`;
      // other anchors inside the region (fractions of the map), tried when every spot round
      // the centre is taken — a big area whose centre holds a smaller place's name still gets one
      const inside = (u, v) => [
        (Math.min(Math.max(it.r.minX + (it.r.maxX - it.r.minX) * u, 0), map.width) - x) / map.width,
        (Math.min(Math.max(it.r.minZ + (it.r.maxZ - it.r.minZ) * v, 0), map.depth) - z) / map.depth,
      ];
      label._inside = INSIDE_SPOTS.map(([u, v]) => inside(u, v));
      this._labels.appendChild(label);
      return label;
    });
    this._labelsDirty = true;
  }

  /**
   * Keep the region names readable: in priority order, each label takes the first free spot of
   * its centre, just above or below it (or a little to the side), then of a few other spots inside
   * its region rect; an area name that finds no spot tries again set compact (smaller, tighter,
   * on two lines), and a label with no free spot is hidden. Runs when the map opens or its size
   * changed. Each shown label keeps its box (`_box`, relative to the map) for `update()`.
   */
  _layoutLabels() {
    const labels = this._labelList ?? [];
    const box = this._mapBox.getBoundingClientRect();
    if (!labels.length || box.width < 10) return;
    this._labelsDirty = false;
    this._labelsWidth = box.width;
    const placed = [];
    const pad = 3;
    const hits = (r) => placed.some((p) => r.left < p.right + pad && r.right > p.left - pad && r.top < p.bottom + pad && r.bottom > p.top - pad);
    const place = (el) => {
      el.style.transform = '';
      const r0 = el.getBoundingClientRect();
      const h = r0.height;
      const w = r0.width;
      const tries = [[0, 0], [0, -h * 0.95], [0, h * 0.95], [w * 0.35, -h * 0.5], [-w * 0.35, h * 0.5], [0, -h * 1.9], [0, h * 1.9]];
      for (const [fx, fz] of el._inside ?? []) tries.push([fx * box.width, fz * box.height]);
      for (const [dx, dy] of tries) {
        const r = { left: r0.left + dx, right: r0.right + dx, top: r0.top + dy, bottom: r0.bottom + dy };
        // keep it inside the map frame
        if (r.left < box.left - 2 || r.right > box.right + 2 || r.top < box.top - 2 || r.bottom > box.bottom + 2) continue;
        if (hits(r)) continue;
        placed.push(r);
        if (dx || dy) el.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
        el._box = { left: r.left - box.left, right: r.right - box.left, top: r.top - box.top, bottom: r.bottom - box.top };
        return true;
      }
      return false;
    };
    for (const el of labels) {
      el.style.visibility = '';
      el.style.opacity = '';
      el._dim = false;
      el._box = null;
      el.classList.remove('lu-worldmap__label--compact');
      if (place(el)) continue;
      // a big area's name (e.g. the farms round a windmill and an orchard): set it compact and try again
      if (el.classList.contains('lu-worldmap__label--area')) {
        el.classList.add('lu-worldmap__label--compact');
        if (place(el)) continue;
        el.classList.remove('lu-worldmap__label--compact');
      }
      el.style.visibility = 'hidden';
    }
  }

  /** Add / remove the combat legend rows (after "Campfire"). */
  _setCombatLegend(on) {
    if (on === this._combatRows.length > 0) return;
    if (!on) {
      for (const li of this._combatRows) li.remove();
      this._combatRows = [];
      return;
    }
    let after = this._legendFire;
    for (const [key, label] of [['enemy', 'Enemy'], ['waystone', 'Waystone'], ['chest', 'Chest']]) {
      const li = document.createElement('li');
      li.innerHTML = `<i class="lu-wm-key lu-wm-key--${key}"></i>`;
      li.appendChild(document.createTextNode(label));
      after.after(li);
      after = li;
      this._combatRows.push(li);
    }
  }

  /** The region name shown under the legend (hidden when there is none). */
  setRegion(name) {
    this._region.textContent = name || '';
    this._region.parentElement.style.display = name ? '' : 'none';
  }

  open() {
    if (!this.map || this._open) return this._open;
    this._open = true;
    this.element.classList.add('is-open');
    this.element.setAttribute('aria-hidden', 'false');
    this._sizer.measure();
    this._layoutLabels();
    return true;
  }

  close() {
    if (!this._open) return false;
    this._open = false;
    this.element.classList.remove('is-open');
    this.element.setAttribute('aria-hidden', 'true');
    return false;
  }

  toggle() {
    return this._open ? this.close() : this.open();
  }

  /** Redraw while open (villagers move, the player arrow pulses). */
  update(dt, s) {
    if (!this._open || !this.map) return;
    this._pulse = (this._pulse + dt) % 1.6;
    const sz = this._sizer;
    if (!sz.w || sz.w < 4) sz.measure();
    const w = sz.w;
    const h = sz.h;
    if (w < 4 || h < 4) return;
    // the frame was resized (window resize while open): lay the names out again
    if (this._labelsDirty || Math.abs(w / sz.dpr - (this._labelsWidth ?? 0)) > 1) this._layoutLabels();
    const { ctx, map } = this;
    const scale = w / map.width;
    ctx.imageSmoothingEnabled = scale < map.pixelsPerTile * 0.9;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(map.canvas, 0, 0, w, h);
    if (!s?.player) return;
    const r = Math.max(2.5, w * 0.0055);
    for (const m of s.markers ?? []) {
      if (m.kind === 'fire') drawDot(ctx, m.x * scale, m.z * scale, r * 0.9, MARKER_COLORS.fire);
      else drawDiamond(ctx, m.x * scale, m.z * scale, r * (m.kind === 'boss' ? 2 : 1.4), MARKER_COLORS[m.kind] ?? MARKER_COLORS.object);
    }
    for (const n of s.npcs ?? []) drawDot(ctx, n.x * scale, n.z * scale, r, '#8fd0ff');
    const en = s.enemies;
    if (en) for (let i = 0; i < en.length; i++) drawDot(ctx, en[i].x * scale, en[i].z * scale, r * 0.85, ENEMY_COLOR);
    const px = s.player.x * scale;
    const py = s.player.z * scale;
    // a region name lying over the "you are here" arrow fades back (the labels are DOM above the canvas)
    const lx = px / sz.dpr;
    const ly = py / sz.dpr;
    const near = (r * 3) / sz.dpr;
    for (const el of this._labelList ?? []) {
      const b = el._box;
      const over = !!b && lx > b.left - near && lx < b.right + near && ly > b.top - near && ly < b.bottom + near;
      if (over !== el._dim) {
        el._dim = over;
        el.style.opacity = over ? '0.3' : '';
      }
    }
    const t = this._pulse / 1.6;
    ctx.beginPath();
    ctx.arc(px, py, r * (2 + t * 5), 0, TAU);
    ctx.strokeStyle = `rgba(255, 236, 180, ${0.8 * (1 - t)})`;
    ctx.lineWidth = Math.max(1.5, r * 0.5);
    ctx.stroke();
    const f = s.facing ?? DEFAULT_FACING;
    drawArrow(ctx, px, py, Math.atan2(f.x, -f.z), Math.max(7, w * 0.014));
  }

  dispose() {
    this._sizer.dispose();
    this.element.remove();
  }
}
