/**
 * EditorApp — the Lumina level editor application (docs/contracts/LEVEL_EDITOR.md §6-§8): layout, menus,
 * panels, the 2D map and 3D preview views, keyboard shortcuts, clipboard, dialogs, saving /
 * loading (project folder, browser storage, files, drag & drop), autosave and play-testing.
 *
 * Exposes `window.__editor = { app, state, tools, view3d, view2d, textures, ready3d }` for scripted
 * tests (`EditorHooks`, above the class).
 */
import { TextureLibrary } from '../engine/pixel/Textures.js';
import { createEmptyLevel, validateLevel, parseLevel, tileDef, getHeightLevel } from '../engine/level/LevelFormat.js';
import { OBJECT_TYPES, ENEMY_INFO, enemyStartPoints, levelHasCombat } from '../engine/level/ObjectCatalog.js';
import {
  enemyKind, bossArena, strayArena, gateEdgeGap, GATE_EDGE_TOLERANCE, dataColliders, levelStartTest, bossExtraCount,
} from './enemyGroups.js';
import {
  PLAYTEST_SLOT, hasProjectApi, saveProjectLevel, loadProjectLevel, saveLocalLevel, loadLocalLevel,
  listLocalLevels, listProjectLevels, downloadLevel, readLevelFile, openLevelFileDialog, slugify,
} from '../engine/level/LevelStorage.js';
import { EditorState } from './EditorState.js';
import { TOOLS, getTool } from './tools/index.js';
import {
  deleteSelection, duplicateSelection, rotateSelection, copySelection, pasteObjects, boundsOfIds,
} from './tools/common.js';
import { Map2DView } from './map2d/Map2DView.js';
import { h, icon, isTypingTarget } from './ui/dom.js';
import { MenuBar } from './ui/MenuBar.js';
import { Toolbar } from './ui/Toolbar.js';
import { ToolOptions } from './ui/ToolOptions.js';
import { Inspector } from './ui/Inspector.js';
import { Outliner } from './ui/Outliner.js';
import { StatusBar } from './ui/StatusBar.js';
import { tooltip } from './ui/Tooltip.js';
import { segmented } from './ui/fields.js';
import { dialogOpen, confirmDialog, alertDialog } from './ui/Dialog.js';
import { showContextMenu, closeContextMenu } from './ui/ContextMenu.js';
import {
  newLevelDialog, openLevelDialog, saveAsDialog, levelSettingsDialog, resizeDialog, shortcutsDialog,
  restoreDialog, problemsDialog, aboutDialog, friendlyProblem,
} from './ui/dialogs.js';
import {
  writeAutosave, readAutosaveMeta, loadAutosave, clearAutosave, discardAutosave, listRecovered, loadRecovered,
  deleteRecovered, SESSION_ID,
} from './autosave.js';
import { ICONS, LOGO_SVG } from './icons.js';
import { ownValue } from '../engine/utils/own.js';

/**
 * @import { Level, LevelObjectOf } from '../engine/level/types.js'
 * @import { Viewport3D } from './viewport3d/Viewport3D.js'
 * @import * as Viewport3DModule from './viewport3d/Viewport3D.js'
 * @import { FileRef } from './EditorState.js'
 * @import { MenuCommand } from './ui/MenuBar.js'
 */

const PREFS_KEY = 'lumina.editor.prefs';
const AUTOSAVE_MS = 20000;
/** The lazy 3D view module (a Vite glob: path → loader). */
const viewport3dModules = /** @type {Record<string, () => Promise<typeof Viewport3DModule>>} */ (import.meta.glob('./viewport3d/Viewport3D.js'));

const DEG = Math.PI / 180;
/** The name of a new level (?new, File › New) until the user names it. */
const DEFAULT_NAME = 'Untitled';
const DEFAULT_NAMES = new Set(['Untitled', 'New Level', '']);

/** A stored file ref ({ kind, name }) made safe. */
function normalizeRef(ref) {
  return ref && typeof ref === 'object' && ['new', 'local', 'project', 'file'].includes(ref.kind)
    ? { kind: ref.kind, name: String(ref.name ?? '') } : { kind: 'new', name: '' };
}

/**
 * `window.__editor` (docs/specs/AUTOMATION_API.md §6), set by the EditorApp constructor for
 * scripted tests (the type of `Window.__editor` in src/globals.d.ts: a member added to that object
 * must be added here too). Wait with `await __editor.app.ready`, then `await __editor.ready3d`.
 * @typedef {object} EditorHooks
 * @property {EditorApp} app  the app: `ready`, `run(commandId)`, `openProject`, `playtest()` …
 * @property {EditorApp['state']} state  the EditorState (document, selection, tool, view, undo)
 * @property {EditorApp['tools']} tools  tool objects by id (`select`, `paint`, … tools/index.js)
 * @property {EditorApp['textures']} textures  the shared TextureLibrary
 * @property {EditorApp['view2d']} view2d  (getter) the Map2DView; null until mounted
 * @property {EditorApp['view3d']} view3d  (getter) the Viewport3D (3D preview); null until mounted
 *   or when it could not start
 * @property {Promise<void>} ready3d  (getter) resolves after `app.ready` and the 3D view's first
 *   full build
 */

export class EditorApp {
  /**
   * Also sets `window.__editor` (`EditorHooks`, above the class).
   * @param {HTMLElement} root   the element to build the editor in (replaced content)
   * @param {{ textures?: TextureLibrary, level?: Level }} [opts]
   */
  constructor(root, { textures = null, level = null } = {}) {
    this.root = root;
    /** The shared texture library (2D swatches, 2D map, 3D view). */
    this.textures = textures ?? new TextureLibrary({ seed: 1337, anisotropy: 4 });
    this.state = new EditorState(level ?? createEmptyLevel({ name: 'Untitled' }));
    this.tools = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
    /** @type {Map2DView|null} */
    this.view2d = null;
    /** @type {Viewport3D|null} */
    this.view3d = null;
    this.projectApi = false;
    this.clipboard = [];
    this._changeCount = 0;
    this._autosavedAt = 0;
    this._lastTool = getTool(this.state.toolId);

    this._loadPrefs();
    this.commands = this._buildCommands();
    this._buildLayout();
    this._wireState();
    this._wireWindow();
    this._applyLayout();

    const self = this;
    window.__editor = {
      app: this,
      state: this.state,
      tools: this.tools,
      textures: this.textures,
      get view2d() { return self.view2d; },
      get view3d() { return self.view3d; },
      /** Resolves once the first level is loaded and the 3D preview's first full build is done. */
      get ready3d() { return Promise.resolve(self.ready).then(() => self.view3d?.ready); },
    };
    this.ready = this.start();
  }

  // -------------------------------------------------------------------------------------------
  // Startup
  // -------------------------------------------------------------------------------------------

  /**
   * Resolve ?open= (project level) / ?local= (browser slot) / ?new / autosave restore. Resolves
   * when the first level is loaded and the 3D preview exists (`view3d` is set, or null when it
   * could not start; its first build is `view3d.ready` / `__editor.ready3d`).
   */
  async start() {
    const mounted = this._mount3D();
    try {
      await this._openFirst();
    } finally {
      await mounted;
    }
  }

  async _openFirst() {
    this.projectApi = await hasProjectApi().catch(() => false);
    this._updateDoc();
    const q = new URLSearchParams(location.search);
    const open = q.get('open');
    const local = q.get('local');
    try {
      // (an autosave of another session is never overwritten unresolved: this session's first
      // autosave moves it to the recovered copies — see autosave.js)
      if (open) {
        const ok = await this.openProject(open, { confirm: false });
        if (ok) await this._offerRestore({ kind: 'project', name: slugify(open) });
        return;
      }
      if (local) {
        const ok = await this.openLocal(local, { confirm: false });
        if (ok) await this._offerRestore({ kind: 'local', name: local });
        return;
      }
      if (q.has('new')) { this._startBlank(); return; }
      if (await this._offerRestore(null)) return;
      this._startBlank();
    } catch (e) {
      console.warn('[editor] startup:', e);
      this._startBlank();
      alertDialog({ title: 'Could not open the level', message: String(e?.message ?? e), icon: ICONS.warning });
    }
  }

  _startBlank() {
    this.state.replaceLevel(createEmptyLevel({ name: DEFAULT_NAME }), { kind: 'new', name: '' });
    this._updateDoc();
  }

  /**
   * Offer to restore the autosaved working copy of an earlier session. `only` = a file ref: only
   * offer a copy of that level (after `?open=` / `?local=`). Resolves true when it was restored.
   */
  async _offerRestore(only) {
    const meta = readAutosaveMeta();
    if (!meta || meta.sid === SESSION_ID || meta.exported) return false;
    const ref = normalizeRef(meta.fileRef);
    if (only && !(ref.kind === only.kind && ref.name === only.name)) return false;
    const older = listRecovered().filter((e) => !e.exported).length;
    const restore = await restoreDialog(meta, { older, reopened: !!only });
    if (restore === true) {
      const r = loadAutosave();
      if (!r) { this.state.notify('The autosaved copy could not be read'); return false; }
      // the copy now lives in this editor (and in this session's own autosave from here on)
      discardAutosave();
      this._replaceDoc(r.level, ref, { unsaved: true });
      this.state.notify(`Restored the autosaved “${r.level.name}”`);
      return true;
    }
    // an explicit "Discard"; closing the dialog (Esc / ×) keeps the copy (it moves to
    // File › Open › This browser › Recovered once this session autosaves)
    if (restore === false) discardAutosave();
    return false;
  }

  /** Open a recovered copy of another session's unsaved work (File › Open › This browser). */
  async openRecovered(id, { confirm = true } = {}) {
    const entry = listRecovered().find((e) => e.id === id);
    const r = loadRecovered(id);
    if (!entry || !r) { alertDialog({ title: 'Could not open the copy', message: 'The recovered copy is no longer in this browser\'s storage.', icon: ICONS.warning }); return false; }
    if (confirm && !(await this.confirmDiscard('open the recovered copy'))) return false;
    this._replaceDoc(r.level, normalizeRef(entry.fileRef), { unsaved: true });
    deleteRecovered(id);
    this.state.notify(`Opened the recovered copy of “${r.level.name}” — save it to keep it`);
    return true;
  }

  /**
   * Make `level` the document (new / open / paste / restore): clears history, resets the tools,
   * and resolves this session's autosave (the old document was saved or discarded).
   * @param {Level} level
   * @param {FileRef} [fileRef]
   * @param {{ unsaved?: boolean }} [opts] unsaved: the level is not saved anywhere (restored,
   *   pasted): it stays dirty and is autosaved at once
   */
  _replaceDoc(level, fileRef, { unsaved = false } = {}) {
    this.state.replaceLevel(level, fileRef);
    this._newerFile = null;
    clearAutosave();
    this._autosavedAt = this._changeCount;
    this._autosaveFailed = false;
    if (unsaved) {
      this.state.markUnsaved();
      this._autosave(true);
    }
    this._updateDoc();
  }

  async _mount3D() {
    const slot = this.vp3dHost;
    const load = viewport3dModules['./viewport3d/Viewport3D.js'];
    if (!load) { this._placeholder3D('The 3D preview module is not installed yet.'); return; }
    try {
      const mod = await load();
      if (typeof mod.Viewport3D !== 'function') throw new Error('Viewport3D.js does not export a Viewport3D class');
      // Retry after a late failure: release the previous instance (GL context, listeners) first
      if (this.view3d) { try { this.view3d.dispose?.(); } catch { /* already broken */ } this.view3d = null; }
      this.view3d = new mod.Viewport3D(slot, this.state, { textures: this.textures });
      this.view3d.setActive?.(this.state.view.layout !== '2d');
      // the 2D map's enemy start dots use the 3D view's start test (every prop's and villager's
      // collider; its level-data form while the view is hidden), and follow it when it changes
      // (lazy: while a build of the document is due, the 2D map's own data test until it lands)
      const v3 = this.view3d;
      if (this.view2d) this.view2d.startTestSource = (flier) => (this.view3d === v3 ? v3.enemyStartTest?.(flier, { lazy: true }) ?? null : null);
      v3.onPlacementChange = () => { if (this.view3d === v3) this.view2d?.placementChanged(); };
      Promise.resolve(this.view3d.ready).then(() => {
        this.vp3d.classList.add('is-ready');
        this._watch3DBuild();
      }).catch((e) => { console.warn('[editor] 3D view:', e); this._set3DLoading(false); });
      this._resizeViews();
    } catch (e) {
      console.warn('[editor] 3D preview unavailable:', e);
      this.view3d = null;
      this._placeholder3D(`The 3D preview could not start: ${e?.message ?? e}`);
    }
  }

  _placeholder3D(message) {
    this.vp3dHost.replaceChildren(h('div', { class: 'le-vp-placeholder' },
      icon(ICONS.cube, 'le-icon le-vp-placeholder-icon'),
      h('div', { class: 'le-vp-placeholder-title' }, '3D preview unavailable'),
      h('div', { class: 'le-vp-placeholder-text' }, message, ' The 2D map is fully editable on its own.'),
      h('div', { class: 'le-vp-placeholder-actions' },
        h('button', { class: 'le-btn is-small', type: 'button', onClick: () => { this.vp3dHost.replaceChildren(); this._mount3D(); } }, 'Retry'),
        h('button', { class: 'le-btn is-small', type: 'button', onClick: () => this.state.setView({ layout: '2d' }) }, icon(ICONS.layout2d), '2D only'))));
  }

  // -------------------------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------------------------

  _buildLayout() {
    const st = this.state;
    this.root.replaceChildren();
    this.root.classList.add('le-app');

    // ---- menu bar
    this.menubarEl = h('header', { class: 'le-menubar' });
    const brand = h('div', { class: 'le-brand', title: 'Lumina Level Editor' }, h('span', { class: 'le-brand-logo', html: LOGO_SVG }), h('span', { class: 'le-brand-name' }, 'Lumina'), h('span', { class: 'le-brand-sub' }, 'Level Editor'));
    this.menubarEl.appendChild(brand);
    this.menubar = new MenuBar(this.menubarEl, { menus: this._menus(), commands: this.commands, run: (id) => this.run(id) });

    // the level's display name (title screen, banner): click to rename / edit the settings
    this.docNameText = h('span', { class: 'le-doc-name-text' });
    this.docName = h('button', { class: 'le-doc-name', type: 'button', onClick: () => this.run('level.settings') }, this.docNameText, icon(ICONS.pencil, 'le-icon le-doc-name-edit'));
    tooltip(this.docName, { title: 'Rename · level settings', text: 'The level name is shown on the title screen and in the banner. Also: subtitle, environment, camera and water.', place: 'bottom' });
    this.dirtyDot = h('span', { class: 'le-dirty-dot', title: 'Unsaved changes' });
    this.docWhere = h('span', { class: 'le-doc-where' });
    this.menubarEl.appendChild(h('div', { class: 'le-doc' }, this.docName, this.dirtyDot, this.docWhere));

    const undoBtn = h('button', { class: 'le-icon-btn', type: 'button', onClick: () => this.run('edit.undo') }, icon(ICONS.undo));
    const redoBtn = h('button', { class: 'le-icon-btn', type: 'button', onClick: () => this.run('edit.redo') }, icon(ICONS.redo));
    tooltip(undoBtn, () => ({ title: st.canUndo ? `Undo ${st.undoLabel}` : 'Nothing to undo', key: 'Ctrl+Z', place: 'bottom' }));
    tooltip(redoBtn, () => ({ title: st.canRedo ? `Redo ${st.redoLabel}` : 'Nothing to redo', key: 'Ctrl+Y', place: 'bottom' }));
    this.undoBtn = undoBtn;
    this.redoBtn = redoBtn;
    this.layoutSeg = segmented({
      options: [
        { value: 'split', icon: ICONS.layoutSplit, label: '3D + 2D', iconOnly: true, title: '3D + 2D map (1)' },
        { value: '3d', icon: ICONS.layout3d, label: '3D', iconOnly: true, title: '3D only (2)' },
        { value: '2d', icon: ICONS.layout2d, label: '2D', iconOnly: true, title: '2D map only (3)' },
      ],
      value: st.view.layout, onChange: (v) => st.setView({ layout: v }), small: true, className: 'le-layout-seg',
    });
    const playBtn = h('button', { class: 'le-play-btn', type: 'button', onClick: () => this.run('level.playtest') }, icon(ICONS.play), h('span', null, 'Play'));
    tooltip(playBtn, { title: 'Play-test this level', key: 'F5', text: 'Validates, saves to the play-test slot and opens the game in a new tab.', place: 'bottom' });
    this.menubarEl.appendChild(h('div', { class: 'le-menubar-right' }, undoBtn, redoBtn, h('span', { class: 'le-vsep' }), this.layoutSeg.el, h('span', { class: 'le-vsep' }), playBtn));

    // ---- main area
    const left = h('div', { class: 'le-left' });
    this.toolbar = new Toolbar(left, st);
    this.toolOptions = new ToolOptions(left, st, { textures: this.textures });

    this.vp3dHost = h('div', { class: 'le-vp-host' });
    this.vp2dHost = h('div', { class: 'le-vp-host' });
    // "Building the 3D preview…" until the first full build is on screen (and during big loads)
    this.vp3dLoading = h('div', { class: 'le-vp-loading is-on', role: 'status' }, h('span', { class: 'le-spinner' }), h('span', { class: 'le-vp-loading-text' }, 'Building the 3D preview…'));
    this.vp3d = h('section', { class: 'le-vp le-vp3d', 'aria-label': '3D preview' }, this.vp3dHost, this.vp3dLoading,
      h('div', { class: 'le-vp-bar' }, h('span', { class: 'le-vp-title' }, icon(ICONS.cube), h('span', { class: 'le-vp-title-text' }, '3D Preview')), this._build3DTools()));
    const zoomLabel = h('span', { class: 'le-vp-zoom' });
    this._zoomLabel = zoomLabel;
    const vpBtn = (ic, title, key, fn, cls = '') => {
      const b = h('button', { class: ['le-vp-btn', cls], type: 'button', 'aria-label': title, onClick: fn }, icon(ic));
      tooltip(b, { title, key, place: 'bottom' });
      return b;
    };
    this.gridBtn = vpBtn(ICONS.grid, 'Grid', 'Ctrl+G', () => this.run('view.grid'));
    this.texBtn = vpBtn(ICONS.texture, 'Textured map', '', () => this.run('view.textured2d'));
    this.vp2d = h('section', { class: 'le-vp le-vp2d', 'aria-label': '2D map' }, this.vp2dHost,
      h('div', { class: 'le-vp-bar' },
        h('span', { class: 'le-vp-title' }, icon(ICONS.map), h('span', { class: 'le-vp-title-text' }, '2D Map')),
        h('span', { class: 'le-vp-tools' },
          this.gridBtn, this.texBtn,
          h('span', { class: 'le-vp-sep' }),
          h('span', { class: 'le-vp-zoomgroup' },
            vpBtn(ICONS.minus, 'Zoom out', '', () => this.view2d?.zoomBy(1 / 1.4)),
            zoomLabel,
            vpBtn(ICONS.plus, 'Zoom in', '', () => this.view2d?.zoomBy(1.4))),
          vpBtn(ICONS.frame, 'Frame level', 'Home', () => this.run('view.frameLevel')))));
    this.splitter = h('div', { class: 'le-splitter', role: 'separator', 'aria-orientation': 'vertical', title: 'Drag to resize · double-click to reset' });
    this.viewports = h('div', { class: 'le-viewports' }, this.vp3d, this.splitter, this.vp2d);
    const center = h('main', { class: 'le-center' }, this.viewports);

    const right = h('div', { class: 'le-right' });
    const actions = {
      focus: (ids) => this.focusIds(ids),
      duplicate: () => this.run('edit.duplicate'),
      remove: () => this.run('edit.delete'),
      rotate: (deg) => rotateSelection(st, deg * DEG),
      settings: () => this.run('level.settings'),
      resize: () => this.run('level.resize'),
      playtest: () => this.run('level.playtest'),
    };
    this.inspector = new Inspector(right, st, actions);
    this.rightSplitter = h('div', { class: 'le-hsplitter', role: 'separator', 'aria-orientation': 'horizontal', title: 'Drag to resize' });
    right.appendChild(this.rightSplitter);
    this.outliner = new Outliner(right, st, actions);

    this.main = h('div', { class: 'le-main' }, left, center, right);
    this.root.append(this.menubarEl, this.main);
    this.statusbar = new StatusBar(this.root, st);

    this.dropOverlay = h('div', { class: 'le-drop-overlay' }, h('div', { class: 'le-drop-card' }, icon(ICONS.upload, 'le-icon le-drop-icon'), h('div', null, 'Drop a level .json to open it')));
    this.root.appendChild(this.dropOverlay);
    this.loadingOverlay = h('div', { class: 'le-loading-overlay', role: 'status' }, h('div', { class: 'le-drop-card' }, h('span', { class: 'le-spinner' }), h('div', { class: 'le-loading-text' }, 'Loading…')));
    this.root.appendChild(this.loadingOverlay);
    // a mouse click leaves no focus on buttons outside dialogs: Enter / Space then never
    // re-trigger the last clicked toolbar button, and shortcuts reach the views
    this.root.addEventListener('click', (e) => {
      if (e.detail === 0) return; // keyboard activation keeps the focus
      const b = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest?.('button, [role="radio"], input[type="checkbox"], input[type="range"]'));
      if (b && this.root.contains(b)) setTimeout(() => { if (document.activeElement === b) b.blur(); }, 0);
    });

    // views
    this.view2d = new Map2DView(this.vp2dHost, st, { textures: this.textures });
    this._bindSplitters();
    this.vp2d.addEventListener('le-zoom', (e) => this._setZoomLabel(/** @type {CustomEvent} */ (e).detail.zoom));
    this.root.addEventListener('le-focus', (e) => this.focusIds([/** @type {CustomEvent} */ (e).detail.id]));
    this.root.addEventListener('le-contextmenu', (e) => this._contextMenu(/** @type {CustomEvent} */ (e).detail));
    this._setZoomLabel(this.view2d.zoomPercent);
  }

  /** The 3D bar's tools: preview time of day (follows the level's start time) and the camera help. */
  _build3DTools() {
    const st = this.state;
    const range = h('input', { class: 'le-range le-time-range', type: 'range', min: '0', max: '24', step: '0.25', 'aria-label': 'Preview time of day' });
    const label = h('span', { class: 'le-vp-time' });
    const link = h('button', { class: 'le-vp-btn le-time-link', type: 'button', 'aria-label': 'Follow the level start time' }, icon(ICONS.link));
    tooltip(link, () => ({ title: st.view.timeFollow !== false ? 'Following the level start time' : 'Follow the level start time', text: 'The preview shows the level at its start time (Level settings › Start time). Drag the slider to preview another hour.', place: 'top' }));
    range.addEventListener('input', () => st.setView({ timeOfDay: Number(range.value), timeFollow: false }));
    // mouse users go back to the views: the slider must not keep the keyboard
    range.addEventListener('pointerup', () => setTimeout(() => range.blur(), 0));
    range.addEventListener('change', () => { if (document.activeElement === range && !range.matches(':focus-visible')) range.blur(); });
    link.addEventListener('click', () => st.setView({ timeFollow: true, timeOfDay: Number(st.level.environment?.timeOfDay ?? 17.2) }));
    const help = h('button', { class: 'le-vp-btn', type: 'button', 'aria-label': '3D view controls' }, icon(ICONS.help));
    tooltip(help, { title: '3D view controls', text: 'Right-drag: orbit · Middle-drag, Shift+right-drag or Space+drag: pan · Wheel: zoom · F / double-click: focus · Hold the right button + WASD / QE: fly · Game camera: Q / E rotate', place: 'top' });
    help.addEventListener('click', () => this.run('help.shortcuts'));
    this._timeUI = { range, label, link };
    this._syncTimeUI();
    return h('span', { class: 'le-vp-tools le-vp-timegroup' }, icon(ICONS.sun, 'le-icon le-vp-time-icon'), range, label, link, h('span', { class: 'le-vp-sep' }), help);
  }

  _syncTimeUI() {
    const t = this._timeUI;
    if (!t) return;
    const v = this.state.view;
    const hour = Number(v.timeOfDay ?? 14);
    if (document.activeElement !== t.range) t.range.value = String(hour);
    t.range.style.setProperty('--k', `${(hour / 24) * 100}%`);
    const hh = Math.floor(hour) % 24;
    const mm = Math.round((hour - Math.floor(hour)) * 60);
    t.label.textContent = `${String(hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`;
    t.link.classList.toggle('is-active', v.timeFollow !== false);
  }

  /** Preview time = the level's start time while following it (on load and settings edits). */
  _followLevelTime() {
    const st = this.state;
    if (st.view.timeFollow === false) return;
    const t = Number(st.level.environment?.timeOfDay);
    if (Number.isFinite(t) && t !== st.view.timeOfDay) st.setView({ timeOfDay: t });
  }

  _set3DLoading(on, text = 'Building the 3D preview…') {
    if (!this.vp3dLoading) return;
    this.vp3dLoading.lastChild.textContent = text;
    this.vp3dLoading.classList.toggle('is-on', !!on);
  }

  /** Keep the 3D loading overlay up until the view equals a full build (or a few seconds pass). */
  _watch3DBuild(maxMs = 12000) {
    const t0 = performance.now();
    clearInterval(this._buildWatch);
    this._buildWatch = setInterval(() => {
      const v = this.view3d;
      const busy = v && (v.terrain?.pendingChunks?.size > 0 || v.terrain?.slicing || v.props?.hasPendingExact || v.scenery?.pending || v.scenery?.building);
      if (!busy || performance.now() - t0 > maxMs) {
        clearInterval(this._buildWatch);
        this._set3DLoading(false);
      }
    }, 120);
  }

  /**
   * Run `fn` (a level replacement) under a loading overlay: big levels block the page while the
   * views rebuild, so the overlay is painted first (two frames) and removed once the 3D preview
   * built them.
   */
  async _withLoading(text, fn, level = null) {
    const L = level ?? this.state.level;
    const big = (L?.width ?? 0) * (L?.depth ?? 0) > 72 * 72 || (L?.objects?.length ?? 0) > 300;
    if (!big) { fn(); return; }
    this.loadingOverlay.querySelector('.le-loading-text').textContent = text;
    this.loadingOverlay.classList.add('is-on');
    this._set3DLoading(true, text);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      fn();
    } finally {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      this.loadingOverlay.classList.remove('is-on');
      if (this.view3d && this.state.view.layout !== '2d') this._watch3DBuild(8000);
      else this._set3DLoading(false);
    }
  }

  _setZoomLabel(z) {
    this._zoomLabel.textContent = `${z}%`;
    this.statusbar?.setZoom(z);
  }

  _bindSplitters() {
    const st = this.state;
    this.splitter.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.splitter.setPointerCapture(e.pointerId);
      this.splitter.classList.add('is-dragging');
      this._splitDragging = true;
      // the 3D drawing buffer follows the drag ~10× a second (CSS stretches it in between)
      this.view3d?.setResizeThrottle?.(100);
      const r = this.viewports.getBoundingClientRect();
      const move = (ev) => {
        const k = Math.max(0.2, Math.min(0.8, (ev.clientX - r.left) / r.width));
        st.setView({ split: Math.round(k * 1000) / 1000 });
      };
      const up = () => {
        this.splitter.classList.remove('is-dragging');
        this._splitDragging = false;
        this.view3d?.setResizeThrottle?.(0);
        this.splitter.removeEventListener('pointermove', move);
        this.splitter.removeEventListener('pointerup', up);
        this.splitter.removeEventListener('pointercancel', up);
        this._savePrefs();
      };
      this.splitter.addEventListener('pointermove', move);
      this.splitter.addEventListener('pointerup', up);
      this.splitter.addEventListener('pointercancel', up);
    });
    this.splitter.addEventListener('dblclick', () => { st.setView({ split: 0.6 }); this._savePrefs(); });

    const right = this.rightSplitter.parentElement;
    this.rightSplitter.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.rightSplitter.setPointerCapture(e.pointerId);
      this.rightSplitter.classList.add('is-dragging');
      const r = right.getBoundingClientRect();
      const move = (ev) => {
        const k = Math.max(0.25, Math.min(0.85, (ev.clientY - r.top) / r.height));
        this.prefs.inspector = k;
        right.style.setProperty('--insp', `${k * 100}%`);
      };
      const up = () => {
        this.rightSplitter.classList.remove('is-dragging');
        this.rightSplitter.removeEventListener('pointermove', move);
        this.rightSplitter.removeEventListener('pointerup', up);
        this._savePrefs();
      };
      this.rightSplitter.addEventListener('pointermove', move);
      this.rightSplitter.addEventListener('pointerup', up);
    });
    if (this.prefs.inspector) right.style.setProperty('--insp', `${this.prefs.inspector * 100}%`);
  }

  _applyLayout() {
    const v = this.state.view;
    this.root.dataset.layout = v.layout;
    this.viewports.style.setProperty('--split', `${(v.split ?? 0.6) * 100}%`);
    this.layoutSeg.set(v.layout);
    this.gridBtn.classList.toggle('is-active', v.grid !== false);
    this.texBtn.classList.toggle('is-active', v.textured2d !== false);
    this.view2d?.setActive(v.layout !== '3d');
    const was3d = this.view3d?.active;
    this.view3d?.setActive?.(v.layout !== '2d');
    // the 2D map's enemy start dots switch between the 3D view's built test and its level-data
    // test (the same rule; see Viewport3D.enemyStartTest)
    if (this.view3d && was3d !== this.view3d.active) this.view2d?.placementChanged();
    this._resizeViews();
  }

  _resizeViews() {
    // coalesced: at most one resize pass per frame, however many layout events came in
    if (this._resizeQueued) return;
    this._resizeQueued = true;
    requestAnimationFrame(() => {
      this._resizeQueued = false;
      this.view2d?.resize();
      try { this.view3d?.resize?.(); } catch (e) { console.warn('[editor] 3D resize:', e); }
    });
  }

  // -------------------------------------------------------------------------------------------
  // State wiring
  // -------------------------------------------------------------------------------------------

  _wireState() {
    const st = this.state;
    st.on('tool', (id) => {
      const next = getTool(id);
      if (this._lastTool && this._lastTool !== next) {
        try { this._lastTool.deactivate?.(st); } catch (e) { console.warn('[editor] tool deactivate:', e); }
      }
      this._lastTool = next;
      try { next.activate?.(st); } catch (e) { console.warn('[editor] tool activate:', e); }
      st.emit('preview');
    });
    st.on('view', (v) => {
      this._applyLayout();
      this._syncTimeUI();
      if (!this._splitDragging) this._savePrefs();
    });
    st.on('dirty', () => this._updateDoc());
    st.on('history', () => this._updateHistory());
    st.on('change', (info) => {
      this._changeCount++;
      if (info.meta || info.source === 'load') { this._updateDoc(); this._followLevelTime(); }
      if (info.source === 'load') {
        // a new document: drop half-finished tool gestures (a pending fence start point…)
        const tool = getTool(st.toolId);
        try { tool.deactivate?.(st); tool.activate?.(st); } catch (e) { console.warn('[editor] tool reset:', e); }
      }
    });
    this._updateHistory();
    this._updateDoc();
    this._lastTool.activate?.(st);
  }

  _updateHistory() {
    const st = this.state;
    this.undoBtn.disabled = !st.canUndo;
    this.redoBtn.disabled = !st.canRedo;
  }

  /** Level name, unsaved dot, save location and the document title. */
  _updateDoc() {
    const st = this.state;
    const ref = st.fileRef;
    const name = st.level.name || 'Untitled';
    this.docNameText.textContent = name;
    this.dirtyDot.classList.toggle('is-on', st.dirty);
    this.dirtyDot.classList.toggle('is-warn', st.dirty && !!this._autosaveFailed);
    this.dirtyDot.title = st.dirty && this._autosaveFailed ? 'Unsaved changes — autosave failed (browser storage full): save your level' : 'Unsaved changes';
    this.root.classList.toggle('is-dirty', st.dirty);
    const where = ref.kind === 'project' ? `public/levels/${ref.name}.json`
      : ref.kind === 'local' ? `browser · ${ref.name}`
        : ref.kind === 'file' ? `file · ${ref.name}` : 'not saved yet';
    this.docWhere.textContent = where;
    this.docWhere.className = `le-doc-where is-${ref.kind}`;
    document.title = `${st.dirty ? '● ' : ''}${name} — Lumina Level Editor`;
  }

  // -------------------------------------------------------------------------------------------
  // Window-level input: keyboard, clipboard, drag & drop, unload, autosave
  // -------------------------------------------------------------------------------------------

  _wireWindow() {
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    document.addEventListener('copy', (e) => this._onCopy(e, false));
    document.addEventListener('cut', (e) => this._onCopy(e, true));
    document.addEventListener('paste', (e) => this._onPaste(e));
    window.addEventListener('beforeunload', (e) => {
      if (!this.state.dirty) return;
      this._autosave(true);
      e.preventDefault();
      e.returnValue = '';
    });
    // drag & drop a level file anywhere
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; depth++; this.dropOverlay.classList.add('is-on'); });
    window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) this.dropOverlay.classList.remove('is-on'); });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      this.dropOverlay.classList.remove('is-on');
      const file = [...e.dataTransfer.files].find((f) => /\.json$/i.test(f.name) || f.type.includes('json')) ?? e.dataTransfer.files[0];
      if (file) this.openFile(file);
    });
    this._autosaveTimer = setInterval(() => this._autosave(), AUTOSAVE_MS);
    window.addEventListener('resize', () => this._resizeViews());
  }

  _autosave(force = false) {
    const st = this.state;
    if (!st.dirty || st.inTransaction) return;
    if (!force && this._autosavedAt === this._changeCount) return;
    if (writeAutosave(st.level, st.fileRef)) {
      this._autosavedAt = this._changeCount;
      if (this._autosaveFailed) { this._autosaveFailed = false; this._updateDoc(); }
      return;
    }
    // storage full / unavailable: the tab-close warning still works, but a crash would lose the
    // work — say so once per unsaved period (and keep a warning next to the unsaved dot)
    this._autosavedAt = this._changeCount;
    if (!this._autosaveFailed) {
      this._autosaveFailed = true;
      this._updateDoc();
      st.notify('Autosave failed — browser storage is full or unavailable. Save your level (Ctrl+S).');
    }
  }

  _onKeyDown(e) {
    if (e.defaultPrevented || e.isComposing) return;
    if (dialogOpen() || this.menubar.isOpen) return;
    const combo = comboOf(e);
    const typing = isTypingTarget(e.target) || isTypingTarget(document.activeElement);
    if (typing) {
      // a few app shortcuts still work while typing; the field commits first
      if (['Ctrl+S', 'Ctrl+Shift+S', 'F5'].includes(combo)) {
        e.preventDefault();
        /** @type {HTMLElement|null} */ (document.activeElement)?.blur?.();
        this.run(this.shortcutIndex.get(combo));
      }
      return;
    }
    // a focused slider keeps its own keyboard control (arrows / Home / End / Page keys)
    const focused = /** @type {HTMLInputElement|null} */ (document.activeElement);
    if (focused?.tagName === 'INPUT' && focused.type === 'range' && /^(Arrow|Home$|End$|Page)/.test(e.key) && !e.ctrlKey && !e.metaKey) return;
    const st = this.state;
    if (st.inTransaction) {
      // mid-stroke (a drag on the map, a slider): only the active tool may react (Esc cancels a
      // move); commands would be folded into the stroke's undo step
      const tool = getTool(st.toolId);
      let handled = false;
      try { handled = !!tool.keyDown?.(e, st); } catch (err) { console.warn('[editor] tool key:', err); }
      if (!handled && e.key === 'Escape') {
        // Esc aborts the stroke: restore the level as it was and reset the tool's stroke state
        st.cancel();
        try { tool.deactivate?.(st); tool.activate?.(st); } catch (err) { console.warn('[editor] tool reset:', err); }
        st.emit('preview');
        st.notify('Cancelled');
        handled = true;
      }
      if (handled || e.ctrlKey || e.metaKey || /^F\d+$/.test(e.key)) e.preventDefault();
      return;
    }
    // copy / cut / paste go through the DOM clipboard events
    if (['Ctrl+C', 'Ctrl+X', 'Ctrl+V'].includes(combo)) return;
    const cmd = this.shortcutIndex.get(combo);
    const appFirst = cmd && (/^Ctrl\+/.test(combo) && !['Ctrl+D', 'Ctrl+R', 'Ctrl+Shift+R'].includes(combo) || /^F\d+$/.test(combo));
    if (appFirst) { e.preventDefault(); this.run(cmd); return; }
    // the active tool (Esc, R, Delete, Ctrl+D, arrows…)
    const tool = getTool(st.toolId);
    let handled = false;
    try { handled = !!tool.keyDown?.(e, st); } catch (err) { console.warn('[editor] tool key:', err); }
    if (handled) { e.preventDefault(); return; }
    if (cmd) { e.preventDefault(); this.run(cmd); return; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = TOOLS.find((x) => x.shortcut.toLowerCase() === e.key.toLowerCase());
      if (t) { e.preventDefault(); st.setTool(t.id); return; }
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[e.key] && st.selection.length) {
        e.preventDefault();
        const s = e.shiftKey ? 2 : 0.5;
        st.moveObjects(st.selection, arrows[e.key][0] * s, arrows[e.key][1] * s, 'Nudge');
      }
    }
  }

  _onCopy(e, cut) {
    if (isTypingTarget(document.activeElement) || dialogOpen()) return;
    const objs = copySelection(this.state);
    if (!objs.length) return;
    e.preventDefault();
    this.clipboard = objs;
    try { e.clipboardData.setData('text/plain', JSON.stringify({ format: 'lumina-objects', objects: objs }, null, 1)); } catch { /* internal clipboard only */ }
    if (cut) deleteSelection(this.state);
    this.state.notify(`${cut ? 'Cut' : 'Copied'} ${objs.length} object${objs.length === 1 ? '' : 's'}`);
  }

  _onPaste(e) {
    if (isTypingTarget(document.activeElement) || dialogOpen()) return;
    let objs = null;
    try {
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (text.trim().startsWith('{')) {
        const data = JSON.parse(text);
        if (data?.format === 'lumina-objects' && Array.isArray(data.objects)) objs = data.objects;
        else if (data?.format === 'lumina-level') {
          e.preventDefault();
          // a whole level replaces the document: ask about unsaved changes first; the pasted
          // level is not saved anywhere, so it stays marked unsaved
          this._openParsed(() => parseLevel(data), { kind: 'new', name: '' }, 'the clipboard', { confirm: true, unsaved: true });
          return;
        }
      }
    } catch { objs = null; }
    objs ??= this.clipboard;
    if (!objs?.length) return;
    e.preventDefault();
    this.paste(objs);
  }

  /** Paste objects at the pointer (when it is over a view) or offset from the originals. */
  paste(objs = this.clipboard) {
    if (!objs?.length) { this.state.notify('The clipboard is empty'); return; }
    const hv = this.state.hover;
    const added = pasteObjects(this.state, objs, hv ? { x: hv.x, z: hv.z } : null);
    this.state.notify(`Pasted ${added.length} object${added.length === 1 ? '' : 's'}`);
  }

  // -------------------------------------------------------------------------------------------
  // Commands, menus, shortcuts
  // -------------------------------------------------------------------------------------------

  _buildCommands() {
    const st = this.state;
    const v = () => st.view;
    const hasSel = () => st.selection.length > 0;
    const hasObjSel = () => st.selectedObjects.length > 0;
    const toggleView = (k) => () => st.setView({ [k]: !(v()[k] !== false) });
    /** @type {Record<string, MenuCommand>} */
    const c = {
      'file.new': { label: 'New level…', shortcut: 'Ctrl+N', icon: ICONS.newFile, run: () => this.newLevel() },
      'file.open': { label: 'Open…', shortcut: 'Ctrl+O', icon: ICONS.open, run: () => this.openDialog() },
      'file.openFile': { label: 'Open file from disk…', icon: ICONS.file, run: () => this.openFromDisk() },
      'file.save': { label: 'Save', shortcut: 'Ctrl+S', icon: ICONS.save, run: () => this.save() },
      'file.saveAs': { label: 'Save as…', shortcut: 'Ctrl+Shift+S', icon: ICONS.saveAs, run: () => this.saveAs() },
      'file.export': { label: 'Download .json', shortcut: 'Ctrl+E', icon: ICONS.download, run: () => this.exportFile(), hint: 'Download a copy of the level as a file' },
      'file.playtest': { label: 'Play-test', shortcut: 'F5', icon: ICONS.play, run: () => this.playtest() },

      'edit.undo': { label: () => (st.canUndo ? `Undo ${st.undoLabel}` : 'Undo'), shortcut: 'Ctrl+Z', icon: ICONS.undo, enabled: () => st.canUndo, run: () => st.undo() },
      'edit.redo': { label: () => (st.canRedo ? `Redo ${st.redoLabel}` : 'Redo'), shortcut: 'Ctrl+Y', icon: ICONS.redo, enabled: () => st.canRedo, run: () => st.redo() },
      'edit.redo2': { label: 'Redo', shortcut: 'Ctrl+Shift+Z', run: () => st.redo(), enabled: () => st.canRedo },
      'edit.cut': { label: 'Cut', shortcut: 'Ctrl+X', icon: ICONS.cut, enabled: hasObjSel, run: () => { this.clipboard = copySelection(st); this._writeSystemClipboard(this.clipboard); deleteSelection(st); } },
      'edit.copy': { label: 'Copy', shortcut: 'Ctrl+C', icon: ICONS.copy, enabled: hasObjSel, run: () => { this.clipboard = copySelection(st); this._writeSystemClipboard(this.clipboard); st.notify(`Copied ${this.clipboard.length} object${this.clipboard.length === 1 ? '' : 's'}`); } },
      'edit.paste': { label: 'Paste', shortcut: 'Ctrl+V', icon: ICONS.paste, enabled: () => this.clipboard.length > 0, run: () => this.paste() },
      'edit.duplicate': { label: 'Duplicate', shortcut: 'Ctrl+D', icon: ICONS.duplicate, enabled: hasObjSel, run: () => duplicateSelection(st) },
      'edit.delete': { label: 'Delete', shortcut: 'Delete', icon: ICONS.trash, enabled: hasObjSel, run: () => deleteSelection(st) },
      'edit.rotateCcw': { label: 'Rotate +90°', shortcut: 'Ctrl+R', icon: ICONS.rotateCcw, enabled: hasSel, run: () => rotateSelection(st, 90 * DEG) },
      'edit.rotateCw': { label: 'Rotate −90°', shortcut: 'Ctrl+Shift+R', icon: ICONS.rotate, enabled: hasSel, run: () => rotateSelection(st, -90 * DEG) },
      'edit.selectAll': { label: 'Select all objects', shortcut: 'Ctrl+A', icon: ICONS.selectAll, run: () => this.selectAll() },
      'edit.deselect': { label: 'Deselect', shortcut: 'Escape', enabled: hasSel, run: () => st.clearSelection() },

      'view.split': { label: '3D + 2D map', shortcut: '1', icon: ICONS.layoutSplit, checked: () => v().layout === 'split', run: () => st.setView({ layout: 'split' }) },
      'view.3d': { label: '3D only', shortcut: '2', icon: ICONS.layout3d, checked: () => v().layout === '3d', run: () => st.setView({ layout: '3d' }) },
      'view.2d': { label: '2D map only', shortcut: '3', icon: ICONS.layout2d, checked: () => v().layout === '2d', run: () => st.setView({ layout: '2d' }) },
      'view.frameSelection': { label: 'Frame selection', shortcut: 'F', icon: ICONS.focus, enabled: hasSel, run: () => this.focusIds(st.selection) },
      'view.frameLevel': { label: 'Frame level', shortcut: 'Home', icon: ICONS.frame, run: () => { this.view2d?.frameLevel(); this.view3d?.frameLevel?.(); } },
      'view.grid': { label: 'Grid', shortcut: 'Ctrl+G', checked: () => v().grid !== false, run: toggleView('grid') },
      'view.textured2d': { label: 'Textured 2D map', checked: () => v().textured2d !== false, run: toggleView('textured2d') },
      'view.objects': { label: 'Show objects', checked: () => v().showObjects !== false, run: toggleView('showObjects') },
      'view.markers': { label: 'Show markers (areas, regions, start)', checked: () => v().showMarkers !== false, run: toggleView('showMarkers') },
      'view.showAll': { label: 'Show all hidden types', enabled: () => (v().hiddenTypes?.length ?? 0) > 0, run: () => st.setView({ hiddenTypes: [] }) },
      'view.gameCamera': { label: '3D: gameplay camera', checked: () => v().cameraMode === 'game', run: () => st.setView({ cameraMode: v().cameraMode === 'game' ? 'edit' : 'game' }) },
      'view.postfx': { label: '3D: HD-2D post effects', checked: () => !!v().postfx, run: () => st.setView({ postfx: !v().postfx }) },
      'view.atmosphere': { label: '3D: particles & god rays', checked: () => !!v().atmosphere, run: () => st.setView({ atmosphere: !v().atmosphere }) },
      'view.brushBigger': { label: 'Bigger brush', shortcut: ']', run: () => this._brush(1) },
      'view.brushSmaller': { label: 'Smaller brush', shortcut: '[', run: () => this._brush(-1) },

      'level.settings': { label: 'Level settings…', icon: ICONS.settings, run: () => levelSettingsDialog(this) },
      'level.resize': { label: 'Resize level…', icon: ICONS.resize, run: () => resizeDialog(this) },
      'level.validate': { label: 'Check for problems', icon: ICONS.validate, run: () => this.validate() },
      'level.playtest': { label: 'Play-test', shortcut: 'F5', icon: ICONS.play, run: () => this.playtest() },
      'level.openInGame': { label: 'Open saved level in the game', icon: ICONS.external, enabled: () => st.fileRef.kind === 'project', run: () => window.open(`index.html?level=${encodeURIComponent(st.fileRef.name)}`, '_blank') },

      'help.shortcuts': { label: 'Keyboard shortcuts', shortcut: '?', icon: ICONS.keyboard, run: () => shortcutsDialog(this._shortcutGroups()) },
      'help.game': { label: 'Open the Emberfall demo', icon: ICONS.external, run: () => window.open('index.html', '_blank') },
      'help.about': { label: 'About the level editor', icon: ICONS.help, run: () => aboutDialog() },
    };
    this.shortcutIndex = new Map();
    for (const [id, cmd] of Object.entries(c)) if (cmd.shortcut) this.shortcutIndex.set(normalizeCombo(cmd.shortcut), id);
    this.shortcutIndex.set('Shift+?', 'help.shortcuts');
    this.shortcutIndex.set('Alt+N', 'file.new'); // Chrome reserves Ctrl+N in normal tabs
    this.shortcutIndex.set('Backspace', 'edit.delete');
    this.shortcutIndex.set('Ctrl+Shift+Z', 'edit.redo2');
    return c;
  }

  _menus() {
    return [
      { id: 'file', label: 'File', items: ['file.new', 'file.open', 'file.openFile', '-', 'file.save', 'file.saveAs', 'file.export', '-', 'file.playtest'] },
      { id: 'edit', label: 'Edit', items: ['edit.undo', 'edit.redo', '-', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.duplicate', 'edit.delete', '-', 'edit.rotateCcw', 'edit.rotateCw', '-', 'edit.selectAll', 'edit.deselect'] },
      { id: 'view', label: 'View', items: [{ header: 'Layout' }, 'view.split', 'view.3d', 'view.2d', '-', 'view.frameSelection', 'view.frameLevel', '-', { header: 'Show' }, 'view.grid', 'view.textured2d', 'view.objects', 'view.markers', 'view.showAll', '-', { header: '3D preview' }, 'view.gameCamera', 'view.postfx', 'view.atmosphere'] },
      { id: 'level', label: 'Level', items: ['level.settings', 'level.resize', '-', 'level.validate', 'level.playtest', 'level.openInGame'] },
      { id: 'help', label: 'Help', items: ['help.shortcuts', 'help.game', '-', 'help.about'] },
    ];
  }

  /** @returns {{ title: string, items: [string, string][] }[]} */
  _shortcutGroups() {
    return [
      { title: 'File', items: [['Ctrl+N / Alt+N', 'New level'], ['Ctrl+O', 'Open'], ['Ctrl+S', 'Save'], ['Ctrl+Shift+S', 'Save as'], ['Ctrl+E', 'Download .json'], ['F5', 'Play-test']] },
      { title: 'Tools', items: TOOLS.map((t) => [t.shortcut, t.label]) },
      { title: 'Edit', items: [['Ctrl+Z', 'Undo'], ['Ctrl+Y / Ctrl+Shift+Z', 'Redo'], ['Ctrl+C', 'Copy objects'], ['Ctrl+X', 'Cut objects'], ['Ctrl+V', 'Paste (at the pointer)'], ['Ctrl+D', 'Duplicate'], ['Delete', 'Delete selection'], ['Ctrl+A', 'Select all objects'], ['Escape', 'Deselect / cancel']] },
      { title: 'Selection & placing', items: [['R / Shift+R', 'Rotate ±15°'], ['Ctrl+R / Ctrl+Shift+R', 'Rotate ±90°'], ['Arrows', 'Nudge 0.5 (Shift: 2)'], ['Alt', 'Place / move without snapping'], ['Shift+click', 'Add to selection'], ['Ctrl+click', 'Toggle selection']] },
      { title: 'Terrain', items: [['[ / ]', 'Brush size'], ['Alt+click', 'Pick tile / level'], ['Shift+click', 'Straight line (paint)'], ['Shift', 'Invert raise / lower']] },
      { title: 'View', items: [['1 / 2 / 3', 'Layout: split / 3D / 2D'], ['F', 'Frame selection'], ['Home', 'Frame level'], ['Ctrl+G', 'Toggle grid'], ['?', 'This list']] },
      { title: '2D map', items: [['Wheel', 'Zoom to the cursor'], ['Right-drag / Middle-drag', 'Pan'], ['Space+drag', 'Pan'], ['Double-click', 'Focus an object']] },
      { title: '3D view', items: [['Right-drag', 'Orbit'], ['Middle-drag / Shift+right-drag', 'Pan'], ['Space+drag', 'Pan'], ['Wheel', 'Zoom to the cursor'], ['F / Double-click', 'Focus'], ['Right button + W A S D', 'Fly'], ['Right button + Q / E', 'Turn'], ['Q / E', 'Rotate (game camera)']] },
    ];
  }

  /** Run a command by id. */
  run(id) {
    const c = this.commands[id];
    if (!c) return;
    if (c.enabled && !c.enabled()) return;
    closeContextMenu();
    try {
      const r = c.run();
      if (r && typeof r.catch === 'function') r.catch((e) => this._error(e));
    } catch (e) { this._error(e); }
  }

  _error(e) {
    console.warn('[editor]', e);
    alertDialog({ title: 'Something went wrong', message: String(e?.message ?? e), icon: ICONS.warning });
  }

  _brush(d) {
    const st = this.state;
    const n = Math.max(1, Math.min(9, st.toolOptions.brushSize + d));
    st.setToolOption('brushSize', n);
    st.emit('preview');
    st.notify(`Brush size ${n}`);
  }

  _writeSystemClipboard(objs) {
    try { navigator.clipboard?.writeText(JSON.stringify({ format: 'lumina-objects', objects: objs }, null, 1)).catch(() => {}); } catch { /* ignore */ }
  }

  selectAll() {
    const st = this.state;
    const hidden = new Set(st.view.hiddenTypes ?? []);
    st.select(st.level.objects.filter((o) => !hidden.has(o.type)).map((o) => o.id));
    st.notify(`${st.selection.length} objects selected`);
  }

  /** Centre both views on the given ids (objects and/or 'spawn'). */
  focusIds(ids) {
    const b = boundsOfIds(this.state, ids);
    if (!b) return;
    // a boss group frames its arena too
    for (const id of ids) {
      const a = bossArena(this.state.getObject(id));
      if (a) { b.minX = Math.min(b.minX, a.minX); b.maxX = Math.max(b.maxX, a.maxX); b.minZ = Math.min(b.minZ, a.minZ); b.maxZ = Math.max(b.maxZ, a.maxZ); }
    }
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    if (this.view2d) {
      if (size > 6) this.view2d.frameRect({ minX: b.minX - 2, maxX: b.maxX + 2, minZ: b.minZ - 2, maxZ: b.maxZ + 2 });
      else this.view2d.focusOn(cx, cz, { scale: Math.max(this.view2d.scale, 36) });
    }
    try { this.view3d?.focusOn?.(cx, cz, { distance: Math.max(20, size * 2.6) }); } catch (e) { console.warn('[editor] 3D focus:', e); }
  }

  _contextMenu({ ev, clientX, clientY }) {
    const st = this.state;
    const id = ev.hitSpawn ? 'spawn' : ev.hitObjectId;
    const items = [];
    if (id) {
      if (!st.selection.includes(id)) st.select([id]);
      const o = id === 'spawn' ? null : st.getObject(id);
      items.push({ header: o ? `${OBJECT_TYPES[o.type].label} · ${o.name || o.id}` : 'Player start' });
      items.push({ label: 'Focus', icon: ICONS.focus, shortcut: 'F', run: () => this.focusIds(st.selection) });
      if (o) {
        items.push({ label: 'Duplicate', icon: ICONS.duplicate, shortcut: 'Ctrl+D', run: () => duplicateSelection(st) });
        items.push({ label: 'Copy', icon: ICONS.copy, shortcut: 'Ctrl+C', run: () => this.run('edit.copy') });
        items.push({ label: 'Rotate +90°', icon: ICONS.rotateCcw, shortcut: 'Ctrl+R', run: () => rotateSelection(st, 90 * DEG) });
        items.push({ label: 'Pick this type', icon: ICONS.eyedropper, run: () => { st.setToolOption('objectType', o.type); st.setTool('place'); } });
        items.push('-');
        items.push({ label: 'Delete', icon: ICONS.trash, shortcut: 'Delete', danger: true, run: () => deleteSelection(st) });
      }
    } else {
      items.push({ header: `Tile ${ev.i}, ${ev.j}` });
      items.push({ label: 'Paste here', icon: ICONS.paste, shortcut: 'Ctrl+V', disabled: !this.clipboard.length, run: () => { const added = pasteObjects(st, this.clipboard, { x: ev.x, z: ev.z }); st.notify(`Pasted ${added.length} objects`); } });
      items.push({ label: 'Place player start here', icon: ICONS.spawn, disabled: !st.inBounds(ev.i, ev.j), run: () => st.setSpawn(ev.i + 0.5, ev.j + 0.5) });
      items.push({ label: `Place ${OBJECT_TYPES[st.toolOptions.objectType]?.label ?? 'object'} here`, icon: ICONS.place, disabled: OBJECT_TYPES[st.toolOptions.objectType]?.placement !== 'point', run: () => st.addObject(st.toolOptions.objectType, Math.round(ev.x * 2) / 2, Math.round(ev.z * 2) / 2) });
      items.push('-');
      items.push({ label: 'Frame level', icon: ICONS.frame, shortcut: 'Home', run: () => this.run('view.frameLevel') });
    }
    showContextMenu(clientX, clientY, items);
  }

  // -------------------------------------------------------------------------------------------
  // Files: new / open / save / export / play-test
  // -------------------------------------------------------------------------------------------

  /**
   * Ask what to do with unsaved changes. Resolves true when it is OK to continue (saved or
   * discarded), false to cancel.
   */
  async confirmDiscard(action = 'continue') {
    if (!this.state.dirty) return true;
    const name = this.state.level.name || 'Untitled';
    const r = await confirmDialog({
      title: 'Unsaved changes', icon: ICONS.warning, width: 470,
      message: `“${name}” has unsaved changes. Save them before you ${action}?`,
      buttons: [{ label: 'Don\'t save', value: 'discard', danger: true, left: true }, { label: 'Cancel', value: null }, { label: 'Save', value: 'save', primary: true }],
    });
    // "Don't save": the autosave is dropped once another level actually replaced this one
    // (_replaceDoc) — if opening fails or is cancelled, the work is still here and autosaved
    if (r === 'discard') return true;
    if (r === 'save') return this.save();
    return false;
  }

  async newLevel() {
    if (!(await this.confirmDiscard('start a new level'))) return;
    const opts = await newLevelDialog(this);
    if (!opts) return;
    this._replaceDoc(createEmptyLevel(opts), { kind: 'new', name: '' });
    this.state.setTool('paint');
    this.state.notify(`New level “${opts.name}” (${opts.width} × ${opts.depth})`);
  }

  async openDialog() {
    if (!(await this.confirmDiscard('open another level'))) return;
    const choice = await openLevelDialog(this);
    if (!choice) return;
    if (choice.kind === 'project') await this.openProject(choice.name, { confirm: false });
    else if (choice.kind === 'local') await this.openLocal(choice.name, { confirm: false });
    else if (choice.kind === 'recovered') await this.openRecovered(choice.name, { confirm: false });
    else await this.openFromDisk({ confirm: false });
  }

  // Every open reads and checks the level FIRST and only then asks about unsaved changes, so a
  // missing or broken file never costs the current work (`confirm: false` = already asked).

  async openProject(name, { confirm = true } = {}) {
    const slug = slugify(name);
    return this._openParsed(() => loadProjectLevel(slug), { kind: 'project', name: slug }, `public/levels/${slug}.json`, { confirm });
  }

  openLocal(slot, { confirm = true } = {}) {
    return this._openParsed(() => {
      const r = loadLocalLevel(slot);
      if (!r) throw new Error(`No level “${slot}” in this browser`);
      return r;
    }, { kind: 'local', name: slot }, `browser slot “${slot}”`, { confirm });
  }

  async openFromDisk({ confirm = true } = {}) {
    let r;
    try { r = await openLevelFileDialog(); } catch (e) { alertDialog({ title: 'Could not open the level', message: String(e?.message ?? e), icon: ICONS.warning }); return false; }
    if (!r) return false;
    return this._openParsed(() => r, { kind: 'file', name: r.fileName ?? 'level.json' }, r.fileName ?? 'file', { confirm });
  }

  async openFile(file) {
    return this._openParsed(() => readLevelFile(file), { kind: 'file', name: file.name }, file.name, { confirm: true });
  }

  /**
   * Load a level (`loader` → { level, warnings }), then — when `confirm` — ask about unsaved
   * changes, then make it the document (`unsaved`: it is not saved anywhere, e.g. pasted). A
   * loading overlay covers the blocking rebuild of big levels.
   */
  async _openParsed(loader, fileRef, label, { confirm = false, unsaved = false } = {}) {
    let r;
    try {
      r = await loader();
    } catch (e) {
      alertDialog({ title: 'Could not open the level', message: `${label}: ${e?.message ?? e}`, icon: ICONS.warning });
      return false;
    }
    if (confirm && !(await this.confirmDiscard('open another level'))) return false;
    await this._withLoading(`Opening “${r.level.name}”…`, () => this._replaceDoc(r.level, fileRef, { unsaved }), r.level);
    // a file written by a newer engine: overwriting it (as version 1) asks first
    this._newerFile = (r.warnings ?? []).some((w) => /newer than this engine/.test(w)) ? { ...fileRef } : null;
    if (r.warnings?.length) {
      const uniq = [...new Set(r.warnings)];
      alertDialog({ title: 'Opened with warnings', message: `“${r.level.name}” was loaded, but some data was adjusted:`, lines: uniq.slice(0, 12).concat(uniq.length > 12 ? [`…and ${uniq.length - 12} more`] : []), icon: ICONS.warning });
    } else {
      this.state.notify(`Opened “${r.level.name}” from ${label}`);
    }
    return true;
  }

  /** Save to the current destination (Save As when there is none). Resolves true when saved. */
  async save() {
    const ref = this.state.fileRef;
    if (ref.kind === 'project') {
      if (this.projectApi) return this._saveTo('project', ref.name);
      this.state.notify('The project folder is unavailable (dev server not running) — choose another destination');
      return this.saveAs();
    }
    if (ref.kind === 'local') return this._saveTo('local', ref.name);
    if (ref.kind === 'file') return this._saveTo('download', ref.name.replace(/(\.level)?\.json$/i, ''));
    return this.saveAs();
  }

  async saveAs() {
    const r = await saveAsDialog(this, { askName: DEFAULT_NAMES.has(this.state.level.name.trim()) });
    if (!r) return false;
    // a level still called "Untitled": the Save As dialog asked for its display name too
    if (r.levelName && r.levelName !== this.state.level.name) this.state.setLevelProps({ name: r.levelName }, 'Name level');
    const ref = this.state.fileRef;
    const same = ref.kind === r.dest && ref.name === r.name;
    if (!same) {
      let exists = false;
      try {
        if (r.dest === 'project') exists = (await listProjectLevels()).some((l) => l.name === r.name);
        else if (r.dest === 'local') exists = listLocalLevels().some((l) => l.slot === r.name);
      } catch { exists = false; }
      if (exists) {
        const where = r.dest === 'project' ? `public/levels/${r.name}.json` : `browser slot “${r.name}”`;
        const ok = await confirmDialog({ title: 'Replace existing level?', message: `${where} already exists. Replace it with this level?`, danger: true, buttons: [{ label: 'Cancel', value: false }, { label: 'Replace', value: true, danger: true }] });
        if (!ok) return false;
      }
    }
    return this._saveTo(r.dest, r.name);
  }

  async _saveTo(dest, name) {
    const st = this.state;
    const nf = this._newerFile;
    if (nf && ((dest === 'project' && nf.kind === 'project') || (dest === 'local' && nf.kind === 'local')) && slugify(name) === slugify(nf.name)) {
      const ok = await confirmDialog({
        title: 'Overwrite a newer level file?', icon: ICONS.warning, danger: true, width: 480,
        message: 'This file was written by a newer version of the engine. Saving writes it as version 1: data this editor does not know may be lost. Save anyway?',
        buttons: [{ label: 'Cancel', value: false }, { label: 'Save as version 1', value: true, danger: true }],
      });
      if (!ok) return false;
      this._newerFile = null;
    }
    // the revision being saved: edits made while a project save is in flight keep the level dirty
    const rev = st.revision;
    const level = st.snapshot();
    try {
      if (dest === 'project') {
        const file = await saveProjectLevel(name, level);
        st.markSaved({ kind: 'project', name: slugify(name) }, rev);
        st.notify(st.dirty ? `Saved to public/${file} — newer edits are not saved yet` : `Saved to public/${file}`);
      } else if (dest === 'local') {
        const slot = saveLocalLevel(name, level);
        st.markSaved({ kind: 'local', name: slot }, rev);
        st.notify(`Saved in this browser (slot “${slot}”)`);
      } else {
        // a download cannot be confirmed (blocked, or cancelled in a "Save as" prompt of the
        // browser): the level counts as saved to that file, but a recovery copy stays in this
        // browser (File › Open › This browser › Recovered)
        const fileName = `${slugify(name)}.level.json`;
        downloadLevel(level, fileName);
        writeAutosave(level, { kind: 'file', name: fileName }, { exported: true });
        st.markSaved({ kind: 'file', name: fileName }, rev);
        st.notify(`Downloaded ${fileName} — check your downloads folder (a recovery copy stays in this browser)`);
        this._autosavedAt = this._changeCount;
        this._updateDoc();
        return true;
      }
      if (!st.dirty) {
        clearAutosave();
        this._autosavedAt = this._changeCount;
      }
      this._updateDoc();
      return true;
    } catch (e) {
      alertDialog({ title: 'Saving failed', message: String(e?.message ?? e), icon: ICONS.warning });
      return false;
    }
  }

  /** Download a copy without changing where the level is saved. */
  exportFile() {
    const level = this.state.snapshot();
    const fileName = `${slugify(level.name)}.level.json`;
    downloadLevel(level, fileName);
    this.state.notify(`Downloaded ${fileName}`);
  }

  validate() {
    const errors = validateLevel(this.state.level).map(friendlyProblem);
    const warnings = this._softWarnings();
    if (!errors.length && !warnings.length) { alertDialog({ title: 'No problems found', message: 'The level is ready to play-test.', icon: ICONS.check }); return; }
    alertDialog({ title: errors.length ? 'Problems found' : 'Level check', message: errors.length ? 'These must be fixed before play-testing:' : 'The level is playable. Some things to consider:', lines: [...errors, ...warnings], icon: errors.length ? ICONS.warning : ICONS.info });
  }

  _softWarnings() {
    const L = this.state.level;
    const out = [];
    // (any number of lights is fine: the game shares its 12 point lights among the lanterns
    // around the player — see LightPool)
    for (const o of L.objects) if (o.type === 'bridge') out.push(...bridgeStepIssues(L, o));
    const outside = L.objects.filter((o) => {
      const p = OBJECT_TYPES[o.type].placement === 'point' ? o : null;
      return p && (p.x < 0 || p.z < 0 || p.x > L.width || p.z > L.depth);
    }).length;
    if (outside) out.push(`${outside} object${outside === 1 ? ' is' : 's are'} outside the map.`);
    if (!L.objects.some((o) => o.type === 'npc')) out.push('There are no villagers to talk to yet.');
    const silent = L.objects.filter((o) => o.type === 'house' && !(Array.isArray(o.text) && o.text.some((t) => String(t).trim()))).length;
    if (silent) out.push(`${silent} house${silent === 1 ? ' has' : 's have'} no “Text when knocking”: ${silent === 1 ? 'its door is' : 'their doors are'} not interactive.`);
    const edges = walkableEdges(L);
    if (edges.length) out.push(`Walkable ground reaches the map edge (${edges.join('; ')}): the player can walk to the edge of the world there. Block it with forest (T) or rock (x) tiles if that is not intended.`);
    out.push(...combatIssues(L, (flier) => this.view3d?.enemyStartTest?.(flier) ?? null));
    return out;
  }

  /** Validate, save to the play-test slot and open the game in a new tab. */
  playtest() {
    const st = this.state;
    const level = st.snapshot();
    const raw = validateLevel(level);
    if (raw.length) {
      const spawnIssue = raw.some((e) => /spawn/.test(e));
      const errors = raw.map(friendlyProblem);
      problemsDialog('Cannot play-test yet', errors, {
        fixSpawn: spawnIssue ? () => { st.select(['spawn']); st.setTool('spawn'); this.focusIds(['spawn']); } : null,
      });
      return false;
    }
    try {
      saveLocalLevel(PLAYTEST_SLOT, level);
    } catch (e) {
      alertDialog({ title: 'Could not start the play-test', message: `Browser storage is unavailable or full: ${e?.message ?? e}`, icon: ICONS.warning });
      return false;
    }
    const url = `index.html?level=local:${PLAYTEST_SLOT}&autostart=1`;
    const w = window.open(url, 'lumina-playtest');
    if (!w) st.notify('Pop-up blocked — allow pop-ups for this page to play-test (the level is saved in the play-test slot).');
    else st.notify(`Play-testing “${level.name}” in a new tab`);
    return true;
  }

  // -------------------------------------------------------------------------------------------
  // Preferences
  // -------------------------------------------------------------------------------------------

  _loadPrefs() {
    this.prefs = {};
    try { this.prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') ?? {}; } catch { this.prefs = {}; }
    const v = this.prefs.view ?? {};
    const keep = {};
    for (const k of ['layout', 'grid', 'split', 'textured2d', 'showObjects', 'showMarkers', 'cameraMode', 'postfx', 'atmosphere']) if (k in v) keep[k] = v[k];
    if (keep.layout && !['split', '3d', '2d'].includes(keep.layout)) delete keep.layout;
    Object.assign(this.state.view, keep);
  }

  _savePrefs() {
    const v = this.state.view;
    this.prefs.view = { layout: v.layout, grid: v.grid, split: v.split, textured2d: v.textured2d, showObjects: v.showObjects, showMarkers: v.showMarkers, cameraMode: v.cameraMode, postfx: v.postfx, atmosphere: v.atmosphere };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* ignore */ }
  }

  dispose() {
    clearInterval(this._autosaveTimer);
    this.view2d?.dispose();
    try { this.view3d?.dispose?.(); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------------------------
// Level checks
// ---------------------------------------------------------------------------------------------

/** Runs of walkable tiles on the map border, described per edge (e.g. "north edge x 29–32"). */
/**
 * Bridge ends the player cannot step on or off: the first deck segment (arched as PropFactory
 * builds it) more than a step (0.55) above or below the flat bank half a tile past that end — a
 * bank one level below the deck plus the arch is just too high (0.5 + arch · sin(π / 2n)).
 * Banks on stairs, water or blocked tiles are skipped (a pier's water end is fine).
 * @param {Level} L
 * @param {LevelObjectOf<'bridge'>} o
 * @returns {string[]}
 */
function bridgeStepIssues(L, o) {
  const dx = o.x1 - o.x0;
  const dz = o.z1 - o.z0;
  const len = Math.hypot(dx, dz);
  if (!(len > 0.5)) return [];
  const ux = dx / len;
  const uz = dz / len;
  const bank = (x, z) => {
    const i = Math.floor(x);
    const j = Math.floor(z);
    const d = tileDef(L, i, j);
    if (!d || d.void || d.water || d.stairs || d.walkable === false) return null;
    return { y: getHeightLevel(L, i, j) * 0.5, x, z };
  };
  /** @type {[end: string, bank: { y: number, x: number, z: number }|null][]} */
  const ends = [['start', bank(o.x0 - ux * 0.5, o.z0 - uz * 0.5)], ['end', bank(o.x1 + ux * 0.5, o.z1 + uz * 0.5)]];
  const deck = Number.isFinite(o.deckY) ? o.deckY : (ends[0][1] ?? ends[1][1])?.y;
  if (deck == null) return [];
  const arch = Number.isFinite(o.opts?.arch) ? o.opts.arch : Math.min(0.4, len * 0.05);
  const n = arch > 0.02 ? Math.max(2, Math.round(len / 0.5)) : 1;
  const first = deck + arch * Math.sin(Math.PI / (2 * n));
  const out = [];
  for (const [which, b] of ends) {
    if (!b) continue;
    const step = first - b.y;
    if (Math.abs(step) <= 0.55) continue;
    out.push(`Bridge “${o.id}”: its ${which} is ${Math.abs(step).toFixed(2)} ${step > 0 ? 'above' : 'below'} the bank at (${b.x.toFixed(1)}, ${b.z.toFixed(1)}) — more than a step (0.55), so the player cannot get on or off there. Level the bank with the deck, set the deck height or flatten the arch.`);
  }
  return out;
}

/** Up to 4 ids, then "+n more". */
function idList(ids) {
  return ids.length > 4 ? `${ids.slice(0, 4).join(', ')} +${ids.length - 4} more` : ids.join(', ');
}

/**
 * Soft warnings of a combat level (COMBAT.md §17): no waystone; enemy start spots off walkable
 * ground; enemies (not dummies) starting within 12 u of the player start; a boss without arena /
 * gate; a boss asking for more than one member (Count above 1: it spawns alone); a boss gate off
 * its arena's edge; more than one boss; an arena / gate on a group that is not the boss (the game
 * ignores it); a non-boss home disc (radius + 2) within 6 u of a boss arena; combat switched off
 * with enemies placed.
 * @param {Level} L level
 * @param {(flier: boolean) => (((x: number, z: number) => boolean)|null)} [exactTest] the 3D
 *   view's start test (every prop and villager collider, in every layout); without a 3D view
 *   the level-data test
 * @returns {string[]}
 */
function combatIssues(L, exactTest = null) {
  const out = [];
  const enemies = L.objects.filter((o) => o.type === 'enemy');
  const combat = levelHasCombat(L);
  if (L.environment?.combat === false && enemies.length) {
    out.push(`Combat is off (Level settings) but ${enemies.length} enemy group${enemies.length === 1 ? ' is' : 's are'} placed: ${enemies.length === 1 ? 'it does' : 'they do'} not appear in the game.`);
  }
  if (combat && !L.objects.some((o) => o.type === 'waystone')) out.push('This is a combat level without a Waystone: a defeated player restarts at the player start. Place a Waystone (checkpoint) along the way.');
  if (!enemies.length) return out;
  const cols = dataColliders(L);
  const tests = new Map();
  /** The game's start rule (standable ground, fliers also water; clear of colliders). */
  const testFor = (flier) => {
    if (!tests.has(flier)) tests.set(flier, exactTest?.(flier) ?? levelStartTest(L, flier, cols));
    return tests.get(flier);
  };
  const offGround = [];
  const nearSpawn = [];
  const bosses = [];
  const stray = [];
  for (const o of enemies) {
    const info = ENEMY_INFO[enemyKind(o)];
    const ok = testFor(!!info.flier);
    const spots = enemyStartPoints(o, ok);
    if (spots.some(([x, z]) => !ok(x, z))) offGround.push(o.id);
    if (!info.passive && spots.some(([x, z]) => Math.hypot(x - L.spawn.x, z - L.spawn.z) < 12)) nearSpawn.push(o.id);
    if (info.boss) bosses.push(o);
    else if (strayArena(o)) stray.push(o.id);
  }
  if (offGround.length) out.push(`Some enemies would start off walkable ground (${idList(offGround)}): move the group or shrink its home radius.`);
  if (nearSpawn.length) out.push(`Enemies start within 12 units of the player start (${idList(nearSpawn)}): the player is attacked right away.`);
  const arenas = [];
  for (const b of bosses) {
    const a = bossArena(b);
    const g = Array.isArray(b.gate) && b.gate.length >= 4 && b.gate.slice(0, 4).every(Number.isFinite);
    if (!a || !g) out.push(`The boss ${b.id} has no ${!a && !g ? 'arena and gate' : !a ? 'arena' : 'gate'}: select it and use “Add arena and gate” in the Inspector.`);
    const extra = bossExtraCount(b);
    if (extra) {
      const asked = b.count != null && b.count !== '' ? `Count ${b.count}` : `${extra + 1} spot offsets`;
      out.push(`The boss ${b.id} has ${asked}, but the boss spawns alone: the game ignores the other ${extra}. Set its Count to 1 in the Inspector.`);
    }
    const gap = gateEdgeGap(b);
    if (gap != null && gap > GATE_EDGE_TOLERANCE) out.push(`The gate of ${b.id} is not on its arena's edge (an end is ${gap.toFixed(1)} units off): the gate's ember wall would not meet the arena's barrier. Drag the gate ends onto the arena's edge.`);
    if (a) arenas.push(a);
  }
  if (bosses.length > 1) out.push(`There are ${bosses.length} boss groups (${idList(bosses.map((b) => b.id))}); a level has one Cinderheart.`);
  if (stray.length) {
    const one = stray.length === 1;
    out.push(`${idList(stray)} ${one ? 'has a boss arena but is' : 'have boss arenas but are'} not the boss: the game ignores ${one ? 'it' : 'them'}. Use “Remove arena” in the Inspector, or set Kind to golem.`);
  }
  const crowding = [];
  for (const o of enemies) {
    if (ownValue(ENEMY_INFO, o.kind)?.boss) continue;
    const r = (Number(o.radius) || 3) + 2;
    for (const a of arenas) {
      const dx = Math.max(a.minX - o.x, 0, o.x - a.maxX);
      const dz = Math.max(a.minZ - o.z, 0, o.z - a.maxZ);
      if (Math.hypot(dx, dz) - r < 6) { crowding.push(o.id); break; }
    }
  }
  if (crowding.length) out.push(`Enemy groups live within 6 units of the boss arena (${idList(crowding)}): keep their home (radius + 2) at least 6 units from it.`);
  return out;
}

function walkableEdges(L) {
  const walk = (i, j) => { const d = L.legend[L.tiles[j]?.[i]]; return !!d && !d.void && !d.water && d.walkable !== false; };
  const out = [];
  const runs = (n, test) => {
    const r = [];
    let a = -1;
    for (let k = 0; k <= n; k++) {
      const on = k < n && test(k);
      if (on && a < 0) a = k;
      if (!on && a >= 0) { r.push(a === k - 1 ? `${a}` : `${a}–${k - 1}`); a = -1; }
    }
    return r;
  };
  const add = (name, axis, r) => { if (r.length) out.push(`${name} edge ${axis} ${r.slice(0, 3).join(', ')}${r.length > 3 ? '…' : ''}`); };
  add('north', 'x', runs(L.width, (i) => walk(i, 0)));
  add('south', 'x', runs(L.width, (i) => walk(i, L.depth - 1)));
  add('west', 'z', runs(L.depth, (j) => walk(0, j)));
  add('east', 'z', runs(L.depth, (j) => walk(L.width - 1, j)));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Shortcut helpers
// ---------------------------------------------------------------------------------------------

/** "Ctrl+Shift+S" style combo of a KeyboardEvent (Cmd counts as Ctrl). */
function comboOf(e) {
  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  if (key === 'Del') key = 'Delete';
  if (key === 'Esc') key = 'Escape';
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  // Shift is implied for symbols like '?' — keep it only for letters / named keys
  if (e.shiftKey && (key.length > 1 || /[A-Z]/.test(key))) parts.push('Shift');
  else if (e.shiftKey && key === '?') parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

function normalizeCombo(s) {
  const parts = s.split('+');
  const key = parts.pop();
  const mods = ['Ctrl', 'Alt', 'Shift'].filter((m) => parts.includes(m));
  return [...mods, key.length === 1 ? key.toUpperCase() : key].join('+');
}

