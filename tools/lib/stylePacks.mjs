/**
 * stylePacks.mjs — shared definitions for the character-art style pipeline
 * (tools/restyle-characters.mjs + sandbox/sprite_restyle.html).
 *
 * A "style pack" is a pure-JSON, declarative description of an art restyle applied on top of
 * the procedural spec system in src/engine/pixel/CharacterSprites.js. No engine code changes:
 *  - palette : hex colour -> replacement (PALETTE ramp names are resolved to their mid tone
 *              through materialRamp(), so `"skinLight": "#f7d9b8"` recolours every preset that
 *              uses that ramp name at once)
 *  - overrides : per-preset field patches merged over CHARACTER_PRESETS[name]
 *  - randomPool : pools consumed by the seeded `randomize` NPC generator
 *  - newPresets : brand-new presets (spec objects) registered under `packName:key`
 *  - postFx : pixel-level tweaks applied to the generated sheet canvas (outline hue, saturation)
 *
 * Shipped packs live in tools/styles/*.json; users can point the pipeline at their own file.
 *
 * The browser side (src/main.js) imports only the PURE parts of this module (validatePack and the
 * constants): node:fs / node:path stay behind the isNode guard below so bundlers never resolve
 * them into the game build. Node-only helpers (loadPackFile, listShippedPacks) throw in a browser.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const isNode = typeof process !== 'undefined' && process.release?.name === 'node';

export const STYLES_DIR = 'tools/styles';

/** Colour keys inside a spec object (and its nested outfit/gear/cape sub-objects). */
export const COLOR_KEYS = new Set([
  'skin', 'hair', 'hatColor', 'hatBand', 'feather',
  'top', 'bottom', 'accent', 'shirt', 'color', 'lining', 'boots', 'leather', 'belt',
  'scarf', 'gloves', 'apron', 'sash', 'sashes', 'staffGem',
]);

/** Preset fields a pack may patch via `overrides` / `newPresets`. */
export const ALLOWED_FIELDS = new Set([
  'skin', 'hair', 'hairStyle', 'outfit', 'cape', 'hat', 'hatColor', 'hatBand', 'feather',
  'weapon', 'beard', 'gear', 'eyes', 'blush', 'female', 'build', 'randomize', 'seed',
]);

const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CSS_NAME_RE = /^[a-z]+$/;

/** Every colour the pack mentions (palette values, override colours, random pools). */
export function collectPackColors(pack) {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
  };
  Object.values(pack.palette ?? {}).forEach(walk);
  for (const o of Object.values(pack.overrides ?? {})) walk(Object.values(o));
  for (const p of Object.values(pack.randomPool ?? {})) walk(p);
  return [...new Set(out)];
}

/** Validate a parsed pack; returns an array of human-readable errors ([] when valid). */
export function validatePack(pack, { source = 'pack' } = {}) {
  const errs = [];
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    return [`${source}: root must be a JSON object`];
  }
  if (typeof pack.name !== 'string' || !pack.name.trim()) errs.push(`${source}: missing string "name"`);

  const checkColor = (val, where) => {
    if (typeof val === 'string' && (HEX_RE.test(val) || CSS_NAME_RE.test(val))) return;
    if (Array.isArray(val) && val.every((c) => typeof c === 'string' && (HEX_RE.test(c) || CSS_NAME_RE.test(c)))) return;
    errs.push(`${source}: ${where} — expected a hex/CSS colour or an array of them, got ${JSON.stringify(val)}`);
  };
  const checkSpecFields = (spec, where) => {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      errs.push(`${source}: ${where} — expected an object`);
      return;
    }
    for (const [k, v] of Object.entries(spec)) {
      if (!ALLOWED_FIELDS.has(k)) {
        errs.push(`${source}: ${where}.${k} — unknown field (allowed: ${[...ALLOWED_FIELDS].join(', ')})`);
        continue;
      }
      if (k === 'outfit' || k === 'gear' || k === 'cape') {
        if (k !== 'cape' || (v && typeof v === 'object')) {
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            for (const [kk, vv] of Object.entries(v)) {
              if (COLOR_KEYS.has(kk)) checkColor(vv, `${where}.${k}.${kk}`);
            }
          } else errs.push(`${source}: ${where}.${k} — expected an object`);
        }
      } else if (COLOR_KEYS.has(k)) checkColor(v, `${where}.${k}`);
    }
  };

  for (const [from, to] of Object.entries(pack.palette ?? {})) {
    if (HEX_RE.test(from)) errs.push(`${source}: palette key "${from}" is a literal hex — use a PALETTE ramp name (e.g. "skinLight") or a preset field selector`);
    // values: one hex/CSS colour (exact target) or an array of up to five hexes (a full dark→light
    // ramp painted through materialRamp()'s shade deltas — StyleRuntime.buildColorMap)
    if (Array.isArray(to)) {
      if (!to.length || to.length > 5) errs.push(`${source}: palette.${from} — ramp arrays must have 1..5 colours`);
      to.forEach((c, i) => checkColor(c, `palette.${from}[${i}]`));
    } else checkColor(to, `palette.${from}`);
  }
  for (const [preset, patch] of Object.entries(pack.overrides ?? {})) checkSpecFields(patch, `overrides.${preset}`);
  for (const [preset, spec] of Object.entries(pack.newPresets ?? {})) checkSpecFields(spec, `newPresets.${preset}`);
  for (const [pool, list] of Object.entries(pack.randomPool ?? {})) {
    if (!Array.isArray(list) || !list.length) errs.push(`${source}: randomPool.${pool} — expected a non-empty array`);
    else list.forEach((v, i) => checkColor(v, `randomPool.${pool}[${i}]`));
  }
  const fx = pack.postFx;
  if (fx !== undefined) {
    if (!fx || typeof fx !== 'object') errs.push(`${source}: postFx — expected an object`);
    else {
      if (fx.outlineHueShift !== undefined && typeof fx.outlineHueShift !== 'number') errs.push(`${source}: postFx.outlineHueShift — expected degrees (number)`);
      if (fx.saturation !== undefined && typeof fx.saturation !== 'number') errs.push(`${source}: postFx.saturation — expected multiplier (number)`);
    }
  }
  return errs;
}

/** Load + validate a pack from a JSON file (absolute or relative to cwd). Throws with all errors. */
export function loadPackFile(file, { quiet = false } = {}) {
  if (!isNode) throw new Error('loadPackFile is Node-only (use fetch() in the browser)');
  const abs = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  if (!existsSync(abs)) throw new Error(`Style pack not found: ${abs}`);
  let pack;
  try {
    pack = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (e) {
    throw new Error(`Style pack ${abs}: invalid JSON — ${e.message}`);
  }
  const errs = validatePack(pack, { source: path.basename(abs) });
  if (errs.length) {
    if (!quiet) console.error(errs.map((e) => `  ✗ ${e}`).join('\n'));
    throw new Error(`Style pack ${path.basename(abs)} failed validation (${errs.length} error(s))`);
  }
  if (!quiet) console.log(`  ✓ pack ${abs} (name: ${pack.name})`);
  return { pack, abs };
}

/** Discover shipped packs: tools/styles/*.json → [{ name, file }] sorted by name. */
export function listShippedPacks(rootDir = process.cwd()) {
  if (!isNode) throw new Error('listShippedPacks is Node-only');
  const dir = path.join(rootDir, STYLES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ name: f.replace(/\.json$/, ''), file: path.join(dir, f) }));
}
