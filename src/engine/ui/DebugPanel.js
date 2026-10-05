import GUI from 'lil-gui';
import './ui.css';

/** @import * as THREE from 'three' */

/**
 * Themed lil-gui debug panel with a small stats overlay (fps, frame ms, draw calls, triangles,
 * geometries, textures, programs) and a pixel-art fps graph. Hidden by default.
 */

const GRAPH_W = 133;
const GRAPH_H = 15;

function fmt(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

/** Renderer statistics overlay. Owned by DebugPanel (`debug.stats`). */
export class DebugStats {
  constructor() {
    const el = document.createElement('div');
    el.className = 'lu-stats lu-panel lu-panel--simple';
    el.innerHTML = `
      <div class="lu-stats__head">
        <span class="lu-stats__fps">--</span><span class="lu-stats__unit">FPS</span>
        <span class="lu-stats__ms">-- ms</span>
      </div>
      <canvas class="lu-stats__graph" width="${GRAPH_W}" height="${GRAPH_H}"></canvas>
      <div class="lu-stats__grid">
        <span class="lu-stats__k">Calls</span><span class="lu-stats__v" data-k="calls">0</span>
        <span class="lu-stats__k">Tris</span><span class="lu-stats__v" data-k="tris">0</span>
        <span class="lu-stats__k">Geom</span><span class="lu-stats__v" data-k="geo">0</span>
        <span class="lu-stats__k">Tex</span><span class="lu-stats__v" data-k="tex">0</span>
        <span class="lu-stats__k">Prog</span><span class="lu-stats__v" data-k="prog">0</span>
        <span class="lu-stats__k">Worst</span><span class="lu-stats__v" data-k="worst">0</span>
      </div>`;
    this.element = el;
    this._fpsEl = el.querySelector('.lu-stats__fps');
    this._msEl = el.querySelector('.lu-stats__ms');
    const v = (k) => el.querySelector(`[data-k="${k}"]`).firstChild;
    this._t = { calls: v('calls'), tris: v('tris'), geo: v('geo'), tex: v('tex'), prog: v('prog'), worst: v('worst') };
    this._canvas = el.querySelector('canvas');
    this._ctx = this._canvas.getContext('2d');

    /** Seconds between display refreshes. */
    this.interval = 0.25;
    /** DOM is only refreshed while visible (set by DebugPanel). */
    this.visible = false;

    this.fps = 0;
    this.frameMs = 0;
    this.calls = 0;
    this.triangles = 0;

    this._configured = new WeakSet();
    this._frames = 0;
    this._t0 = -1;
    this._worst = 0;
    this._history = new Float32Array(GRAPH_W);
    this._head = 0;
    this._last = -1;
  }

  /**
   * Sample renderer statistics. Call once per frame after all rendering (e.g. on 'afterRender').
   * On the first call the renderer's `info.autoReset` is switched off; this method then resets the
   * counters every frame so multi-pass frames (post-processing, shadows) are counted in full.
   * Timing uses performance.now() so it is unaffected by time scaling / dt clamping.
   * @param {THREE.WebGLRenderer} renderer
   * @param {number} [dt] frame delta (only used when performance.now is unavailable)
   */
  update(renderer, dt = 0) {
    if (renderer && renderer.info) {
      const info = renderer.info;
      if (!this._configured.has(renderer)) {
        this._configured.add(renderer);
        info.autoReset = false;
      }
      this.calls = info.render.calls;
      this.triangles = info.render.triangles;
      this._geo = info.memory.geometries;
      this._tex = info.memory.textures;
      this._prog = info.programs ? info.programs.length : 0;
      info.reset();
    }

    const now = typeof performance !== 'undefined' ? performance.now() : (this._last < 0 ? 0 : this._last + dt * 1000);
    if (this._t0 < 0) { this._t0 = now; this._last = now; return; }
    const frameDt = now - this._last;
    this._last = now;
    if (frameDt > this._worst) this._worst = frameDt;
    this._frames++;
    const span = now - this._t0;
    if (span < this.interval * 1000) return;

    this.fps = (this._frames * 1000) / span;
    this.frameMs = span / this._frames;
    this._history[this._head] = this.fps;
    this._head = (this._head + 1) % GRAPH_W;
    const worst = this._worst;
    this._frames = 0;
    this._t0 = now;
    this._worst = 0;
    if (this.visible) this._render(worst);
  }

  _render(worst) {
    const fps = this.fps;
    this._fpsEl.textContent = fps >= 100 ? fps.toFixed(0) : fps.toFixed(1);
    this._fpsEl.classList.toggle('is-mid', fps < 50 && fps >= 30);
    this._fpsEl.classList.toggle('is-low', fps < 30);
    this._msEl.textContent = `${this.frameMs.toFixed(2)} ms`;
    const t = this._t;
    t.calls.nodeValue = fmt(this.calls);
    t.tris.nodeValue = fmt(this.triangles);
    t.geo.nodeValue = fmt(this._geo ?? 0);
    t.tex.nodeValue = fmt(this._tex ?? 0);
    t.prog.nodeValue = fmt(this._prog ?? 0);
    t.worst.nodeValue = `${worst.toFixed(0)}ms`;

    // pixel-art fps history graph
    const ctx = this._ctx;
    ctx.clearRect(0, 0, GRAPH_W, GRAPH_H);
    ctx.fillStyle = 'rgba(232,207,138,0.16)';
    const y60 = GRAPH_H - Math.round((60 / 75) * GRAPH_H);
    ctx.fillRect(0, y60, GRAPH_W, 1);
    for (let i = 0; i < GRAPH_W; i++) {
      const v = this._history[(this._head + i) % GRAPH_W];
      if (v <= 0) continue;
      const h = Math.max(1, Math.round((Math.min(v, 75) / 75) * GRAPH_H));
      ctx.fillStyle = v >= 50 ? 'rgba(201,164,92,0.5)' : v >= 30 ? 'rgba(224,162,62,0.65)' : 'rgba(217,100,63,0.8)';
      ctx.fillRect(i, GRAPH_H - h, 1, h);
      ctx.fillStyle = v >= 50 ? '#f4dea0' : '#ffd08a';
      ctx.fillRect(i, GRAPH_H - h, 1, 1);
    }
  }
}

export class DebugPanel {
  /**
   * @param {HTMLElement} parent
   * @param {{ anchor?: HTMLElement|null, title?: string }} [opts] `anchor`: the panel is placed just
   *   below this element (e.g. the HUD clock) whenever it is shown.
   */
  constructor(parent = document.body, { anchor = null, title = 'Lumina · Debug' } = {}) {
    const el = document.createElement('div');
    el.className = 'lu-debug is-hidden';
    parent.appendChild(el);
    this.element = el;
    this._parent = parent;
    this._anchor = anchor;

    /** @type {DebugStats} */
    this.stats = new DebugStats();
    el.appendChild(this.stats.element);

    /** @type {GUI} */
    this.gui = new GUI({ container: el, title, width: 292 });

    this._visible = false;
    this._onResize = () => { if (this._visible) this._place(); };
    window.addEventListener('resize', this._onResize);
  }

  get visible() { return this._visible; }
  set visible(v) {
    this._visible = !!v;
    this.stats.visible = this._visible;
    this.element.classList.toggle('is-hidden', !this._visible);
    if (this._visible) this._place();
    this.syncListening();
  }

  /**
   * lil-gui controllers that `listen()` refresh their display every animation frame: they only do
   * so while the panel is shown (call this after adding listening controllers to a hidden panel).
   */
  syncListening() {
    for (const c of this.gui.controllersRecursive()) {
      if (this._visible) {
        if (c._luPaused) { c._luPaused = false; c.listen(true); }
      } else if (c._listening) {
        c._luPaused = true;
        c.listen(false);
      }
    }
  }

  /** @returns {boolean} the new visibility */
  toggle() { this.visible = !this._visible; return this._visible; }

  /**
   * @param {string} name
   * @returns {GUI} a lil-gui folder
   */
  addFolder(name) { return this.gui.addFolder(name); }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.gui.destroy();
    this.element.remove();
  }

  _place() {
    const a = this._anchor;
    if (!a || !a.isConnected) return;
    const r = a.getBoundingClientRect();
    if (r.height <= 0) return;
    const pr = this._parent.getBoundingClientRect();
    this.element.style.setProperty('--lu-debug-top', `${Math.round(r.bottom - pr.top + 16)}px`);
  }
}
