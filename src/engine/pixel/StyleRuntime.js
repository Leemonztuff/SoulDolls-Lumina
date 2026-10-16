/**
 * StyleRuntime.js — applies a declarative style pack (see tools/lib/stylePacks.mjs and
 * tools/restyle-characters.mjs) to the procedural character generator WITHOUT touching
 * CHARACTER_PRESETS or any call site.
 *
 * How it plugs in:
 *   installCharacterStyle(pack) registers hooks inside CharacterSprites.js (setCharacterSpecHook
 *   for spec/preset/randomPool/outline, setCharacterSheetPostHook for the canvas-level postFx) so
 *   every sheet the game builds — player, NPCs, party, editor previews, dialog portraits — is
 *   restyled without touching any call site. Call it once at startup with the JSON pack you
 *   validated with the pipeline CLI:
 *
 *     import { installCharacterStyle } from './engine/pixel/StyleRuntime.js';
 *     installCharacterStyle(await fetch('/styles/my-pack.json').then((r) => r.json()));
 *
 *   uninstallCharacterStyle() restores the stock art pixel-for-pixel.
 *
 * Determinism: same pack + same seed → same pixels, everywhere (the hook runs before the seeded
 * jitter/randomize logic, and randomPool overrides keep the RNG draw order).
 */
import { createCharacterSheet, setCharacterSpecHook, setCharacterSheetPostHook } from './CharacterSprites.js';
import { PALETTE } from './Palette.js';
import { rgbToHsl, hslToRgb } from './PixelCanvas.js';

// ---------------------------------------------------------------------------
// Colour mapping
// ---------------------------------------------------------------------------

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function expandHex(hex) {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}

/** Mid tone of a PALETTE ramp (what materialRamp() treats as the base colour). */
function paletteMid(name) {
  const p = PALETTE[name];
  if (typeof p === 'string') return p;
  if (Array.isArray(p)) return p[Math.floor((p.length - 1) / 2)];
  return null;
}

/**
 * colour→colour map from the pack's `palette` section. Keys are PALETTE ramp names (resolved to
 * their mid tone — what materialRamp() treats as the base colour) or literal hexes; values may be
 * a hex (exact target colour) or an array of up to five hexes (a full dark→light ramp: painted
 * through materialRamp()'s own shade deltas -0.62/-0.30/0/+0.24/+0.46, so a whole ramp can be
 * restyled, not just recoloured).
 */
function buildColorMap(pack) {
  const map = new Map();
  for (const [k, v] of Object.entries(pack.palette ?? {})) {
    const from = HEX_RE.test(k) ? k : paletteMid(k);
    if (!from || !HEX_RE.test(from)) continue;
    if (typeof v === 'string') {
      if (HEX_RE.test(v)) map.set(expandHex(from), expandHex(v));
    } else if (Array.isArray(v)) {
      const arr = v.map((c) => (typeof c === 'string' && HEX_RE.test(c) ? expandHex(c) : null));
      if (arr.every(Boolean)) map.set(expandHex(from), arr);
    }
  }
  return map;
}

/** Recolour a single spec colour value through the map (ramp names resolve to their mid tone). */
export function remapColor(value, colorMap) {
  if (typeof value !== 'string' || !colorMap.size) return value;
  if (HEX_RE.test(value)) {
    const hit = colorMap.get(expandHex(value));
    return typeof hit === 'string' ? hit : value; // an array target only makes sense for ramp names
  }
  const mid = paletteMid(value);
  if (mid && HEX_RE.test(mid)) {
    const hit = colorMap.get(expandHex(mid));
    if (typeof hit === 'string') return hit; // named ramp → mapped hex keeps the exact target colour
    if (Array.isArray(hit)) return hit;       // named ramp → mapped ramp (5-tone shading preserved)
  }
  return value;
}

const COLOR_KEYS = new Set([
  'skin', 'hair', 'hatColor', 'hatBand', 'feather',
  'top', 'bottom', 'accent', 'shirt', 'color', 'lining', 'boots', 'leather', 'belt',
  'scarf', 'gloves', 'apron', 'sash', 'sashes', 'staffGem',
]);

function remapDeep(value, colorMap) {
  if (typeof value === 'string') return COLOR_KEYS.has(value) || HEX_RE.test(value) ? remapColor(value, colorMap) : value;
  if (Array.isArray(value)) return value.map((v) => remapDeep(v, colorMap));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = COLOR_KEYS.has(k) ? remapDeep(v, colorMap) : v;
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Spec hook
// ---------------------------------------------------------------------------

/**
 * Build the `(specIn) => specOut` hook installed into CharacterSprites.resolveSpec for this pack.
 * The hook runs AFTER a preset-name spec has been normalised to `{ preset }`, so it sees either an
 * explicit caller spec (sometimes already merged with CHARACTER_PRESETS by Npc/Player) or a bare
 * `{ preset: name }`; it may return a string, which resolveSpec() re-normalises. Per-preset
 * overrides are NOT applied here — they go through makePresetHook() inside resolveSpec(), which
 * covers both shapes without double-merging sub-objects.
 */
export function makeSpecHook(pack) {
  const colorMap = buildColorMap(pack);
  return (spec) => remapDeep(typeof spec === 'string' ? { preset: spec } : (spec ?? {}), colorMap);
}

/**
 * Build the `(name, preset) => patchedPreset` hook installed as CharacterSprites.presetPatchHook:
 * merges `overrides[name]` over the CHARACTER_PRESETS entry before resolveSpec() combines it with
 * the caller's spec (caller fields still win; outfit/gear/cape merge field-wise like resolveSpec).
 */
export function makePresetHook(pack) {
  if (!pack.overrides || !Object.keys(pack.overrides).length) return null;
  return (name, preset) => {
    const o = pack.overrides[name];
    if (!o) return preset;
    const p = preset ?? {};
    return {
      ...p,
      ...o,
      outfit: { ...(p.outfit ?? {}), ...(o.outfit ?? {}) },
      gear: { ...(p.gear ?? {}), ...(o.gear ?? {}) },
      cape: (o.cape && typeof o.cape === 'object' && p.cape && typeof p.cape === 'object')
        ? { ...p.cape, ...o.cape } : (o.cape !== undefined ? o.cape : p.cape),
    };
  };
}

/** randomPool section → the `{ cloth, hair, skin, boots }` pick lists for randomizeSpec(). */
export function makeRandomPools(pack) {
  const rp = pack.randomPool ?? {};
  const pools = {};
  if (Array.isArray(rp.cloth)) pools.cloth = rp.cloth;
  if (Array.isArray(rp.hair)) pools.hair = rp.hair;
  if (Array.isArray(rp.skin)) pools.skin = rp.skin;
  if (Array.isArray(rp.boots)) pools.boots = rp.boots;
  return Object.keys(pools).length ? pools : null;
}

// ---------------------------------------------------------------------------
// Canvas post-processing
// ---------------------------------------------------------------------------

/**
 * Pixel-level tweaks on a finished sheet canvas (in place): global saturation multiplier and a
 * hue rotation of the dark silhouette pixels. With a pack that sets `palette.outline`, the exact
 * stock outline colour (#150e0b) is swapped for its mapped replacement first — an exact, stable
 * pixel match (the palette key 'outline' resolves to that mid tone), so no heuristics are needed;
 * `outlineHueShift` remains as the fallback when the outline was not remapped through the palette.
 * Alpha untouched → the silhouette stays identical.
 */
export function applyPostFx(canvas, pack) {
  const fx = pack?.postFx;
  if (!fx || (!fx.saturation && !fx.outlineHueShift && !fx.hueShift)) return canvas;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const sat = fx.saturation ?? 1;
  const hue = ((fx.outlineHueShift ?? 0) + (fx.hueShift ?? 0)) / 360;
  const gHue = (fx.hueShift ?? 0) / 360;
  // exact outline swap: palette.outline in the pack maps the stock outline hex to a new one
  let outlineFrom = null, outlineTo = null;
  const pOut = pack.palette?.outline;
  if (typeof pOut === 'string' && HEX_RE.test(pOut)) {
    const mid = paletteMid('outline');
    if (mid && HEX_RE.test(mid)) {
      const expand = (h) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h);
      const e = expand(pOut);
      outlineFrom = [parseInt(mid.slice(1, 3), 16), parseInt(mid.slice(3, 5), 16), parseInt(mid.slice(5, 7), 16)];
      outlineTo = [parseInt(e.slice(1, 3), 16), parseInt(e.slice(3, 5), 16), parseInt(e.slice(5, 7), 16)];
    }
  }
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    if (outlineFrom && d[i] === outlineFrom[0] && d[i + 1] === outlineFrom[1] && d[i + 2] === outlineFrom[2]) {
      d[i] = outlineTo[0]; d[i + 1] = outlineTo[1]; d[i + 2] = outlineTo[2];
      continue;
    }
    let [h, s, l] = rgbToHsl([d[i], d[i + 1], d[i + 2]]);
    s = Math.min(1, Math.max(0, s * sat));
    h = (h + gHue) % 1;
    if (l < 0.18) h = (h + hue) % 1; // dark silhouette outline pixels (fallback path)
    const [r, g, b] = hslToRgb([h, s, l]);
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------
// Install / uninstall
// ---------------------------------------------------------------------------

let currentPack = null;

/**
 * Activate a style pack (parsed JSON, already validated by the pipeline). Idempotent; calling it
 * again replaces the previous pack. The spec hook covers every call site that goes through
 * createCharacterSheet(); packs with canvas-level `postFx` additionally need their sheets built
 * through createStyledSheet() below (the game's own sheet factories route there when a pack is
 * installed — see Game.js / Player.js / Npc.js / StoryRunner.js).
 */
export function installCharacterStyle(pack) {
  uninstallCharacterStyle();
  if (!pack) return;
  currentPack = pack;
  const outlineHex = typeof pack.palette?.outline === 'string' ? pack.palette.outline : null;
  setCharacterSpecHook(makeSpecHook(pack), makeRandomPools(pack), outlineHex, makePresetHook(pack));
  // canvas-level postFx through the factory hook: every call site that builds a plain sheet —
  // player, NPCs, party, editor previews, dialog portraits — gets it without touching any of them
  if (pack.postFx) setCharacterSheetPostHook((canvas) => applyPostFx(canvas, pack));
}

/** Restore the stock art (hooks + pools + outline + canvas postFx cleared). */
export function uninstallCharacterStyle() {
  currentPack = null;
  setCharacterSpecHook(null, null, null, null);
  setCharacterSheetPostHook(null);
}

/** The active pack (null when unstyled). */
export function getCharacterStyle() { return currentPack; }

/**
 * Sheet factory for pipelines and callers that want the active pack applied explicitly. With a
 * pack installed it is identical to createCharacterSheet() — the spec/preset hooks run inside
 * resolveSpec() and the canvas postFx through setCharacterSheetPostHook's factory hook — so this
 * thin wrapper exists only as the pipeline-facing entry point (restyle CLI, sandbox). Without a
 * pack it is the plain stock call. Handles both spec shapes the game uses — a bare preset name
 * (`createStyledSheet('guard')`) and a preset already merged into an object
 * (`{ ...CHARACTER_PRESETS[preset], preset, ...overrides }`, as in Npc.js).
 */
export function createStyledSheet(spec = {}, opts = {}) {
  return createCharacterSheet(spec, opts);
}
