#!/usr/bin/env node
/**
 * check-level.mjs — the generators' level checks for any level file, e.g. one made in the editor.
 *
 * Runs `checkLevel` of tools/lib/levelcheck.mjs — the checks `tools/make-gildhaven.mjs` runs on
 * the level it builds — on a saved level: a walk from the spawn with the game's movement rules
 * (every villager, door, sign, well and region reachable; no unreachable pocket), stairs, the
 * waterfalls' drops, bridges walkable end to end (an automatic deck height resolved as the game
 * does), props on flat dry ground, overlaps, blocked doors, what the north-looking camera cannot
 * see past roofs and tree crowns (villagers, talk spots, doors, signs, wells, campfires; the share
 * of street tiles behind roofs), walls and cliffs that hide a walker, critters, wall torches,
 * presets, environment areas, regions over the reachable ground. Read-only: it never writes the level.
 *
 * Usage:
 *   node tools/check-level.mjs <level> [<level> …] [--strict] [--routes=<file.json>] [--quiet]
 *   npm run level:check -- <level> …
 *     <level>   a name in public/levels/ (`brightwater-crossing`) or a path to a .json file
 *     --strict  the generators' bar: the composition rules (roofs, crowns, overlaps, footprints,
 *               pockets, the 3 % of street tiles behind roofs, region coverage) are errors too;
 *               without it they are warnings
 *     --routes  a JSON file of walks that must stay direct (≤ 1.5 × the straight line + 3):
 *               [["the square → the bridge", [x0, z0], [x1, z1]], …] — one level per run
 *     --quiet   print only the problems and the summary
 *
 * On a level file the streets are inferred from the tile types (dirt paths, cobbles, stone tiles,
 * wooden decks, stairs — dirt counts as ground), and every tree counts as hand-placed. A
 * generator's own run knows its streets and scatter: for a generated level run its generator.
 *
 * Exit code: 0 when no level has an error (warnings allowed), 1 when one has, 2 on usage errors or
 * a file that cannot be read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLevel, validateLevel } from '../src/engine/level/LevelFormat.js';
import { parseArgs } from './lib/levelgen.mjs';
import { gridFromLevel, placerFromLevel, checkLevel } from './lib/levelcheck.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const args = parseArgs(argv.filter((a) => a.startsWith('--')));
const names = argv.filter((a) => !a.startsWith('--'));
const usage = 'usage: node tools/check-level.mjs <level name or .json path> [...] [--strict] [--routes=<file.json>] [--quiet]';
if (!names.length || args.help) {
  console.error(usage);
  process.exit(2);
}
if (args.routes === true || (args.routes && names.length > 1)) {
  console.error(args.routes === true ? '--routes needs a file: --routes=<file.json>' : '--routes applies to one level per run');
  process.exit(2);
}

/** A level name (public/levels/<name>.json) or a path to a .json file. */
function resolveLevel(name) {
  if (/[\\/]/.test(name) || name.endsWith('.json')) return path.resolve(process.cwd(), name);
  return path.join(root, 'public', 'levels', `${name}.json`);
}

/** @returns {[name: string, from: [number, number], to: [number, number]][]} */
function readRoutes(file) {
  const list = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8'));
  const point = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  if (!Array.isArray(list) || !list.every((r) => Array.isArray(r) && typeof r[0] === 'string' && point(r[1]) && point(r[2]))) {
    throw new Error('routes must be a JSON array of ["name", [x0, z0], [x1, z1]]');
  }
  return list;
}

let failed = 0;
for (const name of names) {
  const file = resolveLevel(name);
  let level; let formatWarnings; let routes = [];
  try {
    ({ level, warnings: formatWarnings } = parseLevel(fs.readFileSync(file, 'utf8')));
    if (args.routes) routes = readRoutes(String(args.routes));
  } catch (e) {
    console.error(`${path.relative(process.cwd(), file)}: ${e.message}`);
    process.exit(2);
  }
  const t0 = performance.now();
  const errors = validateLevel(level);
  const report = errors.length
    ? { errors: [], warnings: [], info: ['the deeper checks need a structurally valid level'] }
    : (() => { const g = gridFromLevel(level); return checkLevel(level, { g, P: placerFromLevel(g, level) }, { strict: !!args.strict, routes }); })();
  const ms = Math.round(performance.now() - t0);
  const all = { errors: [...errors.map((m) => `validateLevel: ${m}`), ...report.errors], warnings: [...formatWarnings.map((m) => `format: ${m}`), ...report.warnings] };
  console.log(`${level.name} (${path.relative(process.cwd(), file)}): ${level.width} × ${level.depth}, ${level.objects.length} objects${args.strict ? ' · strict' : ''} · ${ms} ms`);
  if (!args.quiet) for (const m of report.info) console.log(`  · ${m}`);
  for (const m of all.warnings) console.log(`  ! ${m}`);
  for (const m of all.errors) console.log(`  ✗ ${m}`);
  console.log(`  ${all.errors.length} error(s), ${all.warnings.length} warning(s)`);
  if (all.errors.length) failed++;
}
process.exit(failed ? 1 : 0);
