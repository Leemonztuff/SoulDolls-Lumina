#!/usr/bin/env node
/**
 * restyle-characters.mjs — the character-art style pipeline (docs/specs/SPRITE_STYLE_PACKS.md).
 *
 * Turns a declarative JSON style pack into reviewable art without touching engine code:
 *   1. validates the pack (tools/lib/stylePacks.mjs),
 *   2. renders every character sheet twice in plain Node (stock hooks vs pack hooks) through the
 *      texture-free factory path of CharacterSprites.js (globalThis.__SPRITE_PIPELINE__ + the
 *      canvas stubs in tools/lib/nodeCanvasStub.mjs — deterministic, no browser / GPU involved),
 *   3. writes .restyle/<pack>/ PNG contact sheets, hashes.json and report.json,
 *   4. gates: with --gate, fails when any STOCK hash differs from sandbox/sprite_art.hashes.json
 *      (the committed baseline) — i.e. the pack's hooks leaked into the stock pipeline;
 *   5. with --install, copies the pack to public/styles/<name>.json so game.html?style=<name>
 *      picks it up at boot (src/main.js installStyleFromURL).
 *
 * Usage:
 *   npm run restyle -- neon                     # a shipped pack (tools/styles/neon.json)
 *   npm run restyle -- path/to/my-pack.json     # your own file
 *   npm run restyle -- neon --gate              # also assert the stock art is untouched
 *   npm run restyle -- neon --install           # also publish it for ?style=neon
 *   npm run restyle -- --list                   # discover shipped packs
 *
 * Output: .restyle/<name>/{sheet-*.png, styled.png, stock.png, hashes.json, report.json}
 * Exit code: 0 ok · 1 validation or gate failure · 2 usage error.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadPackFile, listShippedPacks } from './lib/stylePacks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// CLI arguments
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));
if (flags.has('--help') || flags.has('-h')) {
  console.log('usage: npm run restyle -- <pack-name|file.json> [--gate] [--install] [--list] [--out=<dir>] [--combat]\nsee the header of tools/restyle-characters.mjs');
  process.exit(0);
}
if (flags.has('--list')) {
  const packs = listShippedPacks(root);
  if (!packs.length) console.log('(no packs in tools/styles/)');
  for (const p of packs) console.log(`  ${p.name.padEnd(16)} ${path.relative(root, p.file)}`);
  process.exit(0);
}
if (!positional.length) { console.error('missing style pack: give a name from tools/styles/ or a path to a .json (npm run restyle -- --list)'); process.exit(2); }

const want = positional[0];
let packFile;
const shipped = listShippedPacks(root).find((p) => p.name === want);
if (shipped) packFile = shipped.file;
else {
  const direct = path.isAbsolute(want) ? want : path.resolve(process.cwd(), want);
  if (!fs.existsSync(direct)) { console.error(`style pack not found: "${want}" is neither a shipped pack (tools/styles/) nor an existing file`); process.exit(2); }
  packFile = direct;
}

let pack;
try { ({ pack } = loadPackFile(packFile)); } catch (e) { console.error(String(e?.message ?? e)); process.exit(1); }

const outName = (() => {
  const o = argv.find((a) => a.startsWith('--out='));
  return o ? o.slice('--out='.length) : pack.name;
})();
const outBase = path.join(root, '.restyle', outName.replace(/[^\w.-]/g, '_'));
fs.mkdirSync(outBase, { recursive: true });

// ---------------------------------------------------------------------------
// Pipeline-mode module loading (canvas stubs + texture-free sheet factory)
// ---------------------------------------------------------------------------
await import('./lib/nodeCanvasStub.mjs');
globalThis.__SPRITE_PIPELINE__ = true;
const { createCharacterSheetCanvas, CHARACTER_PRESETS } = await import('../src/engine/pixel/CharacterSprites.js');
const { installCharacterStyle, uninstallCharacterStyle } = await import('../src/engine/pixel/StyleRuntime.js');

// `three` is imported statically by CharacterSprites.js but only touched by finishTexture(), which
// the pipeline path never calls; make sure Vite's bare specifier still resolves under plain Node.
void createRequire(import.meta.url).resolve('three');

// ---------------------------------------------------------------------------
// Sheet specs (the same set sandbox/sprite_art.html?mode=hashes covers)
// ---------------------------------------------------------------------------
const CUSTOM_SPECS = {
  'villager + long red hair, circlet, blue cape': { preset: 'villager', hairStyle: 'long', hair: 'hairRed', hat: 'circlet', outfit: { top: 'purple', bottom: 'black' }, cape: 'blue', female: true, blush: true },
  'guard, no helmet, sword, red cape': { preset: 'guard', hat: 'none', hairStyle: 'spiky', hair: 'hairBlonde', weapon: 'sword', cape: { color: 'red', style: 'cape' } },
  'traveler recoloured (hex)': { preset: 'traveler', skin: 'skinDark', hair: 'hairWhite', hairStyle: 'ponytail', outfit: { top: '#c9643c' }, cape: { color: '#3f5f88', style: 'cloak', lining: '#1d2a4d' } },
  'cleric, white hood, bun': { preset: 'cleric', hairStyle: 'bun', hair: 'hairBlack', hat: 'hood', hatColor: 'white', beard: false },
  'farmer + beard + bow': { preset: 'farmer', beard: 'full', weapon: 'bow', hat: 'cap', hatColor: 'green' },
};
for (let i = 1; i <= 7; i++) CUSTOM_SPECS[`random NPC seed ${i}`] = { randomize: true, seed: i * 7919 };

/** @returns {[string, object|string][]} label → spec */
function buildSpecs() {
  const specs = [];
  for (const name of Object.keys(CHARACTER_PRESETS)) specs.push([`preset:${name}`, { preset: name }]);
  for (let i = 1; i <= 8; i++) specs.push([`random:${i}`, { randomize: true, seed: i }]);
  for (const [k, spec] of Object.entries(CUSTOM_SPECS)) specs.push([`custom:${k}`, spec]);
  return specs;
}

// ---------------------------------------------------------------------------
// Hashing + tiny PNG writer (RGBA → zlib via node:zlib, no image library needed)
// ---------------------------------------------------------------------------
function fnv1a(buf) {
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) { h ^= buf[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
function canvasHash(canvas) {
  const ctx = canvas.getContext('2d');
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let h = 0x811c9dc5;
  const step = (b) => { h ^= b; h = Math.imul(h, 0x01000193); };
  step(canvas.width & 255); step(canvas.width >>> 8);
  step(canvas.height & 255); step(canvas.height >>> 8);
  for (let i = 0; i < d.length; i++) step(d[i]);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** RGBA buffer → PNG bytes (truecolour+alpha, filter 0 per scanline). */
function pngFromRgba(width, height, rgba) {
  const writeU32 = (arr, v) => { arr.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); };
  const chunk = (type, data) => {
    const len = [0, 0, 0, 0]; writeU32(len, data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = [0, 0, 0, 0]; writeU32(crc, crc32(body));
    return Buffer.concat([Buffer.from(len), body, Buffer.from(crc)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // bit depth 8, colour type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
// CRC-32 (PNG chunks)
const _crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; _crcTable[n] = c; }
function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) c = _crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8); return ~c; }

/** Save one sheet canvas as PNG (from the stub's backing buffer). */
function saveSheetPng(canvas, file) {
  const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  fs.writeFileSync(file, pngFromRgba(canvas.width, canvas.height, d.data));
}

/** Contact sheet: stack canvases vertically on a dark background, labels omitted (order = keys). */
function contactSheet(entries, file, zoom = 2) {
  const cells = entries.map(([, canvas]) => canvas);
  const w = Math.max(...cells.map((c) => c.width)) * zoom;
  const rowH = (c) => c.height * zoom;
  const totalH = cells.reduce((s, c) => s + rowH(c), 0);
  const out = new Uint8ClampedArray(w * totalH * 4);
  // checkerboard-ish backdrop so transparent pixels stay visible
  for (let y = 0; y < totalH; y++) for (let x = 0; x < w; x++) {
    const off = (y * w + x) * 4;
    const v = ((x >> 4) + (y >> 4)) % 2 ? 0x2a : 0x24;
    out[off] = v; out[off + 1] = v + 6; out[off + 2] = v + 14; out[off + 3] = 255;
  }
  let dy = 0;
  for (const canvas of cells) {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < canvas.height * zoom; y++) {
      for (let x = 0; x < canvas.width * zoom; x++) {
        const src = (((y / zoom) | 0) * canvas.width + ((x / zoom) | 0)) * 4;
        const a = d[src + 3];
        if (!a) continue;
        const off = ((dy + y) * w + x) * 4;
        for (let ch = 0; ch < 3; ch++) out[off + ch] = d[src + ch];
        out[off + 3] = 255;
      }
    }
    dy += rowH(canvas);
  }
  fs.writeFileSync(file, pngFromRgba(w, totalH, out));
}

// ---------------------------------------------------------------------------
// Render both passes
// ---------------------------------------------------------------------------
const specs = buildSpecs();
console.log(`restyle: pack "${pack.name}" (${packFile}) — ${specs.length} sheets × 2 passes${flags.has('--combat') ? ' (+combat)' : ''}`);

/** @param {(label: string, spec: object) => void} onSheet builds all sheets, reporting each canvas */
function renderPass(label, styled, onSheet) {
  if (styled) installCharacterStyle(pack); else uninstallCharacterStyle();
  const t0 = Date.now();
  for (const [name, spec] of specs) {
    const sheet = createCharacterSheetCanvas(spec, flags.has('--combat') ? { combat: true } : {});
    onSheet(name, sheet.canvas);
  }
  uninstallCharacterStyle();
  console.log(`  ${label}: ${specs.length} sheets in ${Date.now() - t0} ms`);
}

const styledHashes = {}; const stockHashes = {};
const styledCanvases = []; const stockCanvases = [];
renderPass('styled', true, (name, canvas) => { styledHashes[name] = canvasHash(canvas); styledCanvases.push([name, canvas]); });
renderPass('stock', false, (name, canvas) => { stockHashes[name] = canvasHash(canvas); stockCanvases.push([name, canvas]); });

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
contactSheet(styledCanvases, path.join(outBase, 'styled.png'));
contactSheet(stockCanvases, path.join(outBase, 'stock.png'));
fs.mkdirSync(path.join(outBase, 'sheets'), { recursive: true });
for (const [name, canvas] of styledCanvases) {
  const safe = name.replace(/[^\w.-]+/g, '_');
  saveSheetPng(canvas, path.join(outBase, 'sheets', `${safe}.png`));
}
fs.writeFileSync(path.join(outBase, 'hashes.json'), JSON.stringify({ pack: pack.name, styled: styledHashes, stock: stockHashes }, null, 2) + '\n');

// gate: the stock pass must equal a recorded baseline — i.e. the pack's hooks never leaked into
// the stock pipeline. Two modes:
//   --gate            vs sandbox/sprite_art.hashes.json (recorded in Chrome; Node pixel paths for
//                     creatures/props differ slightly from the browser, so those keys are reported
//                     as "browser-path key" warnings instead of failures)
//   --gate --update   re-record .restyle/baseline-node.json from THIS stock run (Node-to-Node
//                     comparison afterwards is exact and machine-independent)
const nodeBaselineFile = path.join(root, '.restyle', 'baseline-node.json');
const committedBaselineFile = path.join(root, 'sandbox', 'sprite_art.hashes.json');
let gateFailures = [];
if (flags.has('--update')) {
  fs.mkdirSync(path.dirname(nodeBaselineFile), { recursive: true });
  fs.writeFileSync(nodeBaselineFile, JSON.stringify({ comment: 'Node stock-pass hashes recorded by tools/restyle-characters.mjs --gate --update; the gate compares every later stock run against this file.', hashes: stockHashes }, null, 2) + '\n');
  console.log(`  ✓ baseline recorded → ${path.relative(root, nodeBaselineFile)} (${Object.keys(stockHashes).length} sheets)`);
} else if (fs.existsSync(nodeBaselineFile)) {
  const baseline = JSON.parse(fs.readFileSync(nodeBaselineFile, 'utf8')).hashes ?? {};
  for (const [k, v] of Object.entries(baseline)) if (k in stockHashes && stockHashes[k] !== v) gateFailures.push(`${k}: baseline ${v} ≠ stock-now ${stockHashes[k]}`);
} else if (fs.existsSync(committedBaselineFile)) {
  const raw = JSON.parse(fs.readFileSync(committedBaselineFile, 'utf8'));
  // The committed baseline wraps its map: { comment, hashes: { key -> hash } }.
  const baseline = raw && typeof raw === 'object' && raw.hashes ? raw.hashes : raw;
  for (const [k, v] of Object.entries(baseline)) {
    if (!(k in stockHashes)) continue;
    if (stockHashes[k] !== v) {
      // Only character sheets have an identical paint path in Node and Chrome (both read back the
      // same RGBA buffer); creature/prop canvases go through the browser compositor → skip those.
      if (/^(creature|prop):/.test(k)) console.warn(`  · ${k}: browser-path key, not comparable in Node (skipped)`);
      else gateFailures.push(`${k}: baseline ${v} ≠ stock-now ${stockHashes[k]}`);
    }
  }
  if (!gateFailures.length) console.warn('  · note: no Node baseline yet — run with --gate --update once to record it (exact thereafter)');
} else gateFailures.push(`no baseline found (${path.relative(root, nodeBaselineFile)} or ${path.relative(root, committedBaselineFile)}) — cannot gate`);

const changed = Object.entries(styledHashes).filter(([k, v]) => stockHashes[k] !== v).map(([k]) => k);
const report = {
  pack: pack.name, file: path.relative(root, packFile), generatedBy: 'tools/restyle-characters.mjs',
  sheets: specs.length, changedVsStock: changed, unchanged: Object.keys(styledHashes).length - changed.length,
  gate: flags.has('--gate') ? (gateFailures.length ? `FAIL: ${gateFailures.join('; ')}` : 'PASS') : 'not requested (--gate)',
};
fs.writeFileSync(path.join(outBase, 'report.json'), JSON.stringify(report, null, 2) + '\n');

console.log(`  ${changed.length}/${specs.length} sheets changed vs stock`);
if (!changed.length) console.warn('  ⚠ the pack did not change any character sheet — check its palette/overrides/postFx');

// --install: publish for game.html?style=<name> (src/main.js fetches public/styles/<name>.json)
if (flags.has('--install')) {
  const pubDir = path.join(root, 'public', 'styles');
  fs.mkdirSync(pubDir, { recursive: true });
  const dest = path.join(pubDir, `${pack.name}.json`);
  fs.copyFileSync(packFile, dest);
  console.log(`  ✓ installed → ${path.relative(root, dest)} — try it: game.html?style=${pack.name}`);
}

if (flags.has('--gate') && gateFailures.length) {
  console.error(`\ngate FAILED — the stock art drifted from the committed baseline:\n${gateFailures.map((f) => `  ✗ ${f}`).join('\n')}`);
  process.exit(1);
}
console.log(`\nreview: ${path.relative(root, outBase)}/styled.png (vs stock.png) · hashes.json · report.json`);
