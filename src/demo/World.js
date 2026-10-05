import * as THREE from 'three';
import { buildLevelTerrain, LevelObjectBuilder, computeCameraBounds } from '../engine/level/ObjectBuilder.js';
import { mergeTrees, scatterForest, forestKindAreas, makeOuterHeight, buildOuterGround } from './Scenery.js';
import { buildGroundDetail } from './GroundDetail.js';
import { addSnowCover, ROOF_MATERIAL } from './SnowCover.js';
import { LightPool, sanitizeLightDescriptors } from '../engine/lighting/LightPool.js';
import { buildShadowCasters, isProxyCaster } from '../engine/world/ShadowCasters.js';
import { cullByBox } from '../engine/world/SpatialSplit.js';
import { waterfallDir } from '../engine/world/Water.js';

/**
 * @import { Engine } from '../engine/core/Engine.js'
 * @import { GodRays } from '../engine/fx/GodRays.js'
 * @import { Particles, PARTICLE_PRESETS } from '../engine/fx/Particles.js'
 * @import { Level, LevelEnvironment, LevelObject } from '../engine/level/types.js'
 * @import { LightingSystem } from '../engine/lighting/LightingSystem.js'
 * @import { TextureLibrary } from '../engine/pixel/Textures.js'
 * @import { PropResult } from '../engine/world/Props.js'
 * @import { Game } from './Game.js'
 * @import { BuiltObject } from '../engine/level/ObjectBuilder.js'
 * @import { SolidMesh } from '../engine/render/types.js'
 */

/** Point-light budget (ARCHITECTURE §1): every light is created before the first frame. */
export const MAX_POINT_LIGHTS = 12;

const nextFrame = () => new Promise((r) => setTimeout(r, 0));

/** Softer, greyer chimney / campfire smoke than the preset (it reads as haze, not cotton). */
const SMOKE = { alpha: 0.2, color: '#b3aca6', colorEnd: '#85828c', size: [0.3, 0.46], sizeEnd: 3.4 };

/** Waterfall spray: a dense emitter reads as a flat, blooming white smear. Default per unit width. */
const MIST = { countPerWidth: 8, alpha: 0.07 };

/**
 * Open ground south of the map before the outer forest (environment.scenery.southGap): the camera
 * looks north, so tall trees right beyond the south edge would hide a player walking near it.
 */
const SOUTH_GAP = 5;

/** Level types World builds in its first pass (props); trees and waterfalls follow separately. */
const LATE_TYPES = new Set(['tree', 'waterfall']);

/**
 * Spatial batching of big levels. Levels up to SMALL_LEVEL tiles on both axes keep one batch per
 * material (the batching they were tuned with). Bigger levels cut every batch into spatially
 * compact pieces (SpatialSplit.kdSplit) of a triangle / instance budget, so the camera and the
 * shadow pass cull what they cannot see while the draw calls stay few:
 *  - terrain: TileMap chunks of `terrainChunk` tiles, then per material merged back into
 *    batches of ≤ `terrainTriangles` over ≤ `terrainExtent` units (a material lighter than
 *    `terrainMinTriangles` in all: one batch) (TileMap.consolidateChunks);
 *  - static props (PropFactory.mergeStatic): per material ≤ `propTriangles`, and batches above
 *    `minTriangles` span ≤ `propExtent` units; trees — map, border and outer forest
 *    (Scenery.mergeTrees) — likewise with `treeTriangles` / `treeExtent`;
 *  - ground foliage: ≤ `foliageInstances` tufts per instanced mesh (GroundDetail);
 *  - shadows of the opaque props and terrain faces: shadow-only proxies merged across materials,
 *    ≤ `casterTriangles` over ≤ `casterExtent` units each (ShadowCasters) — the depth pass needs
 *    no materials, so it costs a few draw calls instead of one per material and region.
 * Every batch is culled by its world bounding box (SpatialSplit.cullByBox). The shadow frustum's
 * depth is limited to `shadowUp` / `shadowDown` units around its centre
 * (LightingSystem.setShadowDepthRange, set by the game), so casters far up-sun are culled too.
 * Measured trade-off (docs/contracts/LEVEL_EDITOR.md §5): finer pieces cut few more triangles but add draw
 * calls; these budgets keep a busy 128 × 128 village under ~300 calls with the shadow pass.
 */
const SMALL_LEVEL = 64;
export const BIG_LEVEL_BATCHING = Object.freeze({
  terrainChunk: 32,
  terrainTriangles: 48000,
  terrainExtent: 48,
  terrainMinTriangles: 12000,
  propTriangles: 16000,
  propExtent: 64,
  treeTriangles: 16000,
  treeExtent: 96,
  minTriangles: 3000,
  casterTriangles: 96000,
  casterExtent: 64,
  foliageInstances: 4000,
  shadowUp: 60,
  shadowDown: 45,
  // particle areas, waterfall mist and chimney smoke whose box is farther than this from the camera
  // focus are switched off (one draw call each; that far out — the top corners of a zoomed-out
  // view — they are specks in the tilt-shift blur). The default view reaches ~32 units.
  particleCull: 34,
});

/**
 * Something the player can examine (Game._findInteractable / Game._interact).
 * @typedef {object} Interactable
 * @property {string} id
 * @property {THREE.Vector3} position   where it is examined from (a door: the door-step point)
 * @property {number} radius            reach
 * @property {string} label             the prompt's verb ('Knock', 'Read' …; the combat system
 *                                      relabels chests 'Open' and waystones 'Rest')
 * @property {string} kind              'door' | 'sign' | 'well' | 'chest' | 'waystone'
 * @property {THREE.Vector3} prompt     where the prompt is drawn
 * @property {{ a: THREE.Vector3, b: THREE.Vector3 }|null} lookSpan
 *   a segment the player may face instead of `position` (a door's leaf; see `_interact`)
 * @property {{ speaker: string, lines: string[], sfx?: string }} text   what examining shows
 * @property {LevelObject} [object]     chests and waystones: the level object
 * @property {PropResult['controls']|null} [prop]   chests and waystones: the prop's `controls`
 * @property {boolean} [disabled]       set by the combat system on an opened chest: offers nothing
 * @property {(game: Game, it: Interactable) => unknown} [onInteract]
 *   set by the combat system on chests and waystones (open / rest) instead of showing `text`
 */

/**
 * World — builds a Lumina level (docs/contracts/LEVEL_EDITOR.md) into the scene: terrain and water via
 * `buildLevelTerrain`, every prop through `LevelObjectBuilder`, then the diorama polish — static
 * mesh batching (PropFactory.mergeStatic), tree merging (Scenery.mergeTrees), the forest border
 * and the fogged outer scenery, ground foliage, snow cover, the ≤ 12 point lights by priority,
 * particle areas and god rays.
 *
 * Every BuiltObject is wired: lights → LightingSystem.addPointLight, emissives → registerEmissive,
 * emitters → Particles.createEmitter, colliders → TileMap.addCollider, walkRects →
 * TileMap.addWalkSurface, update() → per frame.
 *
 * Game-facing results: `interactables` (door / sign / well texts; chests and waystones with their
 * level `object` and prop `controls`), `fires` and `falls` (audio & spray anchors), `areaEmitters`
 * (particle areas the weather drives), `lights`, `emissiveEntries`.
 */
export class World {
  /**
   * @param {{ engine: Engine, textures: TextureLibrary, lighting: LightingSystem, particles: Particles,
   *           godRays: GodRays, level: Level }} ctx  level: a normalised Lumina level
   */
  constructor({ engine, textures, lighting, particles, godRays, level }) {
    this.engine = engine;
    this.scene = engine.scene;
    this.textures = textures;
    this.lighting = lighting;
    this.particles = particles;
    this.godRays = godRays;
    this.level = level;
    /** @type {Partial<LevelEnvironment>} ({} without one) */
    this.env = level.environment ?? {};
    this.root = new THREE.Group();
    this.root.name = 'World';
    this.scene.add(this.root);

    this.tileMap = null;
    this.water = null;
    this.terrain = null;
    this.builder = null;
    this.factory = null;
    /** Every BuiltObject (props, trees, waterfalls) in build order. */
    this.built = [];
    /** PropResults batched by mergeStatic. */
    this.results = [];
    this.updaters = [];
    /** Waterfall BuiltObjects (their update runs every frame). */
    this.waterfalls = [];
    /**
     * Doors, signs, wells, chests and waystones.
     * @type {Interactable[]}
     */
    this.interactables = [];
    /**
     * Named emitters: `dust` (follows the camera, driven by the game) + particle areas by object id
     * (prototype-less: the ids are level data).
     */
    this.emitters = Object.create(null);
    /** Particle areas from `emitter` objects: { id, preset, emitter }. */
    this.areaEmitters = [];
    /** Emitters created from prop descriptors (smoke, embers, mist). */
    this.propEmitters = [];
    this.lights = [];
    /** registerEmissive entries (+ `baseDay`), so the weather can light windows on grey days. */
    this.emissiveEntries = [];
    /** The shared lantern-glass material (its albedo is dimmed while the lamps are unlit). */
    this.glassMaterial = null;
    /** Campfire positions (ambience). */
    this.fires = [];
    /**
     * Waterfalls: { id, x, z, width, dir: [fx, fz], anchor (foot of the fall, in the pool), top,
     * splash (spray bursts + the roar in the ambience) }.
     */
    this.falls = [];
    /** Legacy named anchors (first campfire / first splashing waterfall). */
    this.anchors = {};
    this.stats = {};
  }

  /** Ground height (walk surfaces included). */
  groundAt(x, z) {
    return this.tileMap.getHeight(x, z);
  }

  /** Level objects of one type, in level order. */
  objectsOf(type) {
    return this.level.objects.filter((o) => o.type === type);
  }

  /** Is (x, z) inside the map rectangle? */
  inMap(x, z) {
    return x >= 0 && z >= 0 && x <= this.level.width && z <= this.level.depth;
  }

  /**
   * Build everything (async so a loading screen can breathe between steps).
   * @param {(fraction:number, label:string) => void} [onProgress]
   */
  async build(onProgress = () => {}) {
    const t0 = performance.now();
    // per-phase CPU milliseconds (the yields to the loading screen are not counted)
    const phases = {};
    this.stats.phases = phases;
    let tp = t0;
    const mark = (name) => {
      const now = performance.now();
      phases[name] = (phases[name] ?? 0) + Math.round(now - tp);
      tp = now;
    };
    const step = async (f, label) => { onProgress(f, label); await nextFrame(); tp = performance.now(); };
    const level = this.level;
    /** Spatial batching budgets of a big level (null: one batch per material, see SMALL_LEVEL). */
    this.batching = World.isBigLevel(level) ? { ...BIG_LEVEL_BATCHING } : null;
    const B = this.batching;

    await step(0.08, 'Painting textures');
    this.textures.preload();
    mark('textures');

    await step(0.18, 'Raising the land');
    // (the shore texture is baked once, below, when the props standing in the water exist)
    this.terrain = buildLevelTerrain(level, { textures: this.textures, chunkSize: B ? B.terrainChunk : 64, deferShore: true });
    this.tileMap = this.terrain.tileMap;
    if (B) {
      // terrain shadows: shadow-only proxies of the opaque casting faces (cliffs, walls)
      // (isProxyCaster passes single-material meshes only)
      const casters = /** @type {SolidMesh[]} */ (this.tileMap.object.children.filter(isProxyCaster));
      this.terrainCasters = buildShadowCasters(casters.map((m) => ({ geometry: m.geometry, side: m.material.side })), {
        lights: [this.lighting.sun], maxTriangles: B.casterTriangles, maxExtent: B.casterExtent, name: 'terrain:shadow',
      });
      for (const m of casters) m.castShadow = false;
      this.root.add(this.terrainCasters.object);
    }
    if (B && B.terrainTriangles > 0) {
      const n = this.tileMap.object.children.length;
      this.stats.terrainMeshes = [n, n - this.tileMap.consolidateChunks({ maxTriangles: B.terrainTriangles, maxExtent: B.terrainExtent, minTriangles: B.terrainMinTriangles })];
    }
    this.water = this.terrain.water;
    this.root.add(this.terrain.object);
    mark('terrain');

    await step(0.3, 'Building the village');
    this.builder = new LevelObjectBuilder({ textures: this.textures, seed: 42 });
    this.factory = this.builder.factory;
    this.glassMaterial = this.factory.glassMaterial();
    for await (const f of this._buildProps()) {
      mark('props');
      await step(0.3 + 0.14 * f, 'Building the village');
    }
    mark('props');

    await step(0.45, 'Planting the forest');
    const village = this._buildLevelTrees();
    // every collider exists now (the forest border and outer trees have none): colliders standing
    // in water (bridge posts, rocks, trees) shape the shore texture — a big level bakes it in a
    // worker while the forest, foliage and batches build
    const shore = B && this.water ? this.water.refreshAsync() : null;
    this._buildTrees(village);
    mark('trees');

    await step(0.58, 'Letting the water run');
    this._buildWaterfalls();
    // colliders standing in water (bridge posts, rocks) shape the shore texture
    if (!shore) this.water?.refresh();
    mark('water');

    await step(0.68, 'Growing the meadow');
    this._buildGroundDetail();
    mark('foliage');

    await step(0.8, 'Lighting the lanterns');
    this._wireLights();
    this._buildAtmosphere();
    mark('lights');

    await step(0.88, 'Merging meshes');
    this.merged = this._mergeProps();
    mark('merge');
    if (shore) {
      await shore;
      // (guard: a collider added in the water since the bake started)
      if (this.water._waterColliderSignature() !== this.water._colliderSig) this.water.refresh();
      mark('shoreWait');
    }

    // snow cover (driven by Weather): terrain tops & the outer hills, the ground sprites, the roofs
    this.tileMap.object.traverse((/** @type {SolidMesh} */ o) => { if (o.isMesh) addSnowCover(o.material, 'ground'); });
    if (this.outerGround) addSnowCover(this.outerGround.material, 'ground');
    for (const f of this.groundDetail.fields) addSnowCover(f.material, 'foliage');
    this.merged.object.traverse((/** @type {SolidMesh} */ o) => { if (o.isMesh && ROOF_MATERIAL.test(o.material?.name ?? '')) addSnowCover(o.material, 'ground'); });
    mark('snow');

    // big level: cull the static batches by their boxes (far tighter than spheres for flat,
    // spread-out batches under the tilted camera and the long shadow frustum)
    if (B) {
      for (const m of /** @type {THREE.Mesh[]} */ (this.tileMap.object.children)) if (m.isMesh) cullByBox(m);
      for (const m of this.merged.meshes) cullByBox(m);
      for (const t of this.treeGroups) for (const m of t.meshes) cullByBox(m);
      for (const f of this.groundDetail.fields) cullByBox(f.object, { pad: 0.8 });
      mark('culling');
    }

    this.stats.buildMs = Math.round(performance.now() - t0);
    this.stats.colliders = this.tileMap.colliders.length;
    this.stats.pointLights = this.lights.length;
    this.stats.objects = level.objects.length;
    this.stats.batching = !!B;
  }

  /** mergeStatic / mergeTrees split options of a big level ({} = one batch per material). */
  _splitOpts(kind) {
    const B = this.batching;
    if (!B) return {};
    return kind === 'tree'
      ? { maxTriangles: B.treeTriangles, maxExtent: B.treeExtent, minTriangles: B.minTriangles }
      : { maxTriangles: B.propTriangles, maxExtent: B.propExtent, minTriangles: B.minTriangles };
  }

  /** Does this level get the big-level spatial batching (BIG_LEVEL_BATCHING)? */
  static isBigLevel(level) {
    return Math.max(level.width, level.depth) > SMALL_LEVEL;
  }

  /**
   * Batch the static prop meshes (PropFactory.mergeStatic): one mesh per material, cut into
   * spatially compact pieces on a big level.
   * @returns {{ object: THREE.Object3D, meshes: THREE.Mesh[], dispose(): void }}
   */
  _mergeProps() {
    const B = this.batching;
    const merged = this.factory.mergeStatic(this.results, {
      name: 'village:static',
      ...this._splitOpts('prop'),
      shadowCasters: B ? { lights: [this.lighting.sun], maxTriangles: B.casterTriangles, maxExtent: B.casterExtent } : null,
    });
    this.root.add(merged.object);
    return merged;
  }

  // ---------------------------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------------------------

  /**
   * Build one level object and wire everything it returns.
   * @returns {BuiltObject|null}
   */
  _build(obj, { addToScene = true, merge = true } = {}) {
    let b = null;
    try {
      b = this.builder.build(obj, this.tileMap);
    } catch (err) {
      console.warn(`[Lumina] could not build ${obj.type} "${obj.id}":`, err);
      return null;
    }
    if (!b) return null;
    this.built.push(b);
    if (addToScene) this.root.add(b.object);
    if (merge && b.propResult) this.results.push(b.propResult);
    for (const c of b.colliders) this.tileMap.addCollider(c);
    for (const r of b.walkRects) this.tileMap.addWalkSurface(r);
    for (const e of b.emissives) this._registerEmissive(e);
    for (const l of b.lights) this._lightDescs.push(l);
    if (b.update) this.updaters.push(b.update);
    return b;
  }

  _createEmitter(e) {
    const em = this.particles.createEmitter(e.preset === 'smoke' ? { ...e, ...SMOKE } : e);
    this.propEmitters.push(em);
    return em;
  }

  _registerEmissive(e) {
    this._emissiveSet ??= new Set();
    if (this._emissiveSet.has(e.material)) return;
    this._emissiveSet.add(e.material);
    /** @type {ReturnType<LightingSystem['registerEmissive']> & { baseDay?: number }} */
    const entry = this.lighting.registerEmissive(e.material, { day: e.day ?? 0, night: e.night ?? 1.6 });
    entry.baseDay = entry.day;
    this.emissiveEntries.push(entry);
  }

  /**
   * `lookSpan` (optional) `{ a, b }`: a horizontal segment the player may face instead of
   * `position` — a door's leaf, edge to edge, while `position` is the door-step point in front of
   * it (see Game._findInteractable). `object` / `prop` (optional, chests and waystones — COMBAT.md
   * §9.8): the level object and the prop's `controls`, copied onto the item for the combat system.
   * @param {string} id
   * @param {THREE.Vector3} position
   * @param {{ radius?: number, label?: string, kind?: string, prompt?: THREE.Vector3|null,
   *   lookSpan?: { a: THREE.Vector3, b: THREE.Vector3 }|null, text: Interactable['text'],
   *   object?: LevelObject, prop?: Interactable['prop'] }} opts
   *   radius 1.2, label 'Examine', kind 'object', prompt 1.6 above `position`
   * @returns {Interactable}
   */
  _interact(id, position, { radius = 1.2, label = 'Examine', kind = 'object', prompt = null, lookSpan = null, text, object, prop }) {
    const span = lookSpan ? { a: lookSpan.a.clone(), b: lookSpan.b.clone() } : null;
    const it = { id, position: position.clone(), radius, label, kind, prompt: prompt ?? position.clone().setY(position.y + 1.6), lookSpan: span, text };
    if (object !== undefined) it.object = object;
    if (prop !== undefined) it.prop = prop;
    this.interactables.push(it);
    return it;
  }

  /** Non-empty text lines of an object's `text` field. */
  static textLines(obj) {
    const t = obj.text;
    const lines = Array.isArray(t) ? t : typeof t === 'string' ? [t] : [];
    return lines.map(String).filter((s) => s.trim());
  }

  /**
   * Build every prop-kind object but trees and waterfalls. A generator: it yields the fraction
   * done about every 12 ms so the loading screen keeps animating on big levels.
   */
  *_buildProps() {
    this._lightDescs = [];
    this.houseFootprints = [];
    const objects = this.level.objects;
    let slice = performance.now();
    for (let n = 0; n < objects.length; n++) {
      const obj = objects[n];
      if (performance.now() - slice > 12) {
        yield n / objects.length;
        slice = performance.now();
      }
      if (!LevelObjectBuilder.isBuildable(obj.type) || LATE_TYPES.has(obj.type)) continue;
      const b = this._build(obj);
      if (!b) continue;
      for (const e of b.emitters) this._createEmitter(e);
      const lines = World.textLines(obj);
      switch (obj.type) {
        case 'house': {
          const door = b.interact?.position?.clone() ?? null;
          const box = b.colliders.find((c) => c.type === 'box');
          if (box) this.houseFootprints.push({ minX: box.minX, maxX: box.maxX, minZ: box.minZ, maxZ: box.maxZ, door });
          if (door && lines.length) {
            this._interact(`door:${obj.id}`, door, { radius: 1.0, label: 'Knock', kind: 'door', lookSpan: b.interact.lookSpan, text: { speaker: '', lines } });
          }
          break;
        }
        case 'signpost':
          if (lines.length) {
            this._interact(obj.id, b.anchor, { radius: 1.35, label: 'Read', kind: 'sign', text: { speaker: obj.speaker ?? 'Signpost', lines } });
          }
          break;
        case 'well': {
          if (!lines.length) break;
          const y = b.anchor.y;
          const pos = b.interact?.position ?? new THREE.Vector3(obj.x, y, obj.z);
          // prompt well above the roof (and a touch north): a player standing behind the well
          // projects just above the roof line, so a lower prompt would sit on their head
          const prompt = new THREE.Vector3(obj.x, y + 4.2, obj.z - 0.3);
          this._interact(obj.id, pos, { radius: 1.75, label: 'Look', kind: 'well', prompt, text: { speaker: '', lines, sfx: obj.sfx ?? 'splash' } });
          break;
        }
        case 'campfire':
          this.fires.push(b.anchor.clone());
          this.anchors.campfire ??= this.fires[0];
          break;
        case 'chest':
        case 'waystone': {
          // examined on a peaceful level; on a combat level the combat system sets `onInteract`
          // and the label ('Open' / 'Rest') at load (COMBAT.md §9.8, §6.12)
          const chest = obj.type === 'chest';
          const y = b.anchor.y;
          this._interact(obj.id, b.interact?.position ?? b.anchor, {
            kind: obj.type,
            label: 'Examine',
            radius: chest ? 1.2 : 1.5,
            prompt: new THREE.Vector3(obj.x, y + (chest ? 1.2 : 2.4), obj.z),
            text: chest ? { speaker: '', lines: ['The chest is locked tight.'] }
              : { speaker: obj.name || 'Waystone', lines: ['An old waystone hums quietly.'] },
            object: obj,
            prop: b.propResult?.controls ?? null,
          });
          break;
        }
        default:
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Trees: level trees (trunk colliders unless `collider: false`), forest border, outer world —
  // all merged
  // ---------------------------------------------------------------------------------------------

  /** The level's own trees (with their trunk colliders); merged by _buildTrees. */
  _buildLevelTrees() {
    const village = [];
    for (const obj of this.objectsOf('tree')) {
      const b = this._build(obj, { addToScene: false, merge: false });
      if (b?.propResult) village.push(b.propResult);
    }
    return village;
  }

  _buildTrees(village = this._buildLevelTrees()) {
    const f = this.factory;
    const tm = this.tileMap;
    const env = this.env;
    const trees = this.objectsOf('tree');
    this.stats.trees = { village: village.length, border: 0, outer: 0 };

    const forest = env.border === 'forest';
    const outerOn = env.outerScenery !== false;
    let border = [];
    let outer = [];
    if (forest || outerOn) {
      this.outerHeight = makeOuterHeight(tm);
      // keep the scatter away from the hand-placed trees (big ones beyond the map edge need more room)
      const avoid = trees.map((o) => ({ x: o.x, z: o.z, r: this.inMap(o.x, o.z) ? 1.2 : 1.8 }));
      const southGap = Number.isFinite(env.scenery?.southGap) ? env.scenery.southGap : SOUTH_GAP;
      ({ border, outer } = scatterForest({ tileMap: tm, heightAt: this.outerHeight, avoid, southGap, kindAreas: forestKindAreas(env) }));
      if (!forest) border = [];
      if (!outerOn) outer = [];
    }
    const borderTrees = border.map(([kind, x, y, z, height]) => f.tree(x, y, z, { kind, height, fallenLeaves: false }));
    const outerTrees = outer.map(([kind, x, y, z, height]) => f.tree(x, y, z, { kind, height, fallenLeaves: false }));
    const split = this._splitOpts('tree');

    const a = mergeTrees([...village, ...borderTrees], { name: 'trees:map', ...split });
    this.root.add(a.object);
    this.treeGroups = [a];
    // outer trees: split into four quadrants so frustum culling can skip what the camera can't
    // see (a big level: into compact pieces of the tree budget instead)
    const W = tm.width;
    const D = tm.depth;
    const quads = this.batching ? { all: outerTrees } : { n: [], s: [], e: [], w: [] };
    if (!this.batching) {
      outerTrees.forEach((r, i) => {
        const [, x, , z] = outer[i];
        const q = z < 0 ? 'n' : z > D ? 's' : x < W / 2 ? 'w' : 'e';
        quads[q].push(r);
      });
    }
    for (const [q, list] of Object.entries(quads)) {
      if (!list.length) continue;
      const name = this.batching ? 'trees:outer' : `trees:outer:${q}`;
      const m = mergeTrees(list, { name, castShadow: false, ...split });
      this.root.add(m.object);
      this.treeGroups.push(m);
    }
    this.stats.trees = { village: village.length, border: border.length, outer: outer.length };

    if (outerOn) {
      const ground = buildOuterGround({ textures: this.textures, tileMap: tm, heightAt: this.outerHeight });
      this.root.add(ground);
      this.outerGround = ground;
    } else this.outerGround = null;
  }

  // ---------------------------------------------------------------------------------------------
  // Waterfalls (the river / pond / stream surfaces come with the terrain)
  // ---------------------------------------------------------------------------------------------

  _buildWaterfalls() {
    for (const obj of this.objectsOf('waterfall')) {
      const b = this._build(obj, { merge: false });
      if (!b) continue;
      this.waterfalls.push(b);
      // thin spray (see MIST); `mist: { count, alpha }` tunes it per waterfall
      const width = obj.width ?? 2;
      const mist = { count: Math.max(4, Math.round(MIST.countPerWidth * width)), alpha: MIST.alpha, ...(obj.mist ?? {}) };
      for (const e of b.emitters) this._createEmitter({ ...e, count: mist.count, alpha: mist.alpha });
      const dir = waterfallDir(obj.facing);
      const bottom = b.anchor.y;
      const fall = {
        id: obj.id,
        x: obj.x,
        z: obj.z,
        width,
        dir,
        anchor: new THREE.Vector3(obj.x + dir[0] * 0.6, bottom, obj.z + dir[1] * 0.6),
        splash: obj.splash !== false,
      };
      this.falls.push(fall);
      if (fall.splash) this.anchors.waterfall ??= fall.anchor;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Ground foliage
  // ---------------------------------------------------------------------------------------------

  _buildGroundDetail() {
    const foliage = this.env.foliage && typeof this.env.foliage === 'object' ? this.env.foliage : {};
    // tile-space zones from the level file: keep only well-formed rects
    const rects = (list) => (Array.isArray(list) ? list : []).filter((a) => a && ['minX', 'maxX', 'minZ', 'maxZ'].every((k) => Number.isFinite(a[k])));
    const flowerAreas = rects(foliage.flowerAreas)
      .map((a) => ({ ...a, palette: (Array.isArray(a.palette) ? a.palette : []).filter((f) => Number.isInteger(f) && f >= 0 && f <= 3) }))
      .filter((a) => a.palette.length);
    const shrubAreas = rects(foliage.shrubAreas).filter((a) => Number.isFinite(a.chance));
    const detail = buildGroundDetail({
      tileMap: this.tileMap,
      isFree: (x, z) => this._isFreeForFoliage(x, z),
      houses: this.houseFootprints,
      // ferns around the roots of the trees standing on the map
      trees: this.objectsOf('tree').filter((o) => this.inMap(o.x, o.z)).map((o) => ({ x: o.x, z: o.z, r: 0.3 })),
      // villagers stand on readable ground: no tall grass / flower beds / bushes around their spots
      clearings: this.objectsOf('npc').map((o) => ({ x: o.x, z: o.z, r: Math.min(8, Math.max(0, Number.isFinite(o.wander) ? o.wander : 1.2)) + 0.8 })),
      seed: Number.isFinite(foliage.seed) ? foliage.seed : 2024,
      flowerAreas,
      shrubAreas,
      maxInstances: this.batching?.foliageInstances ?? Infinity,
    });
    this.groundDetail = detail;
    this.root.add(detail.object);
    this.stats.foliage = detail.stats;
  }

  // ---------------------------------------------------------------------------------------------
  // Lights (≤ 12, all created now) and atmosphere
  // ---------------------------------------------------------------------------------------------

  /**
   * Point lights through a LightPool of MAX_POINT_LIGHTS: a level with ≤ 12 light descriptors
   * gets one permanent light each (by LIGHT_PRIORITY — campfire, torches / point lights,
   * lampposts, house door lanterns — ties broken by level object order); a bigger level shares
   * the 12 lights among the lanterns around the camera focus (World.update re-ranks them, with
   * crossfades).
   */
  _wireLights() {
    // sorted by priority, present-but-invalid numbers sanitised (a NaN intensity from a
    // hand-edited `light` object would poison every lit pixel — and the bloom); the editor's 3D
    // preview builds its list with the same function
    const descs = sanitizeLightDescriptors(this._lightDescs);
    this.lightPool = new LightPool(this.lighting, descs, { size: MAX_POINT_LIGHTS });
    this.lights = this.lightPool.handles;
    this.stats.lightDescriptors = this._lightDescs.length;
    this.stats.lightsPooled = this.lightPool.pooled;
  }

  _buildAtmosphere() {
    const P = this.particles;
    const env = this.env;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const W = this.level.width;
    const D = this.level.depth;
    // dust motes that follow the camera focus (moved every frame by the game)
    if (env.dust !== false) {
      this.emitters.dust = P.createEmitter({ preset: 'dust', bounds: { center: V(W / 2, 2.5, D / 2), size: V(20, 4.5, 16) }, count: 120 });
    }
    // particle areas: fireflies (the preset only shows them at night), leaves, petals, glints…
    // (hand-edited files: sizes / counts are sanitised so a typo can't allocate millions of
    // particles or poison the bounds with NaN)
    const num = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d));
    for (const obj of this.objectsOf('emitter')) {
      const size = Array.isArray(obj.size) ? obj.size : [];
      const y = this.groundAt(obj.x, obj.z) + num(obj.dy, 1.2, -5, 30);
      const params = obj.params && typeof obj.params === 'object' && !Array.isArray(obj.params) ? obj.params : {};
      let emitter;
      try {
        emitter = P.createEmitter({
          ...params,
          // (level data: an unknown preset name throws, caught below)
          preset: /** @type {keyof typeof PARTICLE_PRESETS} */ (obj.preset),
          bounds: { center: V(obj.x, y, obj.z), size: V(num(size[0], 8, 0.1, 200), num(size[1], 2.4, 0.1, 60), num(size[2], 8, 0.1, 200)) },
          count: Math.round(num(obj.count, 30, 1, 1000)),
        });
      } catch (err) {
        console.warn(`[Lumina] could not create particle area "${obj.id}" (${obj.preset}):`, err);
        continue;
      }
      this.areaEmitters.push({ id: obj.id, preset: obj.preset, emitter });
      if (obj.id !== 'dust') this.emitters[obj.id] = emitter;
    }

    // god rays over the playable area (or the level's own areas)
    if (env.godRays !== false) {
      const areas = Array.isArray(env.godRayAreas) && env.godRayAreas.length ? env.godRayAreas : [this._autoGodRayArea()];
      for (const a of areas) {
        if (!a || typeof a !== 'object') continue;
        const count = Math.min(12, Math.max(0, Math.round(a.count ?? 3)));
        if (!count || !(a.maxX > a.minX) || !(a.maxZ > a.minZ)) continue;
        const y = Number.isFinite(a.y) ? a.y : 0;
        this.godRays.populate({ minX: a.minX, maxX: a.maxX, minZ: a.minZ, maxZ: a.maxZ, y }, count, Number.isFinite(a.seed) ? a.seed : 7);
      }
    }
  }

  /** God-ray area for levels without `environment.godRayAreas`: over the walkable ground. */
  _autoGodRayArea() {
    const level = this.level;
    const r = computeCameraBounds(level, 1);
    // typical ground height of the walkable tiles
    const hist = new Map();
    this.tileMap.forEachTile((i, j, t) => {
      if (!t.walkable || t.water) return;
      const k = Math.round(t.h * 2);
      hist.set(k, (hist.get(k) ?? 0) + 1);
    });
    let y = 0;
    let best = -1;
    for (const [k, n] of hist) if (n > best) { best = n; y = k / 2; }
    const area = Math.max(1, (r.maxX - r.minX) * (r.maxZ - r.minZ));
    return { ...r, y, count: Math.max(1, Math.min(6, Math.round(area / 90))), seed: 7 };
  }

  // ---------------------------------------------------------------------------------------------

  _isFreeForFoliage(x, z) {
    // candidates from the TileMap's collider grid (a superset; tested exactly below)
    const cs = this.tileMap.queryColliders(x - 0.2, z - 0.2, x + 0.2, z + 0.2, (this._freeTmp ??= []));
    for (let k = 0; k < cs.length; k++) {
      const c = cs[k];
      if (c.type === 'circle') {
        const r = c.r + 0.1;
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < r * r) return false;
      } else if (x > c.minX - 0.15 && x < c.maxX + 0.15 && z > c.minZ - 0.15 && z < c.maxZ + 0.15) return false;
    }
    return true;
  }

  /**
   * Per-frame: animated props (windmill sails, waterfalls), water shore refresh and the point-light
   * pool (ranked around `view.focus`, limited to what `view.camera` sees).
   * @param {number} dt
   * @param {{ focus?: THREE.Vector3, camera?: THREE.Camera }} [view]
   */
  update(dt, view = {}) {
    for (let i = 0; i < this.updaters.length; i++) this.updaters[i](dt);
    this.water?.update(dt);
    if (!view.camera) view = { focus: view.focus ?? null, camera: this.engine.camera };
    this.lightPool?.update(dt, view);
    if (this.batching && view.focus) this._cullParticles(view.focus);
  }

  /** Big levels: switch off the particle areas / smoke far from the focus (BIG_LEVEL_BATCHING.particleCull). */
  _cullParticles(f) {
    if (!this._cullList) {
      const named = new Set([this.emitters.dust].filter(Boolean)); // (the dust follows the camera)
      this._cullList = [...this.areaEmitters.map((a) => a.emitter), ...this.propEmitters]
        .filter((e) => e && !named.has(e) && !e.followCamera)
        .map((e) => ({ e, x: e.position.x, z: e.position.z, hx: e.boxSize.x / 2, hz: e.boxSize.z / 2 }));
    }
    const R2 = this.batching.particleCull ** 2;
    for (const c of this._cullList) {
      const dx = Math.max(0, Math.abs(c.x - f.x) - c.hx);
      const dz = Math.max(0, Math.abs(c.z - f.z) - c.hz);
      const on = dx * dx + dz * dz < R2;
      if (c.e.enabled !== on) c.e.enabled = on;
    }
  }

  dispose() {
    this.lightPool?.dispose();
    this.terrainCasters?.dispose();
    this.groundDetail?.dispose();
    for (const e of this.propEmitters) e.dispose();
    // the dust + every particle area, once each (an area whose id is 'dust' is only in areaEmitters)
    const named = new Set([...Object.values(this.emitters), ...this.areaEmitters.map((a) => a.emitter)]);
    for (const e of named) e?.dispose?.();
    for (const t of this.treeGroups ?? []) t.dispose();
    this.merged?.dispose();
    for (const b of this.built) b.dispose();
    this.terrain?.dispose();
    this.builder?.dispose();
    this.outerGround?.geometry.dispose();
    this.root.removeFromParent();
  }
}
