/**
 * Nav — the enemies' walk grid and path search (KNOWN_ISSUES COMBAT-06 / COMBAT-18, COMBAT.md §7.6).
 *
 * Built once by `CombatSystem.load()` from the TileMap: a grid of 0.5 u cells (two per tile, so a
 * cell never straddles a tile edge) holding the ground height at each cell centre and whether an
 * enemy may walk there — a walkable tile or walk surface (a bridge deck), not open water, not within
 * 0.2 u of a static collider (villagers are `dynamic` and ignored), not within 0.3 u of the map edge
 * and not in a `blocked` area (the boss arenas grown by 0.5 u: only the boss and its adds walk
 * there, §7.6). Two neighbour cells connect when their heights differ by ≤ 0.55 u — tileMap.move's
 * step: one level up or down, a stair ramp; a 2-level cliff never connects — and a diagonal needs
 * both orthogonal cells open. Villagers, the player and other enemies are not in the grid: `seek`'s
 * detours and the separation handle them.
 *
 * A cell is **tight** when an enemy's body (tileMap.move's circle, r 0.3: every point of its rim
 * standable within one step of the centre) does not fit on the cell centre — the cells along a
 * cliff or a stair's side, whose centre is only 0.25 u from the edge. An enemy may still pass
 * through one (a narrow way), but paths avoid them where there is room and never cut a corner
 * through one (KNOWN_ISSUES COMBAT-18: a straight line up a stair's edge column ran the body into
 * the cliff beside it).
 *
 * `findPath` is a bounded A* (costs 10 / 14 per orthogonal / diagonal cell, +6 for entering a cell
 * next to a wall or a cliff, so a path keeps one cell off the edges where there is room, +20 more
 * for a tight cell) from a start to a goal, pruned at `maxCostU` units of path and `maxExpand`
 * expanded cells ("too far" counts as unreachable). The cell path is string-pulled with
 * `lineClear(…, body = true)` into at most `out.length / 2` waypoints, the last one the goal
 * itself. A start or goal inside a closed cell (an actor pressed against a rock) snaps to the
 * nearest open cell within 1.5 u on its level. Cost bound (COMBAT.md §18): CombatSystem allows 2
 * searches per combat sub-step, each at most `maxExpand` (6000) cells — about 1.5 ms warm for the
 * longest; `warm()` runs one throw-away search at load, so the first real ones are not JIT-cold.
 *
 * Every array is allocated here: a search allocates nothing. Deterministic: integer costs and a
 * binary heap with a fixed order. `beginStep(n)` / `spend()` ration the searches per combat
 * sub-step (a caller that is refused keeps its old path, or walks straight, and asks again).
 */

/** @import { TileMap } from '../../engine/world/TileMap.js' */

const CELL = 0.5;
const INV = 1 / CELL;
/** A cell centre closer than this to a static collider is closed. */
const CLEAR = 0.2;
/** …and closer than this to the map edge (tileMap.move keeps a 0.3 u circle inside the map). */
const EDGE = 0.3;
/** Largest height step between two connected cells (tileMap.move's maxStep). */
const STEP = 0.55;
const C_ORTHO = 10;
const C_DIAG = 14;
const C_WALL = 6;
const C_TIGHT = 20;
/** Path cost units per world unit (an orthogonal cell step is CELL u). */
const NAV_COST_PER_U = C_ORTHO / CELL;
/** The body radius of the tight test (tileMap.move's circle for every enemy kind but the boar). */
const BODY = 0.3;
const RIM_X = [1, Math.SQRT1_2, 0, -Math.SQRT1_2, -1, -Math.SQRT1_2, 0, Math.SQRT1_2].map((c) => c * BODY);
const RIM_Z = [0, Math.SQRT1_2, 1, Math.SQRT1_2, 0, -Math.SQRT1_2, -1, -Math.SQRT1_2].map((c) => c * BODY);
/** String pulling looks at most this many cells ahead of the last waypoint. */
const LOOK = 32;
/** A start / goal in a closed cell snaps to an open cell at most this many cells away. */
const SNAP = 3;
const F_OPEN = 1;
const F_WALL = 2;
const F_TIGHT = 4;
const DI = [1, -1, 0, 0, 1, 1, -1, -1];
const DJ = [0, 0, 1, -1, 1, -1, 1, -1];

export class Nav {
  /**
   * @param {TileMap} tileMap
   * @param {{ blocked?: (x: number, z: number) => boolean, maxExpand?: number }} [opts]
   *   `blocked`: extra closed areas (cell centres); `maxExpand`: the largest search (cells)
   */
  constructor(tileMap, { blocked = null, maxExpand = 6000 } = {}) {
    this.tileMap = tileMap;
    /** Grid size in cells. */
    this.cols = Math.max(1, Math.ceil(tileMap.width * INV));
    this.rows = Math.max(1, Math.ceil(tileMap.depth * INV));
    const n = this.cols * this.rows;
    /** Ground height at each cell centre (world Y; void → the map's baseY). */
    this.h = new Float32Array(n);
    /** Bit 1: open (an enemy may stand there); bit 2: next to a wall or a cliff; bit 4: tight. */
    this.flags = new Uint8Array(n);
    this.maxExpand = Math.max(64, maxExpand | 0);
    this._g = new Int32Array(n);
    this._parent = new Int32Array(n);
    this._seen = new Uint32Array(n);
    this._closed = new Uint32Array(n);
    this._gen = 0;
    this._ti = 0;
    this._tj = 0;
    this._heapCell = new Int32Array(this.maxExpand * 8 + 16);
    this._heapKey = new Int32Array(this.maxExpand * 8 + 16);
    this._heapN = 0;
    this._cells = new Int32Array(Math.min(n, 2048));
    /** Searches left in the current sub-step (`beginStep`); unlimited until the first call. */
    this.left = Infinity;
    /** Totals for tests and `stats()`. */
    this.stats = { searches: 0, found: 0, failed: 0, expanded: 0, maxExpanded: 0, open: 0, tight: 0 };
    this.build(blocked);
  }

  /**
   * (Re)build the grid from the TileMap (tiles, walk surfaces, static colliders).
   * @param {((x: number, z: number) => boolean)|null} [blocked]
   */
  build(blocked = null) {
    const tm = this.tileMap;
    const { cols, rows, h, flags } = this;
    const n = cols * rows;
    const W = tm.width;
    const D = tm.depth;
    // walk surfaces (bridge decks): the highest one over each cell centre
    const ws = new Float32Array(n).fill(NaN);
    for (const r of tm.walkSurfaces) {
      const i0 = Math.max(0, Math.ceil(r.minX * INV - 0.5));
      const i1 = Math.min(cols - 1, Math.floor(r.maxX * INV - 0.5));
      const j0 = Math.max(0, Math.ceil(r.minZ * INV - 0.5));
      const j1 = Math.min(rows - 1, Math.floor(r.maxZ * INV - 0.5));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const k = j * cols + i;
          if (!(ws[k] >= r.y)) ws[k] = r.y;
        }
      }
    }
    for (let j = 0; j < rows; j++) {
      const z = (j + 0.5) * CELL;
      for (let i = 0; i < cols; i++) {
        const x = (i + 0.5) * CELL;
        const k = j * cols + i;
        const t = tm.tileAt(Math.floor(x), Math.floor(z));
        let y;
        let ok;
        if (ws[k] === ws[k]) {
          // a deck is ground; open water under it is not
          y = ws[k];
          ok = !(t && t.water) || y > (t.waterSurface ?? -Infinity);
        } else if (!t) {
          y = tm.baseY;
          ok = false;
        } else {
          y = t.stairs ? tm.getHeight(x, z) : t.h;
          ok = t.walkable && !(t.water && y <= (t.waterSurface ?? -Infinity));
        }
        if (x < EDGE || z < EDGE || x > W - EDGE || z > D - EDGE) ok = false;
        if (ok && blocked && blocked(x, z)) ok = false;
        h[k] = y;
        flags[k] = ok ? F_OPEN : 0;
      }
    }
    // static colliders, grown by CLEAR
    for (const c of tm.colliders) {
      if (!c || c.dynamic) continue;
      let x0;
      let x1;
      let z0;
      let z1;
      if (c.type === 'circle') {
        x0 = c.x - c.r - CLEAR; x1 = c.x + c.r + CLEAR; z0 = c.z - c.r - CLEAR; z1 = c.z + c.r + CLEAR;
      } else {
        x0 = c.minX - CLEAR; x1 = c.maxX + CLEAR; z0 = c.minZ - CLEAR; z1 = c.maxZ + CLEAR;
      }
      if (!(Number.isFinite(x0) && Number.isFinite(x1) && Number.isFinite(z0) && Number.isFinite(z1))) continue;
      const i0 = Math.max(0, Math.ceil(x0 * INV - 0.5));
      const i1 = Math.min(cols - 1, Math.floor(x1 * INV - 0.5));
      const j0 = Math.max(0, Math.ceil(z0 * INV - 0.5));
      const j1 = Math.min(rows - 1, Math.floor(z1 * INV - 0.5));
      for (let j = j0; j <= j1; j++) {
        const z = (j + 0.5) * CELL;
        for (let i = i0; i <= i1; i++) {
          const k = j * cols + i;
          if (!flags[k]) continue;
          const x = (i + 0.5) * CELL;
          let hit;
          if (c.type === 'circle') {
            const dx = x - c.x;
            const dz = z - c.z;
            const R = c.r + CLEAR;
            hit = dx * dx + dz * dz < R * R;
          } else {
            const dx = Math.max(c.minX - x, 0, x - c.maxX);
            const dz = Math.max(c.minZ - z, 0, z - c.maxZ);
            hit = dx * dx + dz * dz < CLEAR * CLEAR;
          }
          if (hit) flags[k] = 0;
        }
      }
    }
    // cells next to a closed cell or a step the walk cannot take; of those, the tight ones (a cell
    // whose neighbours are all open and connected always holds the body)
    let open = 0;
    let tight = 0;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        if (!(flags[k] & F_OPEN)) continue;
        open++;
        for (let d = 0; d < 8; d++) {
          const ni = i + DI[d];
          const nj = j + DJ[d];
          const nk = nj * cols + ni;
          if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || !(flags[nk] & F_OPEN) || Math.abs(h[nk] - h[k]) > STEP) {
            flags[k] |= F_WALL;
            break;
          }
        }
        if ((flags[k] & F_WALL) && !this._fits((i + 0.5) * CELL, (j + 0.5) * CELL, h[k])) {
          flags[k] |= F_TIGHT;
          tight++;
        }
      }
    }
    this.stats.open = open;
    this.stats.tight = tight;
  }

  /**
   * One throw-away search across the grid (CombatSystem.load, after building): the first real
   * searches then run JIT-warm (cold, the first ones took 2–5.6 ms). `stats` and the sub-step
   * ration are left as they were.
   */
  warm() {
    const { flags } = this;
    let a = -1;
    let b = -1;
    for (let k = 0; k < flags.length && a < 0; k++) if (flags[k] & F_OPEN) a = k;
    for (let k = flags.length - 1; k > a && b < 0; k--) if (flags[k] & F_OPEN) b = k;
    if (a < 0 || b < 0) return;
    const keep = { ...this.stats };
    this.findPath(this._cx(a), this._cz(a), this._cx(b), this._cz(b), 1e6, new Float32Array(48));
    Object.assign(this.stats, keep);
  }

  /**
   * Cell index of a world point (−1 outside the grid).
   * @param {number} x
   * @param {number} z
   * @returns {number}
   */
  cellAt(x, z) {
    const i = Math.floor(x * INV);
    const j = Math.floor(z * INV);
    if (!(i >= 0 && j >= 0 && i < this.cols && j < this.rows)) return -1;
    return j * this.cols + i;
  }

  /**
   * May an enemy stand in the cell of (x, z)? (Tests and probes.)
   * @param {number} x
   * @param {number} z
   * @returns {boolean}
   */
  open(x, z) {
    const k = this.cellAt(x, z);
    return k >= 0 && (this.flags[k] & F_OPEN) !== 0;
  }

  /**
   * Is the cell of (x, z) tight — open, but an enemy's body does not fit on its centre? (Tests and
   * probes.)
   * @param {number} x
   * @param {number} z
   * @returns {boolean}
   */
  tight(x, z) {
    const k = this.cellAt(x, z);
    return k >= 0 && (this.flags[k] & F_TIGHT) !== 0;
  }

  /**
   * A new sub-step: `n` searches may run in it.
   * @param {number} n
   */
  beginStep(n) {
    this.left = n;
  }

  /**
   * Take one search from this sub-step's ration (false: ask again in a later sub-step).
   * @returns {boolean}
   */
  spend() {
    if (this.left <= 0) return false;
    this.left--;
    return true;
  }

  /**
   * Can an enemy walk straight from a to b? Samples every 0.25 u (from 0.25 u to `skipEnd` u before
   * b): each sample's cell open and within a 0.55 u step of the one before. `skipEnd` leaves the
   * target's own spot out (the player may stand in a closed cell, e.g. against a tree). With `body`
   * the line also keeps out of tight cells (a's and b's own cells excepted), so the enemy's body
   * fits all along it (string pulling, walking on past a waypoint).
   * @param {number} ax
   * @param {number} az
   * @param {number} bx
   * @param {number} bz
   * @param {number} [skipEnd]
   * @param {boolean} [body]
   * @returns {boolean}
   */
  lineClear(ax, az, bx, bz, skipEnd = 0, body = false) {
    const dx = bx - ax;
    const dz = bz - az;
    const d = Math.hypot(dx, dz);
    const k0 = this.cellAt(ax, az);
    if (k0 < 0) return false;
    if (d < 1e-6) return true;
    const ux = dx / d;
    const uz = dz / d;
    const { h, flags } = this;
    const bad = body ? F_TIGHT : 0;
    const kb = body ? this.cellAt(bx, bz) : -1;
    let prev = h[k0];
    let last = k0;
    const end = d - skipEnd + 1e-9;
    for (let s = 0.25; s <= end; s += 0.25) {
      const k = this.cellAt(ax + ux * s, az + uz * s);
      if (k === last) continue;
      if (k < 0 || !(flags[k] & F_OPEN) || Math.abs(h[k] - prev) > STEP || ((flags[k] & bad) && k !== kb)) return false;
      prev = h[k];
      last = k;
    }
    return true;
  }

  /**
   * A path from (ax, az) to (bx, bz) as waypoints in `out` ([x0, z0, x1, z1, …]; the last one is
   * (bx, bz) when the whole path fits, else the path's farthest waypoint — ask again from there).
   * @param {number} ax
   * @param {number} az
   * @param {number} bx
   * @param {number} bz
   * @param {number} maxCostU the longest path accepted (world units)
   * @param {Float32Array|number[]} out
   * @param {number} [maxExpand] the most cells to expand (≤ the constructor's)
   * @returns {number} the number of waypoints (≥ 1), or −1: no path (unreachable, or too far)
   */
  findPath(ax, az, bx, bz, maxCostU, out, maxExpand = this.maxExpand) {
    const st = this.stats;
    st.searches++;
    const s = this._snap(ax, az);
    const t = this._snap(bx, bz);
    if (s < 0 || t < 0) {
      st.failed++;
      return -1;
    }
    const maxPts = out.length >> 1;
    if (s === t) {
      st.found++;
      out[0] = bx;
      out[1] = bz;
      return 1;
    }
    const { cols, rows, h, flags } = this;
    const g = this._g;
    const parent = this._parent;
    const seen = this._seen;
    const closed = this._closed;
    const gen = this._nextGen();
    const maxCost = Math.round(maxCostU * NAV_COST_PER_U);
    const limit = Math.min(this.maxExpand, Math.max(1, maxExpand | 0));
    this._ti = t % cols;
    this._tj = (t - this._ti) / cols;
    this._heapN = 0;
    seen[s] = gen;
    g[s] = 0;
    parent[s] = -1;
    this._push(s, this._heur(s));
    let found = false;
    let expanded = 0;
    while (this._heapN > 0) {
      const c = this._pop();
      if (closed[c] === gen) continue;
      closed[c] = gen;
      if (c === t) {
        found = true;
        break;
      }
      if (++expanded > limit) break;
      const ci = c % cols;
      const cj = (c - ci) / cols;
      const hc = h[c];
      const gc = g[c];
      for (let d = 0; d < 8; d++) {
        const ni = ci + DI[d];
        const nj = cj + DJ[d];
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const nk = nj * cols + ni;
        if (!(flags[nk] & F_OPEN) || closed[nk] === gen || Math.abs(h[nk] - hc) > STEP) continue;
        let cost = C_ORTHO;
        if (d >= 4) {
          // no corner cutting: both orthogonal cells open and on the way up / down
          const a = cj * cols + ni;
          const b = nj * cols + ci;
          if (!(flags[a] & F_OPEN) || !(flags[b] & F_OPEN)) continue;
          if (Math.abs(h[a] - hc) > STEP || Math.abs(h[b] - hc) > STEP || Math.abs(h[a] - h[nk]) > STEP || Math.abs(h[b] - h[nk]) > STEP) continue;
          cost = C_DIAG;
        }
        if (flags[nk] & F_WALL) cost += flags[nk] & F_TIGHT ? C_WALL + C_TIGHT : C_WALL;
        const ng = gc + cost;
        if (seen[nk] === gen && ng >= g[nk]) continue;
        const f = ng + this._heur(nk);
        if (f > maxCost) continue;
        seen[nk] = gen;
        g[nk] = ng;
        parent[nk] = c;
        if (!this._push(nk, f)) break;
      }
    }
    st.expanded += expanded;
    if (expanded > st.maxExpanded) st.maxExpanded = expanded;
    if (!found) {
      st.failed++;
      return -1;
    }
    st.found++;
    // the cell path, start first (only its first `cap` cells when it is longer)
    const cells = this._cells;
    const cap = cells.length;
    let L = 0;
    for (let c = t; c !== -1; c = parent[c]) L++;
    let m = 0;
    for (let c = t; c !== -1; c = parent[c], m++) {
      const idx = L - 1 - m;
      if (idx < cap) cells[idx] = c;
    }
    const N = Math.min(L, cap);
    // string pulling: from each waypoint, the farthest cell ahead reachable in a straight line
    let n = 0;
    let cx = ax;
    let cz = az;
    let k = 0;
    if (this.cellAt(ax, az) !== s) {
      // (the start was snapped: its open cell first)
      cx = this._cx(s);
      cz = this._cz(s);
      out[0] = cx;
      out[1] = cz;
      n = 1;
    }
    while (k < N - 1 && n < maxPts) {
      let best = k + 1;
      const lim = Math.min(N - 1, k + LOOK);
      for (let j = k + 2; j <= lim; j++) {
        if (this.lineClear(cx, cz, this._cx(cells[j]), this._cz(cells[j]), 0, true)) best = j;
        else break;
      }
      cx = this._cx(cells[best]);
      cz = this._cz(cells[best]);
      out[n * 2] = cx;
      out[n * 2 + 1] = cz;
      n++;
      k = best;
    }
    if (N === L && k === N - 1) {
      // the goal itself instead of its cell centre (the goal may stand in a closed cell)
      if (n === 0) n = 1;
      out[(n - 1) * 2] = bx;
      out[(n - 1) * 2 + 1] = bz;
    }
    return Math.max(1, n);
  }

  // ---------------------------------------------------------------------------------------------

  /**
   * Octile distance from cell k to the search's goal (admissible for the 10 / 14 costs).
   * @param {number} k
   * @returns {number}
   */
  _heur(k) {
    const ki = k % this.cols;
    const di = Math.abs(ki - this._ti);
    const dj = Math.abs((k - ki) / this.cols - this._tj);
    return di > dj ? C_ORTHO * di + (C_DIAG - C_ORTHO) * dj : C_ORTHO * dj + (C_DIAG - C_ORTHO) * di;
  }

  /**
   * Does an enemy's body fit on (x, z) at ground height `hc` (tileMap.move's rim test, terrain
   * only)?
   * @param {number} x
   * @param {number} z
   * @param {number} hc
   * @returns {boolean}
   */
  _fits(x, z, hc) {
    for (let d = 0; d < 8; d++) {
      const y = this._standY(x + RIM_X[d], z + RIM_Z[d]);
      if (!(Math.abs(y - hc) <= STEP)) return false;
    }
    return true;
  }

  /**
   * The ground an actor can stand on at (x, z) — a walk surface, else a walkable tile — or NaN.
   * @param {number} x
   * @param {number} z
   * @returns {number}
   */
  _standY(x, z) {
    const tm = this.tileMap;
    let best = -Infinity;
    for (const r of tm.walkSurfaces) if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ && r.y > best) best = r.y;
    if (best > -Infinity) return best;
    const t = tm.tileAt(Math.floor(x), Math.floor(z));
    return t && t.walkable ? tm.getHeight(x, z) : NaN;
  }

  /** World x of cell k's centre. @param {number} k @returns {number} */
  _cx(k) { return ((k % this.cols) + 0.5) * CELL; }
  /** World z of cell k's centre. @param {number} k @returns {number} */
  _cz(k) { return (Math.floor(k / this.cols) + 0.5) * CELL; }

  _nextGen() {
    this._gen++;
    if (this._gen >= 0xfffffff0) {
      this._seen.fill(0);
      this._closed.fill(0);
      this._gen = 1;
    }
    return this._gen;
  }

  /**
   * The open cell of (x, z), or the nearest open one on its level within SNAP cells (−1: none).
   * @param {number} x
   * @param {number} z
   * @returns {number}
   */
  _snap(x, z) {
    const k = this.cellAt(x, z);
    if (k < 0) return -1;
    const { flags, h, cols, rows } = this;
    if (flags[k] & F_OPEN) return k;
    const ci = k % cols;
    const cj = (k - ci) / cols;
    const href = h[k];
    for (let r = 1; r <= SNAP; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di;
          const j = cj + dj;
          if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
          const c = j * cols + i;
          if (!(flags[c] & F_OPEN) || Math.abs(h[c] - href) > STEP) continue;
          const dx = (i + 0.5) * CELL - x;
          const dz = (j + 0.5) * CELL - z;
          const dd = dx * dx + dz * dz;
          if (dd < bestD) {
            bestD = dd;
            best = c;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /**
   * Push cell `c` with priority `key` on the open heap (false: the heap is full).
   * @param {number} c
   * @param {number} key
   * @returns {boolean}
   */
  _push(c, key) {
    let i = this._heapN;
    if (i >= this._heapCell.length) return false;
    this._heapN++;
    const hc = this._heapCell;
    const hk = this._heapKey;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= key) break;
      hc[i] = hc[p];
      hk[i] = hk[p];
      i = p;
    }
    hc[i] = c;
    hk[i] = key;
    return true;
  }

  /**
   * Pop the open cell with the lowest key.
   * @returns {number}
   */
  _pop() {
    const hc = this._heapCell;
    const hk = this._heapKey;
    const top = hc[0];
    const n = --this._heapN;
    if (n > 0) {
      const c = hc[n];
      const key = hk[n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && hk[r] < hk[l] ? r : l;
        if (hk[m] >= key) break;
        hc[i] = hc[m];
        hk[i] = hk[m];
        i = m;
      }
      hc[i] = c;
      hk[i] = key;
    }
    return top;
  }
}
