/**
 * Status bar: tile coordinates, tile name, height level and world position under the pointer;
 * the active tool's help or transient messages; object count, level size and 2D zoom.
 */
import { h, icon, clear } from './dom.js';
import { ICONS } from '../icons.js';
import { getTool } from '../tools/index.js';
import { getTile, getHeightLevel, levelToWorld } from '../../engine/level/LevelFormat.js';
import { tileLabel, tileColor } from '../tools/common.js';

export class StatusBar {
  constructor(host, state) {
    this.state = state;
    this.pos = h('div', { class: 'le-status-pos' });
    this.msgIcon = h('span', { class: 'le-status-msg-icon' });
    this.msg = h('div', { class: 'le-status-msg' });
    this.right = h('div', { class: 'le-status-right' });
    this.zoom = h('span', { class: 'le-status-zoom', title: '2D map zoom (100% = 16 px per tile)' });
    this.counts = h('span');
    this.right.append(this.counts, h('span', { class: 'le-status-sep' }), this.zoom);
    this.el = h('footer', { class: 'le-statusbar' }, this.pos, h('div', { class: 'le-status-center' }, this.msgIcon, this.msg), this.right);
    host.appendChild(this.el);
    this._timer = 0;
    this._message = null;
    state.on('hover', () => this.updatePos());
    state.on('tool', () => this.updateHelp());
    state.on('status', (m) => this.flash(m));
    state.on('change', () => { this.updateCounts(); this.updatePos(); });
    state.on('selection', () => this.updateCounts());
    this.updatePos();
    this.updateHelp();
    this.updateCounts();
  }

  updatePos() {
    const hv = this.state.hover;
    const L = this.state.level;
    clear(this.pos);
    if (!hv) { this.pos.appendChild(h('span', { class: 'le-dim' }, 'Move the pointer over the map')); return; }
    const ch = getTile(L, hv.i, hv.j);
    const lvl = getHeightLevel(L, hv.i, hv.j);
    this.pos.append(...[
      h('span', { class: 'le-status-coord', title: 'Tile (column, row)' }, `${hv.i}, ${hv.j}`),
      ch != null
        ? h('span', { class: 'le-status-tile' }, h('span', { class: 'le-status-dot', style: { background: tileColor(ch, L.legend[ch]) } }), tileLabel(L, ch))
        : h('span', { class: 'le-dim' }, 'outside the map'),
      lvl != null ? h('span', { title: 'Height level (world y)' }, `Lv ${lvl}`, h('span', { class: 'le-dim' }, ` · y ${levelToWorld(lvl).toFixed(1)}`)) : null,
      h('span', { class: 'le-dim', title: 'World position' }, `x ${hv.x.toFixed(2)}  z ${hv.z.toFixed(2)}`),
    ].filter(Boolean)); // (Element.append would print a null as "null")
  }

  updateHelp() {
    if (this._message) return;
    const t = getTool(this.state.toolId);
    clear(this.msgIcon).appendChild(icon(t.icon));
    this.msg.textContent = t.help;
    this.el.classList.remove('is-flash', 'is-error');
  }

  /** Show a transient message for a few seconds. */
  flash(message, { error = /error|fail|could not|not found|invalid/i.test(String(message)) } = {}) {
    clearTimeout(this._timer);
    this._message = String(message);
    clear(this.msgIcon).appendChild(icon(error ? ICONS.warning : ICONS.info));
    this.msg.textContent = this._message;
    this.el.classList.remove('is-flash');
    void this.el.offsetWidth;
    this.el.classList.add('is-flash');
    this.el.classList.toggle('is-error', error);
    this._timer = setTimeout(() => { this._message = null; this.updateHelp(); }, error ? 7000 : 4200);
  }

  updateCounts() {
    const L = this.state.level;
    const sel = this.state.selection.length;
    this.counts.textContent = `${L.objects.length} object${L.objects.length === 1 ? '' : 's'}${sel ? ` · ${sel} selected` : ''} · ${L.width} × ${L.depth}`;
  }

  setZoom(pct) {
    this.zoom.textContent = `2D ${pct}%`;
  }
}
