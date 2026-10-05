import './ui.css';

/**
 * Heads-up display: location plate (top-left), time-of-day clock with sun/moon icon and phase
 * name (top-right), controls legend with keycaps (bottom-left) and toast messages (top-centre).
 */

/** Default legend matching the engine's default Input bindings. */
export const DEFAULT_CONTROLS = [
  { keys: 'WASD', label: 'Move' },
  { keys: 'Shift', label: 'Run' },
  { keys: 'Space', label: 'Talk / Confirm' },
  { keys: 'Q/E', label: 'Rotate camera' },
  { keys: 'Wheel', label: 'Zoom' },
  { keys: 'T', label: 'Time of day' },
  { keys: 'R', label: 'Weather' },
  { keys: 'P', label: 'Photo mode' },
  { keys: 'M', label: 'Music' },
  { keys: '`', label: 'Debug panel' },
];

/** Phase ids → display names. */
export const TIME_PHASES = {
  night: 'Night',
  dawn: 'Dawn',
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  golden: 'Golden Hour',
  dusk: 'Dusk',
};

/**
 * Time-of-day phase for an hour value.
 * @param {number} h hours in [0, 24)
 * @returns {'night'|'dawn'|'morning'|'midday'|'afternoon'|'golden'|'dusk'}
 */
export function timePhase(h) {
  if (h < 4.75 || h >= 20.5) return 'night';
  if (h < 7) return 'dawn';
  if (h < 11) return 'morning';
  if (h < 14) return 'midday';
  if (h < 16.5) return 'afternoon';
  if (h < 18.75) return 'golden';
  return 'dusk';
}

const KEY_LABELS = {
  Space: 'Space', Shift: 'Shift', Enter: 'Enter', Escape: 'Esc', Esc: 'Esc', Backquote: '~', '`': '~', Tab: 'Tab',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Ctrl: 'Ctrl', Alt: 'Alt',
  // mouse buttons (combat bindings, COMBAT.md §5.2)
  Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB',
};

// ---- icons ---------------------------------------------------------------------------------

function rays(cx, cy, r0, rLong, rShort, angles, color, width) {
  let d = '';
  for (let i = 0; i < angles.length; i++) {
    const a = (angles[i] * Math.PI) / 180;
    const r1 = i % 2 === 0 ? rLong : rShort;
    const c = Math.cos(a);
    const s = Math.sin(a);
    d += `M${(cx + c * r0).toFixed(2)} ${(cy + s * r0).toFixed(2)}L${(cx + c * r1).toFixed(2)} ${(cy + s * r1).toFixed(2)}`;
  }
  return `<path d="${d}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" fill="none"/>`;
}

const ALL8 = [0, 45, 90, 135, 180, 225, 270, 315];
const FAN = [-180, -150, -120, -90, -60, -30, 0];

const ICONS = {
  sun: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <g class="lu-rays">${rays(16, 16, 9.3, 14, 12, ALL8, '#f4d27e', 1.7)}</g>
    <circle cx="16" cy="16" r="6.8" fill="#eeac3f" stroke="#5a3a12" stroke-width=".9"/>
    <circle cx="14.6" cy="14.4" r="4.3" fill="#ffe29a"/>
    <circle cx="13.4" cy="13.1" r="1.5" fill="#fff8dc"/>
  </svg>`,
  golden: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="17" r="11.5" fill="#f59a3a" opacity=".18"/>
    <g class="lu-rays">${rays(16, 17, 9.4, 13.8, 11.8, ALL8, '#f7b25c', 1.6)}</g>
    <circle cx="16" cy="17" r="6.8" fill="#ec8a33" stroke="#5a2a10" stroke-width=".9"/>
    <circle cx="14.7" cy="15.5" r="4.2" fill="#ffc46e"/>
    <circle cx="13.5" cy="14.3" r="1.4" fill="#fff0c8"/>
  </svg>`,
  dawn: `<svg viewBox="0 0 32 32" aria-hidden="true">
    ${rays(16, 20.5, 10, 14.2, 12.4, FAN, '#f6c49a', 1.6)}
    <path d="M8.6 20.5a7.4 7.4 0 0 1 14.8 0z" fill="#f29f7e" stroke="#5a2a22" stroke-width=".9"/>
    <path d="M11.2 20.5a4.8 4.8 0 0 1 8 -3.6" fill="none" stroke="#ffd9b0" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M3.5 20.5h25" stroke="#e8cf8a" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M10.5 24h11M13 27h6" stroke="#f2b7a0" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>
  </svg>`,
  dusk: `<svg viewBox="0 0 32 32" aria-hidden="true">
    ${rays(16, 20.5, 10, 13.6, 12, FAN, '#d9a0c4', 1.5)}
    <path d="M8.6 20.5a7.4 7.4 0 0 1 14.8 0z" fill="#d9788e" stroke="#3e1a33" stroke-width=".9"/>
    <path d="M11.2 20.5a4.8 4.8 0 0 1 8 -3.6" fill="none" stroke="#f5b3b8" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M3.5 20.5h25" stroke="#c9a45c" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M10.5 24h11M13 27h6" stroke="#b58ac0" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>
  </svg>`,
  night: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M14.92 6.06A10 10 0 1 0 25.46 19.23A8.5 8.5 0 0 1 14.92 6.06z" fill="#dfe6fb" stroke="#1d2447" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M12.2 9.4A7.6 7.6 0 0 0 16.4 23.6" fill="none" stroke="#fbfdff" stroke-width="1.3" stroke-linecap="round" opacity=".85"/>
    <circle cx="11.4" cy="18.6" r="1.2" fill="#b6c2e6"/><circle cx="15.2" cy="22.4" r=".8" fill="#b6c2e6"/>
    <path d="M25.5 4.2l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z" fill="#fff6d6"/>
    <path d="M28.6 12.2l.45 1.15 1.15.45-1.15.45-.45 1.15-.45-1.15-1.15-.45 1.15-.45z" fill="#e8eeff"/>
  </svg>`,
};
const PHASE_ICON = { night: 'night', dawn: 'dawn', morning: 'sun', midday: 'sun', afternoon: 'sun', golden: 'golden', dusk: 'dusk' };

const SVG_COMPASS = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <circle cx="12" cy="12" r="8.2" fill="none" stroke="#c9a45c" stroke-width=".9" opacity=".85"/>
  <path d="M12 .8 14 10 23.2 12 14 14 12 23.2 10 14 .8 12 10 10z" fill="#d9b86e" stroke="#20150a" stroke-width=".8" stroke-linejoin="round"/>
  <path d="M12 .8 12 12 10 10zM.8 12 12 12 10 14zM23.2 12 12 12 14 10zM12 23.2 12 12 14 14z" fill="#fff4d0" opacity=".7"/>
  <circle cx="12" cy="12" r="1.6" fill="#2a1c0a"/>
</svg>`;

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Build keycap markup for a key spec.
 * @param {string|string[]} keys e.g. 'WASD', 'Q/E', 'Shift+Space', ['Q', 'E']
 * @returns {HTMLElement}
 */
export function createKeycaps(keys) {
  const wrap = document.createElement('span');
  wrap.className = 'lu-keys';
  let parts;
  let sep = null;
  if (Array.isArray(keys)) parts = keys;
  else if (String(keys).length > 1 && String(keys).includes('+')) { parts = String(keys).split('+'); sep = '+'; }
  else if (String(keys).length > 1 && String(keys).includes('/')) parts = String(keys).split('/');
  else parts = [String(keys)];
  parts.forEach((p, i) => {
    if (i > 0 && sep) {
      const s = document.createElement('span');
      s.className = 'lu-key-sep';
      s.textContent = sep;
      wrap.appendChild(s);
    }
    const k = document.createElement('kbd');
    const label = KEY_LABELS[p.trim()] ?? p.trim();
    k.className = label.length >= 4 ? 'lu-key lu-key--wide' : /^[A-Za-z0-9]*$/.test(label) ? 'lu-key' : 'lu-key lu-key--sym';
    k.textContent = label;
    wrap.appendChild(k);
  });
  return wrap;
}

export class HUD {
  /** @param {HTMLElement} parent */
  constructor(parent = document.body) {
    const el = document.createElement('div');
    el.className = 'lu-hud';
    el.innerHTML = `
      <div class="lu-loc is-empty">
        <span class="lu-loc__icon">${SVG_COMPASS}</span>
        <div class="lu-loc__text"><div class="lu-loc__name"></div><div class="lu-loc__sub"></div></div>
      </div>
      <div class="lu-clock lu-panel lu-panel--simple" data-phase="golden">
        <span class="lu-clock__icon"></span>
        <div class="lu-clock__body">
          <div class="lu-clock__time"><span></span><span></span><span class="lu-clock__colon">:</span><span></span><span></span></div>
          <div class="lu-clock__phase"></div>
          <div class="lu-clock__track"><span class="lu-clock__mark"></span></div>
        </div>
      </div>
      <div class="lu-help lu-panel lu-panel--simple is-empty">
        <div class="lu-help__title">Controls</div>
        <div class="lu-help__grid"></div>
        <div class="lu-help__foot"></div>
      </div>
      <div class="lu-toasts"></div>`;
    parent.appendChild(el);
    this.element = el;

    /** @type {HTMLElement} */
    this._loc = el.querySelector('.lu-loc');
    this._locName = el.querySelector('.lu-loc__name');
    this._locSub = el.querySelector('.lu-loc__sub');
    /** @type {HTMLElement} */
    this._clock = el.querySelector('.lu-clock');
    this._icon = el.querySelector('.lu-clock__icon');
    this._phaseEl = el.querySelector('.lu-clock__phase');
    /** @type {HTMLElement} */
    this._mark = el.querySelector('.lu-clock__mark');
    const spans = el.querySelectorAll('.lu-clock__time > span');
    this._digits = [spans[0], spans[1], spans[3], spans[4]].map((s) => {
      const t = document.createTextNode('0');
      s.appendChild(t);
      return t;
    });
    /** @type {HTMLElement} */
    this._help = el.querySelector('.lu-help');
    this._helpGrid = el.querySelector('.lu-help__grid');
    /** @type {HTMLElement} */
    this._helpFoot = el.querySelector('.lu-help__foot');
    this._toasts = el.querySelector('.lu-toasts');

    /** Key shown in the legend footer as the help toggle ('' hides the footer). */
    this.helpKey = 'H';
    /** Maximum toasts stacked at once. */
    this.maxToasts = 3;

    this._visible = true;
    this._helpVisible = true;
    this._hours = -1;
    this._minute = -1;
    this._phase = '';
    this._locationName = '';
    this._locationSub = '';
    this._timers = new Set();

    this.setTime(17.2);
    this.setControls(DEFAULT_CONTROLS);
  }

  /** Whole-HUD visibility (fades). */
  get visible() { return this._visible; }
  set visible(v) {
    this._visible = !!v;
    this.element.classList.toggle('is-hidden', !this._visible);
  }

  /** The clock panel element (used to place the debug panel below it). */
  get clockElement() { return this._clock; }
  /** The location plate element (`.lu-loc`). */
  get locationElement() { return this._loc; }
  /** The controls legend panel element (`.lu-help`). */
  get helpElement() { return this._help; }
  /** Current hours value last passed to setTime. */
  get hours() { return this._hours; }
  /** Current phase id (see TIME_PHASES). */
  get phase() { return this._phase; }
  get helpVisible() { return this._helpVisible; }

  /**
   * Update the clock. Cheap to call every frame: the DOM only changes when the minute changes.
   * @param {number} hours 0..24 (wraps)
   */
  setTime(hours) {
    if (!Number.isFinite(hours)) return;
    const h = ((hours % 24) + 24) % 24;
    this._hours = h;
    const minute = Math.floor(h * 60) % 1440;
    if (minute === this._minute) return;
    this._minute = minute;
    const hh = Math.floor(minute / 60);
    const mm = minute % 60;
    const d = this._digits;
    d[0].nodeValue = DIGITS[(hh / 10) | 0];
    d[1].nodeValue = DIGITS[hh % 10];
    d[2].nodeValue = DIGITS[(mm / 10) | 0];
    d[3].nodeValue = DIGITS[mm % 10];
    this._mark.style.setProperty('--lu-t', (minute / 1440).toFixed(4));
    const phase = timePhase(h);
    if (phase !== this._phase) {
      const prevIcon = PHASE_ICON[this._phase];
      this._phase = phase;
      this._clock.dataset.phase = phase;
      this._phaseEl.textContent = TIME_PHASES[phase];
      if (PHASE_ICON[phase] !== prevIcon) this._icon.innerHTML = ICONS[PHASE_ICON[phase]];
    }
  }

  /**
   * Set the location plate text.
   * @param {string} name
   * @param {string} [subtitle] optional smaller italic line (region, district…)
   */
  setLocation(name, subtitle = '') {
    const n = String(name ?? '');
    const s = String(subtitle ?? '');
    if (n === this._locationName && s === this._locationSub) return;
    const had = !!this._locationName;
    this._locationName = n;
    this._locationSub = s;
    this._locName.textContent = n;
    this._locSub.textContent = s;
    this._loc.classList.toggle('is-empty', !n);
    if (n && had) {
      this._loc.classList.add('is-swap');
      void this._loc.offsetWidth;
      this._loc.classList.remove('is-swap');
    }
  }

  /** Show / hide the controls legend. */
  showHelp(show) {
    this._helpVisible = !!show;
    this._help.classList.toggle('is-hidden', !this._helpVisible);
  }

  toggleHelp() { this.showHelp(!this._helpVisible); return this._helpVisible; }

  /**
   * Replace the controls legend.
   * @param {{ keys: string|string[], label: string }[]} list
   */
  setControls(list = []) {
    const grid = this._helpGrid;
    grid.textContent = '';
    for (const item of list) {
      const keys = createKeycaps(item.keys);
      keys.classList.add('lu-help__keys');
      const label = document.createElement('span');
      label.className = 'lu-help__label';
      label.textContent = item.label ?? '';
      grid.appendChild(keys);
      grid.appendChild(label);
    }
    this._help.classList.toggle('is-empty', list.length === 0);
    this._helpFoot.textContent = '';
    if (this.helpKey) {
      this._helpFoot.appendChild(createKeycaps(this.helpKey));
      this._helpFoot.appendChild(document.createTextNode(' Hide controls'));
    }
    this._helpFoot.style.display = this.helpKey ? '' : 'none';
  }

  /**
   * Show a short message at the top centre.
   * @param {string} text
   * @param {number} [seconds]
   */
  toast(text, seconds = 2.5) {
    const el = document.createElement('div');
    el.className = 'lu-toast';
    el.innerHTML = '<span class="lu-gem"></span><span class="lu-toast__text"></span><span class="lu-gem"></span>';
    el.children[1].textContent = String(text ?? '');
    this._toasts.appendChild(el);
    while (this._toasts.children.length > this.maxToasts) this._toasts.firstElementChild.remove();
    void el.offsetWidth;
    el.classList.add('is-on');
    const t1 = setTimeout(() => {
      this._timers.delete(t1);
      el.classList.add('is-off');
      const t2 = setTimeout(() => { this._timers.delete(t2); el.remove(); }, 520);
      this._timers.add(t2);
    }, Math.max(0.5, seconds) * 1000);
    this._timers.add(t1);
    return el;
  }

  /**
   * Per-frame hook (reserved; the HUD is event driven). UI.update passes `dt`, unused so far.
   * @type {(dt?: number) => void}
   */
  update() {}

  dispose() {
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    this.element.remove();
  }
}
