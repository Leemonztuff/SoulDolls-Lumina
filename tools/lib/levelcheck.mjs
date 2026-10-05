/**
 * The level checks of the generators, for any level: `tools/make-gildhaven.mjs` runs them on the
 * level it builds (strict, with its routes, street centre lines and scattered trees), and
 * `tools/check-level.mjs` runs them on a level file — an editor-made level gets the same checks.
 *
 *   gridFromLevel(level)       a `createGrid` grid filled from the level's rows (path tiles inferred
 *                              from the tile types: dirt paths, cobbles, stone tiles, decks, stairs)
 *   placerFromLevel(g, level)  a `createPlacer` placer holding the level's objects (colliders
 *                              reserved, bridges with their deck height resolved, waterfalls,
 *                              the object sightlines)
 *   checkLevel(level, { g, P }, options)   → { errors, warnings, info }
 *   addSightlines(P) · sightTargets(objects, doorOf) · cameraPitch(environment)
 *
 * Severity: the checks that find a broken level (an unreachable villager, door, sign or well; a
 * stair, waterfall or bridge that does not work; critters or objects off the map) are errors.
 * The composition rules of the level design guide (nothing hidden behind roofs or crowns, ≤ 3 % of
 * the path tiles behind roofs, flat footprints, no overlaps, no unreachable pockets, every point in
 * a region …) are warnings, or errors with `strict` — the generators' bar.
 *
 * Node-safe: no three.js (the game's rules that live in three.js modules — the bridge deck height,
 * the water surfaces — are mirrored here). Randomness: none.
 */
import { OBJECT_TYPES, CHARACTER_PRESET_NAMES, EMITTER_PRESETS, critterStartPoints } from '../../src/engine/level/ObjectCatalog.js';
import { charToLevel } from '../../src/engine/level/LevelFormat.js';
import { clamp } from '../../src/engine/utils/math.js';
import {
  createGrid, createPlacer, createWalkModel, createOcclusion, roofsOf, scatterForestTop, hitShape, shapeBounds, stairT, CARDINAL,
} from './levelgen.mjs';

/** @import { Level, LevelEnvironment, LevelObject, TileDef, XZ } from '../../src/engine/level/types.js' */

/** Top textures of the tiles that count as streets on a level file (dirt is yard ground, not a street). */
const PATH_TOPS = new Set(['dirt_path', 'cobblestone', 'stone_tiles', 'wood_deck']);
/** Height of one stair step (TileMap STEP_H) and the water depth of a tile without a level (AUTO_WATER_DEPTH). */
const STEP_H = 0.125;
const AUTO_WATER_DEPTH = 0.35;

/**
 * Is a tile definition a street (a walkable path-type top or stairs)?
 * @param {TileDef|undefined} d
 */
export const isPathDef = (d) => !!d && !d.water && !d.void && d.walkable !== false && (!!d.stairs || PATH_TOPS.has(d.top));

/**
 * A `createGrid` grid filled from a level's `tiles` / `heights` rows: water by the legend, the
 * path tiles (`pathMask`) inferred from the tile types (`isPathDef`), no street centre lines.
 * @param {Level} level a normalised level (`parseLevel` / `normalizeLevel`)
 */
export function gridFromLevel(level) {
  const g = createGrid({ width: level.width, depth: level.depth });
  const legend = level.legend;
  for (let j = 0; j < level.depth; j++) {
    for (let i = 0; i < level.width; i++) {
      const k = g.I(i, j);
      g.tiles[k] = level.tiles[j][i];
      g.levels[k] = charToLevel(level.heights[j][i]);
      if (isPathDef(legend[g.tiles[k]])) g.pathMask[k] = 1;
    }
  }
  g.isWater = (i, j) => !!legend[g.T(i, j)]?.water;
  return g;
}

/**
 * Water surface of tile (i, j) as TileMap computes it (legend `waterLevel` / `waterDepth`, else the
 * level's `waterLevel` when it is above the bed, else bed + 0.35).
 * @param {ReturnType<typeof createGrid>} g
 * @param {Level} level
 */
export function waterSurfaceAt(g, level, i, j) {
  const d = level.legend[g.T(i, j)];
  const h = g.L(i, j) * 0.5;
  if (typeof d?.waterLevel === 'number') return d.waterLevel;
  if (typeof d?.waterDepth === 'number') return h + d.waterDepth;
  const global = level.waterLevel ?? 0.35;
  return global > h + 0.02 ? global : h + AUTO_WATER_DEPTH;
}

/**
 * The deck height of a bridge with `deckY: null`, as the game picks it (ObjectBuilder
 * `bridgeDeckHeight`): the bank half a tile beyond either end, never below the water under the
 * span + 0.1; no bank: 0.3 above the water.
 * @param {ReturnType<typeof createGrid>} g
 * @param {Level} level
 * @param {LevelObject} o bridge
 */
export function bridgeDeckY(g, level, o) {
  const dx = o.x1 - o.x0; const dz = o.z1 - o.z0; const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len; const uz = dz / len;
  const groundAt = (x, z) => {
    const i = Math.floor(x); const j = Math.floor(z);
    const d = g.inMap(i, j) ? level.legend[g.T(i, j)] : null;
    if (!d || d.water || d.void) return null;
    const h = g.L(i, j) * 0.5;
    return d.stairs ? clamp(h + STEP_H * 0.5 + stairT(d.stairs, x - i, z - j) * 0.5, h, h + 0.5) : h;
  };
  const a = groundAt(o.x0 - ux * 0.5, o.z0 - uz * 0.5);
  const b = groundAt(o.x1 + ux * 0.5, o.z1 + uz * 0.5);
  let water = -Infinity;
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const i = Math.floor(o.x0 + dx * t); const j = Math.floor(o.z0 + dz * t);
    if (g.isWater(i, j)) water = Math.max(water, waterSurfaceAt(g, level, i, j));
  }
  const bankY = a ?? b;
  if (bankY != null) return water > -Infinity ? Math.max(bankY, water + 0.1) : bankY;
  if (water > -Infinity) return water + 0.3;
  return g.L(Math.floor(o.x0), Math.floor(o.z0)) * 0.5;
}

/**
 * Sightline corridors south of everything the camera must see (villagers 3 × 9, door fronts
 * 2.5 × 8.5, wells, campfires and signs 2 × 4.5): the scatter keeps trunks out of them and the
 * checks fail a hand-placed tree inside one.
 * @param {ReturnType<typeof createPlacer>} P
 */
export function addSightlines(P) {
  for (const o of P.objects) {
    if (o.type === 'npc') P.view(o.x, o.z, 3, 9);
    else if (o.type === 'house') { const d = P.doorOf(o); P.view(d.x, d.z - 1, 2.5, 8.5); }
    else if (o.type === 'well' || o.type === 'campfire' || o.type === 'signpost') P.view(o.x, o.z, 2, 4.5);
  }
}

/**
 * A placer holding a level's objects: their colliders reserved, the bridges (a pier — one end
 * over water — listed with that end last; a `deckY: null` deck resolved with `bridgeDeckY`), the
 * waterfalls and the object sightlines.
 * @param {ReturnType<typeof createGrid>} g
 * @param {Level} level
 */
export function placerFromLevel(g, level) {
  const P = createPlacer(g);
  const onBank = (x, z) => {
    const i = Math.floor(x); const j = Math.floor(z);
    const d = g.inMap(i, j) ? level.legend[g.T(i, j)] : null;
    return !!d && !d.water && !d.void && d.walkable !== false;
  };
  for (let o of level.objects) {
    if (o.type === 'bridge') {
      if (o.deckY == null) o = { ...o, deckY: bridgeDeckY(g, level, o) };
      const dx = o.x1 - o.x0; const dz = o.z1 - o.z0; const len = Math.hypot(dx, dz) || 1;
      const a = onBank(o.x0 - (dx / len) * 0.5, o.z0 - (dz / len) * 0.5);
      const b = onBank(o.x1 + (dx / len) * 0.5, o.z1 + (dz / len) * 0.5);
      // a pier: one end on a bank, the other over water (checked from the bank end)
      const pier = a !== b;
      const span = !a && b ? { ...o, x0: o.x1, z0: o.z1, x1: o.x0, z1: o.z0 } : o;
      P.BRIDGES.push({ o: span, pier, name: o.id });
    }
    P.objects.push(o);
    P.usedIds.add(o.id);
    const def = OBJECT_TYPES[o.type];
    if (def.kind === 'prop' || o.type === 'npc') P.reserve(o);
    if (o.type === 'waterfall') P.FALLS.push(o);
  }
  addSightlines(P);
  return P;
}

/**
 * The camera pitch where a figure stands: `highGround.pitch` above `highGround.minY`, else the
 * camera pitch (default 32°).
 * @param {Partial<LevelEnvironment>} env
 * @returns {(y: number) => number}
 */
export function cameraPitch(env) {
  const base = Number.isFinite(env?.camera?.pitch) ? env.camera.pitch : 32;
  const hg = env?.highGround;
  if (!hg || !Number.isFinite(hg.minY)) return () => base;
  const high = Number.isFinite(hg.pitch) ? hg.pitch : base;
  return (y) => (y > hg.minY ? high : base);
}

/**
 * What the camera must see past the tree crowns (yaw 0): villagers and the spot south of them,
 * door fronts, signs and their reading spots, campfires, wells.
 * @param {LevelObject[]} objects
 * @param {(o: LevelObject) => { x: number, z: number }} doorOf
 */
export function sightTargets(objects, doorOf) {
  const out = [];
  for (const o of objects) {
    if (o.type === 'npc') {
      out.push({ what: `villager ${o.id}`, x: o.x, z: o.z, h0: 0.25, h1: 1.6 });
      out.push({ what: `the talk spot south of ${o.id}`, x: o.x, z: o.z + 1.1, h0: 0.25, h1: 1.6 });
    } else if (o.type === 'house') { const d = doorOf(o); out.push({ what: `the door of ${o.id}`, x: d.x, z: d.z, h0: 0.25, h1: 1.6 }); }
    else if (o.type === 'signpost') {
      out.push({ what: `signpost ${o.id}`, x: o.x, z: o.z, h0: 0.4, h1: 1.8 });
      out.push({ what: `the reading spot of ${o.id}`, x: o.x, z: o.z + 0.9, h0: 0.25, h1: 1.6 });
    } else if (o.type === 'campfire') out.push({ what: `campfire ${o.id}`, x: o.x, z: o.z, h0: 0.1, h1: 0.8 });
    else if (o.type === 'well') out.push({ what: `well ${o.id}`, x: o.x, z: o.z, h0: 0.2, h1: 1.4 });
  }
  return out;
}

const inRect = (x, z, r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

/**
 * @typedef {object} CheckOptions
 * @property {boolean} [strict] the composition rules are errors (the generators' bar), not warnings
 * @property {[name: string, from: XZ, to: XZ][]} [routes] walks that must stay direct
 *   (≤ 1.5 × the straight line + 3 on the walk grid)
 * @property {{ name: string, points: XZ[], width: number }[]} [paths] street centre lines that no
 *   prop may block (default `g.PATHS`; a level file has none)
 * @property {Set<LevelObject>} [scattered] trees placed by a scatter (exempt from the
 *   hand-placed-tree sightline rule; on a level file every tree counts as hand-placed)
 * @property {(y: number) => number} [pitchAt] camera pitch by ground height (default from the environment)
 * @property {number} [hiddenShareMax] most path tiles behind roofs (0.03)
 * @property {number} [minVillagers] warn below this many villagers
 */

/**
 * Check a level against the generators' rules.
 * @param {Level} level a normalised level
 * @param {{ g: ReturnType<typeof createGrid>, P: ReturnType<typeof createPlacer> }} ctx its grid and
 *   placer (`gridFromLevel` / `placerFromLevel`, or a generator's own)
 * @param {CheckOptions} [options]
 * @returns {{ errors: string[], warnings: string[], info: string[] }}
 */
export function checkLevel(level, { g, P }, options = {}) {
  const { strict = false, routes = [], paths = g.PATHS, scattered = new Set(), hiddenShareMax = 0.03, minVillagers = null } = options;
  const pitchAt = options.pitchAt ?? cameraPitch(level.environment);
  const { W, D, T, L, I, inMap } = g;
  const legend = level.legend;
  // (by id: a generator's normalised level holds copies of the objects it placed)
  const scatteredIds = new Set([...scattered].map((t) => t.id));
  const stairDir = (ch) => legend[ch]?.stairs;
  const report = { errors: [], warnings: [], info: [] };
  const err = (m) => report.errors.push(m);
  const warn = (m) => report.warnings.push(m);
  const soft = strict ? err : warn;
  const info = (m) => report.info.push(m);
  const walk = createWalkModel(g, P, level);
  const { reachNear, surfaceAt, standable, walkLength, tileDef, walkRects } = walk;
  const objects = level.objects;
  info(`walk grid: ${walk.reached} of ${walk.standableCount} standable nodes reachable from the spawn`);
  // unreachable walkable pockets
  const pockets = walk.pockets(48);
  for (const p of pockets) soft(`an unreachable walkable pocket of ${p.nodes} nodes round (${p.x}, ${p.z}) — box x ${p.box[0]}–${p.box[1]}, z ${p.box[2]}–${p.box[3]}`);
  // routes
  for (const [name, [ax, az], [bx, bz]] of routes) {
    const straight = Math.hypot(bx - ax, bz - az);
    const len = walkLength(ax, az, bx, bz);
    const limit = straight * 1.5 + 3;
    if (!(len <= limit)) err(`route "${name}" is a long detour: ${len === Infinity ? 'no walk' : `${len.toFixed(1)} u`} for ${straight.toFixed(1)} u as the crow flies (limit ${limit.toFixed(1)})`);
    else info(`route ${name}: ${len.toFixed(1)} u (${straight.toFixed(1)} straight)`);
  }
  // interactions: villagers, doors, signs, wells — and every region
  for (const o of objects) {
    const y = P.groundY(o.x, o.z);
    if (o.type === 'npc') {
      const tp = o.talkOffset ? [o.x + o.talkOffset[0], o.z + o.talkOffset[1]] : [o.x, o.z];
      const ys = surfaceAt(o.x, o.z);
      if (!reachNear(tp[0], tp[1], (o.talkRadius ?? 1.6) - 0.15, ys === ys ? ys : y)) err(`NPC ${o.id} (${o.name}) cannot be reached to talk`);
      if (ys !== ys) err(`NPC ${o.id} stands on unwalkable ground`);
      const blocker = P.allShapes.find((c) => c.owner.id !== o.id && c.owner.type !== 'npc' && hitShape(c, o.x, o.z, 0.3));
      // (a stall keeper among the stall's crates is a design choice: soft)
      if (blocker) soft(`NPC ${o.id} stands inside ${blocker.owner.id}`);
      if (o.behaviour === 'chase' && o.area) {
        const a = o.area; let ok = 0; let n = 0;
        for (let z = o.z + a.minZ; z <= o.z + a.maxZ; z += 0.5) for (let x = o.x + a.minX; x <= o.x + a.maxX; x += 0.5) { n++; if (standable(x, z, true) === standable(x, z, true)) ok++; }
        if (n && ok / n < 0.5) err(`chase area of ${o.id} is only ${Math.round((100 * ok) / n)} % walkable`);
      }
    } else if (o.type === 'house') {
      const d = P.doorOf(o);
      if (!reachNear(d.x, d.z, 0.85, y)) err(`door of ${o.id} (${o.name}) is not reachable`);
    } else if (o.type === 'signpost') {
      if (!reachNear(o.x, o.z, 1.2, y)) err(`signpost ${o.id} is not reachable`);
    } else if (o.type === 'well') {
      if (!reachNear(o.x, o.z, 1.6, y)) err(`well ${o.id} is not reachable`);
    } else if (o.type === 'region') {
      let ok = false;
      for (let z = Math.ceil(o.minZ * 2) / 2; z < o.maxZ && !ok; z += 0.5) for (let x = Math.ceil(o.minX * 2) / 2; x < o.maxX; x += 0.5) {
        if (walk.reachableAt(x, z) && (o.minY == null || surfaceAt(x, z) > o.minY)) { ok = true; break; }
      }
      if (!ok) soft(`region ${o.id} (${o.name}) has no reachable ground`);
    }
  }
  // paths not blocked by props
  for (const p of paths) {
    if (p.width < 1.5) continue;
    for (let k = 0; k < p.points.length - 1; k++) {
      const [ax, az] = p.points[k]; const [bx, bz] = p.points[k + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
      for (let s = 0; s <= n; s++) {
        const x = ax + ((bx - ax) * s) / n; const z = az + ((bz - az) * s) / n;
        const i = Math.floor(x); const j = Math.floor(z);
        if (!inMap(i, j)) continue;
        if (g.isWater(i, j)) {
          if (standable(x, z, true) !== standable(x, z, true)) { err(`path "${p.name}" crosses water without a bridge at (${x.toFixed(1)}, ${z.toFixed(1)})`); s = n; }
          continue;
        }
        if (!g.pathMask[I(i, j)]) continue;
        const b = P.blockedAt(x, z, 0.29, (ow) => ow.type === 'npc');
        if (b) { err(`path "${p.name}" is blocked at (${x.toFixed(1)}, ${z.toFixed(1)}) by ${b.id}`); s = n; }
      }
    }
  }
  // stairs rise toward their direction, one level per tile
  for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    const ch = T(i, j);
    const dir = stairDir(ch);
    if (!dir) continue;
    const [fx, fz] = CARDINAL[dir];
    const l = L(i, j);
    const ahead = T(i + fx, j + fz); const behind = T(i - fx, j - fz);
    const flat = (c) => c && legend[c]?.walkable !== false && !legend[c]?.water && !legend[c]?.void && !stairDir(c);
    const okA = (ahead === ch && L(i + fx, j + fz) === l + 1) || (flat(ahead) && L(i + fx, j + fz) === l + 1);
    const okB = (behind === ch && L(i - fx, j - fz) === l - 1) || (flat(behind) && L(i - fx, j - fz) === l);
    if (!okA || !okB) err(`stairs ${ch} at (${i}, ${j}) level ${l}: ${okA ? '' : `the high side (${ahead}${L(i + fx, j + fz)}) is not level ${l + 1}`} ${okB ? '' : `the low side (${behind}${L(i - fx, j - fz)}) is not level ${l}`}`);
  }
  // waterfalls: on a tile edge between a higher and a lower water tile, a real drop
  for (const f of P.FALLS) {
    const [fx, fz] = CARDINAL[f.facing];
    const onEdge = fz ? Number.isInteger(f.z) : Number.isInteger(f.x);
    const ti = Math.floor(f.x - fx * 0.5 + 0.01); const tj = Math.floor(f.z - fz * 0.5 + 0.01);
    const bi = Math.floor(f.x + fx * 0.5 + 0.01); const bj = Math.floor(f.z + fz * 0.5 + 0.01);
    if (!onEdge) err(`waterfall ${f.id} is not on a tile edge`);
    if (!g.isWater(ti, tj) || !g.isWater(bi, bj)) { err(`waterfall ${f.id}: no water above / below`); continue; }
    const drop = waterSurfaceAt(g, level, ti, tj) - waterSurfaceAt(g, level, bi, bj);
    if (drop < 0.5) err(`waterfall ${f.id}: drop ${drop.toFixed(2)} is too small`);
    for (let k = 0; k < Math.round(f.width); k++) {
      const ci = fz ? Math.floor(f.x - f.width / 2 + k + 0.5) : ti; const cj = fz ? tj : Math.floor(f.z - f.width / 2 + k + 0.5);
      if (!g.isWater(ci, cj)) err(`waterfall ${f.id}: the lip is not water across its width`);
    }
    info(`waterfall ${f.id}: drop ${drop.toFixed(2)}`);
  }
  // bridges span water bank to bank, and can be walked end to end
  for (const { o, pier, name } of P.BRIDGES) {
    const dx = o.x1 - o.x0; const dz = o.z1 - o.z0; const len = Math.hypot(dx, dz); const ux = dx / len; const uz = dz / len;
    const bank = (x, z) => { const d = tileDef(Math.floor(x), Math.floor(z)); return d && !d.water && !d.void && d.walkable !== false ? L(Math.floor(x), Math.floor(z)) * 0.5 : null; };
    const a = bank(o.x0 - ux * 0.5, o.z0 - uz * 0.5); const b = bank(o.x1 + ux * 0.5, o.z1 + uz * 0.5);
    let wetN = 0;
    for (let t = 0.05; t < 1; t += 0.05) if (g.isWater(Math.floor(o.x0 + dx * t), Math.floor(o.z0 + dz * t))) wetN++;
    if (!wetN) err(`bridge ${o.id} does not cross water`);
    if (a == null || (!pier && b == null)) err(`bridge ${o.id}: an end is not on a bank`);
    if (a != null && Math.abs(a - o.deckY) > 0.5) err(`bridge ${o.id}: deck ${o.deckY} vs bank ${a}`);
    if (!pier && b != null && Math.abs(b - o.deckY) > 0.5) err(`bridge ${o.id}: deck ${o.deckY} vs far bank ${b}`);
    let prev = null; let bad = null;
    for (let t = -0.9; t <= (pier ? len - 0.4 : len + 0.9) + 1e-6; t += 0.2) {
      const x = o.x0 + ux * t; const z = o.z0 + uz * t;
      const h = standable(x, z, true);
      if (h !== h) { bad = `not standable at (${x.toFixed(2)}, ${z.toFixed(2)})`; break; }
      if (prev != null && Math.abs(h - prev) > 0.55) { bad = `a ${Math.abs(h - prev).toFixed(2)} step at (${x.toFixed(2)}, ${z.toFixed(2)})`; break; }
      prev = h;
    }
    if (bad) err(`bridge ${o.id} cannot be walked end to end: ${bad}`);
    info(`bridge ${name}: ${len.toFixed(1)} long, deck ${+o.deckY.toFixed(3)}`);
  }
  // props stand on proper ground (trees and rocks may stand on forest or rock, rocks in water);
  // buildings on flat, dry footprints
  const FLAT = new Set(['house', 'marketStall', 'well', 'campfire', 'bench', 'windmill']);
  for (const o of objects) {
    const def = OBJECT_TYPES[o.type];
    if (def.kind !== 'prop' || def.placement !== 'point' || o.type === 'wallTorch' || o.type === 'light' || o.type === 'waterfall') continue;
    const i = Math.floor(o.x); const j = Math.floor(o.z);
    if (!inMap(i, j)) continue; // (reported below as outside the map)
    const d = tileDef(i, j);
    const onDeck = walkRects.some((r) => o.x >= r.minX && o.x <= r.maxX && o.z >= r.minZ && o.z <= r.maxZ);
    const natural = o.type === 'tree' || o.type === 'rock';
    const ground = !!d && !d.void && (d.water ? o.type === 'rock' : d.walkable !== false || natural);
    if (!onDeck && !ground) soft(`${o.id} stands on ${JSON.stringify(T(i, j))} at (${o.x}, ${o.z})`);
    if (FLAT.has(o.type)) {
      const b = P.collidersOf(o)[0];
      const bb = b ? shapeBounds(b) : { minX: o.x - 0.5, maxX: o.x + 0.5, minZ: o.z - 0.5, maxZ: o.z + 0.5 };
      const l0 = L(i, j);
      for (let jj = Math.floor(bb.minZ + 0.15); jj <= Math.floor(bb.maxZ - 0.15); jj++) for (let ii = Math.floor(bb.minX + 0.15); ii <= Math.floor(bb.maxX - 0.15); ii++) {
        const dd = tileDef(ii, jj);
        if (!dd || dd.water || dd.stairs || dd.walkable === false || L(ii, jj) !== l0) { soft(`${o.id} footprint is uneven or wet at tile (${ii}, ${jj})`); ii = 1e9; jj = 1e9; }
      }
    }
  }
  // no two props overlap (approximate colliders)
  const pairs = new Set();
  const overlap = (a, b) => {
    if (a.c === 'seg' || b.c === 'seg') {
      const s = a.c === 'seg' ? a : b; const o = s === a ? b : a;
      if (o.c === 'seg') return false;
      const n = Math.max(2, Math.ceil(Math.hypot(s.x1 - s.x0, s.z1 - s.z0) / 0.2));
      for (let k = 0; k <= n; k++) if (hitShape(o, s.x0 + ((s.x1 - s.x0) * k) / n, s.z0 + ((s.z1 - s.z0) * k) / n, s.h - 0.02)) return true;
      return false;
    }
    if (a.c === 'circle' && b.c === 'circle') return (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < (a.r + b.r - 0.02) ** 2;
    if (a.c === 'box' && b.c === 'box') return a.minX < b.maxX - 0.02 && b.minX < a.maxX - 0.02 && a.minZ < b.maxZ - 0.02 && b.minZ < a.maxZ - 0.02;
    const c = a.c === 'circle' ? a : b; const bx = c === a ? b : a;
    return hitShape(bx, c.x, c.z, c.r - 0.02);
  };
  for (const a of P.allShapes) {
    const ab = shapeBounds(a);
    for (const b of P.shapesNear((ab.minX + ab.maxX) / 2, (ab.minZ + ab.maxZ) / 2)) {
      if (a === b || a.owner === b.owner) continue;
      const key = a.owner.id < b.owner.id ? `${a.owner.id}|${b.owner.id}` : `${b.owner.id}|${a.owner.id}`;
      if (pairs.has(key)) continue;
      if (a.owner.type === 'npc' || b.owner.type === 'npc') continue;
      if (overlap(a, b)) { pairs.add(key); soft(`overlap: ${a.owner.id} × ${b.owner.id}`); }
    }
  }
  for (const o of objects) {
    if (o.type !== 'house') continue;
    const d = P.doorOf(o);
    const b = P.blockedAt(d.x, d.z, 0.35, (ow) => ow.id === o.id || ow.type === 'npc');
    if (b) soft(`door of ${o.id} is blocked by ${b.id}`);
  }
  // the camera (yaw 0) sees every villager, talk spot, door, sign, well and campfire past the roofs
  const { roofAt } = roofsOf(objects, P.groundY);
  const hiddenBy = (x, z, hh, skip = null) => {
    const y0 = surfaceAt(x, z);
    const y = (y0 === y0 ? y0 : P.groundY(x, z)) + hh;
    const p = (pitchAt(y0 === y0 ? y0 : P.groundY(x, z)) * Math.PI) / 180;
    for (let t = 0.1; t < 18; t += 0.1) {
      const h = roofAt(x, y + Math.sin(p) * t, z + Math.cos(p) * t, skip);
      if (h) return h;
    }
    return null;
  };
  for (const o of objects) {
    const spots = [];
    if (o.type === 'npc') {
      spots.push([`villager ${o.id}`, o.x, o.z, 1.0]);
      spots.push([`the talk spot south of ${o.id}`, o.x, o.z + 1.1, 1.0]);
    } else if (o.type === 'house') { const d = P.doorOf(o); spots.push([`the door of ${o.id}`, d.x, d.z, 1.0]); }
    else if (o.type === 'signpost') spots.push([`signpost ${o.id}`, o.x, o.z, 1.6]);
    else if (o.type === 'well') spots.push([`well ${o.id}`, o.x, o.z, 1.2]);
    else if (o.type === 'campfire') spots.push([`campfire ${o.id}`, o.x, o.z, 0.6]);
    for (const [what, x, z, hh] of spots) {
      const h = hiddenBy(x, z, hh, o.type === 'house' || o.type === 'well' ? o : null);
      if (h) soft(`${what} at (${x.toFixed(1)}, ${z.toFixed(1)}) is hidden from the camera behind ${h.id}`);
    }
  }
  // walkers on the streets: the share hidden behind roofs (chest height)
  let pathTiles = 0; let hiddenTiles = 0; const hiders = {};
  for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    if (!g.pathMask[I(i, j)] || g.isWater(i, j)) continue;
    pathTiles++;
    const h = hiddenBy(i + 0.5, j + 0.5, 1.0);
    if (h) { hiddenTiles++; (hiders[h.id] ??= []).push(`${i},${j}`); }
  }
  const share = hiddenTiles / Math.max(1, pathTiles);
  const byHider = Object.entries(hiders).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => `${k} ${v.length} (${v[0]}…)`).join(', ');
  info(`camera: a walker is behind a roof on ${hiddenTiles} of ${pathTiles} path tiles (${(100 * share).toFixed(1)} %)${byHider ? `: ${byHider}` : ''}`);
  if (share > hiddenShareMax) soft(`${(100 * share).toFixed(1)} % of the path tiles are hidden behind roofs (at most ${Math.round(hiddenShareMax * 100)} %)`);
  // … and past the terrain: no wall or cliff hides a walker to the waist at a path tile's centre
  const walled = [];
  for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
    if (!g.pathMask[I(i, j)] || g.isWater(i, j)) continue;
    const y0 = standable(i + 0.5, j + 0.5, true);
    if (y0 !== y0) continue;
    const p = (pitchAt(y0) * Math.PI) / 180;
    for (let t = 0.1; t < 12; t += 0.1) {
      const ii = i; const jj = Math.floor(j + 0.5 + Math.cos(p) * t);
      if (!inMap(ii, jj)) break;
      const top = L(ii, jj) * 0.5 + (stairDir(T(ii, jj)) ? 0.25 : 0);
      if (top >= y0 + 1 && y0 + 0.5 + Math.sin(p) * t < top - 0.02) { walled.push(`${i},${j}`); break; }
    }
  }
  if (walled.length) soft(`a wall or cliff hides a walker to the waist at the centre of ${walled.length} path tiles: ${walled.slice(0, 12).join(' ')}`);
  // hand-placed trees keep the sightlines; no crown hides half of a sight target
  for (const t of objects) {
    if (t.type !== 'tree' || scatteredIds.has(t.id)) continue;
    const v = P.VIEWS.find((q) => t.z > q.z && t.z < q.z + q.depth && Math.abs(t.x - q.x) < q.w);
    if (v) soft(`hand-placed ${t.id} at (${t.x}, ${t.z}) stands in the sightline of (${v.x}, ${v.z})`);
  }
  const occl = createOcclusion({ g, objects, groundY: P.groundY, forestTop: scatterForestTop(g) });
  for (const s of sightTargets(objects, P.doorOf)) {
    const r = occl.cover(s.x, s.z, { yaw: 0, pitch: pitchAt(P.groundY(s.x, s.z)), h0: s.h0, h1: s.h1, terrain: false });
    if (r.share >= 0.5) soft(`${s.what} at (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) is ${Math.round(r.share * 100)} % hidden behind ${[...r.by.keys()].map((k) => k.id ?? k).join(', ')}`);
  }
  // critters on walkable ground, wall torches on a wall, everything on the map, env rects overlap it
  const walkableAt = (x, z) => { const h = surfaceAt(x, z); return h === h; };
  for (const o of objects) {
    const def = OBJECT_TYPES[o.type];
    if (def.placement === 'point' && !(o.x >= 0 && o.z >= 0 && o.x <= W && o.z <= D)) soft(`${o.id} lies outside the map`);
    if (o.type === 'critters') {
      const bad = critterStartPoints(o, walkableAt).filter(([x, z]) => !walkableAt(x, z));
      if (bad.length) err(`critters ${o.id}: ${bad.length} animal(s) start off walkable ground`);
    } else if (o.type === 'wallTorch') {
      const i = Math.floor(o.x); const j = Math.floor(o.z);
      let onWall = P.allShapes.some((c) => c.owner.type === 'house' && hitShape(c, o.x, o.z, 1.0));
      for (let dj = -1; dj <= 1 && !onWall; dj++) for (let di = -1; di <= 1; di++) if (inMap(i + di, j + dj) && Math.abs(L(i + di, j + dj) - L(i, j)) >= 2) { onWall = true; break; }
      if (!onWall) soft(`wall torch ${o.id} has no wall to hang on`);
    } else if (o.type === 'npc' && !CHARACTER_PRESET_NAMES.includes(o.preset)) err(`NPC ${o.id}: unknown preset ${o.preset}`);
    else if (o.type === 'emitter' && !EMITTER_PRESETS.includes(o.preset)) err(`emitter ${o.id}: unknown preset ${o.preset}`);
  }
  const env = level.environment;
  for (const a of [...(env.godRayAreas ?? []), ...(env.foliage?.flowerAreas ?? []), ...(env.foliage?.shrubAreas ?? []), ...(env.forest?.areas ?? [])]) {
    if (!(a.maxX > a.minX && a.maxZ > a.minZ && a.maxX > 0 && a.minX < W && a.maxZ > 0 && a.minZ < D)) soft(`an environment area ${a.minX}–${a.maxX} × ${a.minZ}–${a.maxZ} does not overlap the map`);
  }
  // every point the player can reach inside some region (else the HUD keeps a stale place name)
  const regionless = [];
  for (let z = 0.5; z < D; z += 2) for (let x = 0.5; x < W; x += 2) {
    if (walk.reachableAt(x, z) && !objects.some((o) => o.type === 'region' && inRect(x, z, o))) regionless.push(`(${x}, ${z})`);
  }
  if (regionless.length) soft(`${regionless.length} reachable point(s) lie in no region: ${regionless.slice(0, 8).join(' ')}${regionless.length > 8 ? ' …' : ''}`);
  const npcs = objects.filter((o) => o.type === 'npc').length;
  if (minVillagers != null && npcs < minVillagers) warn(`only ${npcs} villagers — a bustling town wants ${minVillagers} or more`);
  return report;
}
