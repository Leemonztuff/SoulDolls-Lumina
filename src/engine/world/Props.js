import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG, hashString, hash2 } from '../utils/math.js';
import { MeshBuilder } from './props/MeshBuilder.js';
import { applyWind } from './props/Wind.js';
import { createFlame } from './props/Flame.js';
import { PropTextureSet } from './props/PropTextures.js';
import { kdSplit, triangleCount } from './SpatialSplit.js';
import { buildShadowCasters } from './ShadowCasters.js';
import { buildHouse } from './props/House.js';
import { buildTree } from './props/Trees.js';
import { buildLamppost, buildWallTorch, buildCampfire } from './props/LightProps.js';
import { buildWell, buildMarketStall, buildBridge, buildWindmill } from './props/Structures.js';
import {
  buildFence, buildBarrel, buildCrate, buildCrateStack, buildSignpost, buildRock, rockGeom, buildBench,
  buildHaystack, buildFlowerbox,
} from './props/SmallProps.js';
import { buildChest, buildWaystone } from './props/CombatProps.js';

/**
 * @import { TextureLibrary } from '../pixel/Textures.js'
 * @import { HouseOptions } from './props/House.js'
 * @import { TreeOptions } from './props/Trees.js'
 * @import { Collider } from './TileMap.js'
 */

/**
 * Props.js — procedural HD-2D diorama props.
 *
 * Every factory method builds chunky, slightly irregular low-poly geometry wearing the shared
 * pixel textures at a constant 16 px / unit (world-space UVs scaled by `textures.meta(name).units`),
 * merges static parts into one mesh per material (a house is 10–13 draw calls), bakes a soft
 * vertex-colour occlusion toward the ground, and returns a {@link PropResult}:
 *
 *  - `object`    THREE.Object3D placed at (x, y, z) with `rotation` about Y (add it to the scene)
 *  - `colliders` world-space circles / AABBs for TileMap.addCollider
 *  - `lights`    point-light descriptors for LightingSystem.addPointLight
 *  - `emissives` materials for LightingSystem.registerEmissive (windows, lantern glass)
 *  - `emitters`  particle emitter descriptors for Particles.createEmitter (chimney smoke, embers)
 *  - `update`    per-frame animation (windmill sails, chest lid, waystone crystal); flames &
 *                foliage animate on the GPU from globalUniforms and need no update
 *  - `interact`  optional interaction point
 *  - `walkRects` optional walkable deck rects (bridges)
 *  - `controls`  optional handles a game drives (chest `open()`, waystone `setAttuned(on)`)
 *  - `sails` / `lid` / `crystal` optional animated parts (windmill, chest, waystone)
 *  - `dispose()` (extra) frees the prop's own geometries (and per-instance materials)
 *
 * Everything casts and receives shadows (flames/glows excepted). Randomness is seeded from the
 * factory seed + prop kind + position (+ `opts.seed`), so a world rebuilds identically.
 *
 * What every factory method returns (ARCHITECTURE.md §4 Props.js;
 * docs/architecture/modules/world.md §4.1):
 * @typedef {object} PropResult
 * @property {THREE.Object3D} object the prop's root group, placed at (x, y, z) and turned by
 *   `rotation`; add it at the scene root (colliders, lights, … are computed in world space)
 * @property {Collider[]} colliders world-space circles / AABBs for TileMap.addCollider ([] when none)
 * @property {{ position: THREE.Vector3, color?: THREE.ColorRepresentation, intensity?: number,
 *   distance?: number, flicker?: number, nightOnly?: boolean }[]} lights
 *   point-light descriptors for LightingSystem.addPointLight / a LightPool ([] when none)
 * @property {{ material: THREE.Material, day?: number, night?: number }[]} emissives
 *   for LightingSystem.registerEmissive, deduplicated per result (library materials are shared)
 * @property {{ preset: string, position: THREE.Vector3, rate?: number, [k: string]: any }[]}
 *   emitters
 *   Particles.createEmitter configs (chimney smoke, embers; [] when none)
 * @property {(dt: number) => void} [update] per-frame animation: windmill sails, chest lid,
 *   waystone crystal (flames and foliage animate on the GPU)
 * @property {{ position: THREE.Vector3, radius: number, id: string,
 *   lookSpan?: { a: THREE.Vector3, b: THREE.Vector3 } }} [interact]
 *   interaction point, id `opts.id` or the kind ('house', 'well', …); `lookSpan` (houses): the door
 *   leaf's edges, a segment the player may face instead of `position` (Game._findInteractable)
 * @property {{ minX: number, maxX: number, minZ: number, maxZ: number, y: number }[]} [walkRects]
 *   bridges: walkable deck rects stepped along the arch, for TileMap.addWalkSurface
 * @property {THREE.Group} [sails] windmills: the turning sails (never merged)
 * @property {{ opened?: boolean, open?: (instant?: boolean) => boolean, attuned?: boolean,
 *   setAttuned?: (on: boolean) => boolean }} [controls]
 *   handles a game drives: a chest's `open(instant = false)` (false if already open) / `opened`,
 *   a waystone's `setAttuned(on)` / `attuned` (COMBAT.md §14.3)
 * @property {THREE.Group} [lid] chests: the lid group `update` swings open
 * @property {THREE.Group} [crystal] waystones: the floating crystal `update` bobs and spins
 * @property {() => void} dispose frees the prop's own geometries, flame materials and per-instance
 *   materials and removes the object (after `mergeStatic`, not the merged parts)
 */
/**
 * What a prop builder hands `PropFactory.result()`: any PropResult fields (the rest default to
 * []) plus the flames and per-instance materials the result's `dispose()` frees.
 * @typedef PropParts
 * @type {Partial<Omit<PropResult, 'object'|'dispose'>> & {
 *   flames?: { materials: THREE.Material[] }[], materials?: THREE.Material[] }}
 */

const _v = new THREE.Vector3();
const _rel = new THREE.Matrix4();
const _mw = new THREE.Matrix4();

export class PropFactory {
  /** @param {{ textures: TextureLibrary, seed?: number }} opts */
  // @ts-expect-error the `{}` default lacks `textures` on purpose: the constructor throws on it
  constructor({ textures, seed = 42 } = {}) {
    if (!textures) throw new Error('PropFactory: `textures` (TextureLibrary) is required');
    this.textures = textures;
    this.seed = seed >>> 0;
    /** Prop-specific textures not in the library (birch bark, produce, sail, leaf litter, ash). */
    this.extra = new PropTextureSet(this.seed ^ 0x5eed);
    this._geometries = new Set();
    this._materials = new Map();
    this._flameMaterials = new Set();
    /** Per-instance materials of single props (a waystone's crystal): freed with their prop. */
    this._ownMaterials = new Set();
  }

  // ===========================================================================================
  // Contract API
  // ===========================================================================================

  /**
   * House with plinth, walls, gable roof with overhang, ridge cap, fascia, door, windows
   * (glowing at night), chimney with smoke, optional jettied 2nd story, flower boxes, lantern.
   * Extra opts: seed, gableFront, upperWall, pitch (deg), overhang, shutters, flowerboxes,
   * lantern, sign, woodpile, doorHood, doorOffset, windowLights, plinth, storyHeight, id.
   * @param {number} x
   * @param {number} y ground height
   * @param {number} z
   * @param {HouseOptions} [opts]
   * @returns {PropResult}
   */
  house(x, y, z, { width = 4, depth = 3, stories = 1, roof = 'roof_red', wall = 'timber_frame',
    rotation = 0, chimney = true, door = 'front', ...rest } = {}) {
    return buildHouse(this, x, y, z, { width, depth, stories, roof, wall, rotation, chimney, door, ...rest });
  }

  /**
   * Tree: 'oak' | 'autumn' | 'pine' | 'birch'. Canopy sways with the wind (and so do its shadows).
   * Extra opts: rotation, fallenLeaves (autumn).
   * @param {number} x
   * @param {number} y ground height
   * @param {number} z
   * @param {TreeOptions} [opts]
   * @returns {PropResult}
   */
  tree(x, y, z, { kind = 'oak', height = 4.5, seed, ...rest } = {}) {
    return buildTree(this, x, y, z, { kind, height, seed, ...rest });
  }

  /** Iron lamppost with a curled arm and hanging lantern (+ warm light). opts: { rotation, style:'arm'|'top', height } */
  lamppost(x, y, z, opts = {}) { return buildLamppost(this, x, y, z, opts); }

  /** Wall torch (bracket + animated flame + light). (x,y,z) = wall mount point; opts.rotation faces local +Z out. */
  wallTorch(x, y, z, opts = {}) { return buildWallTorch(this, x, y, z, opts); }

  /** Campfire: stones, logs, animated flame, embers + smoke emitters, flickering light (day & night). */
  campfire(x, y, z, opts = {}) { return buildCampfire(this, x, y, z, opts); }

  /** Straight fence run between two points (posts + rails), box colliders along the run. */
  fence(x0, z0, x1, z1, y, opts = {}) { return buildFence(this, x0, z0, x1, z1, y, opts); }

  /** Stone well with a small roof, windlass, rope and bucket. */
  well(x, y, z, opts = {}) { return buildWell(this, x, y, z, opts); }

  /**
   * Market stall with striped awning and produce crates.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {{ cloth?: string, rotation?: number, width?: number, depth?: number, display?: boolean,
   *   seed?: number, id?: string }} [opts] cloth ('cloth_stripe'), rotation (0), width (3),
   *   depth (1.6), display (true)
   * @returns {PropResult}
   */
  marketStall(x, y, z, { cloth = 'cloth_stripe', rotation, ...rest } = {}) {
    return buildMarketStall(this, x, y, z, { cloth, rotation, ...rest });
  }

  /** Barrel. opts: { height, radius, lying, rotation } */
  barrel(x, y, z, opts = {}) { return buildBarrel(this, x, y, z, opts); }

  /** Crate. opts: { size, rotation } */
  crate(x, y, z, opts = {}) { return buildCrate(this, x, y, z, opts); }

  /** Small pile of crates (+ optional barrel). opts: { count, size, barrel, rotation } */
  crateStack(x, y, z, opts = {}) { return buildCrateStack(this, x, y, z, opts); }

  /**
   * Wooden plank bridge with a slight arch; returns `walkRects` at deck height.
   * @param {number} x0
   * @param {number} z0
   * @param {number} x1
   * @param {number} z1
   * @param {number} y deck top height
   * @param {{ width?: number, arch?: number, postDepth?: number, rails?: boolean, seed?: number,
   *   id?: string }} [opts] width (2), arch (auto, ≤ 0.4), postDepth (1.4), rails (true)
   * @returns {PropResult}
   */
  bridge(x0, z0, x1, z1, y, { width = 2, ...rest } = {}) {
    return buildBridge(this, x0, z0, x1, z1, y, { width, ...rest });
  }

  /** Signpost with arrow boards. opts: { rotation, boards } */
  signpost(x, y, z, opts = {}) { return buildSignpost(this, x, y, z, opts); }

  /**
   * Irregular low-poly mossy rock.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {{ size?: number, flat?: boolean, rotation?: number, seed?: number, id?: string }} [opts]
   *   size (1), flat (false), rotation (random)
   * @returns {PropResult}
   */
  rock(x, y, z, { size = 1, ...rest } = {}) { return buildRock(this, x, y, z, { size, ...rest }); }

  /** Bench. opts: { rotation, length, back } */
  bench(x, y, z, opts = {}) { return buildBench(this, x, y, z, opts); }

  /** Windmill with rotating sails (call result.update(dt)). opts: { rotation, height, roof, speed } */
  windmill(x, y, z, opts = {}) { return buildWindmill(this, x, y, z, opts); }

  /** Haystack. opts: { size } */
  haystack(x, y, z, opts = {}) { return buildHaystack(this, x, y, z, opts); }

  /** Flower box (on legs, or wall-mounted with `wall: true`). opts: { rotation, length, wall } */
  flowerbox(x, y, z, opts = {}) { return buildFlowerbox(this, x, y, z, opts); }

  /**
   * Iron-banded treasure chest (combat levels, COMBAT.md §14.3); front = local +Z. The result's
   * `controls = { open(instant?), opened }` swings the lid open (0.4 s, in `update`).
   * opts: { rotation, id, seed }
   */
  chest(x, y, z, opts = {}) { return buildChest(this, x, y, z, opts); }

  /**
   * Waystone (checkpoint): rune pillar with a floating crystal on its own emissive material,
   * registered as `{ day: 0.9, night: 1.6 }` so it glows by day. `controls = { setAttuned(on),
   * attuned }` changes the crystal's emissive colour. No light descriptors. opts: { id, seed }
   */
  waystone(x, y, z, opts = {}) { return buildWaystone(this, x, y, z, opts); }

  /** Dispose every geometry, material and texture this factory created (not the TextureLibrary's). */
  dispose() {
    for (const g of this._geometries) g.dispose();
    this._geometries.clear();
    for (const m of this._materials.values()) {
      m.userData.depthMaterial?.dispose();
      m.dispose();
    }
    this._materials.clear();
    for (const m of this._flameMaterials) m.dispose();
    this._flameMaterials.clear();
    for (const m of this._ownMaterials) m.dispose();
    this._ownMaterials.clear();
    this.extra.dispose();
  }

  /**
   * Optional performance helper (extra to the contract): merge the STATIC meshes of many props into
   * one mesh per (material, shadow flags), so a whole village costs a few dozen draw calls — saved
   * again in the shadow pass — instead of ~10 per house. Library materials are shared by every
   * prop, so e.g. all walls of one texture become a single mesh.
   *
   * Left in their prop objects (keep adding every `result.object` to the scene): wind-swayed trunks
   * and foliage (their shader needs the per-tree model matrix), flame billboards and animated parts
   * (windmill sails, anything flagged `userData.dynamic`). Call once the props are built and placed
   * (at the scene root or under a common parent: merged positions are relative to each prop root's
   * parent). A merged prop's own `dispose()` no longer frees the merged parts — use the returned
   * handle's `dispose()` or `factory.dispose()`. Descriptors (colliders, lights, …) are unaffected.
   *
   * Big levels: `maxTriangles` / `maxExtent` cut a material's batch into spatially compact pieces
   * (SpatialSplit.kdSplit by mesh position) of at most that many triangles / spanning at most
   * that many world units (the extent limit only for batches above `minTriangles`), so the
   * camera and the shadow pass cull the parts of the map they cannot see while the draw calls
   * stay few. Default: one batch per material.
   *
   * `shadowCasters` ({ lights, maxTriangles?, maxExtent? }): the shadows of every opaque batch are
   * drawn by a few shadow-only proxy meshes per region instead (ShadowCasters.buildShadowCasters —
   * the depth pass needs no materials), and those batches stop casting: the same shadows for a
   * handful of shadow-pass draw calls.
   * @param {(PropResult|THREE.Object3D)[]} results
   * @param {{ name?: string, maxTriangles?: number, maxExtent?: number, minTriangles?: number,
   *           shadowCasters?: { lights: THREE.Light[], maxTriangles?: number, maxExtent?: number }|null }} [opts]
   * @returns {{ object: THREE.Group, meshes: THREE.Mesh[], dispose: () => void }}
   */
  mergeStatic(results, { name = 'props:static', maxTriangles = Infinity, maxExtent = Infinity, minTriangles = 0, shadowCasters = null } = {}) {
    const buckets = new Map();
    const merged = [];
    const visit = (o, fn) => {
      if (o.userData.dynamic) return;
      fn(o);
      for (const c of o.children) visit(c, fn);
    };
    for (const r of results) {
      const root = /** @type {THREE.Object3D} */ (/** @type {PropResult} */ (r)?.object ?? r);
      if (!root?.isObject3D) continue;
      root.updateWorldMatrix(true, true);
      const rel = root.parent ? _rel.copy(root.parent.matrixWorld).invert() : null;
      visit(root, (o) => {
        if (!o.isMesh || !this._geometries.has(o.geometry)) return;
        const m = o.material;
        if (Array.isArray(m) || m.isShaderMaterial || m.userData.wind) return;
        _mw.copy(o.matrixWorld);
        if (rel) _mw.premultiply(rel);
        if (_mw.determinant() < 0) return; // mirrored: would flip the winding, keep it separate
        const key = `${m.uuid}|${+o.castShadow}|${+o.receiveShadow}`;
        let bk = buckets.get(key);
        if (!bk) {
          bk = { material: m, castShadow: o.castShadow, receiveShadow: o.receiveShadow, depth: o.customDepthMaterial, geos: [], meshes: [], pos: [] };
          buckets.set(key, bk);
        }
        bk.geos.push(o.geometry.clone().applyMatrix4(_mw));
        bk.meshes.push(o);
        bk.pos.push([_mw.elements[12], _mw.elements[14]]);
      });
    }
    const group = new THREE.Group();
    group.name = name;
    let casters = null;
    if (shadowCasters) {
      const pieces = [];
      for (const bk of buckets.values()) {
        const m = bk.material;
        if (!bk.castShadow || bk.depth || m.isShaderMaterial || (m.alphaTest > 0 && (m.map || m.alphaMap)) || m.alphaToCoverage) continue;
        bk.proxied = true;
        for (const g of bk.geos) pieces.push({ geometry: g, side: m.side });
      }
      casters = buildShadowCasters(pieces, { name: `${name}:shadow`, ...shadowCasters });
      group.add(casters.object);
    }
    for (const bk of buckets.values()) {
      const idx = bk.geos.map((_, i) => i);
      const parts = Number.isFinite(maxTriangles) || Number.isFinite(maxExtent)
        ? kdSplit(idx, {
          x: (i) => bk.pos[i][0], z: (i) => bk.pos[i][1], weight: (i) => triangleCount(bk.geos[i]),
          maxWeight: maxTriangles, maxExtent, minWeight: minTriangles,
        })
        : [idx];
      const label = `${name}:${bk.material.userData.texture || bk.material.name || 'mat'}`;
      let ok = true;
      const made = [];
      for (let p = 0; p < parts.length && ok; p++) {
        const g = mergeGeometries(parts[p].map((i) => bk.geos[i]), false);
        if (!g) { ok = false; break; } // incompatible attribute sets: leave these meshes as they are
        g.computeBoundingSphere();
        g.computeBoundingBox();
        const mesh = new THREE.Mesh(g, bk.material);
        mesh.name = parts.length > 1 ? `${label}#${p}` : label;
        mesh.castShadow = bk.castShadow && !bk.proxied;
        mesh.receiveShadow = bk.receiveShadow;
        if (bk.depth) mesh.customDepthMaterial = bk.depth;
        mesh.matrixAutoUpdate = false;
        made.push(mesh);
      }
      for (const c of bk.geos) c.dispose();
      if (!ok) {
        for (const m of made) m.geometry.dispose();
        continue;
      }
      for (const mesh of made) {
        group.add(mesh);
        merged.push(mesh);
        this._geometries.add(mesh.geometry);
      }
      for (const o of bk.meshes) {
        o.removeFromParent();
        o.geometry.dispose();
        this._geometries.delete(o.geometry);
      }
    }
    return {
      object: group,
      meshes: merged,
      dispose: () => {
        for (const mesh of merged) {
          mesh.geometry.dispose();
          this._geometries.delete(mesh.geometry);
        }
        casters?.dispose();
        group.removeFromParent();
      },
    };
  }

  // ===========================================================================================
  // Helpers used by the prop builders (public so custom props can reuse them)
  // ===========================================================================================

  /** Deterministic RNG for a prop from its kind, position and optional seed. */
  rng(kind, x, z, seed) {
    const s = hashString(kind) ^ Math.floor(hash2(Math.round(x * 16), Math.round(z * 16), this.seed) * 4294967296)
      ^ (seed != null ? Math.imul((seed | 0) + 0x9e3779b9, 0x85ebca6b) : 0);
    return new RNG(s >>> 0);
  }

  /** New MeshBuilder bound to this factory's textures. */
  builder(ao = null) {
    return new MeshBuilder(this.textures, { ao });
  }

  /** Track geometries for disposal. */
  track(geometries) {
    for (const g of geometries) this._geometries.add(g);
  }

  /** Build a MeshBuilder into a placed group (tracked for disposal). */
  finish(b, name, x, y, z, rotation = 0) {
    const { group, geometries } = b.build(name);
    this.track(geometries);
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    group.updateMatrixWorld(true);
    group.userData.geometries = geometries;
    return group;
  }

  /** Local (prop-space) point → world Vector3 (assumes the prop sits at the scene root). */
  world(group, p) {
    return new THREE.Vector3().copy(p).applyMatrix4(group.matrixWorld);
  }

  /**
   * World AABB collider of a local-space rectangle.
   * @returns {{ type: 'box', minX: number, maxX: number, minZ: number, maxZ: number }}
   */
  boxCollider(group, minX, maxX, minZ, maxZ) {
    const r = this.localRect(group, minX, maxX, minZ, maxZ);
    return { type: 'box', ...r };
  }

  /** World AABB {minX,maxX,minZ,maxZ} of a local-space rectangle. */
  localRect(group, minX, maxX, minZ, maxZ) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const [lx, lz] of [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]]) {
      _v.set(lx, 0, lz).applyMatrix4(group.matrixWorld);
      x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x);
      z0 = Math.min(z0, _v.z); z1 = Math.max(z1, _v.z);
    }
    return { minX: x0, maxX: x1, minZ: z0, maxZ: z1 };
  }

  /**
   * Assemble a PropResult with defaults and a dispose() for the prop's own geometries.
   * `parts.flames` (flame billboards) and `parts.materials` (per-instance materials the prop owns
   * alone) are freed by that dispose() too; neither is kept on the result.
   * @param {THREE.Object3D} group
   * @param {PropParts} [parts]
   * @returns {PropResult}
   */
  result(group, parts = {}) {
    /** @type {Partial<PropResult> & PropParts} */
    const res = {
      object: group,
      colliders: parts.colliders ?? [],
      lights: parts.lights ?? [],
      emissives: dedupe(parts.emissives ?? []),
      emitters: parts.emitters ?? [],
      ...parts,
    };
    res.emissives = dedupe(res.emissives);
    const flames = parts.flames ?? [];
    delete res.flames;
    const own = parts.materials ?? [];
    delete res.materials;
    for (const m of own) this._ownMaterials.add(m);
    res.dispose = () => {
      group.traverse(/** @param {THREE.Object3D & { geometry?: THREE.BufferGeometry }} o */ (o) => {
        if (o.geometry && this._geometries.has(o.geometry)) {
          o.geometry.dispose();
          this._geometries.delete(o.geometry);
        }
      });
      for (const fl of flames) {
        for (const m of fl.materials) { m.dispose(); this._flameMaterials.delete(m); }
      }
      for (const m of own) { m.dispose(); this._ownMaterials.delete(m); }
      group.removeFromParent();
    };
    return /** @type {PropResult} */ (res); // `dispose` was just set
  }

  /** Flame billboard (+glow) — materials/geometries are tracked for disposal. */
  flame(opts) {
    const fl = createFlame(opts);
    this.track(fl.geometries);
    for (const m of fl.materials) this._flameMaterials.add(m);
    return fl;
  }

  /** Window material variant (emissive starts at 0 = day; drive it via PropResult.emissives). */
  windowMaterial() {
    return this.textures.material('window', { vertexColors: true, emissiveIntensity: 0 });
  }

  /** Lantern glass variant (emissive starts at 0 = day). */
  glassMaterial() {
    return this.textures.material('lantern_glass', { vertexColors: true, emissiveIntensity: 0 });
  }

  /**
   * Own (non-library) material sharing a texture's maps, patched for wind sway. `name` is a
   * TextureLibrary name or one of the extra prop textures ('birch').
   */
  windMaterial(name) {
    return this._cachedMaterial(`wind:${name}`, () => {
      const src = this._source(name);
      const m = new THREE.MeshLambertMaterial({ map: src.map, normalMap: src.normalMap, normalScale: src.normalScale.clone(), vertexColors: true });
      m.name = `lumina:wind:${name}`;
      m.userData.units = src.units;
      return applyWind(m, { foliage: false });
    });
  }

  /**
   * Alpha-tested, double-sided foliage material with wind sway + foliage lighting.
   * `billboard: true` → cards authored facing +Z turn toward the camera (sun in the shadow pass).
   */
  foliageMaterial(name, { billboard = false } = {}) {
    return this._cachedMaterial(`foliage:${name}:${billboard}`, () => {
      const src = this._source(name);
      const m = new THREE.MeshLambertMaterial({
        map: src.map, normalMap: src.normalMap, normalScale: src.normalScale.clone().multiplyScalar(0.8),
        vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide,
      });
      m.name = `lumina:foliage:${name}`;
      m.userData.units = src.units;
      return applyWind(m, { foliage: true, wrap: 0.5, billboard });
    });
  }

  /** Ground decal material (alpha, polygon offset, receives but does not cast shadows). */
  decalMaterial(name) {
    return this._cachedMaterial(`decal:${name}`, () => {
      const t = this.extra.textures(name);
      const m = new THREE.MeshLambertMaterial({
        map: t.map, normalMap: t.normal, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      m.name = `lumina:decal:${name}`;
      m.userData.units = t.units;
      m.userData.castShadow = false;
      return m;
    });
  }

  /** Emit an irregular rock into a builder (see SmallProps.rockGeom). */
  rockGeom(b, cx, cy, cz, size, rng, opts) {
    return rockGeom(b, cx, cy, cz, size, rng, opts);
  }

  _cachedMaterial(key, make) {
    let m = this._materials.get(key);
    if (!m) {
      m = make();
      this._materials.set(key, m);
    }
    return m;
  }

  _source(name) {
    if (this.textures.has(name)) {
      const lib = this.textures.material(name);
      return { map: lib.map, normalMap: lib.normalMap, normalScale: lib.normalScale, units: this.textures.meta(name).units };
    }
    const t = this.extra.textures(name);
    return { map: t.map, normalMap: t.normal, normalScale: new THREE.Vector2(0.6, 0.6), units: t.units };
  }
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const e of list) {
    if (seen.has(e.material)) continue;
    seen.add(e.material);
    out.push(e);
  }
  return out;
}
