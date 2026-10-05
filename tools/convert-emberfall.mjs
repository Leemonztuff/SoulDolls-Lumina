#!/usr/bin/env node
/**
 * One-off conversion: the hand-coded Emberfall demo → `public/levels/emberfall.json`, the Lumina
 * level file that is now the single source of truth for the demo village (docs/contracts/LEVEL_EDITOR.md §5).
 *
 *   node tools/convert-emberfall.mjs [--rev=<git revision>] [--out=public/levels/emberfall.json]
 *
 * Inputs are the pre-conversion demo sources: the placement constants of
 * `src/demo/maps/emberfall.js` (map, SPAWN, HOUSES, LAMPPOSTS, TORCHES, WELL, CAMPFIRE, WATERFALL,
 * BRIDGE, FOOTBRIDGE, TREES, FOREGROUND_OAKS, PROPS, FENCES, REGIONS), `NPC_DEFS` / `OBJECT_TEXT`
 * from `src/demo/dialogue.js` and the camera tuning of `src/demo/config.js`. Those constants were
 * removed after the conversion, so when the working tree no longer has them the script reads the
 * three files from git (`--rev`, default HEAD) instead.
 *
 * What the old World / Game / Critters built in code (windmill, spring cascade, atmosphere
 * particle areas, critters, god-ray areas, foliage zones, title camera) is transcribed below.
 *
 * Exactness: the PropFactory draws some options at random (seeded by kind + position) when they
 * are absent. Level objects always carry the catalog defaults, so such options are written as
 * `null` ("seeded random", e.g. house shutters / door hood / woodpile, tree & rock seeds), and the
 * random rotations of barrels / crates / crate stacks — which the level builder always passes
 * explicitly — are computed here with the factory's own RNG so the props come out identical.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  LEVEL_FORMAT, LEVEL_VERSION, defaultLegend, normalizeLevel, validateLevel, serializeLevel, charToLevel,
} from '../src/engine/level/LevelFormat.js';
import { OBJECT_TYPES } from '../src/engine/level/ObjectCatalog.js';
import { RNG, hashString, hash2 } from '../src/engine/utils/math.js';
import { buildBarrel, buildCrate, buildCrateStack } from '../src/engine/world/props/SmallProps.js';

/** @import { LevelObject } from '../src/engine/level/types.js' */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const OUT = path.resolve(root, String(args.out ?? 'public/levels/emberfall.json'));
const SOURCES = { map: 'src/demo/maps/emberfall.js', dialogue: 'src/demo/dialogue.js', config: 'src/demo/config.js' };

// ---------------------------------------------------------------------------------------------
// Legacy sources (working tree, or git when they have already been converted)
// ---------------------------------------------------------------------------------------------

/**
 * The exports of the three legacy modules (untyped: the files are gone from the working tree).
 * @typedef {object} LegacySources
 * @property {Record<string, any>} map src/demo/maps/emberfall.js
 * @property {Record<string, any>} dialogue src/demo/dialogue.js
 * @property {Record<string, any>} config src/demo/config.js
 */

/**
 * @param {string} dir repository root (the working tree or a temporary git checkout)
 * @returns {Promise<LegacySources|null>} null when the constants are not there
 */
async function importSources(dir) {
  const out = /** @type {LegacySources} */ ({});
  for (const [k, rel] of Object.entries(SOURCES)) {
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) return null;
    out[k] = await import(pathToFileURL(file).href);
  }
  return out.map.HOUSES && out.dialogue.NPC_DEFS && out.dialogue.OBJECT_TEXT && out.config.CAMERA_BOUNDS ? out : null;
}

/** @returns {Promise<LegacySources & { from: string }>} */
async function loadLegacy() {
  const local = await importSources(root);
  if (local) return { ...local, from: 'working tree' };
  const rev = String(args.rev ?? 'HEAD');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'emberfall-legacy-'));
  try {
    for (const rel of Object.values(SOURCES)) {
      const text = execFileSync('git', ['show', `${rev}:${rel}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      fs.writeFileSync(path.join(tmp, rel), text);
    }
  } catch {
    throw new Error(`The legacy Emberfall constants are gone from the working tree and could not be read from git revision "${rev}". Pass --rev=<a revision before the level conversion>.`);
  }
  const old = await importSources(tmp);
  if (!old) throw new Error(`Git revision "${rev}" has no legacy Emberfall constants; pass --rev=<an older revision>.`);
  return { ...old, from: `git ${rev}` };
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** PropFactory#rng (factory seed 42), see src/engine/world/Props.js. */
function factoryRng(kind, x, z, seed) {
  const s = hashString(kind) ^ Math.floor(hash2(Math.round(x * 16), Math.round(z * 16), 42) * 4294967296)
    ^ (seed != null ? Math.imul((seed | 0) + 0x9e3779b9, 0x85ebca6b) : 0);
  return new RNG(s >>> 0);
}

/**
 * The rotation a prop builder picks when `opts.rotation` is absent: run the real builder with a
 * geometry-less stand-in factory and capture what it passes to `finish()`.
 */
function randomRotation(builder, kind, x, z, opts) {
  let rotation = null;
  const noop = new Proxy(() => noop, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : noop), apply: () => noop });
  const f = {
    rng: (k, px, pz, seed) => factoryRng(k, px, pz, seed),
    builder: () => noop,
    finish: (b, k, px, py, pz, rot) => { rotation = rot; return noop; },
    result: () => ({}),
    boxCollider: () => ({}),
    world: () => ({}),
    textures: noop,
    extra: noop,
  };
  builder(f, x, 0, z, { ...opts });
  if (!Number.isFinite(rotation)) throw new Error(`could not derive the ${kind} rotation at ${x},${z}`);
  return rotation;
}
const RANDOM_ROTATION = { barrel: buildBarrel, crate: buildCrate, crateStack: buildCrateStack };

/**
 * Catalog defaults that differ from the PropFactory's behaviour when an option is absent:
 * `null` keeps the factory's seeded random choice.
 */
const FACTORY_DEFAULTS = {
  house: { shutters: null, doorHood: null, woodpile: null, seed: null },
  tree: { seed: null },
  rock: { seed: null },
};

const r6 = (v) => Math.round(v * 1e6) / 1e6;

// ---------------------------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------------------------

async function main() {
  const L = await loadLegacy();
  const M = L.map;
  const { NPC_DEFS, OBJECT_TEXT } = L.dialogue;
  const { CAMERA, CAMERA_BOUNDS, HILL_CAMERA } = L.config;
  const map = M.EMBERFALL_MAP;
  const W = M.MAP_WIDTH;
  const D = M.MAP_DEPTH;

  // legend: the demo's legend is a subset of the built-in palette (identical definitions)
  const legend = defaultLegend();
  for (const [ch, def] of Object.entries(map.legend)) {
    if (JSON.stringify(legend[ch]) !== JSON.stringify(def)) {
      console.warn(`legend "${ch}" differs from the built-in palette; keeping the demo's definition`);
      legend[ch] = def;
    }
  }
  /** Flat ground height of the tile under (x, z) (no stairs / bridges at the sampled points). */
  const groundY = (x, z) => charToLevel(map.heights[Math.floor(z)][Math.floor(x)]) * 0.5;

  const objects = [];
  const ids = new Set();
  const counters = {};
  const nextId = (type) => {
    counters[type] = (counters[type] ?? 0) + 1;
    return `${type}_${counters[type]}`;
  };
  const add = (type, fields) => {
    const def = OBJECT_TYPES[type];
    if (!def) throw new Error(`unknown type ${type}`);
    const { id = nextId(type), ...rest } = fields;
    if (ids.has(id)) throw new Error(`duplicate id ${id}`);
    ids.add(id);
    const opts = rest.opts ? { ...rest.opts } : undefined;
    if (opts) {
      delete opts.id;
      if (def.rotatable && 'rotation' in opts) {
        rest.rotation = opts.rotation;
        delete opts.rotation;
      }
      for (const [k, v] of Object.entries(FACTORY_DEFAULTS[type] ?? {})) if (!(k in opts)) opts[k] = v;
      rest.opts = opts;
    }
    const obj = { id, type, ...rest };
    objects.push(obj);
    return obj;
  };
  const text = (key) => OBJECT_TEXT[key]?.lines ?? [];

  // ---- buildings & lights (World._buildProps order: it decides the point-light order) ----
  for (const h of M.HOUSES) {
    add('house', { id: h.id, x: h.x, z: h.z, rotation: 0, name: h.name, light: !!h.light, text: text(`door:${h.id}`), opts: h.opts });
  }
  M.LAMPPOSTS.forEach((lp) => add('lamppost', { x: lp.x, z: lp.z, rotation: lp.rotation ?? 0, opts: { style: lp.style ?? 'arm' } }));
  M.TORCHES.forEach((t, k) => add('wallTorch', { id: ['torch_inn', 'torch_barn'][k] ?? undefined, x: t.x, z: t.z, rotation: t.rotation ?? 0, dy: t.dy, opts: { embers: k === 0 } }));
  add('well', { id: 'well', x: M.WELL.x, z: M.WELL.z, rotation: 0, text: text('well'), sfx: OBJECT_TEXT.well?.sfx ?? 'splash', opts: { roof: 'wood_planks' } });
  add('campfire', { id: 'campfire', x: M.CAMPFIRE.x, z: M.CAMPFIRE.z, rotation: 0.8, opts: { seat: false } });

  // bridges: deck at the bank level, the main bridge's automatic arch written out
  const B = M.BRIDGE;
  add('bridge', {
    id: 'bridge', x0: B.x0, z0: B.z, x1: B.x1, z1: B.z, deckY: groundY(B.x0 - 0.5, B.z),
    opts: { width: B.width, arch: r6(Math.min(0.4, Math.hypot(B.x1 - B.x0, 0) * 0.05)) },
  });
  const FB = M.FOOTBRIDGE;
  add('bridge', {
    id: 'footbridge', x0: FB.x0, z0: FB.z, x1: FB.x1, z1: FB.z, deckY: groundY(FB.x0 - 0.4, FB.z),
    opts: { width: FB.width, arch: 0.18, postDepth: 0.8 },
  });
  add('windmill', { id: 'windmill', x: 11.4, z: 5.6, rotation: 0.12, opts: { height: 6.2, roof: 'roof_red' } });

  for (const [type, x, z, o] of M.PROPS) {
    const opts = { ...o };
    const fields = { id: o.id, x, z, opts };
    if (RANDOM_ROTATION[type] && opts.rotation == null) opts.rotation = r6(randomRotation(RANDOM_ROTATION[type], type, x, z, o));
    if (type === 'signpost') Object.assign(fields, { speaker: OBJECT_TEXT[o.id]?.speaker ?? 'Signpost', text: text(o.id) });
    if (type === 'marketStall') opts.width ??= 3;
    if (OBJECT_TYPES[type].rotatable) opts.rotation ??= 0;
    add(type, fields);
  }
  for (const [x0, z0, x1, z1] of M.FENCES) add('fence', { x0, z0, x1, z1, opts: {} });

  // ---- trees (World._buildTrees): village trees with trunk colliders, big foreground oaks ----
  for (const [kind, x, z, height] of M.TREES) add('tree', { x, z, collider: true, opts: { kind, height } });
  for (const [x, z, height] of M.FOREGROUND_OAKS) add('tree', { x, z, collider: false, opts: { kind: 'oak', height } });

  // ---- water (World._buildWater): the falls into the plunge pool, the spring cascade ----
  const F = M.WATERFALL;
  add('waterfall', { id: 'falls', x: F.x, z: F.z, width: F.width, facing: 'S', mist: { count: 16, alpha: 0.07 }, splash: true });
  add('waterfall', { id: 'spring', x: 31, z: 3, width: 2, facing: 'S', mist: { count: 10, alpha: 0.06 }, splash: false });

  // ---- villagers: placement + the hand-written conversation (script) + a plain fallback ----
  // (talk point and chase area are written relative to the villager — `talkOffset`, `area` — so
  // they follow when the NPC is moved in the editor)
  const ACTIONS = { innkeeper: 'rest', merchant: 'shop', bard: 'music' };
  const relRect = (b, x, z) => ({ minX: r6(b.minX - x), maxX: r6(b.maxX - x), minZ: r6(b.minZ - z), maxZ: r6(b.maxZ - z) });
  for (const d of NPC_DEFS) {
    const extra = {};
    const [hx, hz] = d.home;
    if (d.behaviour) extra.behaviour = d.behaviour;
    if (d.talkRadius != null) extra.talkRadius = d.talkRadius;
    if (d.talkPoint) extra.talkOffset = [r6(d.talkPoint[0] - hx), r6(d.talkPoint[1] - hz)];
    if (d.bounds) extra.area = relRect(d.bounds, hx, hz);
    add('npc', {
      id: d.id, x: d.home[0], z: d.home[1], name: d.name, preset: d.preset, facing: d.facing ?? 'down',
      wander: d.wander ?? 1.2, speed: d.speed ?? 1.3, portraitColor: d.portraitColor ?? '#c9a45c',
      dialogue: await firstConversation(d), action: ACTIONS[d.id] ?? 'none', script: d.id, ...extra,
    });
  }

  // ---- critters (Critters.js): chicken yard, the cat, the plaza birds ----
  // (yard and bird spots relative to the group — `area`, `spotOffsets` — so they move with it)
  add('critters', {
    id: 'chickens', kind: 'chicken', count: 5, x: 6.5, z: 18.55, radius: 3.1,
    area: relRect({ minX: 3.4, maxX: 9.6, minZ: 17.2, maxZ: 19.9 }, 6.5, 18.55), seed: 4242, seedBase: 100,
  });
  add('critters', { id: 'cat', kind: 'cat', count: 1, x: 14.4, z: 21.6, radius: 3.2, seedBase: 7 });
  add('critters', {
    id: 'birds', kind: 'bird', count: 4, x: 17.5, z: 24.8, radius: 1.6, seedBase: 300,
    spotOffsets: [[17.2, 24.6], [17.9, 25.1], [16.6, 25.0], [18.4, 24.4]].map(([x, z]) => [r6(x - 17.5), r6(z - 24.8)]),
  });

  // ---- particle areas (World._buildAtmosphere; the camera-following dust is environment.dust) ----
  const area = (id, preset, [cx, cy, cz], size, count, params) => add('emitter', {
    id, x: cx, z: cz, preset, size, count, dy: r6(cy - groundY(cx, cz)), ...(params ? { params } : {}),
  });
  area('firefliesPond', 'fireflies', [40.8, 1.6, 16.5], [8, 2.2, 7], 34);
  area('firefliesGrove', 'fireflies', [40, 2.0, 27], [9, 2.6, 12], 30);
  area('firefliesMeadow', 'fireflies', [14, 1.4, 33], [20, 2.2, 7], 40);
  area('leaves', 'leaves', [40, 3.2, 21], [11, 3.6, 18], 34);
  area('petals', 'petals', [16, 3.2, 33], [26, 4.5, 8], 44);
  area('poolSparkle', 'sparkle', [31, 0.7, 12.8], [4.4, 0.5, 2.4], 9, { life: [0.5, 1.1] });

  // ---- regions (HUD location plate, first match wins) ----
  for (const g of M.REGIONS) {
    const slug = g.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    let id = `region_${slug}`;
    for (let n = 2; ids.has(id); n++) id = `region_${slug}_${n}`;
    const minY = g.test ? HILL_CAMERA.minY : null; // the Windmill Hill test: p.y > HILL_CAMERA.minY
    add('region', {
      id, name: g.name, sub: g.sub ?? '', minX: g.minX, maxX: g.maxX, minZ: g.minZ, maxZ: g.maxZ, minY,
      ...(g.test ? { banner: 'Where the valley keeps its winds' } : {}),
    });
  }

  const raw = {
    format: LEVEL_FORMAT,
    version: LEVEL_VERSION,
    name: 'Emberfall',
    subtitle: 'Riverside Village',
    author: 'Lumina',
    description: 'The Lumina HD-2D demo village: a riverside village with an inn and a market square, a farm, Windmill Hill, Amberleaf Grove and the campfire meadow.',
    width: W,
    depth: D,
    waterLevel: map.waterLevel,
    water: { flow: [0, 0.45], reflect: 0.2, neutral: 0.2 },
    environment: {
      timeOfDay: 17.2,
      clock: true,
      weather: 'clear',
      border: 'forest',
      outerScenery: true,
      godRays: true,
      dust: true,
      music: true,
      camera: {
        distance: CAMERA.distance,
        pitch: CAMERA.pitch,
        bounds: { near: { ...CAMERA_BOUNDS.near }, mid: { ...CAMERA_BOUNDS.mid }, far: { ...CAMERA_BOUNDS.far } },
      },
      highGround: { minY: HILL_CAMERA.minY, pitch: HILL_CAMERA.pitch },
      title: { subtitle: 'A Lumina HD-2D Engine Demo', credit: 'Lumina HD-2D Engine · three.js' },
      titleCamera: { x: 22, z: 21, y: 1.5, driftX: 7, driftZ: 5, distance: 35 },
      // the big foreground oaks and the outer forest stand right beyond the south edge
      scenery: { southGap: 0 },
      godRayAreas: [
        { minX: 12, maxX: 30, minZ: 13, maxZ: 31, y: 1, count: 4, seed: 7 },
        { minX: 35, maxX: 45, minZ: 12, maxZ: 32, y: 1, count: 2, seed: 11 },
      ],
      foliage: {
        flowerAreas: [{ minX: 0, maxX: W, minZ: 30, maxZ: D, palette: [0, 1, 2, 3, 0, 2] }],
        shrubAreas: [{ minX: 35, maxX: W, minZ: 11, maxZ: 37, chance: 0.16 }],
      },
    },
    spawn: { ...M.SPAWN },
    legend,
    tiles: [...map.tiles],
    heights: [...map.heights],
    objects,
  };

  const { level, warnings } = normalizeLevel(raw);
  if (warnings.length) throw new Error(`normalisation warnings:\n  ${warnings.join('\n  ')}`);
  const errors = validateLevel(level);
  if (errors.length) throw new Error(`invalid level:\n  ${errors.join('\n  ')}`);
  // readable object key order: id, type, placement first
  level.objects = level.objects.map((o) => {
    const head = ['id', 'type', 'x', 'z', 'x0', 'z0', 'x1', 'z1', 'minX', 'maxX', 'minZ', 'maxZ'];
    const out = {};
    for (const k of head) if (k in o) out[k] = o[k];
    for (const [k, v] of Object.entries(o)) if (!(k in out)) out[k] = v;
    return /** @type {LevelObject} */ (out);
  });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, serializeLevel(level));
  const counts = {};
  for (const o of level.objects) counts[o.type] = (counts[o.type] ?? 0) + 1;
  console.log(`Emberfall (${L.from}) → ${path.relative(root, OUT)}: ${level.width}×${level.depth}, ${level.objects.length} objects`, counts);
}

/**
 * First-visit lines of a hand-written conversation (choices answered with the first option),
 * stored as the NPC's plain `dialogue` so the character still talks sensibly without its script.
 */
async function firstConversation(def) {
  const lines = [];
  const game = {
    audio: { musicPlaying: false },
    inventory: { apples: 0 },
    setMusic() {},
    async restUntilMorning() {},
  };
  let first = true;
  await def.talk({
    say: async (ls) => {
      if (first) lines.push(...ls.map((l) => (typeof l === 'string' ? l : { text: l.text, choices: [...l.choices] })));
      first = false;
      return 0;
    },
    visits: 0,
    game,
    npc: {},
    toast() {},
    sfx() {},
  });
  return lines.length ? lines : ['Hello, traveler!'];
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
