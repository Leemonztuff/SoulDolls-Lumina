/**
 * Inspector (right column, top): schema-driven property editor for the selection.
 *   - one object: header (type, editable id), position fields, the catalog fields
 *     (OBJECT_TYPES[type].fields), actions;
 *   - several objects: counts by type, shared fields when all have the same type (mixed values
 *     shown blank), common actions;
 *   - the player start: position, facing, walkability;
 *   - an enemy group: also a "Boss arena" section (relative arena rect + gate) for the boss kind
 *     (and for another kind that still has one: the game ignores it, a hint says so); the boss
 *     kind's Count is 1 (the boss spawns alone): its field stops at 1, and an edit that makes a
 *     group the boss (Kind) or sets its Count clamps it (`clampBossCount`);
 *   - nothing: level summary, validation, quick environment settings and level actions.
 * All edits go through EditorState (undoable); slider drags are one undo step.
 */
import { h, icon, clear, fmt } from './dom.js';
import { createFieldEditor, numberControl, selectControl, textControl } from './fields.js';
import { glyphBadge } from './ToolOptions.js';
import { ICONS } from '../icons.js';
import {
  OBJECT_TYPES, SPAWN_MARKER, ENEMY_INFO, getField, setField, enemyStartPoints, levelHasCombat,
} from '../../engine/level/ObjectCatalog.js';
import { validateLevel, levelStats, tileDef, onBridgeDeck } from '../../engine/level/LevelFormat.js';
import { isWalkableAt } from '../tools/SpawnTool.js';
import { friendlyProblem } from './dialogs.js';
import { gateEdgeGap, GATE_EDGE_TOLERANCE, isBossGroup, clampBossCount, bossExtraCount } from '../enemyGroups.js';
import { ownValue } from '../../engine/utils/own.js';

/** @import { EditorState } from '../EditorState.js' */

const LIGHT_TYPES = new Set(['lamppost', 'wallTorch', 'campfire', 'light']);
const WEATHER = [{ value: 'clear', label: 'Clear' }, { value: 'rain', label: 'Rain' }, { value: 'snow', label: 'Snow' }];

/** Number of objects that request a point light. */
export function countLights(level) {
  return level.objects.filter((o) => LIGHT_TYPES.has(o.type) || (o.type === 'house' && o.light)).length;
}

/** A new boss group's arena and gate (relative to the group; COMBAT.md §14.1): 18 × 18 u, gate south. */
const DEFAULT_ARENA = { minX: -9, maxX: 9, minZ: -9, maxZ: 9 };
const DEFAULT_GATE = [-1.5, 9, 1.5, 9];

/**
 * Combat numbers of a level (COMBAT.md §17): enemies (start spots, a boss group counts one), enemy
 * groups, waystones and chests.
 * @returns {{ enemies: number, groups: number, waystones: number, chests: number }}
 */
export function combatStats(level) {
  let enemies = 0;
  let groups = 0;
  let waystones = 0;
  let chests = 0;
  for (const o of level.objects) {
    if (o.type === 'enemy') { groups++; enemies += enemyStartPoints(o).length; }
    else if (o.type === 'waystone') waystones++;
    else if (o.type === 'chest') chests++;
  }
  return { enemies, groups, waystones, chests };
}

export class Inspector {
  /**
   * @param {HTMLElement} host
   * @param {EditorState} state
   * @param {{ focus(ids:string[]):void, duplicate():void, remove():void, rotate(deg:number):void,
   *           settings():void, resize():void, playtest():void }} actions
   */
  constructor(host, state, actions) {
    this.state = state;
    this.actions = actions;
    this.el = h('section', { class: 'le-panel le-inspector', 'aria-label': 'Inspector' });
    this.header = h('div', { class: 'le-panel-header' }, icon(ICONS.settings, 'le-icon le-panel-header-icon'), h('span', { class: 'le-panel-title' }, 'Inspector'));
    this.headerNote = h('span', { class: 'le-panel-note' });
    this.header.appendChild(this.headerNote);
    this.body = h('div', { class: 'le-panel-body le-scroll' });
    this.el.append(this.header, this.body);
    host.appendChild(this.el);
    this.bindings = [];
    this._key = '';
    this._raf = 0;
    state.on('selection', () => this.render());
    state.on('change', (info) => this._onChange(info));
    // the weather hint depends on the atmosphere preview
    state.on('view', () => { for (const b of this.bindings) if (b.view) b.update(); });
    this.render();
  }

  _onChange(info) {
    if (info.source === 'load') { this.render(); return; }
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this.refresh());
  }

  /**
   * Selection signature: re-render when the kind of content changes (an enemy group turning into
   * the boss or back changes its Count field), else refresh values.
   */
  _signature() {
    const sel = this.state.selection;
    const objs = this.state.selectedObjects;
    return `${sel.join('|')}#${objs.map((o) => (isBossGroup(o) ? 'enemy:boss' : o.type)).join(',')}`;
  }

  refresh() {
    if (this._signature() !== this._key) { this.render(); return; }
    for (const b of this.bindings) b.update();
  }

  render() {
    this._key = this._signature();
    this.bindings = [];
    const scroll = this.body.scrollTop;
    clear(this.body);
    const sel = this.state.selection;
    const objs = this.state.selectedObjects;
    if (!sel.length) this._renderLevel();
    else if (sel.length === 1 && sel[0] === 'spawn') this._renderSpawn();
    else if (sel.length === 1 && objs.length === 1) this._renderObject(objs[0]);
    else this._renderMulti(objs, sel.includes('spawn'));
    this.headerNote.textContent = sel.length > 1 ? `${sel.length} selected` : sel.length === 1 ? (sel[0] === 'spawn' ? 'Player start' : objs[0]?.id ?? '') : 'Level';
    // scrollTop is only clamped at layout time, so reset it explicitly for a new selection
    this.body.scrollTop = this._lastSel === sel.join('|') ? scroll : 0;
    this._lastSel = sel.join('|');
  }

  // -------------------------------------------------------------------------------------------

  _section(title, content, extra = null) {
    return h('section', { class: 'le-section' },
      h('div', { class: 'le-section-head' }, h('span', { class: 'le-section-title' }, title), extra),
      h('div', { class: 'le-section-body' }, content));
  }

  _bind(update) { this.bindings.push({ update }); }

  _actions(buttons) {
    return h('div', { class: 'le-actions' }, buttons.filter(Boolean).map((b) => h('button', {
      class: ['le-btn', 'is-small', b.danger && 'is-danger', b.primary && 'is-primary'], type: 'button', title: b.title ?? null, onClick: b.onClick,
    }, b.icon ? icon(b.icon) : null, b.label)));
  }

  /**
   * Number field bound to a getter / setter on the object with live slider support.
   * @param {string} label
   * @param {{ get: () => number|null|undefined, set: (v: number|null, live: boolean) => void,
   *   min?: number, max?: number, step?: number, nullable?: boolean, slider?: boolean,
   *   labelTitle?: string }} opts  step (0.5); `set(v, true)` while a slider drag is live
   */
  _numberField(label, { get, set, min, max, step = 0.5, nullable = false, slider = false, labelTitle }) {
    let live = false;
    const ctl = numberControl({
      value: get(), min, max, step, nullable, slider,
      onChange: (v) => set(v, false),
      onInput: (v) => set(v, true),
      onBegin: () => { live = true; this.state.begin(`Edit ${label}`); },
      onEnd: () => { if (live) { live = false; this.state.commit(); } },
    });
    this._bind(() => ctl.set(get()));
    return h('div', { class: 'le-field', title: labelTitle ?? null }, h('label', { class: 'le-field-label' }, label), h('div', { class: 'le-field-control' }, ctl.el));
  }

  _pair(a, b) { return h('div', { class: 'le-pair' }, a, b); }

  // ------------------------------------------------------------------------------ one object

  _renderObject(o) {
    const def = OBJECT_TYPES[o.type];
    const id = o.id;
    const st = this.state;
    const cur = () => st.getObject(id);
    const edit = (fn, label) => st.updateObject(id, fn, label);

    // header card
    const idCtl = textControl({
      value: id, maxLength: 60,
      onChange: (v) => {
        const nv = String(v).trim().replace(/\s+/g, '_');
        if (!nv || nv === id) { idCtl.set(id); return; }
        if (!/^[\w-]+$/.test(nv)) { st.notify('Ids may contain letters, digits, _ and -'); idCtl.set(id); return; }
        if (nv === 'spawn') { st.notify('“spawn” is reserved for the player start — choose another id'); idCtl.set(id); return; }
        if (st.getObject(nv)) { st.notify(`Id "${nv}" is already used`); idCtl.set(id); return; }
        // select inside the transaction so undo / redo restore the matching selection
        st.begin('Rename');
        st.updateObject(id, (ob) => { ob.id = nv; }, 'Rename');
        st.select(st.selection.map((s) => (s === id ? nv : s)));
        st.commit();
      },
    });
    this.body.appendChild(h('div', { class: 'le-card le-obj-card' },
      glyphBadge(o.type, 'xl'),
      h('div', { class: 'le-obj-titles' },
        h('div', { class: 'le-obj-type' }, def.label, h('span', { class: 'le-chip' }, def.category)),
        h('div', { class: 'le-obj-id' }, h('span', { class: 'le-obj-id-label' }, 'id'), idCtl.el)),
    ));
    if (def.help) this.body.appendChild(h('p', { class: 'le-hint le-pad' }, def.help));

    // transform
    const tf = [];
    const num = (label, key, extra = {}) => this._numberField(label, {
      get: () => cur()?.[key],
      set: (v) => {
        if (v == null) return;
        edit((ob) => {
          ob[key] = v;
          // keep areas well-formed when a min is typed past its max (or vice versa)
          if (def.placement === 'rect') {
            if (ob.minX > ob.maxX) [ob.minX, ob.maxX] = [ob.maxX, ob.minX];
            if (ob.minZ > ob.maxZ) [ob.minZ, ob.maxZ] = [ob.maxZ, ob.minZ];
          }
        }, def.placement === 'rect' ? 'Resize area' : 'Move');
      },
      step: 0.5, ...extra,
    });
    if (def.placement === 'point') tf.push(this._pair(num('X', 'x'), num('Z', 'z')));
    else if (def.placement === 'line') {
      tf.push(this._pair(num('Start X', 'x0'), num('Start Z', 'z0')), this._pair(num('End X', 'x1'), num('End Z', 'z1')));
      const len = h('span', { class: 'le-readout' });
      const upd = () => { const ob = cur(); if (ob) len.textContent = `${fmt(Math.hypot(ob.x1 - ob.x0, ob.z1 - ob.z0))} units long`; };
      upd();
      this._bind(upd);
      tf.push(len);
    } else {
      tf.push(this._pair(num('Min X', 'minX'), num('Max X', 'maxX')), this._pair(num('Min Z', 'minZ'), num('Max Z', 'maxZ')));
      const size = h('span', { class: 'le-readout' });
      const upd = () => { const ob = cur(); if (ob) size.textContent = `${fmt(ob.maxX - ob.minX)} × ${fmt(ob.maxZ - ob.minZ)}`; };
      upd();
      this._bind(upd);
      tf.push(size);
    }
    const fields = def.fields;
    const rotField = fields.find((f) => f.key === 'rotation');
    if (rotField) tf.push(this._fieldEditor(rotField, [id]));

    // the content a designer edits (names, dialogue, walls…) first; the position is mostly set
    // by dragging, so the transform follows
    const rest = fields.filter((f) => f.key !== 'rotation');
    const boss = isBossGroup(o);
    const props = rest.map((f) => (boss && f.key === 'count'
      // the boss spawns alone (enemyStartPoints takes one): the field stops at 1
      ? [this._fieldEditor({ ...f, max: 1, slider: false }, [id]), this._bossCountHint(id)]
      : this._fieldEditor(f, [id])));
    if (rest.length) this.body.appendChild(this._section('Properties', props));
    this.body.appendChild(this._section('Transform', tf));
    if (!rest.length) this.body.appendChild(h('p', { class: 'le-hint le-pad' }, 'This object has no other properties.'));
    if (o.type === 'enemy') this.body.appendChild(this._arenaSection(id));

    this.body.appendChild(this._actions([
      { label: 'Focus', icon: ICONS.focus, title: 'Centre the views on it (F)', onClick: () => this.actions.focus([id]) },
      { label: 'Duplicate', icon: ICONS.duplicate, title: 'Ctrl+D', onClick: () => this.actions.duplicate() },
      { label: 'Delete', icon: ICONS.trash, danger: true, title: 'Del', onClick: () => this.actions.remove() },
    ]));
  }

  /** Under a boss group's Count: it spawns alone (a warning while the stored count is above 1). */
  _bossCountHint(id) {
    const hint = h('p', { class: 'le-hint' });
    const upd = () => {
      const ob = this.state.getObject(id);
      const extra = ob ? bossExtraCount(ob) : 0;
      const asked = ob && ob.count != null && ob.count !== '' ? `Count ${ob.count}` : `${extra + 1} spot offsets`;
      hint.textContent = extra
        ? `The boss spawns alone: the game ignores the other ${extra} (${asked}). Set Count to 1.`
        : 'The boss spawns alone: Count is 1.';
      hint.style.color = extra ? 'var(--le-warn)' : '';
    };
    upd();
    this._bind(upd);
    return hint;
  }

  /**
   * The boss arena of an enemy group (optional `arena` / `gate`, relative to the group): shown
   * for the boss kind and for any group that has one; drag the corners / gate ends in a view with
   * the select tool, or type them here.
   */
  _arenaSection(id) {
    const st = this.state;
    const cur = () => st.getObject(id);
    const has = () => !!cur()?.arena;
    const edit = (fn, label) => st.updateObject(id, fn, label);
    const arenaNum = (label, key) => this._numberField(label, {
      get: () => cur()?.arena?.[key],
      set: (v) => { if (v != null && has()) edit((ob) => { ob.arena = { ...ob.arena, [key]: v }; }, 'Edit arena'); },
      step: 0.5,
    });
    const gateNum = (label, k) => this._numberField(label, {
      get: () => cur()?.gate?.[k],
      set: (v) => {
        if (v == null) return;
        edit((ob) => { const g = Array.isArray(ob.gate) ? [...ob.gate] : [...DEFAULT_GATE]; g[k] = v; ob.gate = g; }, 'Edit gate');
      },
      step: 0.5,
    });
    const fields = h('div', null,
      this._pair(arenaNum('Min X', 'minX'), arenaNum('Max X', 'maxX')),
      this._pair(arenaNum('Min Z', 'minZ'), arenaNum('Max Z', 'maxZ')),
      this._pair(gateNum('Gate X0', 0), gateNum('Gate Z0', 1)),
      this._pair(gateNum('Gate X1', 2), gateNum('Gate Z1', 3)));
    const hint = h('p', { class: 'le-hint' });
    const addBtn = h('button', {
      class: 'le-btn is-small', type: 'button', title: 'An 18 × 18 arena around the group with a gate in its south edge',
      onClick: () => edit((ob) => { ob.arena = { ...DEFAULT_ARENA }; ob.gate = [...DEFAULT_GATE]; }, 'Add arena'),
    }, icon(ICONS.plus), 'Add arena and gate');
    const removeBtn = h('button', {
      class: 'le-btn is-small is-danger', type: 'button',
      onClick: () => edit((ob) => { delete ob.arena; delete ob.gate; }, 'Remove arena'),
    }, icon(ICONS.trash), 'Remove arena');
    const section = this._section('Boss arena', [hint, fields, h('div', { class: 'le-actions' }, addBtn, removeBtn)]);
    // (inline display: the editor's button / section styles override the hidden attribute)
    const show = (el, on) => { el.style.display = on ? '' : 'none'; };
    const upd = () => {
      const ob = cur();
      if (!ob) return;
      const boss = !!ownValue(ENEMY_INFO, ob.kind)?.boss;
      show(section, boss || !!ob.arena || !!ob.gate);
      show(fields, !!ob.arena);
      show(addBtn, boss && !ob.arena);
      show(removeBtn, !!ob.arena || !!ob.gate);
      const gap = boss ? gateEdgeGap(ob) : null;
      const offEdge = gap != null && gap > GATE_EDGE_TOLERANCE;
      hint.textContent = !boss
        ? 'Only the boss (Kind golem) has an arena: the game ignores this one, and the views do not show it. Remove it, or set Kind to golem.'
        : offEdge
          ? `The gate is not on the arena's edge (an end is ${gap.toFixed(1)} units off): its ember wall would not meet the barrier. Drag the gate ends onto the edge.`
          : ob.arena
            ? 'Relative to the group. The gate closes behind the player; keep it on the arena edge (it follows a dragged edge). Drag the corners and gate ends with the select tool (V).'
            : 'The boss needs an arena (the fight is locked inside it) and a gate on its edge.';
      hint.style.color = !boss || offEdge || (boss && (!ob.arena || !ob.gate)) ? 'var(--le-warn)' : '';
    };
    upd();
    this._bind(upd);
    return section;
  }

  /** Field editor for one or several objects (mixed values). */
  _fieldEditor(field, ids) {
    const st = this.state;
    const values = () => ids.map((i) => st.getObject(i)).filter(Boolean).map((ob) => getField(ob, field.key));
    const isMixed = (vals) => vals.some((v) => JSON.stringify(v) !== JSON.stringify(vals[0]));
    let live = false;
    const apply = (v, isLive = false) => {
      if (v === undefined) return;
      const label = `Edit ${field.label}`;
      if (!isLive && !live) st.begin(label);
      // an enemy group that is (or becomes) the boss keeps Count 1 (it spawns alone)
      const clamp = field.key === 'kind' || field.key === 'count';
      for (const i of ids) {
        st.updateObject(i, (ob) => {
          setField(ob, field.key, clone(v));
          if (clamp) clampBossCount(ob);
        }, label);
      }
      if (!isLive && !live) st.commit();
    };
    const vals = values();
    const ed = createFieldEditor(field, {
      value: vals[0], mixed: isMixed(vals), apply,
      begin: () => { live = true; st.begin(`Edit ${field.label}`); },
      end: () => { if (live) { live = false; st.commit(); } },
    });
    this._bind(() => { const vv = values(); if (vv.length) ed.set(vv[0], isMixed(vv)); });
    return ed.el;
  }

  // ------------------------------------------------------------------------------ several

  _renderMulti(objs, withSpawn) {
    const counts = new Map();
    for (const o of objs) counts.set(o.type, (counts.get(o.type) ?? 0) + 1);
    const n = objs.length + (withSpawn ? 1 : 0);
    this.body.appendChild(h('div', { class: 'le-card le-multi-card' },
      h('div', { class: 'le-multi-count' }, String(n)),
      h('div', null, h('div', { class: 'le-obj-type' }, `${n} items selected`),
        h('div', { class: 'le-hint' }, 'Edits apply to every selected object.'))));
    const list = h('div', { class: 'le-type-list' });
    for (const [t, c] of counts) {
      list.appendChild(h('button', {
        class: 'le-type-row', type: 'button', title: `Select only the ${OBJECT_TYPES[t].label} objects`,
        onClick: () => this.state.select(objs.filter((o) => o.type === t).map((o) => o.id)),
      }, glyphBadge(t), h('span', null, OBJECT_TYPES[t].label), h('span', { class: 'le-count' }, String(c))));
    }
    if (withSpawn) list.appendChild(h('div', { class: 'le-type-row' }, h('span', { class: 'le-glyph is-md', style: { '--c': SPAWN_MARKER.color } }, SPAWN_MARKER.glyph), h('span', null, 'Player start'), h('span', { class: 'le-count' }, '1')));
    this.body.appendChild(this._section('Selection', [list]));

    this.body.appendChild(this._actions([
      { label: 'Focus', icon: ICONS.focus, onClick: () => this.actions.focus(this.state.selection) },
      { label: '−90°', icon: ICONS.rotate, title: 'Rotate −90° (Ctrl+Shift+R)', onClick: () => this.actions.rotate(-90) },
      { label: '+90°', icon: ICONS.rotateCcw, title: 'Rotate +90° (Ctrl+R)', onClick: () => this.actions.rotate(90) },
      objs.length ? { label: 'Duplicate', icon: ICONS.duplicate, onClick: () => this.actions.duplicate() } : null,
      objs.length ? { label: 'Delete', icon: ICONS.trash, danger: true, onClick: () => this.actions.remove() } : null,
    ]));

    if (counts.size === 1 && !withSpawn) {
      const type = objs[0].type;
      const ids = objs.map((o) => o.id);
      const fields = OBJECT_TYPES[type].fields;
      if (fields.length) this.body.appendChild(this._section(`Shared ${OBJECT_TYPES[type].label} properties`, fields.map((f) => this._fieldEditor(f, ids))));
    }
  }

  // ------------------------------------------------------------------------------ spawn

  _renderSpawn() {
    const st = this.state;
    const s = () => st.level.spawn;
    this.body.appendChild(h('div', { class: 'le-card le-obj-card' },
      h('span', { class: 'le-glyph is-xl', style: { '--c': SPAWN_MARKER.color } }, SPAWN_MARKER.glyph),
      h('div', { class: 'le-obj-titles' }, h('div', { class: 'le-obj-type' }, 'Player start'), h('div', { class: 'le-hint' }, 'Where the player appears when the level starts.'))));
    const setPos = (k) => (v) => {
      if (v == null) return;
      const p = { ...s(), [k]: v };
      st.setSpawn(p.x, p.z, p.facing);
    };
    const status = h('div', { class: 'le-status-line' });
    const upd = () => {
      const ok = isWalkableAt(st.level, s().x, s().z);
      const d = tileDef(st.level, Math.floor(s().x), Math.floor(s().z));
      const deck = ok && onBridgeDeck(st.level, s().x, s().z);
      clear(status).append(icon(ok ? ICONS.check : ICONS.warning), ok ? (deck ? 'On a bridge deck' : 'On walkable ground') : d ? 'Not walkable — move it onto ground or a bridge' : 'Outside the map');
      status.classList.toggle('is-bad', !ok);
    };
    upd();
    this._bind(upd);
    const facing = selectControl({ value: s().facing, options: [{ value: 'down', label: 'Down (toward camera)' }, { value: 'up', label: 'Up' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }], onChange: (v) => st.setSpawn(s().x, s().z, v) });
    this._bind(() => facing.set(s().facing));
    this.body.appendChild(this._section('Position', [
      this._pair(this._numberField('X', { get: () => s().x, set: setPos('x'), step: 0.5 }), this._numberField('Z', { get: () => s().z, set: setPos('z'), step: 0.5 })),
      h('div', { class: 'le-field' }, h('label', { class: 'le-field-label' }, 'Facing'), h('div', { class: 'le-field-control' }, facing.el)),
      status,
    ]));
    this.body.appendChild(this._actions([
      { label: 'Focus', icon: ICONS.focus, onClick: () => this.actions.focus(['spawn']) },
      { label: 'Snap to tile centre', icon: ICONS.magnet, onClick: () => st.setSpawn(Math.floor(s().x) + 0.5, Math.floor(s().z) + 0.5) },
    ]));
  }

  // ------------------------------------------------------------------------------ level

  _renderLevel() {
    const st = this.state;
    const L = () => st.level;
    const title = h('div', { class: 'le-level-name' });
    const sub = h('div', { class: 'le-level-sub' });
    const stats = h('div', { class: 'le-stats' });
    const combat = h('div', { class: 'le-status-line' });
    const valid = h('div', { class: 'le-status-line' });
    const upd = () => {
      const lv = L();
      title.textContent = lv.name || 'Untitled';
      sub.textContent = lv.subtitle || (lv.author ? `by ${lv.author}` : 'No subtitle');
      const s = levelStats(lv);
      const lights = countLights(lv);
      const npcs = s.counts.npc ?? 0;
      const tiles = lv.width * lv.depth;
      clear(stats).append(
        stat('Size', `${lv.width} × ${lv.depth}`),
        stat('Objects', String(s.objects)),
        stat('Lights', lights > 12 ? `${lights} · 12 lit` : `${lights} / 12`, lights > 12 ? 'The game shares its 12 point lights among the lanterns, torches and campfires around the player (they crossfade as you walk).' : ''),
        stat('Villagers', String(npcs)),
        stat('Water', `${Math.round((s.water / tiles) * 100)}%`),
        stat('Walkable', `${Math.round((s.walkable / tiles) * 100)}%`),
      );
      // combat levels (COMBAT.md §17): "Enemies n (groups g) · Waystones n · Chests n"
      const c = combatStats(lv);
      const on = levelHasCombat(lv);
      const shown = !!(c.groups || c.waystones || c.chests || on);
      combat.style.display = shown ? '' : 'none';
      if (shown) {
        const mode = lv.environment?.combat === true ? 'on' : lv.environment?.combat === false ? 'off' : `auto (${on ? 'on' : 'off'})`;
        const bad = (lv.environment?.combat === false && c.groups > 0) || (on && !c.waystones);
        clear(combat).append(icon(bad ? ICONS.warning : ICONS.info),
          `Enemies ${c.enemies} (groups ${c.groups}) · Waystones ${c.waystones} · Chests ${c.chests}`);
        combat.title = `Combat ${mode}${bad ? (on ? ' — no Waystone: a defeated player restarts at the player start' : ' — these enemies do not appear in the game') : ''} (Level settings › Environment).`;
        combat.classList.toggle('is-bad', bad);
      }
      const errors = validateLevel(lv).map(friendlyProblem);
      clear(valid).append(icon(errors.length ? ICONS.warning : ICONS.check), errors.length ? errors.join(' ') : 'Ready to play-test');
      valid.classList.toggle('is-bad', errors.length > 0);
    };
    upd();
    this._bind(upd);
    this.body.appendChild(h('div', { class: 'le-card le-level-card' }, title, sub, stats, combat, valid));

    const env = () => L().environment;
    let live = false;
    const tod = numberControl({
      value: env().timeOfDay, min: 0, max: 24, step: 0.25, suffix: 'h',
      onChange: (v) => { if (v != null) st.setLevelProps({ environment: { timeOfDay: v } }, 'Time of day'); },
      onInput: (v) => st.setLevelProps({ environment: { timeOfDay: v } }, 'Time of day'),
      onBegin: () => { live = true; st.begin('Time of day'); },
      onEnd: () => { if (live) { live = false; st.commit(); } },
    });
    const weather = selectControl({ value: env().weather, options: WEATHER, onChange: (v) => st.setLevelProps({ environment: { weather: v } }, 'Weather') });
    const wl = numberControl({
      value: L().waterLevel, min: -2, max: 10, step: 0.05, slider: false,
      onChange: (v) => { if (v != null) st.setLevelProps({ waterLevel: v }, 'Water level'); },
    });
    this._bind(() => { tod.set(env().timeOfDay); weather.set(env().weather); wl.set(L().waterLevel); });
    // the 3D preview always shows the weather's light; the rain / snow, its haze and the snow
    // cover only with its atmosphere (particles) layer
    const wHint = h('p', { class: 'le-hint le-weather-hint' });
    const updHint = () => {
      const w = env().weather;
      const on = (w === 'rain' || w === 'snow') && !st.view.atmosphere;
      wHint.hidden = !on;
      if (!on) return;
      clear(wHint).append(`${w === 'rain' ? 'Rain and haze show' : 'Snowfall and snow cover show'} in the 3D view with particles on. `,
        h('button', { class: 'le-link-btn', type: 'button', onClick: () => st.setView({ atmosphere: true }) }, 'Show it'));
    };
    updHint();
    this.bindings.push({ update: updHint, view: true });
    const todHint = h('p', { class: 'le-hint' }, 'The 3D preview shows the start time while its sun slider is linked (3D view bar).');
    this.body.appendChild(this._section('Environment', [
      h('div', { class: 'le-field' }, h('label', { class: 'le-field-label' }, 'Start time'), h('div', { class: 'le-field-control' }, tod.el)),
      todHint,
      h('div', { class: 'le-field' }, h('label', { class: 'le-field-label' }, 'Weather'), h('div', { class: 'le-field-control' }, weather.el)),
      wHint,
      h('div', { class: 'le-field', title: 'World height of the water surface' }, h('label', { class: 'le-field-label' }, 'Water level'), h('div', { class: 'le-field-control' }, wl.el)),
    ]));
    this.body.appendChild(this._actions([
      { label: 'Level settings…', icon: ICONS.settings, onClick: () => this.actions.settings() },
      { label: 'Resize…', icon: ICONS.resize, onClick: () => this.actions.resize() },
      { label: 'Play-test', icon: ICONS.play, primary: true, title: 'F5', onClick: () => this.actions.playtest() },
    ]));
    this.body.appendChild(h('p', { class: 'le-hint le-pad' }, 'Select an object (V) or the player start to edit it here. Nothing is selected, so this shows the level.'));
  }
}

function stat(label, value, title = '', warn = false) {
  return h('div', { class: ['le-stat', warn && 'is-warn'], title: title || null }, h('div', { class: 'le-stat-value' }, value), h('div', { class: 'le-stat-label' }, label));
}

const clone = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
