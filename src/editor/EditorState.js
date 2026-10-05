import { EventEmitter } from '../engine/core/EventEmitter.js';
import {
  createEmptyLevel, cloneLevel, setTile as setTileRaw, setHeightLevel, getTile, getHeightLevel,
  addObject as addObjectRaw, inBounds,
} from '../engine/level/LevelFormat.js';
import { OBJECT_TYPES, normalizeObject } from '../engine/level/ObjectCatalog.js';
import { ownValue } from '../engine/utils/own.js';

/** @import { Level } from '../engine/level/types.js' */

/**
 * Where a document came from / was last saved: `new` (never saved; name ''), `local` (browser slot
 * `name`), `project` (public/levels/`name`.json) or `file` (a file on disk; `name` its file name).
 * @typedef {{ kind: 'new'|'local'|'project'|'file', name: string }} FileRef
 */

/**
 * EditorState — the single source of truth of the level editor: the level being edited, the
 * selection, the active tool and its options, view options, and undo / redo.
 *
 * Every mutation goes through a transaction. Edits made outside `begin()/commit()` are wrapped in
 * their own one-step transaction automatically, so every edit is undoable. Views never mutate
 * `state.level` directly; they call the methods below (or tools do, on their behalf).
 *
 * Events (EventEmitter):
 *   'change'    (info)  after every edit, undo, redo or load. info = {
 *                          source: 'edit'|'undo'|'redo'|'load',
 *                          terrain: boolean,              tiles/heights/legend/waterLevel changed
 *                          rect: {minI,maxI,minJ,maxJ}|null   changed tile rect (null = unknown/all)
 *                          objects: boolean,              objects or spawn changed (views diff by id)
 *                          ids: string[]|null,            ids of the objects that changed (added, edited,
 *                                                         moved, removed; 'spawn' = player start) —
 *                                                         null = unknown (diff everything)
 *                          meta: boolean }                name / environment / water / size
 *   'selection' (ids: string[])
 *   'tool'      (toolId)
 *   'toolOptions' (options)
 *   'view'      (view)
 *   'hover'     (hover|null)       pointer position over a view: { i, j, x, z, view }
 *   'dirty'     (dirty: boolean)
 *   'history'   ({ canUndo, canRedo })
 *   'status'    (message: string)  transient status-bar messages (see `notify`)
 */
export class EditorState extends EventEmitter {
  constructor(level = createEmptyLevel({ name: 'Untitled' })) {
    super();
    /** The level being edited (treat as read-only outside this class). */
    this.level = level;
    /** @type {FileRef} where the level came from / was last saved */
    this.fileRef = { kind: 'new', name: '' };
    this.dirty = false;
    /** Selected object ids ('spawn' selects the player start marker). */
    this.selection = [];
    this.toolId = 'select';
    /** The tool that was active before the current one (e.g. the eyedropper returns to it). */
    this.prevToolId = 'select';
    /** Options shared by tools and palettes (tools may add their own keys). */
    this.toolOptions = {
      tile: 'g',            // tile char for paint / fill / rect
      brushSize: 1,         // 1..9 tiles
      brushShape: 'square', // 'square' | 'circle'
      heightMode: 'raise',  // 'raise' | 'lower' | 'set' | 'flatten' | 'smooth'
      heightValue: 2,       // target level for 'set'
      objectType: 'house',  // catalog type for the place tool
      snap: true,           // snap placed / moved objects (to the type's snap step or 0.5)
      paintHeight: false,   // paint tool also sets the height to heightValue
    };
    /** View options shared by the 2D and 3D views. */
    this.view = {
      layout: 'split',      // 'split' | '3d' | '2d'
      grid: true,
      showObjects: true,
      showMarkers: true,    // emitters, regions, spawn, critter areas
      cameraMode: 'edit',   // 3D: 'edit' (free orbit) | 'game' (HD-2D gameplay camera)
      postfx: false,        // 3D: HD-2D post effects in the preview
      timeOfDay: 14,        // 3D preview lighting (hour)
      timeFollow: true,     // the preview hour follows the level's start time (environment.timeOfDay)
      atmosphere: false,    // 3D: particles / god rays in the preview
      hiddenTypes: [],      // object types hidden in the views (outliner eye toggles)
      textured2d: true,     // 2D map: draw real tile textures (false = flat tile colours)
      split: 0.6,           // split layout: fraction of the width given to the 3D view
    };
    /** Pointer position over a view, or null. */
    this.hover = null;

    this._undo = [];
    this._redo = [];
    this._tx = null;
    this.maxHistory = 200;
    /** Revision ids: every committed step gets one; the document's revision is the top undo step's. */
    this._seq = 0;
    /** Revision of the state below the oldest undo step (a load, or a step dropped from history). */
    this._baseRev = 0;
    /** Revision that was last saved (-1: none — e.g. a restored or pasted level). */
    this._savedRev = 0;
  }

  /** Id of the current document state (changes with every edit, undo and redo). */
  get revision() {
    return this._undo.length ? this._undo[this._undo.length - 1].id : this._baseRev;
  }

  // -------------------------------------------------------------------------------------------
  // Transactions & history
  // -------------------------------------------------------------------------------------------

  /** Start a transaction (e.g. at pointer-down of a brush stroke). Nested calls are merged. */
  begin(label = 'Edit') {
    if (this._tx) { this._tx.depth++; return; }
    this._tx = {
      label, depth: 1, before: JSON.stringify(this.level), selectionBefore: [...this.selection],
      terrain: false, objects: false, meta: false, rect: null, ids: new Set(),
    };
  }

  /** End the transaction: pushes one undo step if anything changed. */
  commit() {
    const tx = this._tx;
    if (!tx) return;
    if (--tx.depth > 0) return;
    this._tx = null;
    if (!(tx.terrain || tx.objects || tx.meta)) return;
    const after = JSON.stringify(this.level);
    if (after === tx.before) return;
    // consecutive steps share their snapshot string (one copy per step instead of two)
    const prev = this._undo[this._undo.length - 1];
    const before = prev && prev.after === tx.before ? prev.after : tx.before;
    this._undo.push({
      id: ++this._seq, label: tx.label, before, after, selectionBefore: tx.selectionBefore, selectionAfter: [...this.selection],
      kinds: { terrain: tx.terrain, objects: tx.objects, meta: tx.meta }, rect: tx.rectUnknown ? null : tx.rect, ids: tx.ids ? [...tx.ids] : null,
    });
    if (this._undo.length > this.maxHistory) this._baseRev = this._undo.shift().id;
    this._redo.length = 0;
    this._updateDirty();
    this._emitHistory();
  }

  /** Abort the transaction and restore the level as it was at begin(). */
  cancel() {
    const tx = this._tx;
    if (!tx) return;
    this._tx = null;
    this.level = JSON.parse(tx.before);
    this.selection = tx.selectionBefore;
    this.emit('change', { source: 'undo', terrain: tx.terrain, rect: null, objects: tx.objects, ids: null, meta: tx.meta });
    this.emit('selection', [...this.selection]);
  }

  get inTransaction() { return !!this._tx; }
  get canUndo() { return this._undo.length > 0 && !this._tx; }
  get canRedo() { return this._redo.length > 0 && !this._tx; }
  get undoLabel() { return this._undo[this._undo.length - 1]?.label ?? ''; }
  get redoLabel() { return this._redo[this._redo.length - 1]?.label ?? ''; }

  undo() {
    if (!this.canUndo) return false;
    const e = this._undo.pop();
    this._redo.push(e);
    this._restore(e.before, e.selectionBefore, 'undo', e);
    return true;
  }

  redo() {
    if (!this.canRedo) return false;
    const e = this._redo.pop();
    this._undo.push(e);
    this._restore(e.after, e.selectionAfter, 'redo', e);
    return true;
  }

  _restore(json, selection, source, entry) {
    const kinds = entry.kinds;
    this.level = JSON.parse(json);
    const ids = new Set(this.level.objects.map((o) => o.id));
    this.selection = selection.filter((id) => id === 'spawn' || ids.has(id));
    this._updateDirty();
    // the step's changed tile rect and object ids (null = unknown: views diff everything)
    this.emit('change', {
      source, terrain: kinds.terrain, rect: kinds.terrain && !kinds.meta ? entry.rect ?? null : null,
      objects: kinds.objects, ids: kinds.objects && Array.isArray(entry.ids) ? [...entry.ids] : null, meta: kinds.meta,
    });
    this.emit('selection', [...this.selection]);
    this._emitHistory();
  }

  _emitHistory() {
    this.emit('history', { canUndo: this.canUndo, canRedo: this.canRedo });
  }

  _setDirty(d) {
    if (this.dirty === d) return;
    this.dirty = d;
    this.emit('dirty', d);
  }

  /** dirty = the document differs from the last saved revision (undo back to it is clean). */
  _updateDirty() {
    this._setDirty(this.revision !== this._savedRev);
  }

  /**
   * Mark a revision as saved under `fileRef` (default: the current one). Pass the revision taken
   * when the save started: edits made while it was in flight keep the document dirty.
   * @param {FileRef|null} [fileRef]
   * @param {number} [revision]
   */
  markSaved(fileRef, revision = this.revision) {
    if (fileRef) this.fileRef = fileRef;
    this._savedRev = revision;
    this._updateDirty();
  }

  /** The current document is not saved anywhere (a restored autosave, a pasted level…). */
  markUnsaved() {
    this._savedRev = -1;
    this._updateDirty();
  }

  /** Run `fn` inside a transaction (auto-wrapped if none is open). */
  _edit(label, fn) {
    const own = !this._tx;
    if (own) this.begin(label);
    try {
      return fn(this._tx);
    } finally {
      if (own) this.commit();
    }
  }

  _changed(tx, kinds, rect = null, ids = null) {
    if (kinds.terrain) {
      tx.terrain = true;
      if (!rect) tx.rectUnknown = true;
      else tx.rect = tx.rect ? unionRect(tx.rect, rect) : { ...rect };
    }
    if (kinds.objects) {
      tx.objects = true;
      if (!ids) tx.ids = null;
      else if (tx.ids) for (const id of ids) tx.ids.add(id);
    }
    if (kinds.meta) tx.meta = true;
    this.emit('change', { source: 'edit', terrain: !!kinds.terrain, rect, objects: !!kinds.objects, ids: kinds.objects ? ids : null, meta: !!kinds.meta });
  }

  // -------------------------------------------------------------------------------------------
  // Level replacement
  // -------------------------------------------------------------------------------------------

  /**
   * Replace the whole level (new / open). Clears history and selection.
   * @param {Level} level
   * @param {FileRef} [fileRef] (a new, unsaved document)
   */
  replaceLevel(level, fileRef = { kind: 'new', name: '' }) {
    this._tx = null;
    this.level = level;
    this.fileRef = fileRef;
    this._undo.length = 0;
    this._redo.length = 0;
    this.selection = [];
    this._baseRev = ++this._seq;
    this._savedRev = this._baseRev;
    this.dirty = true;
    this._setDirty(false);
    this.emit('change', { source: 'load', terrain: true, rect: null, objects: true, ids: null, meta: true });
    this.emit('selection', []);
    this._emitHistory();
  }

  /** Replace the level through an undoable edit (resize, import into current…). */
  setLevel(level, label = 'Replace level') {
    this._edit(label, (tx) => {
      this.level = level;
      const ids = new Set(level.objects.map((o) => o.id));
      this.selection = this.selection.filter((id) => id === 'spawn' || ids.has(id));
      this._changed(tx, { terrain: true, objects: true, meta: true });
    });
  }

  // -------------------------------------------------------------------------------------------
  // Terrain edits
  // -------------------------------------------------------------------------------------------

  getTile(i, j) { return getTile(this.level, i, j); }
  getHeight(i, j) { return getHeightLevel(this.level, i, j); }
  inBounds(i, j) { return inBounds(this.level, i, j); }

  /**
   * Apply many tile edits at once: cells = [{ i, j, tile?, height? }] (`tile`: a one-character
   * key of the level's legend; any other value is ignored). Returns the number of tiles that
   * changed. One 'change' event for the whole batch.
   */
  editTiles(cells, label = 'Paint') {
    return this._edit(label, (tx) => {
      let n = 0;
      let rect = null;
      for (const c of cells) {
        let ch = false;
        // (a tile is one character of its row: a longer legend key, e.g. "constructor" from a
        // hand-written file, would be spliced into the row whole)
        if (typeof c.tile === 'string' && c.tile.length === 1 && ownValue(this.level.legend, c.tile)) ch = setTileRaw(this.level, c.i, c.j, c.tile) || ch;
        if (c.height != null) ch = setHeightLevel(this.level, c.i, c.j, c.height) || ch;
        if (ch) {
          n++;
          rect = rect ? unionRect(rect, { minI: c.i, maxI: c.i, minJ: c.j, maxJ: c.j }) : { minI: c.i, maxI: c.i, minJ: c.j, maxJ: c.j };
        }
      }
      if (n) this._changed(tx, { terrain: true }, rect);
      return n;
    });
  }

  setTile(i, j, ch) { return this.editTiles([{ i, j, tile: ch }]) > 0; }
  setHeight(i, j, level) { return this.editTiles([{ i, j, height: level }], 'Height') > 0; }

  // -------------------------------------------------------------------------------------------
  // Object edits
  // -------------------------------------------------------------------------------------------

  getObject(id) { return this.level.objects.find((o) => o.id === id) ?? null; }

  /** Add a catalog object; returns it. */
  addObject(type, x, z, overrides = {}, { select = true } = {}) {
    return this._edit(`Add ${OBJECT_TYPES[type]?.label ?? type}`, (tx) => {
      const obj = addObjectRaw(this.level, type, x, z, overrides);
      this._changed(tx, { objects: true }, null, [obj.id]);
      if (select) this.select([obj.id]);
      return obj;
    });
  }

  /** Insert fully-formed objects (paste / duplicate); ids are regenerated if taken. */
  insertObjects(objs, { select = true } = {}) {
    return this._edit('Paste', (tx) => {
      const ids = new Set(this.level.objects.map((o) => o.id));
      const added = [];
      // (all normalised first: an object normalizeObject refuses throws before the level changes)
      const fresh = objs.map((src) => normalizeObject(JSON.parse(JSON.stringify(src))));
      for (const o of fresh) {
        let n = 1;
        // ('spawn' addresses the player start: never an object id)
        let id = o.id && !ids.has(o.id) && o.id !== 'spawn' ? o.id : '';
        while (!id) { const c = `${o.type}_${n++}`; if (!ids.has(c)) id = c; }
        o.id = id;
        ids.add(id);
        this.level.objects.push(o);
        added.push(o);
      }
      if (added.length) this._changed(tx, { objects: true }, null, added.map((o) => o.id));
      if (select) this.select(added.map((o) => o.id));
      return added;
    });
  }

  /**
   * Update an object: `patch` is an object merged shallowly, or a function (obj) => void that
   * mutates it in place. Returns the object.
   */
  updateObject(id, patch, label = 'Edit object') {
    return this._edit(label, (tx) => {
      const obj = this.getObject(id);
      if (!obj) return null;
      if (typeof patch === 'function') patch(obj);
      else Object.assign(obj, patch);
      // (the patch may rename the object: both ids changed)
      this._changed(tx, { objects: true }, null, obj.id === id ? [id] : [id, obj.id]);
      return obj;
    });
  }

  /** Move objects (and/or the spawn when 'spawn' is in ids) by (dx, dz). */
  moveObjects(ids, dx, dz, label = 'Move') {
    if (!dx && !dz) return;
    this._edit(label, (tx) => {
      for (const id of ids) {
        if (id === 'spawn') { this.level.spawn.x += dx; this.level.spawn.z += dz; continue; }
        const o = this.getObject(id);
        if (!o) continue;
        const p = OBJECT_TYPES[o.type].placement;
        if (p === 'line') { o.x0 += dx; o.x1 += dx; o.z0 += dz; o.z1 += dz; }
        else if (p === 'rect') { o.minX += dx; o.maxX += dx; o.minZ += dz; o.maxZ += dz; }
        else { o.x += dx; o.z += dz; shiftLegacyFields(o, dx, dz); }
      }
      this._changed(tx, { objects: true }, null, [...ids]);
    });
  }

  removeObjects(ids, label = 'Delete') {
    const set = new Set(ids);
    this._edit(label, (tx) => {
      const before = this.level.objects.length;
      this.level.objects = this.level.objects.filter((o) => !set.has(o.id));
      if (this.level.objects.length !== before) this._changed(tx, { objects: true }, null, [...set]);
      this.selection = this.selection.filter((id) => !set.has(id));
      this.emit('selection', [...this.selection]);
    });
  }

  setSpawn(x, z, facing = this.level.spawn.facing) {
    this._edit('Move player start', (tx) => {
      this.level.spawn = { ...this.level.spawn, x, z, facing };
      this._changed(tx, { objects: true }, null, ['spawn']);
    });
  }

  /**
   * Change level-wide properties: name, subtitle, author, description, waterLevel, water,
   * environment, legend (shallow merge for water / environment).
   */
  setLevelProps(patch, label = 'Level settings') {
    this._edit(label, (tx) => {
      let terrain = false;
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'environment' || k === 'water') this.level[k] = { ...this.level[k], ...v };
        else this.level[k] = v;
        if (k === 'waterLevel' || k === 'legend') terrain = true;
      }
      this._changed(tx, { meta: true, terrain });
    });
  }

  // -------------------------------------------------------------------------------------------
  // Selection, tools, view, hover
  // -------------------------------------------------------------------------------------------

  select(ids, { additive = false, toggle = false } = {}) {
    let next;
    if (toggle) {
      const s = new Set(this.selection);
      for (const id of ids) (s.has(id) ? s.delete(id) : s.add(id));
      next = [...s];
    } else {
      next = additive ? [...new Set([...this.selection, ...ids])] : [...ids];
    }
    if (next.length === this.selection.length && next.every((id, k) => id === this.selection[k])) return;
    this.selection = next;
    this.emit('selection', [...next]);
  }

  clearSelection() { this.select([]); }

  /** Selected level objects (excluding the spawn marker). */
  get selectedObjects() {
    return this.selection.map((id) => this.getObject(id)).filter(Boolean);
  }

  setTool(id) {
    if (this.toolId === id) return;
    this.prevToolId = this.toolId;
    this.toolId = id;
    this.emit('tool', id);
  }

  setToolOption(key, value) {
    if (this.toolOptions[key] === value) return;
    this.toolOptions[key] = value;
    this.emit('toolOptions', { ...this.toolOptions });
  }

  setView(patch) {
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      if (this.view[k] !== v) { this.view[k] = v; changed = true; }
    }
    if (changed) this.emit('view', { ...this.view });
  }

  setHover(h) {
    const a = this.hover;
    if (a === h || (a && h && a.i === h.i && a.j === h.j && a.x === h.x && a.z === h.z && a.view === h.view)) return;
    this.hover = h;
    this.emit('hover', h);
  }

  /** Transient status-bar message. */
  notify(message) {
    this.emit('status', message);
  }

  /** Deep copy of the current level (e.g. for saving while editing continues). */
  snapshot() {
    return cloneLevel(this.level);
  }
}

/**
 * Legacy absolute npc / critters fields (talkPoint, bounds, spots) follow a moved object.
 * (Loads and pastes convert them to the relative forms; this covers objects made by scripts.)
 */
export function shiftLegacyFields(o, dx, dz) {
  if (!dx && !dz) return o;
  const pt = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
  if (pt(o.talkPoint)) o.talkPoint = [o.talkPoint[0] + dx, o.talkPoint[1] + dz];
  const b = o.bounds;
  if (b && ['minX', 'maxX', 'minZ', 'maxZ'].every((k) => Number.isFinite(b[k]))) o.bounds = { ...b, minX: b.minX + dx, maxX: b.maxX + dx, minZ: b.minZ + dz, maxZ: b.maxZ + dz };
  if (Array.isArray(o.spots)) o.spots = o.spots.map((p) => (pt(p) ? [p[0] + dx, p[1] + dz] : p));
  return o;
}

function unionRect(a, b) {
  return {
    minI: Math.min(a.minI, b.minI), maxI: Math.max(a.maxI, b.maxI),
    minJ: Math.min(a.minJ, b.minJ), maxJ: Math.max(a.maxJ, b.maxJ),
  };
}
