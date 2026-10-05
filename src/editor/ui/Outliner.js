/**
 * Outliner (right column, bottom): every object of the level grouped by type, with a filter,
 * per-type visibility (eye) toggles, click / Shift / Ctrl selection and double-click focus.
 */
import { h, icon } from './dom.js';
import { glyphBadge } from './ToolOptions.js';
import { ICONS } from '../icons.js';
import { OBJECT_TYPES, SPAWN_MARKER, objectCenter } from '../../engine/level/ObjectCatalog.js';

/** @import { EditorState } from '../EditorState.js' */

const ORDER = Object.keys(OBJECT_TYPES);

export class Outliner {
  /**
   * @param {HTMLElement} host
   * @param {EditorState} state
   * @param {{ focus(ids: string[]): void }} actions
   */
  constructor(host, state, actions) {
    this.state = state;
    this.actions = actions;
    this.collapsed = new Set();
    this.filter = '';
    this.rows = new Map();
    this.el = h('section', { class: 'le-panel le-outliner', 'aria-label': 'Outliner' });
    this.count = h('span', { class: 'le-panel-note' });
    this.search = h('input', {
      class: 'le-input le-search', type: 'search', placeholder: 'Filter objects…', spellcheck: false,
      onInput: () => { this.filter = this.search.value.trim().toLowerCase(); this.render(); },
      onKeydown: (e) => { if (e.key === 'Escape') { this.search.value = ''; this.filter = ''; this.render(); this.search.blur(); e.stopPropagation(); } },
    });
    this.list = h('div', { class: 'le-outliner-list le-scroll', role: 'tree', tabIndex: 0 });
    this.el.append(
      h('div', { class: 'le-panel-header' }, icon(ICONS.layers, 'le-icon le-panel-header-icon'), h('span', { class: 'le-panel-title' }, 'Outliner'), this.count),
      h('div', { class: 'le-search-wrap' }, icon(ICONS.search, 'le-icon le-search-icon'), this.search),
      this.list,
    );
    host.appendChild(this.el);
    this._raf = 0;
    const later = () => { cancelAnimationFrame(this._raf); this._raf = requestAnimationFrame(() => this.render()); };
    state.on('change', (info) => { if (info.objects || info.source !== 'edit') later(); });
    state.on('selection', () => this.updateSelection(true));
    state.on('view', later);
    this.render();
  }

  render() {
    const st = this.state;
    const f = this.filter;
    // only positions changed (drags, nudges): update the coordinates in place, no rebuild
    const sig = `${f}#${(st.view.hiddenTypes ?? []).join(',')}#${[...this.collapsed].join(',')}#${st.level.objects.map((o) => `${o.id}|${o.type}|${o.name ?? ''}`).join('/')}`;
    if (sig === this._sig) { this._updateMeta(); return; }
    this._sig = sig;
    const hidden = new Set(st.view.hiddenTypes ?? []);
    const groups = new Map();
    let total = 0;
    for (const o of st.level.objects) {
      const def = OBJECT_TYPES[o.type];
      const text = `${o.id} ${o.name ?? ''} ${def.label} ${def.category}`.toLowerCase();
      total++;
      if (f && !text.includes(f)) continue;
      if (!groups.has(o.type)) groups.set(o.type, []);
      groups.get(o.type).push(o);
    }
    this.count.textContent = `${total} object${total === 1 ? '' : 's'}`;
    // The wanted rows (keyed); existing row elements are reused and only the difference touches
    // the DOM — placing one object on a 400-object level adds one row instead of rebuilding all.
    const items = [];
    const add = (key, make) => items.push({ key, make });

    // player start
    if (!f || 'player start spawn'.includes(f)) {
      add('row:spawn', () => this._row({ id: 'spawn', glyph: h('span', { class: 'le-glyph is-sm', style: { '--c': SPAWN_MARKER.color } }, SPAWN_MARKER.glyph), label: 'Player start', meta: `${fmt1(st.level.spawn.x)}, ${fmt1(st.level.spawn.z)}` }));
    }
    for (const type of ORDER) {
      const objs = groups.get(type);
      if (!objs?.length) continue;
      const def = OBJECT_TYPES[type];
      const isHidden = hidden.has(type);
      const collapsed = this.collapsed.has(type) && !f;
      add(`group:${type}|${objs.length}|${isHidden}|${collapsed}`, () => this._groupHead(type, def, objs, isHidden, collapsed));
      if (collapsed) continue;
      for (const o of objs) {
        const label = o.name ? `${o.name}` : o.id;
        const sub = o.name ? o.id : '';
        add(`row:${o.id}|${label}|${sub}|${isHidden}`, () => {
          const c = objectCenter(o);
          return this._row({ id: o.id, glyph: null, label, sub, meta: `${fmt1(c.x)}, ${fmt1(c.z)}`, hidden: isHidden });
        });
      }
    }
    if (!items.length) add(`empty:${f ? 1 : 0}`, () => h('div', { class: 'le-empty' }, f ? 'No objects match the filter.' : 'No objects yet — pick one in the palette (O) and click on the map.'));
    // (rows are kept, not rebuilt: the list keeps its scroll position by itself — writing
    // scrollTop here would force a layout of every row on each added object)
    this._reconcile(items);
    this._updateMeta();
    this.updateSelection(false);
  }

  /** Make the list's children match `items` ({ key, make }), reusing elements by key. */
  _reconcile(items) {
    const old = this._nodes ?? new Map();
    const fresh = new Map();
    this.rows.clear();
    let cursor = this.list.firstChild;
    for (const it of items) {
      let el = old.get(it.key);
      if (!el || fresh.has(it.key)) el = it.make();
      fresh.set(it.key, el);
      if (it.key.startsWith('row:')) this.rows.set(el.dataset.id, el);
      if (el === cursor) { cursor = cursor.nextSibling; continue; }
      this.list.insertBefore(el, cursor);
    }
    while (cursor) {
      const n = cursor.nextSibling;
      cursor.remove();
      cursor = n;
    }
    this._nodes = fresh;
  }

  _groupHead(type, def, objs, isHidden, collapsed) {
    const st = this.state;
    {
      const eye = h('button', {
        class: ['le-eye', isHidden && 'is-off'], type: 'button', title: isHidden ? `Show ${def.label} objects` : `Hide ${def.label} objects in the views`,
        onClick: (e) => {
          e.stopPropagation();
          const hs = new Set(st.view.hiddenTypes ?? []);
          if (hs.has(type)) hs.delete(type); else hs.add(type);
          st.setView({ hiddenTypes: [...hs] });
        },
      }, icon(isHidden ? ICONS.eyeOff : ICONS.eye));
      const head = h('div', {
        class: ['le-group', collapsed && 'is-collapsed', isHidden && 'is-hidden'], role: 'treeitem',
        onClick: (e) => {
          // (the ids of this type now: the head element outlives edits that keep the count)
          if (e.shiftKey || e.ctrlKey || e.metaKey) { st.select(st.level.objects.filter((o) => o.type === type).map((o) => o.id), { additive: true }); return; }
          if (this.collapsed.has(type)) this.collapsed.delete(type); else this.collapsed.add(type);
          this.render();
        },
        title: 'Click: collapse · Shift+click: select all of this type',
      }, icon(ICONS.chevronDown, 'le-icon le-group-caret'), glyphBadge(type, 'sm'), h('span', { class: 'le-group-label' }, def.label), h('span', { class: 'le-count' }, String(objs.length)), eye);
      return head;
    }
  }

  /** Refresh the coordinate column of every row. */
  _updateMeta() {
    const st = this.state;
    const byId = new Map(st.level.objects.map((o) => [o.id, o]));
    for (const [id, row] of this.rows) {
      let text;
      if (id === 'spawn') text = `${fmt1(st.level.spawn.x)}, ${fmt1(st.level.spawn.z)}`;
      else {
        const o = byId.get(id);
        if (!o) continue;
        const c = objectCenter(o);
        text = `${fmt1(c.x)}, ${fmt1(c.z)}`;
      }
      if (row._meta.textContent !== text) row._meta.textContent = text;
    }
  }

  _row({ id, glyph, label, sub = '', meta = '', hidden = false }) {
    const st = this.state;
    /** @type {HTMLDivElement & { _meta?: HTMLSpanElement }} the row; `_meta` its right-hand count */
    const row = h('div', {
      class: ['le-row-item', hidden && 'is-hidden', glyph && 'is-top'], role: 'treeitem', tabIndex: -1, dataset: { id },
      onClick: (e) => {
        if (e.shiftKey) st.select([id], { additive: true });
        else if (e.ctrlKey || e.metaKey) st.select([id], { toggle: true });
        else st.select([id]);
      },
      onDblclick: () => this.actions.focus([id]),
    }, glyph ?? h('span', { class: 'le-row-indent' }), h('span', { class: 'le-row-label' }, label, sub ? h('span', { class: 'le-row-sub' }, sub) : null));
    row._meta = h('span', { class: 'le-row-meta' }, meta);
    row.appendChild(row._meta);
    return row;
  }

  updateSelection(scroll) {
    const sel = new Set(this.state.selection);
    let first = null;
    // only rows whose state changes are touched (a big level has hundreds of rows)
    for (const [id, row] of this.rows) {
      const on = sel.has(id);
      if (row._sel !== on) {
        row._sel = on;
        row.classList.toggle('is-selected', on);
        row.setAttribute('aria-selected', on ? 'true' : 'false');
      }
      if (on && !first) first = row;
    }
    if (scroll && first && !this.el.matches(':hover')) first.scrollIntoView({ block: 'nearest' });
  }
}

const fmt1 = (v) => (Math.round(v * 10) / 10).toString();
