/**
 * Saving and loading Lumina levels:
 *  - browser storage (localStorage slots, always available),
 *  - the project folder `public/levels/<name>.json` through the dev-server API
 *    (tools/vite-level-api.js — only while `npm run dev` is running),
 *  - plain files (download / open from disk).
 *
 * Every load goes through `parseLevel`, so files are normalised and validated the same way.
 */
import { parseLevel, serializeLevel } from './LevelFormat.js';

/** @import { Level } from './types.js' */

const LOCAL_PREFIX = 'lumina.level.';
const LOCAL_INDEX = 'lumina.levels';
export const PLAYTEST_SLOT = '__playtest__';
const API = '/api/levels';

/**
 * Turn any display name into a safe slot / file name ("My Village!" → "my-village"). Names with
 * no Latin letters or digits ("村の広場") get a stable "level-<hash>" name, so two such levels
 * never share a file; a blank name is "untitled"; Windows device names ("con", "nul"…) get a
 * "-level" suffix.
 * @param {string} name any display name (null / undefined count as blank)
 * @returns {string}
 */
export function slugify(name) {
  const raw = String(name ?? '');
  const s = raw.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  // (Windows reserves con / prn / aux / nul / com1-9 / lpt1-9 as file names, with any extension)
  if (s) return RESERVED_FILE_NAMES.test(s) ? `${s}-level` : s;
  const t = raw.trim();
  return t ? `level-${hash6(t)}` : 'untitled';
}

/** File names Windows cannot use for a file (`con.json` is the console device there). */
export const RESERVED_FILE_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/** 6 base-36 chars of a string hash (FNV-1a). */
function hash6(str) {
  let h = 0x811c9dc5;
  for (const ch of str) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(6, '0').slice(-6);
}

// ---------------------------------------------------------------------------------------------
// Browser storage
// ---------------------------------------------------------------------------------------------

function readIndex() {
  try { return JSON.parse(localStorage.getItem(LOCAL_INDEX) ?? '[]'); } catch { return []; }
}

function writeIndex(list) {
  try { localStorage.setItem(LOCAL_INDEX, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

/**
 * Levels saved in this browser, newest first.
 * @returns {{ slot: string, name: string, savedAt: number, width: number, depth: number }[]}
 */
export function listLocalLevels() {
  return readIndex().filter((e) => e.slot !== PLAYTEST_SLOT).sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Save to browser storage. Returns the slot name. Throws if storage is full / unavailable.
 * @param {string} slot slot or display name (slugified, except the play-test slot)
 * @param {Level} level
 * @returns {string}
 */
export function saveLocalLevel(slot, level) {
  slot = slot === PLAYTEST_SLOT ? slot : slugify(slot);
  localStorage.setItem(LOCAL_PREFIX + slot, serializeLevel(level));
  const list = readIndex().filter((e) => e.slot !== slot);
  list.push({ slot, name: level.name, savedAt: Date.now(), width: level.width, depth: level.depth });
  writeIndex(list);
  return slot;
}

/**
 * Load from browser storage.
 * @param {string} slot
 * @returns {{ level: Level, warnings: string[] }|null} null when the slot is empty or storage is
 *   unavailable
 */
export function loadLocalLevel(slot) {
  let text = null;
  try { text = localStorage.getItem(LOCAL_PREFIX + slot); } catch { /* unavailable */ }
  return text ? parseLevel(text) : null;
}

/** @param {string} slot */
export function deleteLocalLevel(slot) {
  try { localStorage.removeItem(LOCAL_PREFIX + slot); } catch { /* unavailable */ }
  writeIndex(readIndex().filter((e) => e.slot !== slot));
}

// ---------------------------------------------------------------------------------------------
// Project folder (dev-server API) and published levels
// ---------------------------------------------------------------------------------------------

/** Is the dev-server level API reachable (i.e. running under `npm run dev`)? */
export async function hasProjectApi() {
  try {
    const r = await fetch(API, { method: 'GET', cache: 'no-store' });
    return r.ok && (r.headers.get('content-type') ?? '').includes('json');
  } catch {
    return false;
  }
}

/**
 * Levels in `public/levels/` (dev server only).
 * @returns {Promise<{ name: string, file: string, title: string, size: number, modified: number }[]>}
 */
export async function listProjectLevels() {
  const r = await fetch(API, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Level API: HTTP ${r.status}`);
  return (await r.json()).levels ?? [];
}

/**
 * Write `public/levels/<name>.json` (dev server only). Returns the file name written.
 * @param {string} name display name (slugified)
 * @param {Level} level
 * @returns {Promise<string>}
 */
export async function saveProjectLevel(name, level) {
  const slug = slugify(name);
  const r = await fetch(`${API}/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: serializeLevel(level),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    let msg = text;
    try { msg = JSON.parse(text)?.error ?? text; } catch { /* plain text */ }
    throw new Error(msg || `HTTP ${r.status}`);
  }
  return (await r.json()).file;
}

/** @param {string} name display name (slugified) */
export async function deleteProjectLevel(name) {
  const r = await fetch(`${API}/${encodeURIComponent(slugify(name))}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`Delete failed: HTTP ${r.status}`);
}

/**
 * Load a published level `levels/<name>.json` (works in dev and in production builds, since
 * files in public/ are copied to dist/).
 * @param {string} name level name (slugified)
 * @returns {Promise<{ level: Level, warnings: string[] }>}
 */
export async function loadProjectLevel(name) {
  const base = import.meta.env?.BASE_URL ?? '/';
  const r = await fetch(`${base}levels/${encodeURIComponent(slugify(name))}.json`, { cache: 'no-store' });
  // dev servers answer unknown paths with index.html (HTTP 200), so check what actually came back
  const type = r.headers.get('content-type') ?? '';
  if (!r.ok || type.includes('text/html')) throw new Error(`Level "${name}" not found${r.ok ? '' : ` (HTTP ${r.status})`}`);
  return parseLevel(await r.text());
}

// ---------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------

/**
 * Download the level as `<slug>.level.json`.
 * @param {Level} level
 * @param {string} [filename]
 */
export function downloadLevel(level, filename = `${slugify(level.name)}.level.json`) {
  const blob = new Blob([serializeLevel(level)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Read a File (from an <input type=file> or drag & drop).
 * @param {File} file
 * @returns {Promise<{ level: Level, warnings: string[] }>}
 */
export async function readLevelFile(file) {
  return parseLevel(await file.text());
}

/**
 * Let the user pick a level file. Resolves null when the picker reports no file; a cancelled
 * picker never resolves (only `change` is listened to — docs/ai/KNOWN_ISSUES.md ED-20).
 * @returns {Promise<{ level: Level, warnings: string[], fileName: string }|null>}
 */
export function openLevelFileDialog() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      try { resolve({ ...(await readLevelFile(file)), fileName: file.name }); } catch (e) { reject(e); }
    };
    input.click();
  });
}

// ---------------------------------------------------------------------------------------------
// URL resolution (used by the game)
// ---------------------------------------------------------------------------------------------

/**
 * Resolve the level requested by a URL query:
 *   ?level=local:<slot>   browser storage (the editor's play-test uses local:__playtest__)
 *   ?level=<name>         public/levels/<name>.json
 *   (none)                null — the caller uses its built-in default level
 * @param {string} [search=location.search]
 * @returns {Promise<{ level: Level, warnings: string[], source: string }|null>}
 */
export async function resolveLevelFromURL(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search).get('level');
  if (!q) return null;
  if (q.startsWith('local:')) {
    const slot = q.slice(6);
    const r = loadLocalLevel(slot);
    if (!r) throw new Error(`No level "${slot}" in this browser's storage`);
    return { ...r, source: `local:${slot}` };
  }
  const r = await loadProjectLevel(q);
  return { ...r, source: `levels/${slugify(q)}.json` };
}
