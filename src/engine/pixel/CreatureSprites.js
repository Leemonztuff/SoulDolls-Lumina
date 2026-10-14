/**
 * CreatureSprites.js — species sprite sheets for the creature layer ("Critters Collection" plan §5,
 * §12). `createSpeciesSheet(id, { pose })` returns a SpriteSheet (the `createCharacterSheet` shape)
 * plus `{ id, pose, poses, spriteOptions }`: rows = DIRECTIONS (down, left, right, up, with a real
 * `right` row — the left drawing mirrored by `resolvePainter`), columns = the six plain poses
 * (idle0, idle1, walk0–walk3), and the `idle_<d>` / `walk_<d>` / `run_<d>` animations. The battle
 * and roster screens ask for `pose: 'front'` (32×32, a large facing critter); the free-roam
 * `creature` actors ask for `pose: 'overworld'` (20×20, a small critter).
 *
 * Art: the critters are painted like the creatures of CharacterSprites.js and the monsters of
 * MonsterSprites.js — shaded parts in a (material, shade) label buffer, 5-tone ramps, the dark plum
 * silhouette outline, light from the upper left — through `_painterKit`. Fire types carry a few
 * glow texels (alpha 204) so a `combatFx` sprite's `setGlow` lights them. Painting is RNG-free
 * (fixed layouts and colours). The overworld wander can also reuse the existing generic
 * `createCreatureSheet` look (CharacterSprites.js); this module is the front/overworld species art.
 */
import { _painterKit } from './CharacterSprites.js';
import { PixelCanvas } from './PixelCanvas.js';
import { DIRECTIONS, PPU } from '../constants.js';

/** @import * as THREE from 'three' */

const { Painter, resolvePainter, M, blob, quadGait, rampForKind, finishTexture, buildAnimations, POSES, glowTexel, OUTLINE } = _painterKit;

/**
 * Every species with a sheet (`createSpeciesSheet`), matching `CREATURE_DEFS` in
 * src/game/creatures/defs.js (the engine stays independent of the game data: the ids and their art
 * live here).
 * @type {readonly string[]}
 */
export const CREATURE_SPECIES_IDS = Object.freeze([
  'leafling', 'emberling', 'rippling', 'mossling', 'sparrowling', 'stoneling',
  'voltling', 'slitherling', 'buzzling', 'shadeling', 'frostling', 'aurorling',
  'peatling', 'mossmote', 'boggart', 'lanternfly', 'gloamwing', 'cinderbound',
  'cavernmite', 'murkfin', 'shellskimmer', 'saltling', 'hollowwisp', 'tidewisp',
]);

/** The two art poses of a species sheet. */
export const CREATURE_POSES = Object.freeze(['front', 'overworld']);

/**
 * Per-species art: five-tone ramps by colour spec (a PALETTE ramp name or a hex) for the body,
 * belly and accent, the accent's glow ramp, and the type (which picks the head emblem: a leaf, a
 * flame or a droplet).
 * @typedef {object} SpeciesArt
 * @property {string} body    the main ramp
 * @property {string} belly   the belly patch ramp
 * @property {string} accent  the head emblem ramp (also the glow source)
 * @property {'grass'|'fire'|'water'} type
 */

/**
 * Every species' art, by id.
 * @type {Record<string, SpeciesArt>}
 */
const SPECIES_ART = {
  leafling: { body: 'grass', belly: 'cream', accent: 'leaves', type: 'grass' },
  emberling: { body: 'red', belly: 'yellow', accent: 'fire', type: 'fire' },
  rippling: { body: 'water', belly: 'cream', accent: 'blue', type: 'water' },
  mossling: { body: 'moss', belly: 'cream', accent: 'leaves', type: 'grass' },
  sparrowling: { body: 'hairBlonde', belly: 'cream', accent: 'brown', type: 'grass' },
  stoneling: { body: 'stoneWarm', belly: 'sand', accent: 'fire', type: 'fire' },
  voltling: { body: 'yellow', belly: 'cream', accent: 'fire', type: 'fire' },
  slitherling: { body: 'water', belly: 'sand', accent: 'leaves', type: 'water' },
  buzzling: { body: 'grassDry', belly: 'yellow', accent: 'leaves', type: 'grass' },
  shadeling: { body: 'purple', belly: 'red', accent: 'fire', type: 'fire' },
  frostling: { body: 'white', belly: 'water', accent: 'blue', type: 'water' },
  aurorling: { body: 'blue', belly: 'cream', accent: 'water', type: 'water' },
  peatling: { body: 'grass', belly: 'cream', accent: 'leaves', type: 'grass' },
  mossmote: { body: 'moss', belly: 'sand', accent: 'leaves', type: 'grass' },
  boggart: { body: 'grassDry', belly: 'cream', accent: 'leaves', type: 'grass' },
  lanternfly: { body: 'yellow', belly: 'cream', accent: 'fire', type: 'fire' },
  gloamwing: { body: 'purple', belly: 'yellow', accent: 'fire', type: 'fire' },
  cinderbound: { body: 'red', belly: 'sand', accent: 'fire', type: 'fire' },
  cavernmite: { body: 'stoneWarm', belly: 'sand', accent: 'fire', type: 'fire' },
  murkfin: { body: 'blue', belly: 'water', accent: 'blue', type: 'water' },
  shellskimmer: { body: 'sand', belly: 'cream', accent: 'water', type: 'water' },
  saltling: { body: 'white', belly: 'cream', accent: 'water', type: 'water' },
  hollowwisp: { body: 'water', belly: 'cream', accent: 'water', type: 'water' },
  tidewisp: { body: 'water', belly: 'white', accent: 'water', type: 'water' },
};

/** Frame size per pose: [width, height]. */
const POSE_SIZE = { front: [32, 32], overworld: [20, 20] };

/** 40 material ramps from the art; every unspecified material falls back to `fallback`. */
function makeRamps(art, fallback) {
  const ramps = new Array(40).fill(null);
  ramps[M.FUR] = rampForKind(art.body);
  ramps[M.FUR2] = rampForKind(art.accent);
  ramps[M.FUR3] = rampForKind(art.belly);
  ramps[M.GLOW] = rampForKind(art.accent).map(glowTexel);
  ramps[M.EYE] = eyeRamp('#20242e', '#4a5468');
  ramps[M.LINE] = [OUTLINE, OUTLINE, OUTLINE, OUTLINE, OUTLINE];
  const fb = ramps[fallback] ?? ramps[M.FUR];
  for (let i = 0; i < 40; i++) if (!ramps[i]) ramps[i] = fb;
  return ramps;
}

/** Eye ramp [outline, dark, iris, light, white]. */
function eyeRamp(iris, light) {
  const c = rampForKind([iris, iris, iris, light, '#ffffff']);
  return [OUTLINE, c[1], c[2], c[3], [255, 255, 255, 255]];
}

/** One 2 px eye with a highlight (big = the front pose's larger eye). */
function eye(p, x, y, big) {
  p.set(x, y, M.EYE, 2);
  p.set(x, y - 1, M.EYE, 4);
  if (big) p.set(x + 1, y, M.EYE, 1);
}

/** A foot / paw: a small rounded block in the body's darkest tone. */
function foot(p, x, y, w) {
  blob(p, x, y, w, 1.5, M.FUR2, { maxShade: 1, minShade: 0 });
}

/** The head emblem: a leaf, a flame or a droplet (its position depends on the view). */
function emblem(p, art, cx, y, back) {
  const oy = back ? y + 2 : y;
  if (art.type === 'grass') {
    p.set(cx, oy, M.FUR2, 3);
    p.set(cx - 1, oy + 1, M.FUR2, 2);
    p.set(cx + 1, oy + 1, M.FUR2, 3);
    p.set(cx, oy + 2, M.FUR2, 2);
    p.set(cx, oy + 3, M.FUR, 1);
  } else if (art.type === 'fire') {
    p.set(cx, oy + 2, M.GLOW, 4);
    p.set(cx, oy + 1, M.GLOW, 3);
    p.set(cx - 1, oy + 1, M.GLOW, 2);
    p.set(cx + 1, oy + 1, M.GLOW, 2);
    p.set(cx, oy, M.GLOW, 3);
  } else {
    p.set(cx, oy, M.FUR2, 4);
    p.set(cx - 1, oy + 1, M.FUR2, 3);
    p.set(cx + 1, oy + 1, M.FUR2, 3);
    p.set(cx, oy + 2, M.FUR2, 2);
    p.set(cx, oy + 3, M.FUR2, 1);
  }
}

/**
 * Paint one critter into the painter's label buffer.
 * @param {InstanceType<typeof Painter>} p
 * @param {SpeciesArt} art
 * @param {'down'|'up'|'side'} view
 * @param {{key: string, bob: number, br: number, walk: number}} pose
 * @param {boolean} big
 */
function drawSpecies(p, art, view, pose, big) {
  const cx = Math.round(p.w / 2);
  const G = p.h - 3;
  const bob = pose.key === 'walk1' || pose.key === 'walk3' ? -1 : 0;
  const rx = big ? 9 : 5.5;
  const ry = big ? 7 : 4.2;
  const cy = G - (big ? 11 : 7) + bob;
  const gait = quadGait(pose);

  // feet (near pair + far pair, at the body's base)
  const spread = big ? 4 : 2.5;
  foot(p, cx - spread, G - gait[2].lift, big ? 2 : 1.6);
  foot(p, cx + spread, G - gait[0].lift, big ? 2 : 1.6);

  // body
  p.begin('below', 0);
  blob(p, cx, cy, rx, ry, M.FUR, { hi: 0.6, lo: -0.1, deep: -0.7 });
  p.end();

  // belly patch (front / side)
  if (view !== 'up') {
    p.begin(null);
    blob(p, cx, cy + Math.round(ry * 0.35), rx * 0.55, ry * 0.5, M.FUR3, { maxShade: 3, minShade: 1 });
    p.end();
  }

  if (big) {
    // a warm glow spot for the fire types
    if (art.type === 'fire') {
      p.set(cx - 2, cy + 2, M.GLOW, 3);
      p.set(cx + 2, cy + 1, M.GLOW, 2);
    }
  }

  // eyes
  const ey = cy - (big ? 2 : 1);
  if (view === 'down') {
    eye(p, cx - (big ? 3 : 2), ey, big);
    eye(p, cx + (big ? 2 : 1), ey, big);
  } else if (view === 'side') {
    eye(p, cx + (big ? 2 : 1), ey, big);
  }

  // head emblem
  emblem(p, art, cx, cy - ry - (big ? 1 : 0), view === 'up');
}

/**
 * Create a species sprite sheet (callers cache it: one sheet per (id, pose) is shared). An unknown
 * id throws, like `createEnemySheet`; an unknown pose falls back to 'front'.
 * @param {string} id one of `CREATURE_SPECIES_IDS`
 * @param {{ pose?: 'front'|'overworld' }} [opts]
 * @returns {{texture: THREE.Texture, canvas: HTMLCanvasElement, frameWidth: number, frameHeight: number,
 *   columns: number, rows: number, pixelsPerUnit: number, anchor: [number, number],
 *   animations: Record<string, {frames: {col:number,row:number}[], fps: number, loop: boolean}>,
 *   name: string, id: string, pose: string, poses: Record<string, number>,
 *   spriteOptions: { blobSize: [number, number] }, dispose: () => void}}
 */
export function createSpeciesSheet(id, { pose = 'front' } = {}) {
  const art = Object.hasOwn(SPECIES_ART, id) ? SPECIES_ART[id] : null;
  if (!art) throw new Error(`createSpeciesSheet: unknown species "${id}"`);
  const look = pose === 'overworld' ? 'overworld' : 'front';
  const [FW, FH] = POSE_SIZE[look];
  const big = look === 'front';
  const cols = POSES.length;
  const rows = DIRECTIONS.length;
  const sheet = new PixelCanvas(FW * cols, FH * rows);
  const p = new Painter(FW, FH);
  const ramps = makeRamps(art, M.FUR);

  DIRECTIONS.forEach((dir, row) => {
    const view = dir === 'down' ? 'down' : dir === 'up' ? 'up' : 'side';
    POSES.forEach((poseSpec, col) => {
      p.clear();
      drawSpecies(p, art, view, poseSpec, big);
      resolvePainter(p, ramps, sheet, col * FW, row * FH, dir === 'right');
    });
  });

  const poses = {};
  POSES.forEach((poseSpec, col) => { poses[poseSpec.key] = col; });

  const canvas = sheet.toCanvas();
  const texture = finishTexture(canvas, `species:${id}:${look}`);
  return {
    texture, canvas, frameWidth: FW, frameHeight: FH, columns: cols, rows,
    pixelsPerUnit: PPU, anchor: [0.5, 0],
    animations: buildAnimations(rows, { idleFps: 2.5, walkFps: 8, runFps: 13 }),
    name: id, id, pose: look, poses,
    spriteOptions: { blobSize: /** @type {[number, number]} */ (big ? [1.1, 0.55] : [0.75, 0.4]) },
    dispose() { texture.dispose(); },
  };
}
