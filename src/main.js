/**
 * Lumina HD-2D engine — game entry point. Plays a Lumina level (docs/contracts/LEVEL_EDITOR.md):
 *   (no query)              Emberfall, from public/levels/emberfall.json
 *   ?level=<name>           public/levels/<name>.json
 *   ?level=local:<slot>     a level saved in this browser (the editor's play-test uses
 *                           local:__playtest__)
 *   ?autostart=1            skips the title screen (play-tests, the headless check harness)
 * Loading problems are shown on the loading screen; normalisation warnings go to the console.
 */
import { Game } from './demo/Game.js';
import {
  resolveLevelFromURL, loadProjectLevel, saveLocalLevel, loadLocalLevel, listLocalLevels, PLAYTEST_SLOT, slugify,
} from './engine/level/LevelStorage.js';
import { validateLevel, normalizeLevel } from './engine/level/LevelFormat.js';

/** @import { Level } from './engine/level/types.js' */

const DEFAULT_LEVEL = 'emberfall';

const params = new URLSearchParams(window.location.search);
const autostart = params.has('autostart') && params.get('autostart') !== '0';
const requested = params.get('level');

const loading = document.getElementById('loading');
const bar = /** @type {HTMLElement|null} */ (loading?.querySelector('.bar > i'));
const label = loading?.querySelector('.label');
const title = loading?.querySelector('.title');

// another level than the default: don't flash the demo's name while its file loads
if (requested) {
  if (title) title.textContent = 'Lumina';
  document.title = 'Lumina HD-2D Engine';
}

/**
 * The loading screen's bar and label (Game.init reports its phases here).
 * @param {number} fraction 0…1
 * @param {string} [text]
 */
function progress(fraction, text) {
  if (bar) bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, fraction)).toFixed(3)})`;
  if (label && text) label.textContent = text;
}

/**
 * The requested level, or Emberfall.
 * @returns {Promise<{ level: Level, warnings: string[],
 *   source: string }>}
 */
async function loadLevel() {
  const fromUrl = await resolveLevelFromURL(window.location.search);
  if (fromUrl) return fromUrl;
  const r = await loadProjectLevel(DEFAULT_LEVEL);
  return { ...r, source: `levels/${DEFAULT_LEVEL}.json` };
}

/**
 * `window.__lumina` (docs/specs/AUTOMATION_API.md §4): the type of `Window.__lumina` in
 * src/globals.d.ts. Members appear in three steps (`exposeHook` below); `loadMs` is the readiness
 * signal for scripts.
 * @typedef {object} LuminaHooks
 * @property {{
 *   saveLocalLevel: typeof saveLocalLevel,
 *   loadLocalLevel: typeof loadLocalLevel,
 *   listLocalLevels: typeof listLocalLevels,
 *   loadProjectLevel: typeof loadProjectLevel,
 *   PLAYTEST_SLOT: typeof PLAYTEST_SLOT,
 * }} storage  (at boot) the browser-storage helpers of LevelStorage.js
 *   (docs/specs/LEVEL_STORAGE_API.md)
 * @property {(level: Parameters<typeof normalizeLevel>[0], slot?: string, query?: string)
 *   => string} playLocal  (at boot) normalise `level` (any, possibly partial level object), save it
 *   to browser slot `slot` (default 'test', slugified) and open `?level=local:<slot>&<query>`
 *   (default 'autostart=1') in this tab 50 ms later → the slot
 * @property {Awaited<ReturnType<typeof loadLevel>>['level']} [level]  (after the level loaded) the
 *   normalised level
 * @property {string} [source]  (after the level loaded) `levels/<slug>.json` or `local:<slot>`
 * @property {string[]} [warnings]  (after the level loaded) its normalisation warnings
 * @property {number} [loadMs]  (after warm-up) ms from navigation start to the first gameplay-ready
 *   frames (meaningless in a fixed-step run, whose page clock is virtual)
 */

/**
 * Small scripted-test hook (the check harness can't reload a page with new storage otherwise).
 * Merges `extra` into `window.__lumina` (`LuminaHooks` above; called at boot, after the level
 * loaded, after warm-up).
 * @param {Partial<LuminaHooks>} [extra]
 */
function exposeHook(extra = {}) {
  window.__lumina = {
    ...(window.__lumina ?? {}),
    storage: { saveLocalLevel, loadLocalLevel, listLocalLevels, loadProjectLevel, PLAYTEST_SLOT },
    /**
     * Save `level` (any, possibly partial, level object) to browser storage and open it in this
     * tab a moment later. Returns the slot.
     */
    playLocal(level, slot = 'test', query = 'autostart=1') {
      const s = saveLocalLevel(slot, normalizeLevel(level).level);
      const url = `${window.location.pathname}?level=local:${encodeURIComponent(s)}${query ? `&${query}` : ''}`;
      setTimeout(() => { window.location.href = url; }, 50);
      return s;
    },
    ...extra,
  };
}

async function boot() {
  exposeHook();
  progress(0.03, 'Reading the map');
  let loaded;
  try {
    loaded = await loadLevel();
  } catch (err) {
    const what = requested ? `level "${requested}"` : `the ${DEFAULT_LEVEL} level`;
    let why = err?.message ?? String(err);
    if (err instanceof SyntaxError) {
      // the dev server answers unknown paths with index.html
      const project = !requested || !requested.startsWith('local:');
      why = project && /<!doctype|Unexpected token '<'/i.test(why)
        ? `levels/${slugify(requested || DEFAULT_LEVEL)}.json does not exist`
        : `the file is not valid level JSON (${why})`;
    }
    // `levelLoad`: a user-facing loading problem (the handler below warns instead of erroring)
    const e = /** @type {Error & { levelLoad?: boolean }} */ (new Error(`Could not load ${what}: ${why}`));
    e.levelLoad = true;
    throw e;
  }
  const { level, warnings = [], source } = loaded;
  if (!level.name.trim()) level.name = 'Untitled';
  for (const w of warnings) console.warn(`[Lumina] ${source}: ${w}`);
  for (const e of validateLevel(level)) console.warn(`[Lumina] ${source}: ${e}`);
  exposeHook({ level, source, warnings });
  if (title) title.textContent = level.name;
  document.title = `${level.name} — Lumina HD-2D Engine`;

  const game = new Game({ container: document.getElementById('app'), level, source, autostart });
  await game.init(progress);
  game.start();
  // keep the loader up while the first frames (every effect on, see Game.start) are drawn, so any
  // remaining first-use shader work happens behind it
  await game.warmedUp;
  // time from navigation start to the first gameplay frame (automation / profiling)
  exposeHook({ level, source, warnings, loadMs: Math.round(performance.now()) });
  requestAnimationFrame(() => {
    if (!loading) return;
    loading.classList.add('is-done');
    setTimeout(() => loading.remove(), 900);
  });
}

/**
 * Ways out of the error screen: the demo village (unless it is what failed), the combat demo
 * (unless it is what failed) and the editor.
 */
function showErrorActions() {
  const box = loading?.querySelector('.actions');
  if (!box) return;
  const links = [];
  if (requested) links.push(['Play Emberfall', './']);
  if (requested !== 'cinderwatch-pass') links.push(['Play Cinderwatch Pass', './?level=cinderwatch-pass']);
  links.push(['Open the level editor', 'editor.html']);
  box.replaceChildren(...links.map(([text, href]) => {
    const a = document.createElement('a');
    a.textContent = text;
    a.href = href;
    return a;
  }));
}

boot().catch((err) => {
  // a missing / unreadable level is a user-facing problem (shown on the loading screen)
  if (err?.levelLoad) console.warn(`[Lumina] ${err.message}`);
  else console.error('[Lumina] failed to start:', err);
  if (label) label.textContent = err?.message ? String(err.message) : 'Something went wrong — see the console.';
  if (bar) bar.style.transform = 'scaleX(0)';
  loading?.classList.remove('is-done');
  loading?.classList.add('is-error');
  showErrorActions();
});
