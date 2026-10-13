/**
 * The display mode: whether the game's UI is laid out for a pointer at a desk or for thumbs on a
 * phone held in landscape (the mobile mode — the touch controls' own phase follows this choice).
 * Import-free and Node-safe: nothing here touches `location`, `localStorage`, `window` or `document`
 * at import time, so the level tools can import it in Node.
 *
 * The choice is resolved once per page load, as the language is (`resolveLang`): `?layout=` (not
 * saved, so a check run leaves no state) > the saved choice > 'auto'. It is one of
 * - `'auto'`    — the device decides (`detectMobileLayout`);
 * - `'desktop'` — the wide layout whatever the device;
 * - `'mobile'`  — the touch layout whatever the device;
 *
 * and the *effective* mode (`effectiveLayout`) is what the UI follows: `'mobile'` when the choice
 * is `'mobile'`, or when it is `'auto'` and the device reads as a phone. The effective mode is
 * written to `<html data-lu-layout>` — so CSS breakpoints and the check harness can read it — and
 * recomputed when the window resizes or the primary pointer changes (`startLayoutWatch`).
 *
 * Switching the choice (`setLayoutChoice`, the title screen's display row) is a hot switch: it is
 * saved and the subscribers are told, the page is not reloaded.
 */

/** localStorage key of the saved choice (the `luminati.*` storage keys, AGENTS.md). */
export const LAYOUT_KEY = 'luminati.layout';
/** The choices, in the title screen's row order. */
export const LAYOUT_MODES = Object.freeze(['auto', 'desktop', 'mobile']);
/**
 * The logical viewport width (device-independent CSS px) below which a touch device is a phone:
 * a touch laptop or a large tablet in landscape (≥ this) keeps the desktop layout.
 */
export const COMPACT_WIDTH = 900;

/** @typedef {'auto'|'desktop'|'mobile'} LayoutChoice */
/** @typedef {'desktop'|'mobile'} LayoutEffective */

/** @type {LayoutChoice} */
let choice = 'auto';
/** @type {LayoutEffective} */
let effective = 'desktop';
/** @type {Set<(mode: LayoutEffective) => void>} */
const subs = new Set();
/** @type {(() => void)|null} */
let watching = null;

/**
 * A mode from a loose value (anything else: null).
 * @param {unknown} v
 * @returns {LayoutChoice|null}
 */
export function normalizeLayout(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  return s === 'auto' || s === 'desktop' || s === 'mobile' ? s : null;
}

/**
 * True for a device that reads as a phone held in landscape: a coarse (touch) primary pointer or
 * any touch point, **and** a compact logical viewport (under `COMPACT_WIDTH`). Either signal alone
 * is not enough — a touch laptop has touch points, a large tablet has a wide viewport, and neither
 * wants a thumb layout.
 * @param {{ win?: (Window|null) }} [o] defaults: the page's window
 * @returns {boolean}
 */
export function detectMobileLayout({ win } = {}) {
  const w = win ?? (typeof window !== 'undefined' ? window : null);
  if (!w) return false;
  let touch = false;
  try {
    const nav = w.navigator;
    touch = (typeof w.matchMedia === 'function' && w.matchMedia('(pointer: coarse)').matches)
      || (nav && typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0) > 0;
  } catch { touch = false; }
  if (!touch) return false;
  const width = Number(w.innerWidth);
  return Number.isFinite(width) && width > 0 && width < COMPACT_WIDTH;
}

/**
 * The choice for this page load: `?layout=` (not saved), else the saved choice, else 'auto'.
 * @param {{ search?: string, storage?: { getItem(k: string): string|null } | null }} [o]
 *   defaults: the page's
 * @returns {LayoutChoice}
 */
export function resolveLayout({ search, storage } = {}) {
  const q = search ?? (typeof location !== 'undefined' ? location.search : '');
  try {
    const fromQuery = normalizeLayout(new URLSearchParams(q).get('layout'));
    if (fromQuery) return fromQuery;
  } catch { /* a malformed query */ }
  let st = storage;
  if (st === undefined) { try { st = typeof localStorage !== 'undefined' ? localStorage : null; } catch { st = null; } }
  try { const saved = normalizeLayout(st?.getItem(LAYOUT_KEY)); if (saved) return saved; } catch { /* storage off */ }
  return 'auto';
}

/**
 * Save `mode` as the player's choice (the title screen's display row).
 * @param {unknown} mode
 * @returns {LayoutChoice} the choice saved
 */
export function saveLayout(mode) {
  const m = normalizeLayout(mode) ?? 'auto';
  try { localStorage.setItem(LAYOUT_KEY, m); } catch { /* storage off: the choice lasts this load */ }
  return m;
}

/** The current choice ('auto' | 'desktop' | 'mobile'). @returns {LayoutChoice} */
export const layoutChoice = () => choice;

/** What the UI follows right now. @returns {LayoutEffective} */
export const effectiveLayout = () => effective;

/** True when the UI should lay out for touch. */
export const isMobileLayout = () => effective === 'mobile';

/**
 * Apply the choice: compute the effective mode, write `<html data-lu-layout>`, and tell the
 * subscribers when it changed.
 * @param {boolean} [notify]
 */
function refresh(notify = true) {
  const detected = choice === 'auto' ? detectMobileLayout() : false;
  const next = /** @type {LayoutEffective} */ (choice === 'mobile' ? 'mobile' : choice === 'desktop' ? 'desktop' : (detected ? 'mobile' : 'desktop'));
  const changed = next !== effective;
  effective = next;
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.dataset.luLayout = effective;
  if (changed && notify) for (const fn of [...subs]) fn(effective);
}

/**
 * Choose the mode (the title screen's display row): it is saved, the effective mode recomputed
 * and the subscribers told — a hot switch, the page is not reloaded.
 * @param {unknown} mode
 * @returns {LayoutChoice} the choice saved
 */
export function setLayoutChoice(mode) {
  choice = saveLayout(mode);
  refresh();
  return choice;
}

/**
 * Subscribe to a change of the effective mode; returns the unsubscribe.
 * @param {(mode: LayoutEffective) => void} fn
 * @returns {() => void}
 */
export function onLayoutChange(fn) {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

/**
 * Resolve the choice and follow the device for as long as the page lives: the window's resizes
 * (the viewport may cross the compact edge) and the primary pointer's changes. Called once at
 * boot (src/main.js); calling it again does nothing new. Returns the stop function.
 * @returns {() => void}
 */
export function startLayoutWatch() {
  if (typeof window === 'undefined') return () => {};
  if (watching) return stopLayoutWatch;
  choice = resolveLayout();
  refresh(false);
  const onResize = () => { if (choice === 'auto') refresh(); };
  window.addEventListener('resize', onResize);
  /** @type {MediaQueryList|null} */
  let mq = null;
  try { mq = typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null; } catch { mq = null; }
  const onPointer = () => { if (choice === 'auto') refresh(); };
  try { mq?.addEventListener?.('change', onPointer); } catch { /* an old engine: resizes cover it */ }
  watching = () => {
    window.removeEventListener('resize', onResize);
    try { mq?.removeEventListener?.('change', onPointer); } catch { /* nothing to remove */ }
    watching = null;
  };
  return watching;
}

/** Stop following the device (the effective mode keeps its last value). */
export function stopLayoutWatch() {
  watching?.();
  watching = null;
}
