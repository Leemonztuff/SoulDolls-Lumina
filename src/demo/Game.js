import * as THREE from 'three';
import {
  Engine, CameraRig, PostFX, LightingSystem, TextureLibrary, Particles, GodRays, SpriteManager,
  AudioSystem, UI, DEG2RAD, DEFAULT_KEYFRAMES, clamp, lerp, smoothstep,
} from '../engine/index.js';
import { computeCameraBounds } from '../engine/level/ObjectBuilder.js';
import { CHARACTER_PRESET_NAMES, levelHasCombat } from '../engine/level/ObjectCatalog.js';
import { renderLevelMap } from '../engine/level/LevelMap.js';
import { makeShadowOnly } from '../engine/world/ShadowCasters.js';
import { BlobBatch } from '../engine/sprite/BlobBatch.js';
import { World } from './World.js';
import { Player } from './Player.js';
import { Npc } from './Npc.js';
import { Critters } from './Critters.js';
import { Weather } from './Weather.js';
import { AudioDirector } from './AudioDirector.js';
import { ResolutionGovernor } from './ResolutionGovernor.js';
import { buildDebugControls } from './DebugControls.js';
import { conversationFor } from './dialogue.js';
import { installFogStart } from './AtmosphereFog.js';
import { SHIPPED_LEVELS } from './levels.js';
// (the CombatSystem is imported dynamically in init, on combat levels only: peaceful levels never
// download or parse the combat code; bindings.js is a tiny import-free table)
import { PHOTO_PAD_DEFLECT, PHOTO_PAD_QUIET } from './combat/bindings.js';
import {
  CAMERA, TIME_SPEED, SUN_PATH, MOON_PATH, KEYFRAME_OVERRIDES, SPRITE_FILL,
} from './config.js';

/**
 * @import { Level, LevelEnvironment, ObjectShapeOf } from '../engine/level/types.js'
 * @import { NpcDef } from './Npc.js'
 * @import { CombatSystem } from './combat/CombatSystem.js'
 * @import { CombatHooks } from './combat/types.js'
 */

const CONTROLS = [
  { keys: 'WASD', label: 'Move' },
  { keys: 'Shift', label: 'Run' },
  { keys: 'Space', label: 'Talk / Examine' },
  { keys: 'Q/E', label: 'Rotate camera' },
  { keys: 'Z/X', label: 'Zoom (or wheel)' },
  { keys: 'N/Tab', label: 'World map' },
  { keys: 'T', label: 'Time of day' },
  { keys: 'R', label: 'Weather' },
  { keys: 'P', label: 'Photo mode' },
  { keys: 'M', label: 'Music' },
  { keys: '`', label: 'Debug panel' },
];

const INTERACT_RANGE = 1.6;
/** An interactable's `lookSpan` (a door's leaf) counts when the player faces it within 60°. */
const SPAN_FACING = 0.5;
const _spanPt = { x: 0, z: 0 };
/** Nearest point of a `lookSpan` segment `{ a, b }` to (x, z), horizontally; writes into `out`. */
function nearestOnSpan(span, x, z, out = _spanPt) {
  const ax = span.a.x;
  const az = span.a.z;
  const ex = span.b.x - ax;
  const ez = span.b.z - az;
  const len2 = ex * ex + ez * ez;
  const u = len2 > 1e-12 ? Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / len2)) : 0;
  out.x = ax + ex * u;
  out.z = az + ez * u;
  return out;
}
/**
 * Big levels: villagers and critters farther than this from the camera focus update every
 * FAR_EVERY-th frame with the accumulated time (same behaviour, a quarter of the CPU). The
 * distance grows with the zoom (1.15 × the camera distance + 4), so zoomed right out the actors in
 * the top corners of the view still move every frame.
 */
const FAR_ACTOR_DISTANCE = 42;
const FAR_EVERY = 4;
/** Seconds after a conversation closes during which confirm doesn't start a new one. */
const TALK_COOLDOWN = 0.8;
/** Real frames drawn behind the loading screen with every effect on (see start()). */
const WARM_FRAMES = 5;

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const finite = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
const isRect = (r) => !!r && ['minX', 'maxX', 'minZ', 'maxZ'].every((k) => Number.isFinite(r[k]));
const isPoint = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/**
 * Automatic focus-bound margins (world units inside the walkable tile extent) for levels without
 * `environment.camera.bounds` — Emberfall's hand-tuned values: the camera looks north, so the
 * north edge needs almost none; east / west and south need more the further the camera is out.
 */
const AUTO_BOUNDS_MARGINS = {
  near: { x: 1.8, north: 0.5, south: 0.8 },
  mid: { x: 3.5, north: 0.5, south: 2 },
  far: { x: 4.5, north: 1, south: 3 },
};

/**
 * Level npc object → Npc definition (object-relative offsets resolved to world positions).
 * @param {ObjectShapeOf<'npc'>} obj (the npc's own fields only)
 * @returns {NpcDef}
 */
function npcDef(obj) {
  const x = obj.x;
  const z = obj.z;
  // `talkOffset` [dx, dz] and `area` {minX…} are relative to the NPC, so they move with it in the
  // editor; `talkPoint` / `bounds` (absolute world coordinates) are still honoured
  let talkPoint;
  if (isPoint(obj.talkOffset)) talkPoint = [x + obj.talkOffset[0], z + obj.talkOffset[1]];
  else if (isPoint(obj.talkPoint)) talkPoint = [obj.talkPoint[0], obj.talkPoint[1]];
  let bounds;
  if (isRect(obj.area)) bounds = { minX: x + obj.area.minX, maxX: x + obj.area.maxX, minZ: z + obj.area.minZ, maxZ: z + obj.area.maxZ };
  else if (isRect(obj.bounds)) bounds = { ...obj.bounds };
  return {
    id: obj.id,
    name: obj.name || 'Villager',
    preset: CHARACTER_PRESET_NAMES.includes(obj.preset) ? obj.preset : 'villager',
    home: [x, z],
    wander: Math.max(0, finite(obj.wander, 1.2)),
    speed: Math.max(0.1, finite(obj.speed, 1.3)),
    facing: ['down', 'up', 'left', 'right'].includes(obj.facing) ? obj.facing : 'down',
    behaviour: obj.behaviour,
    talkRadius: obj.talkRadius != null ? Math.max(0.5, finite(obj.talkRadius, 1.6)) : undefined,
    talkPoint,
    bounds,
    portraitColor: obj.portraitColor || '#c9a45c',
  };
}

/**
 * Game — plays a Lumina level (Emberfall, or any level made in the editor): wires every engine
 * module together (engine loop, lighting, post, camera rig, UI, audio, world, characters), runs
 * the title → gameplay flow, input shortcuts, interactions and dialogues, and exposes
 * `window.__game` for automated checks.
 *
 * Everything level-specific comes from the level object (docs/contracts/LEVEL_EDITOR.md §5): terrain and
 * props (World), villagers (`npc` objects: `script` = a conversation in dialogue.js, otherwise
 * plain `dialogue` + `action`), critters, particle areas, regions (HUD plate / arrival banners),
 * spawn, camera tuning (`environment.camera`, `highGround`, `titleCamera`), titles (`name`,
 * `subtitle`, `environment.title`), time, clock, weather and music.
 *
 * Combat (docs/contracts/COMBAT.md): a level with `enemy` objects (or `environment.combat: true`)
 * gets a `CombatSystem` (`this.combat`); every other level plays exactly as before
 * (`this.combat === null`: no combat module, sheet, binding, DOM or program is created).
 */
export class Game {
  /**
   * @param {{ container: HTMLElement, level: Level,
   *   autostart?: boolean, source?: string }} opts
   *   level: a normalised level (LevelFormat.normalizeLevel / LevelStorage loaders)
   */
  constructor({ container, level, autostart = false, source = '' }) {
    if (!level || !Array.isArray(level.tiles)) throw new Error('Game: a level is required');
    this.container = container;
    this.level = level;
    this.source = source;
    /** @type {Partial<LevelEnvironment>} ({} without one) */
    this.env = level.environment ?? {};
    this.autostart = autostart;
    /** Camera framing for this level (CAMERA defaults + environment.camera). */
    const cam = this.env.camera ?? {};
    const distance = clamp(finite(cam.distance, CAMERA.distance), 8, 80);
    this.camera = Object.freeze({
      ...CAMERA,
      distance,
      pitch: clamp(finite(cam.pitch, CAMERA.pitch), 10, 80),
      minDistance: Math.min(CAMERA.minDistance, distance),
      maxDistance: Math.max(CAMERA.maxDistance, distance),
    });
    this.cameraBounds = this._resolveCameraBounds(cam.bounds);
    const hg = this.env.highGround;
    this.highGround = hg && Number.isFinite(finite(hg.minY, NaN)) ? { minY: finite(hg.minY, 0), pitch: clamp(finite(hg.pitch, this.camera.pitch), 10, 80) } : null;
    this.regions = level.objects.filter((o) => o.type === 'region');
    this._bannersShown = new Set();
    /** 'loading' | 'title' | 'play' */
    this.mode = 'loading';
    this.photoMode = false;
    /** World map overlay open (gameplay input paused). */
    this.mapOpen = false;
    this.busy = false; // talking / fading: player frozen
    /** @type {Record<string, number>} count by item name (no prototype: shop items are level data) */
    this.inventory = Object.assign(Object.create(null), { apples: 0 });
    this.visits = new Map();
    this.region = '';
    this._regionTimer = 0;
    this._burstTimer = 0;
    this._sparkleTimer = 0;
    this._talkCooldown = 0;
    this._cine = { t: 0, target: new THREE.Vector3(), ...this._titleCamera() };
    this._cine.target.set(this._cine.x, this._cine.y, this._cine.z + Math.sin(1) * this._cine.driftZ);
    this._tmp = new THREE.Vector3();
    this._focusPos = new THREE.Vector3();
    this._target = { kind: '', npc: null, it: null };
    this._timeouts = new Set();
    this._photoTimer = 0;
    this._removeAudioUnlock = null;
    this._disposed = false;
    this._warmFrames = 0;
    /** Combat level (COMBAT.md §3): evaluated once; `combat` is created in init. */
    this.combatEnabled = levelHasCombat(level);
    /** @type {CombatSystem|null} */
    this.combat = null;
    /** Seconds since the move vector was last deflected > 0.35 (the pad photo guard, combat levels). */
    this._padQuiet = 0;
    /**
     * Resolves once the first frames (with every effect on) have been drawn behind the loader.
     * @type {Promise<void>}
     */
    this.warmedUp = new Promise((resolve) => { this._resolveWarm = resolve; });
  }

  /**
   * near / mid / far focus bounds: environment.camera.bounds (one rect or three), else automatic —
   * the walkable area shrunk by AUTO_BOUNDS_MARGINS (the same framing Emberfall was tuned to).
   */
  _resolveCameraBounds(b) {
    // (hand-written rects: accept swapped min / max)
    const rect = (r) => ({ minX: Math.min(r.minX, r.maxX), maxX: Math.max(r.minX, r.maxX), minZ: Math.min(r.minZ, r.maxZ), maxZ: Math.max(r.minZ, r.maxZ) });
    if (b && isRect(b.near) && isRect(b.mid) && isRect(b.far)) return { near: rect(b.near), mid: rect(b.mid), far: rect(b.far) };
    if (isRect(b) || isRect(b?.mid)) {
      const c = rect(isRect(b) ? b : b.mid);
      return { near: { ...c }, mid: { ...c }, far: { ...c } };
    }
    const walk = computeCameraBounds(this.level, 0);
    const shrink = (lo, hi, a, b2) => (hi - lo >= a + b2 ? [lo + a, hi - b2] : Array(2).fill(lo + (hi - lo) * (a / Math.max(1e-6, a + b2))));
    const out = {};
    for (const [k, m] of Object.entries(AUTO_BOUNDS_MARGINS)) {
      const [minX, maxX] = shrink(walk.minX, walk.maxX, m.x, m.x);
      const [minZ, maxZ] = shrink(walk.minZ, walk.maxZ, m.north, m.south);
      out[k] = { minX, maxX, minZ, maxZ };
    }
    return out;
  }

  /** Title-screen drift: environment.titleCamera, else around the middle of the playable area. */
  _titleCamera() {
    const t = this.env.titleCamera ?? {};
    const mid = this.cameraBounds.mid;
    const cx = (mid.minX + mid.maxX) / 2;
    const cz = (mid.minZ + mid.maxZ) / 2;
    const size = Math.max(this.level.width, this.level.depth);
    return {
      x: finite(t.x, cx),
      z: finite(t.z, cz),
      y: finite(t.y, this._typicalGround() + 0.5),
      driftX: finite(t.driftX, Math.min(7, (mid.maxX - mid.minX) * 0.25)),
      driftZ: finite(t.driftZ, Math.min(5, (mid.maxZ - mid.minZ) * 0.25)),
      distance: clamp(finite(t.distance, Math.min(35, Math.max(22, size * 0.8))), 8, 80),
    };
  }

  /** Most common height of the walkable tiles (world units). */
  _typicalGround() {
    const L = this.level;
    const hist = new Map();
    L.tiles.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const d = L.legend[row[i]];
        if (!d || d.void || d.water || d.walkable === false) continue;
        const h = L.heights[j][i];
        hist.set(h, (hist.get(h) ?? 0) + 1);
      }
    });
    let best = -1;
    let ch = '0';
    for (const [h, n] of hist) if (n > best) { best = n; ch = h; }
    const c = ch.charCodeAt(0);
    return (c >= 97 ? c - 87 : c - 48) * 0.5;
  }

  /**
   * Build everything (async; reports progress for the loading indicator).
   * @param {(fraction:number, label:string) => void} [onProgress]
   */
  async init(onProgress = () => {}) {
    const t0 = performance.now();
    /** Loading milliseconds by phase (wall clock, the loading screen's frames included). */
    this.loadStats = {};
    installFogStart(this.camera.distance - 7);
    const engine = new Engine({ container: this.container, maxPixelRatio: 1.25 });
    this.engine = engine;
    const { scene, camera, renderer } = engine;

    this.textures = new TextureLibrary({ seed: 1337, anisotropy: 4 });
    const keyframes = DEFAULT_KEYFRAMES.map((k) => ({ ...k, ...(KEYFRAME_OVERRIDES[k.name] ?? {}) }));
    const timeOfDay = ((finite(this.env.timeOfDay, 17.2) % 24) + 24) % 24;
    this.lighting = new LightingSystem(engine, { timeOfDay, shadowExtent: 26, sunPath: SUN_PATH, moonPath: MOON_PATH, keyframes });
    this.lighting.sky.lowerClouds = 0.25;
    // the clock runs while playing (paused on the loading / title screens); levels may stop it
    this.lighting.timeSpeed = this.env.clock === false ? 0 : TIME_SPEED;
    this.lighting.paused = true;
    this.particles = new Particles(scene);
    this.godRays = new GodRays({ gain: 0.2 });
    scene.add(this.godRays.object);
    this.spriteManager = new SpriteManager(camera);

    this.rig = new CameraRig(camera, { ...this.camera, yaw: 0, lookAhead: 1.3 });
    this.rig.bounds = { ...this.cameraBounds.mid };

    // 64 taps is plenty for this blur radius (96 costs ~0.35 ms more at 1080p for no visible gain);
    // 2× MSAA on big drawing buffers (4× costs ~0.9 ms at 1080p), 4× below.
    const dpr = Math.min(window.devicePixelRatio || 1, engine.maxPixelRatio);
    const bufferPixels = window.innerWidth * window.innerHeight * dpr * dpr;
    this.postfx = new PostFX(renderer, scene, camera, { maxTaps: 64, samples: bufferPixels > 1.8e6 ? 2 : 4 });
    this._tunePost(this.postfx.settings);
    engine.events.on('resize', ({ width, height, pixelRatio }) => this.postfx.setSize(width, height, pixelRatio));
    this.resolution = new ResolutionGovernor({ engine, postfx: this.postfx });

    this.ui = new UI(document.body);
    this.audio = new AudioSystem({ volume: 0.6 });

    // ---- world ----
    this.world = new World({ engine, textures: this.textures, lighting: this.lighting, particles: this.particles, godRays: this.godRays, level: this.level });
    const tw = performance.now();
    this.loadStats.engine = Math.round(tw - t0);
    await this.world.build((f, label) => onProgress(f * 0.9, label));
    this.tileMap = this.world.tileMap;
    // big level: the shadow pass only draws casters that can shade what the camera sees
    const B = this.world.batching;
    if (B) this.lighting.setShadowDepthRange(B.shadowUp, B.shadowDown);
    this.loadStats.world = Math.round(performance.now() - tw);
    // the world's shader programs start compiling now (in parallel, KHR_parallel_shader_compile)
    // while the villagers, weather and UI are set up; the compile below only adds theirs
    const earlyCompile = this._compileScene();

    // ---- characters ----
    onProgress(0.92, 'Waking the villagers');
    await wait(0);
    this.player = new Player({ tileMap: this.tileMap, rig: this.rig, particles: this.particles, audio: this.audio, spawn: this.level.spawn, combat: this.combatEnabled });
    scene.add(this.player.sprite);
    this.spriteManager.add(this.player.sprite);
    this.lighting.followTarget(this.player.sprite);
    this._ensureStandingSpawn();

    const sheetCache = new Map();
    this.npcs = [];
    for (const obj of this.level.objects) {
      if (obj.type !== 'npc') continue;
      try {
        const npc = new Npc({ def: npcDef(obj), tileMap: this.tileMap, sheetCache });
        npc.talk = conversationFor(obj);
        scene.add(npc.sprite);
        this.spriteManager.add(npc.sprite);
        this.npcs.push(npc);
      } catch (err) {
        console.warn(`[Lumina] could not create NPC "${obj.id}":`, err);
      }
    }
    this.npcById = new Map(this.npcs.map((n) => [n.id, n]));
    this.critters = new Critters({
      tileMap: this.tileMap, scene, spriteManager: this.spriteManager,
      groups: this.level.objects.filter((o) => o.type === 'critters'),
    });
    // chickens scatter from the player and from villagers who chase them
    this._threats = [this.player.position, ...this.npcs.filter((n) => n.behaviour === 'chase').map((n) => n.position)];
    this._npcCtx = { player: this.player.position, chickens: this.critters.chickens };
    this._critterCtx = { player: this.player.position, threats: this._threats };
    // far actors are throttled on big levels only (a small level keeps its exact behaviour)
    this._throttle = this.world.batching ? { far2: FAR_ACTOR_DISTANCE ** 2, every: FAR_EVERY, frame: 0, npcDt: new Float32Array(this.npcs.length) } : null;
    if (this._throttle) this.critters.throttle = { focus: this.rig.focusPoint, far2: FAR_ACTOR_DISTANCE ** 2, every: FAR_EVERY };
    // combat level: enemies, the player kit, FX batches, combat UI and bindings (COMBAT.md §4.5)
    if (this.combatEnabled) {
      onProgress(0.94, 'Sharpening blades');
      await wait(0);
      const { CombatSystem } = await import('./combat/CombatSystem.js');
      this.combat = new CombatSystem({ game: this });
      await this.combat.load();
    }
    // warm fill on every character / critter sprite (fades down at night)
    // big level (and every combat level): every blob contact shadow in one instanced draw call (a
    // busy view holds dozens)
    const batchActors = this.world.batching || !!this.combat;
    this.blobs = batchActors ? new BlobBatch() : null;
    const actors = [this.player.sprite, ...this.npcs.map((n) => n.sprite), ...this.critters.all.map((c) => c.sprite)];
    if (this.combat) actors.push(...this.combat.actorSprites);
    for (const s of actors) {
      this.lighting.registerEmissive(s.material, SPRITE_FILL);
      // big / combat level: the sun-facing shadow quad (it draws nothing in the colour pass) only
      // takes a draw call in the shadow pass
      if (batchActors && s.shadowProxy) makeShadowOnly(s.shadowProxy, [this.lighting.sun]);
      this.blobs?.adopt(s);
    }
    if (this.blobs?.mesh) engine.scene.add(this.blobs.mesh);

    this.weather = new Weather({ lighting: this.lighting, particles: this.particles, postfx: this.postfx, godRays: this.godRays, world: this.world });
    this.audioDirector = new AudioDirector({
      audio: this.audio, lighting: this.lighting, weather: this.weather, tileMap: this.tileMap,
      fires: this.world.fires, falls: this.world.falls.filter((f) => f.splash).map((f) => f.anchor),
    });

    // ---- UI ----
    const ui = this.ui;
    ui.hud.setControls(CONTROLS);
    // combat: the combat legend (keyboard or pad), vitals and skill slots
    this.combat?.setupUI();
    ui.hud.setLocation(this.level.name, this.level.subtitle);
    ui.hud.showHelp(false);
    ui.prompt.keyHint = 'Space';
    ui.dialog.speed = 55;
    ui.dialog.onSound = (name) => this.audio.playSfx(name, { volume: 0.7 });
    let blip = 0;
    ui.dialog.onChar = (ch) => {
      if (ch === ' ' || (blip++ & 1)) return;
      this.audio.playSfx('blip', { volume: 0.22, pitch: 0.94 + Math.random() * 0.12 });
    };
    buildDebugControls(this);
    this._setupMaps();

    // ---- frame wiring ----
    // lighting: update = clock/palette (before gameplay), lateUpdate = shadow frustum (after the rig)
    engine.addSystem(this.lighting, -10);
    engine.addSystem({ name: 'game', update: (dt, t) => this.update(dt, t) }, 0);
    engine.addSystem(this.audio, 20);
    engine.events.on('lateUpdate', (dt) => this.ui.update(dt, { camera, input: engine.input }));
    engine.setRenderFn((dt) => {
      // DOF follows the player (not the bounds-clamped camera focus point) while playing
      this.postfx.setFocus(this.mode === 'play' ? this._playerFocusDistance() : this.rig.focusDistance);
      this.postfx.render(dt);
    });
    engine.events.on('afterRender', (dt) => this.ui.debug.stats.update(renderer, dt));

    // ---- warm-up: compile every program now (lights are final), incl. the weather emitters ----
    // Programs are keyed by the render target they draw into: the scene renders into PostFX's
    // linear HDR target, so compile against that target (compiling for the canvas would build
    // unused sRGB variants and leave the real ones to stall the first frame / first rain).
    const tc = performance.now();
    this.loadStats.characters = Math.round(tc - tw - this.loadStats.world);
    onProgress(0.96, 'Warming up the lanterns');
    await wait(0);
    this.rig.setTarget(this.player.sprite);
    this.rig.snap();
    this.weather.rain.intensity = 1;
    this.weather.snow.intensity = 1;
    this.particles.update(1 / 60, camera);
    // the one-shot bursts (waterfall spray and glints, running dust) create their pools on first
    // use: one particle each, far below the world, so their programs compile now and not on the
    // first approach to a waterfall (a 100–300 ms hitch on a big level whose spawn is far from one)
    const far = this._tmp.set(0, -1000, 0);
    if (this.world.falls.some((f) => f.splash)) {
      this.particles.burst('splash', far, 1);
      this.particles.burst('sparkle', far, 1, { size: [0.2, 0.34] });
    }
    this.particles.burst('footstep', far, 1);
    // combat: textures, one FX quad / marker far below, every combat burst (COMBAT.md §19)
    this.combat?.warmup(far);
    await earlyCompile;
    await this._compileScene();
    this.postfx.warmup();
    this.weather.rain.intensity = 0;
    this.weather.snow.intensity = 0;
    // the level's starting weather (after the warm-up, which forced both precipitations on)
    if (this.env.weather && this.env.weather !== 'clear') this.weather.setWeather(this.env.weather, { instant: true });
    this._exposeGlobal();
    this.loadStats.compile = Math.round(performance.now() - tc);
    onProgress(1, 'Ready');
  }

  /** compileAsync every program of the scene for PostFX's HDR scene target (see init). */
  _compileScene() {
    const renderer = this.engine.renderer;
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.postfx.sceneTarget);
    const compiled = renderer.compileAsync(this.engine.scene, this.engine.camera);
    renderer.setRenderTarget(prevTarget);
    return compiled;
  }

  /**
   * The painted level map (LevelMap) for the HUD minimap (unless `environment.minimap` is false)
   * and the world map overlay (N / Tab), with the level's regions and points of interest.
   */
  _setupMaps() {
    const t0 = performance.now();
    const map = renderLevelMap(this.level);
    this.levelMap = map;
    const ui = this.ui;
    ui.minimap.setMap(map, { view: 34 });
    ui.minimap.enabled = this.env.minimap !== false;
    const mapOpts = { title: this.level.name, subtitle: this.level.subtitle, regions: this.regions };
    // combat levels: the extra legend rows (enemy, waystone, chest)
    if (this.combat) mapOpts.combat = true;
    ui.worldMap.setMap(map, mapOpts);
    const W = this.world;
    this._map = {
      player: this.player.position,
      facing: this.player.facing,
      view: { x: 0, z: -1 },
      npcs: this.npcs.map((n) => n.position),
      markers: [
        ...W.interactables.map((it) => ({ x: it.position.x, z: it.position.z, kind: it.kind })),
        ...W.fires.map((f) => ({ x: f.x, z: f.z, kind: 'fire' })),
      ],
    };
    // combat: enemy dots, chest markers once discovered, the boss marker
    if (this.combat) this.combat.attachMaps(this._map);
    this.loadStats.map = Math.round(performance.now() - t0);
  }

  /** Open / close the world map (only while playing, not during a conversation or photo mode). */
  toggleMap(open = !this.mapOpen) {
    const ui = this.ui;
    if (open && (this.mode !== 'play' || this.busy || ui.dialog.isOpen || this.photoMode || !this.levelMap || this.combat?.locksPlayer)) return this.mapOpen;
    if (open === this.mapOpen) return this.mapOpen;
    this.mapOpen = open;
    if (open) {
      this.combat?.onMapOpen();
      ui.worldMap.setRegion(this.region);
      ui.worldMap.open();
      ui.prompt.hide();
      this.audio.playSfx('open', { volume: 0.45 });
    } else {
      ui.worldMap.close();
      this.audio.playSfx('close', { volume: 0.4 });
    }
    return this.mapOpen;
  }

  /** Per frame: the minimap follows the player; the world map redraws while open. */
  _updateMaps(dt) {
    const m = this._map;
    if (!m) return;
    const e = this.engine.camera.matrixWorld.elements;
    const vx = -e[8];
    const vz = -e[10];
    const len = Math.hypot(vx, vz) || 1;
    m.view.x = vx / len;
    m.view.z = vz / len;
    if (this.mode === 'play' && !this.photoMode) this.ui.minimap.update(m);
    if (this.mapOpen) this.ui.worldMap.update(dt, m);
  }

  /** HD-2D post look tuned for this scene (DOF band around the player, warm grade, teal shadows). */
  _tunePost(S) {
    Object.assign(S.dof, { focusRange: 6, maxBlur: 13, nearScale: 1.5, farScale: 1.15, tiltShift: 0.42, tiltCenter: 0.5, tiltWidth: 0.3, bokehBoost: 1.6 });
    // threshold above 1: sunlit sprites / white hair / spray stop blooming; lantern glass still does
    Object.assign(S.bloom, { strength: 0.5, radius: 0.58, threshold: 1.05 });
    // lifted, slightly teal shadows (ARCHITECTURE §1.5), saturation compensating the lower contrast
    Object.assign(S.grade, { exposure: 1.03, contrast: 1.04, saturation: 1.3, temperature: 0.04, vignette: 0.55, grain: 0.03, shadowsTint: [-0.04, 0.05, 0.15] });
  }

  // ---------------------------------------------------------------------------------------------
  // Flow
  // ---------------------------------------------------------------------------------------------

  start() {
    // Draw a few real frames with the rain & snow emitters on while the loading screen is still
    // up: ANGLE finishes some programs only at their first real draw (and the shadow-depth
    // variants are only built by the shadow pass), so those stalls happen here, not in play.
    this._warmFrames = WARM_FRAMES;
    this.engine.start();
    if (this.autostart) this.enterGameplay({ instant: true });
    else this.showTitle();
  }

  async showTitle() {
    this.mode = 'title';
    // the title camera drifts over the level: no x-ray figure of the player on a roof
    this.player.setSilhouetteEnabled(false);
    this.lighting.paused = true;
    const rig = this.rig;
    rig.setTarget(this._cine.target);
    rig.distanceTarget = this._cine.distance;
    rig.snap();
    this.ui.title.onDismiss = () => this.audio.unlock();
    const t = this.env.title ?? {};
    const opts = {
      title: t.title || this.level.name.toUpperCase(),
      subtitle: t.subtitle ?? (this.level.subtitle || 'A Lumina HD-2D Level'),
      prompt: t.prompt || 'Press any key',
      credit: t.credit ?? 'Lumina HD-2D Engine · three.js',
    };
    // a shipped level offers the other shipped levels as destinations (COMBAT.md §13.4)
    const slug = this._shippedSlug();
    if (slug) {
      opts.destinations = SHIPPED_LEVELS;
      opts.current = slug;
    }
    await this.ui.title.show(opts);
    if (this._disposed) return;
    const dest = slug ? this.ui.title.destination : undefined;
    if (dest && dest !== slug && SHIPPED_LEVELS.some((l) => l.value === dest)) {
      const params = new URLSearchParams(window.location.search);
      params.delete('autostart');
      params.set('level', dest);
      window.location.search = params.toString();
      return;
    }
    this.enterGameplay({ instant: false });
  }

  /** The SHIPPED_LEVELS slug of this level when it was loaded from `levels/<slug>.json`, else null. */
  _shippedSlug() {
    const m = /^levels\/([^/]+)\.json$/.exec(this.source || '');
    return m && SHIPPED_LEVELS.some((l) => l.value === m[1]) ? m[1] : null;
  }

  enterGameplay({ instant = false } = {}) {
    this.mode = 'play';
    this.player.setSilhouetteEnabled(true);
    this.lighting.paused = false;
    const rig = this.rig;
    rig.setTarget(this.player.sprite);
    rig.setAngles(0, this.camera.pitch);
    rig.distanceTarget = this.camera.distance;
    if (instant) {
      this._updateCameraBounds();
      rig.snap();
      this.postfx.setFocus(this._playerFocusDistance(), true);
      // ?autostart skips the title (whose key press unlocks WebAudio): unlock on the first gesture
      this._armAudioUnlock();
    }
    this.audioDirector.enabled = true;
    this.audioDirector.update(1, this.player.position);
    if (!instant && this.env.music !== false) this.audio.startMusic();
    this._later(instant ? 0.2 : 0.9, () => {
      this.ui.banner.show(this.level.name, this.level.subtitle, { duration: 3.2 });
      this.ui.hud.showHelp(true);
    });
    this._bannersShown.clear();
  }

  /** setTimeout that dispose() cancels. */
  _later(seconds, fn) {
    const id = setTimeout(() => {
      this._timeouts.delete(id);
      if (!this._disposed) fn();
    }, seconds * 1000);
    this._timeouts.add(id);
    return id;
  }

  _armAudioUnlock() {
    if (this._removeAudioUnlock || this.audio.ready) return;
    const unlock = (e) => {
      this._removeAudioUnlock?.();
      this.audio.unlock();
      // the level's music starts like after the title screen (?autostart: editor play-tests) —
      // unless that first key is the music key itself, which toggles it on in the same frame
      const musicKey = e?.type === 'keydown' && (this.engine?.input?.bindings?.music ?? ['KeyM']).includes(e.code);
      if (this.mode === 'play' && this.env.music !== false && !this.audio.musicPlaying && !musicKey) this.audio.startMusic();
    };
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('pointerdown', unlock, true);
    this._removeAudioUnlock = () => {
      window.removeEventListener('keydown', unlock, true);
      window.removeEventListener('pointerdown', unlock, true);
      this._removeAudioUnlock = null;
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Actions (keys, __game API)
  // ---------------------------------------------------------------------------------------------

  cycleTime() {
    const p = this.weather.cycleTime();
    this.ui.hud.toast(p.name, 1.6);
    return p.h;
  }

  /** Set the hour (non-numbers are ignored). Returns the current time of day. */
  setTime(h) {
    this.weather.setTime(h);
    return this.lighting.timeOfDay;
  }

  setWeather(name) {
    return this.weather.setWeather(name);
  }

  cycleWeather() {
    const w = this.weather.cycleWeather();
    const label = { clear: 'Clear skies', rain: 'Rain', snow: 'Snowfall' }[w];
    this.ui.hud.toast(label, 1.6);
    return w;
  }

  setMusic(on) {
    // combat levels restart the track combat wants (battle / boss while fighting)
    if (on) this.audio.startMusic(this.combat ? { track: this.combat.musicTrack } : undefined);
    else this.audio.stopMusic();
    return this.audio.musicPlaying;
  }

  /**
   * Photo mode hides the UI (not while a conversation is running: the dialog would be hidden but
   * still waiting for input). From the keyboard a short hint shows first; `instant` (automation)
   * hides the UI right away.
   */
  togglePhotoMode({ instant = false } = {}) {
    if (!this.photoMode && (this.busy || this.ui.dialog.isOpen || this.mode !== 'play' || this.mapOpen)) return this.photoMode;
    // combat levels: no photo mode in a fight (COMBAT.md §6.12)
    if (!this.photoMode && (this.combat?.engaged || this.combat?.locksPlayer)) {
      this.ui.hud.toast('Not while foes are near', 1.6);
      return this.photoMode;
    }
    this.photoMode = !this.photoMode;
    clearTimeout(this._photoTimer);
    this._timeouts.delete(this._photoTimer);
    if (this.photoMode) {
      this.ui.prompt.hide();
      if (instant) this.ui.setVisible(false);
      else {
        this.ui.hud.toast('Photo mode · P or Esc to return', 1.6);
        this._photoTimer = this._later(1.2, () => { if (this.photoMode) this.ui.setVisible(false); });
      }
    } else this.ui.setVisible(true);
    return this.photoMode;
  }

  /**
   * Move the player to (x, z). A spot the player can't stand on (water, inside a house, off the
   * map) snaps to the nearest standable point within 3 u; returns null (and doesn't move) if none.
   */
  teleport(x, z) {
    const spot = this._standable(Number(x), Number(z));
    if (!spot) return null;
    this.player.teleport(spot.x, spot.z);
    // combat: the lock releases and the camera focus vectors jump with the player
    this.combat?.onTeleport();
    this._updateCameraBounds();
    this.rig.snap();
    // pooled point lights jump to the new surroundings (no fade from the old spot)
    this.world.lightPool?.snap();
    this.postfx.setFocus(this.mode === 'play' ? this._playerFocusDistance() : this.rig.focusDistance, true);
    return { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z };
  }

  /**
   * A spawn that isn't standable (water, a wall, off the map — e.g. a level edited carelessly)
   * moves to the nearest standable spot, so a sparse or broken level still starts.
   */
  _ensureStandingSpawn() {
    const p = this.player.position;
    let spot = this._standable(p.x, p.z);
    if (!spot) {
      let best = Infinity;
      this.tileMap.forEachTile((i, j, t) => {
        if (!t.walkable) return;
        const d = (i + 0.5 - p.x) ** 2 + (j + 0.5 - p.z) ** 2;
        if (d >= best) return;
        const s = this._standable(i + 0.5, j + 0.5);
        if (s) { best = d; spot = s; }
      });
    }
    if (spot && (spot.x !== p.x || spot.z !== p.z)) {
      console.warn(`[Lumina] spawn (${p.x}, ${p.z}) is not standable; moved to (${spot.x.toFixed(2)}, ${spot.z.toFixed(2)})`);
      this.player.teleport(spot.x, spot.z);
    }
  }

  _standable(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const tm = this.tileMap;
    const r = this.player.radius;
    const ok = (px, pz) => tm.isWalkable(px, pz) && tm.isWalkable(px + r, pz) && tm.isWalkable(px - r, pz)
      && tm.isWalkable(px, pz + r) && tm.isWalkable(px, pz - r);
    if (ok(x, z)) return { x, z };
    for (let d = 0.25; d <= 3.001; d += 0.25) {
      const n = Math.max(8, Math.round(d * 12));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * d;
        const pz = z + Math.sin(a) * d;
        if (ok(px, pz)) return { x: px, z: pz };
      }
    }
    return null;
  }

  async restUntilMorning() {
    const wasBusy = this.busy;
    this.busy = true;
    try {
      await this.ui.fader.fadeOut(1.0);
      this.weather.setTime(8.0);
      this.audio.playSfx('chime', { volume: 0.6 });
      await wait(0.7);
      await this.ui.fader.fadeIn(1.1);
      this.ui.hud.toast('You feel well rested.', 2.2);
    } finally {
      this.busy = wasBusy;
    }
  }

  /**
   * Walk-free talk (for scripts): place the player beside the NPC and start the dialogue.
   * Returns false for an unknown id, or while another conversation / fade / photo mode is active.
   */
  talkTo(id) {
    const npc = this.npcById.get(id);
    if (!npc || this.busy || this.ui.dialog.isOpen || this.mode !== 'play' || this.photoMode) return false;
    this.toggleMap(false);
    const ip = npc.interactPoint;
    // side-by-side first (both faces stay visible to the camera), then in front, then behind
    const cands = [[-1.15, 0], [1.15, 0], [-0.85, 0.85], [0.85, 0.85], [0, 1.15], [0, -1.15]];
    const tm = this.tileMap;
    const clear = (x, z) => tm.isWalkable(x, z) && [[0.32, 0], [-0.32, 0], [0, 0.32], [0, -0.32]].every(([ox, oz]) => tm.isWalkable(x + ox, z + oz))
      && Math.abs(tm.getHeight(x, z) - tm.getHeight(ip.x, ip.z)) < 0.3;
    let spot = null;
    for (const [dx, dz] of cands) {
      const x = ip.x + dx;
      const z = ip.z + dz;
      if (clear(x, z)) { spot = [x, z]; break; }
    }
    if (spot) this.teleport(spot[0], spot[1]);
    this.player.faceTowards(npc.position.x, npc.position.z);
    this._interact({ kind: 'npc', npc, it: null });
    return true;
  }

  // ---------------------------------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------------------------------

  /**
   * Best interactable in front of the player, or null. Returns a reused object
   * `{ kind: 'npc'|'object', npc, it }` (copy the fields to keep them).
   */
  _findInteractable() {
    const p = this.player.position;
    const f = this.player.facing;
    let bestScore = Infinity;
    let bestNpc = null;
    let bestIt = null;
    const npcs = this.npcs;
    const items = this.world.interactables;
    const n = npcs.length;
    for (let k = 0; k < n + items.length; k++) {
      const isNpc = k < n;
      const ref = isNpc ? npcs[k] : items[k - n];
      // an opened chest (combat levels) offers nothing
      if (!isNpc && ref.disabled) continue;
      const pos = isNpc ? ref.interactPoint : ref.position;
      const radius = isNpc ? (ref.talkRadius ?? INTERACT_RANGE) : (ref.radius ?? INTERACT_RANGE);
      const dx = pos.x - p.x;
      const dz = pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > radius || Math.abs(pos.y - p.y) > 1.3) continue;
      const dot = d > 1e-3 ? (dx * f.x + dz * f.z) / d : 1;
      // must be (roughly) in front, unless the player stands on it
      let score = d <= 0.55 || dot >= 0.25 ? d - dot * 0.7 : Infinity;
      // an object's `lookSpan` (a door's leaf) is a second target within the same reach: its
      // nearest point counts when faced, scored by the distance to it. A player who walks on into
      // a door stops at the wall with the door-step point `pos` behind them.
      const span = isNpc ? null : ref.lookSpan;
      if (span) {
        const q = nearestOnSpan(span, p.x, p.z);
        const lx = q.x - p.x;
        const lz = q.z - p.z;
        const ld = Math.hypot(lx, lz);
        const ldot = ld > 1e-3 ? (lx * f.x + lz * f.z) / ld : 1;
        if (ldot >= SPAN_FACING) score = Math.min(score, ld - ldot * 0.7);
      }
      if (score < bestScore) {
        bestScore = score;
        bestNpc = isNpc ? ref : null;
        bestIt = isNpc ? null : ref;
      }
    }
    if (!bestNpc && !bestIt) return null;
    const t = this._target;
    t.kind = bestNpc ? 'npc' : 'object';
    t.npc = bestNpc;
    t.it = bestIt;
    return t;
  }

  async _interact(target) {
    if (this.busy) return;
    const { kind, npc, it } = target;
    this.busy = true;
    this.ui.prompt.hide();
    try {
      if (kind === 'npc') {
        npc.beginTalk(this.player.position.x, this.player.position.z);
        this.player.faceTowards(npc.position.x, npc.position.z);
        const visits = this.visits.get(npc.id) ?? 0;
        this.visits.set(npc.id, visits + 1);
        const say = (lines, opts = {}) => this.ui.dialog.open({ speaker: opts.speaker ?? npc.name, lines, portraitColor: npc.def.portraitColor });
        await npc.talk({
          say, visits, game: this, npc,
          toast: (t) => this.ui.hud.toast(t, 2.4),
          sfx: (n) => this.audio.playSfx(n, { volume: 0.7 }),
        });
      } else {
        // a door: face its leaf, not the door-step point (behind a player who stands at the wall)
        const q = it.lookSpan ? nearestOnSpan(it.lookSpan, this.player.position.x, this.player.position.z) : it.position;
        this.player.faceTowards(q.x, q.z);
        if (it.onInteract) {
          // combat levels: waystones rest, chests open (set by the CombatSystem)
          await it.onInteract(this, it);
        } else {
          const text = it.text?.lines?.length ? it.text : { speaker: '', lines: ['Nothing of note.'] };
          if (text.sfx) this.audio.playSfx(text.sfx, { volume: 0.6 });
          await this.ui.dialog.open({ speaker: text.speaker, lines: text.lines });
        }
      }
    } catch (err) {
      if (!this._disposed) console.error('[Lumina] interaction failed:', err);
    } finally {
      if (kind === 'npc') npc.endTalk();
      this.busy = false;
      this._talkCooldown = TALK_COOLDOWN;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------------------------

  /**
   * One frame of the game (the 'game' engine system, priority 0; its `t` is not used).
   * @type {(dt: number, t?: number) => void}
   */
  update(dt) {
    const { engine, ui, rig, player } = this;
    const input = engine.input;
    const playing = this.mode === 'play';
    const talking = this.busy || ui.dialog.isOpen;
    if (this._talkCooldown > 0) this._talkCooldown -= dt;

    // ---- shortcuts (the game, not the UI, owns these) ----
    if (playing) {
      if (input.actionPressed('debug')) ui.debug.toggle();
      // world map: N / Tab (gamepad Back) opens it; the map key or Esc closes it
      if (this.mapOpen) {
        if (input.actionPressed('map') || input.actionPressed('cancel')) this.toggleMap(false);
      } else if (!talking && !this.photoMode && input.actionPressed('map')) this.toggleMap(true);
    }
    const mapOpen = this.mapOpen;
    // combat levels: photo mode is on an LS click, ignored while (and 0.3 s after) the move
    // vector is deflected (COMBAT.md §5.2)
    let photoPad = false;
    if (this.combat) {
      const mv = input.getMoveVector();
      this._padQuiet = Math.hypot(mv.x, mv.y) > PHOTO_PAD_DEFLECT ? 0 : this._padQuiet + dt;
      photoPad = input.actionPressed('photoPad') && this._padQuiet >= PHOTO_PAD_QUIET - 1e-6;
    }
    if (playing && !mapOpen) {
      if (input.actionPressed('help')) ui.hud.toggleHelp();
      if (!talking) {
        if (input.actionPressed('photo') || photoPad || (this.photoMode && input.actionPressed('cancel'))) this.togglePhotoMode();
        if (input.actionPressed('time')) this.cycleTime();
        if (input.actionPressed('weather')) this.cycleWeather();
        if (input.actionPressed('music')) {
          const on = this.setMusic(!this.audio.musicPlaying);
          ui.hud.toast(on ? '♪ Music on' : 'Music off', 1.4);
        }
      }
    }

    // ---- player (and combat, COMBAT.md §4.2) ----
    // combat runs while playing without a dialog, the map or photo mode; on combat levels photo
    // mode and the combat locks (death, boss intro) also freeze the player
    const combat = this.combat;
    const active = playing && !talking && !this.mapOpen && !this.photoMode;
    player.frozen = !playing || talking || mapOpen || (!!combat && (this.photoMode || combat.locksPlayer));
    combat?.update(dt, active);
    player.update(dt, input);
    combat?.afterPlayer(dt, active);
    player.setSilhouetteLevel(lerp(1, 0.5, this.lighting.nightFactor));

    // ---- interaction prompt / confirm ----
    if (playing && !talking && !this.photoMode && !mapOpen && !combat?.locksPlayer) {
      const target = this._findInteractable();
      if (target) {
        if (target.kind === 'npc') ui.prompt.show(target.npc.sprite, 'Talk', { offsetY: target.npc.def.preset === 'child' ? 1.9 : 2.35 });
        else ui.prompt.show(target.it.prompt, target.it.label);
        if (this._talkCooldown <= 0 && input.actionPressed('confirm')) {
          input.consumeAction?.('confirm');
          this._interact(target);
        }
      } else ui.prompt.hide();
    } else if (!talking) ui.prompt.hide();

    // ---- villagers & critters ----
    const pp = player.position;
    const ctx = this._npcCtx;
    const th = this._throttle;
    if (th) {
      th.frame++;
      const far = Math.max(FAR_ACTOR_DISTANCE, rig.distance * 1.15 + 4);
      th.far2 = far * far;
      if (this.critters.throttle) this.critters.throttle.far2 = th.far2;
      const fp = rig.focusPoint;
      for (let i = 0; i < this.npcs.length; i++) {
        const n = this.npcs[i];
        const d2 = (n.position.x - fp.x) ** 2 + (n.position.z - fp.z) ** 2;
        th.npcDt[i] += dt;
        if (d2 < th.far2 || n.talking || (th.frame + i) % th.every === 0) {
          n.update(Math.min(th.npcDt[i], 0.25), ctx);
          th.npcDt[i] = 0;
        }
      }
    } else for (let i = 0; i < this.npcs.length; i++) this.npcs[i].update(dt, ctx);
    this.critters.update(dt, this._critterCtx);

    // ---- camera ----
    rig.inputEnabled = playing && !talking && !mapOpen;
    if (this.mode === 'title') this._updateCinematic(dt);
    else if (playing) this._updatePlayCamera();
    rig.update(dt, input);
    this.spriteManager.update(dt);
    this.blobs?.update();

    // ---- world & atmosphere ----
    const dust = this.world.emitters.dust;
    if (dust) dust.position.set(rig.focusPoint.x, rig.focusPoint.y + 1.2, rig.focusPoint.z - 2);
    // fog scales with zoom: the fog start is fixed, so far zoom would bury the focus band in haze
    this.weather.zoomFog = clamp(((this.camera.distance - 7) / Math.max(1, rig.distance - 7)) ** 2, 0.4, 1);
    this.weather.update(dt);
    // combat look: grade / DOF offsets on top of what Weather wrote this frame
    combat?.applyLook(dt);
    if (this._warmFrames > 0) {
      this._warmFrames--;
      this.weather.rain.intensity = 1;
      this.weather.snow.intensity = 1;
      if (this._warmFrames === 0) {
        combat?.endWarmup();
        this._resolveWarm();
      }
    }
    const wv = (this._worldView ??= { focus: rig.focusPoint, camera: engine.camera });
    this.world.update(dt, wv);
    this.godRays.update(dt);
    this._waterfallFx(dt);
    this.particles.update(dt, engine.camera);
    this.resolution.update(dt);

    // ---- HUD / audio ----
    ui.hud.setTime(this.lighting.timeOfDay);
    this._updateRegion(dt);
    this._updateMaps(dt);
    this.audioDirector.update(dt, pp);
  }

  /** Gameplay camera extras: zoom-dependent bounds, the hill tilt, edge-aware yaw. */
  _updatePlayCamera() {
    const rig = this.rig;
    const p = this.player.position;
    if (!this.photoMode) {
      // high ground (Windmill Hill): tilt down a little so the blurred roofs below don't fill the frame
      const hg = this.highGround;
      rig.pitchTarget = (hg && p.y > hg.minY ? hg.pitch : this.camera.pitch) * DEG2RAD;
      // near the east / west edges don't let the camera swing out over the border forest
      // (the trees would stand between it and the player); the edge band shrinks on narrow maps so
      // Q / E still turn the camera there
      const W = this.level.width;
      const e0 = Math.min(9, W / 5);
      const e1 = e0 * (5 / 9);
      const east = smoothstep(W - e0, W - e1, p.x);
      const west = smoothstep(e0, e1, p.x);
      if (east > 0 || west > 0) {
        rig.yawTarget = clamp(rig.yawTarget, -(60 - 50 * west) * DEG2RAD, (60 - 50 * east) * DEG2RAD);
      }
    }
    this._updateCameraBounds();
  }

  /** Camera focus bounds for the current zoom (near ↔ mid ↔ far, see environment.camera.bounds). */
  _updateCameraBounds() {
    const d = this.rig.distance;
    const C = this.camera;
    const { near, mid, far } = this.cameraBounds;
    let a;
    let c;
    let t;
    if (d <= C.distance) {
      a = near;
      c = mid;
      t = clamp((d - C.minDistance) / Math.max(1e-6, C.distance - C.minDistance));
    } else {
      a = mid;
      c = far;
      t = clamp((d - C.distance) / Math.max(1e-6, C.maxDistance - C.distance));
    }
    const b = this.rig.bounds;
    b.minX = lerp(a.minX, c.minX, t);
    b.maxX = lerp(a.maxX, c.maxX, t);
    b.minZ = lerp(a.minZ, c.minZ, t);
    b.maxZ = lerp(a.maxZ, c.maxZ, t);
  }

  /** View depth of the player's chest (the DOF focus while playing). */
  _playerFocusDistance() {
    const p = this.player.position;
    const cam = this.engine.camera;
    const v = this._focusPos.set(p.x, p.y + 0.9, p.z).applyMatrix4(cam.matrixWorldInverse);
    return Math.max(1, -v.z);
  }

  _updateCinematic(dt) {
    const c = this._cine;
    c.t += dt;
    const s = c.t * 0.045;
    c.target.set(c.x + Math.sin(s) * c.driftX, c.y, c.z + Math.sin(s * 0.7 + 1) * c.driftZ);
    this.rig.yawTarget = Math.sin(c.t * 0.05) * 18 * DEG2RAD;
    this.rig.distanceTarget = c.distance + Math.sin(c.t * 0.07) * 3;
  }

  /** Spray bursts and glints at the foot of every splashing waterfall near the camera. */
  _waterfallFx(dt) {
    this._burstTimer -= dt;
    this._sparkleTimer -= dt;
    const falls = this.world.falls;
    if (!falls.length) return;
    const burst = this._burstTimer <= 0;
    const sparkle = this._sparkleTimer <= 0;
    if (!burst && !sparkle) return;
    const fp = this.rig.focusPoint;
    let any = false;
    for (let i = 0; i < falls.length; i++) {
      const f = falls[i];
      const a = f.anchor;
      // only bother when the falls could be on screen
      if (!f.splash || Math.hypot(a.x - fp.x, a.z - fp.z) > 30) continue;
      any = true;
      const [fx, fz] = f.dir;
      // lateral axis across the fall (+X for a fall toward +Z)
      const rx = fz;
      const rz = -fx;
      if (burst) {
        const u = (Math.random() - 0.5) * f.width * 0.9;
        this.particles.burst('splash', this._tmp.set(f.x + rx * u + fx * 0.85, a.y + 0.05, f.z + rz * u + fz * 0.85), 4);
      }
      if (sparkle) {
        const u = (Math.random() - 0.5) * f.width * 1.4;
        this.particles.burst('sparkle', this._tmp.set(f.x + rx * u + fx * 1.1, a.y + 0.5, f.z + rz * u + fz * 1.1), 2, { size: [0.2, 0.34] });
      }
    }
    if (!any) return;
    if (burst) this._burstTimer = 0.28;
    if (sparkle) this._sparkleTimer = 0.9;
  }

  _updateRegion(dt) {
    this._regionTimer -= dt;
    if (this._regionTimer > 0 || this.mode !== 'play') return;
    this._regionTimer = 0.3;
    const p = this.player.position;
    // first matching region object wins; `minY` = only while the player stands above that height
    const r = this.regions.find((g) => p.x >= g.minX && p.x < g.maxX && p.z >= g.minZ && p.z < g.maxZ && (g.minY == null || p.y > g.minY));
    // between regions (e.g. a stretch no region covers) keep the current plate instead of
    // flashing a generic fallback
    if (!r) return;
    if (r.name !== this.region) {
      this.region = r.name;
      this.ui.hud.setLocation(r.name, r.sub || this.level.name);
    }
    // arrival banner, once per visit (Windmill Hill's waits for the plateau itself: its region has
    // minY, the stair below it is a separate region without a banner)
    if (r.banner && !this._bannersShown.has(r.name)) {
      this._bannersShown.add(r.name);
      this.ui.banner.show(r.name, r.banner, { duration: 2.6 });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Automation hooks
  // ---------------------------------------------------------------------------------------------

  state() {
    const p = this.player.position;
    const info = this.postfx.sceneInfo;
    const target = this.mode === 'play' ? this._findInteractable() : null;
    const s = {
      mode: this.mode,
      level: this.level.name,
      player: {
        x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3),
        tile: { i: Math.floor(p.x), j: Math.floor(p.z) },
        facing: this.player.sprite.direction,
        animation: this.player.sprite.animation,
        speed: +this.player.speed.toFixed(2),
      },
      region: this.region,
      time: +this.lighting.timeOfDay.toFixed(3),
      phase: this.lighting.phaseName,
      night: +this.lighting.nightFactor.toFixed(3),
      weather: this.weather.weather,
      dialogOpen: this.ui.dialog.isOpen,
      busy: this.busy,
      photoMode: this.photoMode,
      mapOpen: this.mapOpen,
      music: this.audio.musicPlaying,
      audioReady: this.audio.ready,
      nearest: target ? (target.kind === 'npc' ? target.npc.id : target.it.id) : null,
      drawCalls: info.calls,
      triangles: info.triangles,
      fps: +this.engine.time.fps.toFixed(1),
      pointLights: this.world.lights.length,
      activeLights: this.world.lightPool?.activeCount ?? this.world.lights.length,
      renderScale: +this.engine.renderScale.toFixed(2),
      pixelRatio: +this.engine.pixelRatio.toFixed(3),
      gpuMs: +this.resolution.gpuMs.toFixed(2),
      camera: { yaw: +(this.rig.yaw / DEG2RAD).toFixed(1), pitch: +(this.rig.pitch / DEG2RAD).toFixed(1), distance: +this.rig.distance.toFixed(2), focus: this.rig.focusPoint.toArray().map((v) => +v.toFixed(2)) },
      inventory: { ...this.inventory },
    };
    // combat levels only (COMBAT.md §20.2)
    if (this.combat) s.combat = this.combat.state();
    return s;
  }

  /**
   * `__game.state()`: a snapshot for assertions (docs/specs/AUTOMATION_API.md §3.3; `combat` on
   * combat levels only, §3.5).
   * @typedef {ReturnType<Game['state']>} GameState
   */

  /**
   * `window.__game` (docs/specs/AUTOMATION_API.md §3): the game's objects and thin wrappers of its
   * actions for scripts. Set at the end of `init()` (before the title / play starts), deleted on
   * dispose; absent when the level failed to load. Built by `_exposeGlobal` below.
   * @typedef {object} GameHooks
   * @property {Game} game  the Game itself (everything below is reachable from it)
   * @property {Game['engine']} engine  renderer, scene, camera, input, time, systems
   * @property {Game['rig']} rig  CameraRig (yaw, pitch, distance, focusPoint, bounds …)
   * @property {Game['postfx']} postfx  PostFX (settings, sceneInfo, enableTimings / timings)
   * @property {Game['lighting']} lighting  LightingSystem (timeOfDay, nightFactor, phaseName,
   *   timeSpeed …)
   * @property {Game['ui']} ui  the DOM overlay (dialog, hud, banner, title, prompt, maps, debug)
   * @property {Game['audio']} audio  AudioSystem (ready, musicPlaying, playSfx)
   * @property {Game['tileMap']} tileMap  TileMap (getHeight, isWalkable, tileAt, colliders)
   * @property {Game['textures']} textures  the TextureLibrary
   * @property {Game['particles']} particles  Particles
   * @property {Game['godRays']} godRays  GodRays
   * @property {Game['player']} player  Player (position, facing, speed, sprite)
   * @property {Game['npcs']} npcs  the villagers (id, name, position, behaviour, talking)
   * @property {Game['world']} world  World (built, interactables, lights, lightPool, stats …)
   * @property {Game['weather']} weather  Weather (weather, time, snowCover, tuning)
   * @property {Game['level']} level  the normalised level being played
   * @property {Game['source']} levelSource  where it came from: `levels/<slug>.json` or
   *   `local:<slot>`
   * @property {Game['setTime']} setTime  jump to hour h (wrapped to 0–24; non-numbers ignored) →
   *   the hour
   * @property {Game['teleport']} teleport  move the player to (x, z) or the nearest standable spot
   *   within 3 u → { x, y, z } | null
   * @property {Game['talkTo']} talkTo  walk-free talk to NPC `id` → false when unknown / not now
   * @property {Game['setWeather']} setWeather  'clear' | 'rain' | 'snow' (unknown: no change) → the
   *   current weather
   * @property {Game['cycleTime']} cycleTime  glide to the next time preset (toast) → its hour
   * @property {Game['cycleWeather']} cycleWeather  clear → rain → snow (toast) → the new weather
   * @property {(on: boolean) => boolean} setMusic  start (truthy) / stop the music → music wanted
   * @property {(on?: boolean) => boolean} photo  enter / leave photo mode with the UI hidden at
   *   once (default: toggle) → photo mode
   * @property {(on?: boolean) => boolean} map  open / close the world map (default: toggle) → open
   * @property {() => GameState} state  the snapshot above
   * @property {CombatHooks} [combat]  combat levels only: the combat test hooks (§3.4, COMBAT.md
   *   §20.1)
   */

  /**
   * Sets `window.__game` (`GameHooks` above, the type of `Window.__game` in src/globals.d.ts: a
   * member added to the object must be added to the typedef too).
   */
  _exposeGlobal() {
    const g = this;
    window.__game = {
      engine: g.engine, rig: g.rig, postfx: g.postfx, lighting: g.lighting, ui: g.ui, audio: g.audio,
      tileMap: g.tileMap, textures: g.textures, particles: g.particles, godRays: g.godRays, player: g.player, npcs: g.npcs,
      world: g.world, weather: g.weather, game: g, level: g.level, levelSource: g.source,
      setTime: (h) => g.setTime(h),
      teleport: (x, z) => g.teleport(x, z),
      talkTo: (id) => g.talkTo(id),
      setWeather: (name) => g.setWeather(name),
      cycleTime: () => g.cycleTime(),
      cycleWeather: () => g.cycleWeather(),
      setMusic: (on) => g.setMusic(!!on),
      photo: (on = !g.photoMode) => (on !== g.photoMode ? g.togglePhotoMode({ instant: true }) : g.photoMode),
      map: (on = !g.mapOpen) => g.toggleMap(!!on),
      state: () => g.state(),
    };
    // combat levels only: the combat test hooks (COMBAT.md §20.1)
    if (g.combat) window.__game.combat = g.combat.hooks;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    for (const id of this._timeouts) clearTimeout(id);
    this._timeouts.clear();
    this._removeAudioUnlock?.();
    this._resolveWarm?.();
    this.engine?.stop();
    // game objects first (the renderer is still alive), then the engine (systems: lighting, audio;
    // the scene graph) and the UI
    const steps = [
      () => this.combat?.dispose(),
      () => this.resolution?.dispose(),
      () => this.blobs?.dispose(),
      () => this.weather?.dispose(),
      () => this.critters?.dispose(this.spriteManager),
      () => this.npcs?.forEach((n) => n.dispose()),
      () => this.player?.dispose(),
      () => this.world?.dispose(),
      () => this.spriteManager?.dispose(),
      () => this.godRays?.dispose(),
      () => this.particles?.dispose(),
      () => this.postfx?.dispose(),
      () => this.engine?.dispose(),
      () => this.ui?.dispose(),
    ];
    for (const step of steps) {
      try {
        step();
      } catch (err) {
        console.warn('[Lumina] dispose step failed:', err);
      }
    }
    if (window.__game?.game === this) delete window.__game;
  }
}
