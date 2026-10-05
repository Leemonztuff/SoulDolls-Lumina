import { createKeycaps } from './HUD.js';
import { svgUrl } from './WorldLabels.js';
import './ui.css';
import './combat.css';

/**
 * CombatHUD — the player's combat readouts inside the HUD (COMBAT.md §13.1–§13.2): vitals under
 * the location plate (`.lu-vitals`: level, HP / MP / SP bars, XP track), the skill bar with the
 * draught slot and the gold counter (`.lu-skills`, bottom-right) and the loot feed (`.lu-loot`,
 * right edge above the skill bar). Created by `UI.enableCombat()` on combat levels only; every
 * setter is cheap to call every frame (it writes the DOM only on change).
 *
 * The vitals sit at a **fixed** offset: the location plate's top + its two-line height, measured
 * once here (with an invisible two-line copy of the plate) and again only on window resize — the
 * region name, subtitle or the plate's `is-empty` state never move them.
 */

// ---- icons (vector, like the HUD clock icons) -----------------------------------------------

const SKILL_ICONS = {
  // three crescent blades swirling round a gold diamond
  whirl: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="12.5" fill="#e8cf8a" opacity=".1"/>
    ${[0, 120, 240].map((a) => `<path transform="rotate(${a} 16 16)" d="M16 2.8A13.2 13.2 0 0 1 28.4 11.6 9.4 9.4 0 0 0 15.2 7.6z" fill="#f4e8c6" stroke="#20150a" stroke-width=".9" stroke-linejoin="round"/>
    <path transform="rotate(${a} 16 16)" d="M17.2 4.6A11 11 0 0 1 26 10" fill="none" stroke="#fffaf0" stroke-width=".9" stroke-linecap="round" opacity=".8"/>`).join('')}
    <path d="M16 11.6 20.4 16 16 20.4 11.6 16z" fill="#d9b86e" stroke="#20150a" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M16 11.6 20.4 16H11.6z" fill="#fff4d0" opacity=".7"/>
  </svg>`,
  // an ember comet flying up-right
  bolt: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M3.5 28.5C8 24 11.5 20.8 15.6 17.6" fill="none" stroke="#e8662a" stroke-width="3.6" stroke-linecap="round" opacity=".55"/>
    <path d="M6.5 23.5C10 20.8 12.4 19.2 15.2 17.2" fill="none" stroke="#ffb14a" stroke-width="2" stroke-linecap="round" opacity=".85"/>
    <path d="M9.5 27.2C12.6 24.4 14.8 22.4 17.4 20" fill="none" stroke="#ff8a3a" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>
    <path d="M13.6 13.2C15.6 7.6 21.4 4.4 27.4 4.6 27.6 10.6 24.4 16.4 18.8 18.4z" fill="#f07a2a" stroke="#3a1206" stroke-width=".9" stroke-linejoin="round"/>
    <circle cx="20.4" cy="11.6" r="5" fill="#ffae4a"/>
    <circle cx="20.9" cy="11.1" r="3" fill="#ffe08a"/>
    <circle cx="21.6" cy="10.2" r="1.3" fill="#fffbe8"/>
  </svg>`,
  // a radiant eight-point star
  nova: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="13" fill="#ffd98a" opacity=".16"/>
    <path d="M16 4.8V1.6M16 27.2v3.2M4.8 16H1.6M27.2 16h3.2M8.1 8.1 5.9 5.9M23.9 23.9l2.2 2.2M8.1 23.9l-2.2 2.2M23.9 8.1l2.2-2.2" stroke="#f4d27e" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M16 3.4 18.4 13.6 28.6 16 18.4 18.4 16 28.6 13.6 18.4 3.4 16 13.6 13.6z" fill="#e8b84e" stroke="#2a1c0a" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M16 7.6 17.6 14.4 24.4 16 17.6 17.6 16 24.4 14.4 17.6 7.6 16 14.4 14.4z" fill="#ffe7a4"/>
    <circle cx="16" cy="16" r="2.6" fill="#fffbe8"/>
  </svg>`,
  // the Healing Draught: a round flask of green tonic
  draught: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M14 5.6h4v7a8.3 8.3 0 1 1-4 0z" fill="#1c2a3a" fill-opacity=".72" stroke="#12100c" stroke-width="1" stroke-linejoin="round"/>
    <path d="M8.7 20.5a7.3 7.3 0 0 0 14.6 0z" fill="#7fcf5f"/>
    <path d="M8.9 20.5h14.2" stroke="#c8f0a0" stroke-width="1.1"/>
    <circle cx="13.6" cy="23.6" r="1.1" fill="#d8ffc0" opacity=".8"/><circle cx="17.8" cy="25.4" r=".8" fill="#d8ffc0" opacity=".7"/>
    <path d="M11 17.4a5.8 5.8 0 0 1 2.4-2.6" fill="none" stroke="#f4fbff" stroke-width="1.1" stroke-linecap="round" opacity=".75"/>
    <rect x="13.2" y="2.8" width="5.6" height="3.4" rx=".9" fill="#b07a3e" stroke="#12100c" stroke-width=".9"/>
    <path d="M14.2 3.8h2.6" stroke="#e0b070" stroke-width=".8" stroke-linecap="round"/>
  </svg>`,
};

const LOOT_ICONS = {
  gold: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.3" fill="#e0a93a" stroke="#3a2406" stroke-width="1.1"/><circle cx="8" cy="8" r="4.1" fill="none" stroke="#fff0b0" stroke-width=".8" opacity=".75"/><path d="M8 5.4v5.2" stroke="#8c5a14" stroke-width="1.3" stroke-linecap="round"/><circle cx="5.9" cy="5.5" r="1.1" fill="#fffbe0"/></svg>`,
  heart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 14 2.4 8.5A3.2 3.2 0 0 1 8 4.4a3.2 3.2 0 0 1 5.6 4.1z" fill="#e8584a" stroke="#3a0e0a" stroke-width="1.1" stroke-linejoin="round"/><circle cx="5.2" cy="6.6" r="1.1" fill="#ffc8bc"/></svg>`,
  mana: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="#8fd0ff" opacity=".22"/><path d="M8 1.8 12 8 8 14.2 4 8z" fill="#6fb4ff" stroke="#0c1a3a" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 3.8 10.4 8H5.6z" fill="#dff2ff" opacity=".85"/></svg>`,
  draught: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M6.8 2.8h2.4v3.4a4.4 4.4 0 1 1-2.4 0z" fill="#1c2a3a" stroke="#12100c" stroke-width="1" stroke-linejoin="round"/><path d="M4.1 10.4a3.9 3.9 0 0 0 7.8 0z" fill="#7fcf5f"/><rect x="6.4" y="1.2" width="3.2" height="2" rx=".5" fill="#b07a3e"/></svg>`,
  upgrade: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.2 14.8 8 8 14.8 1.2 8z" fill="#8a5ad0" stroke="#1c0c30" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 4.2 11 8H9.2v3.6H6.8V8H5z" fill="#f4e3b3"/></svg>`,
  core: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#ff9a3c" opacity=".25"/><path d="M8 1.6 13 8 8 14.4 3 8z" fill="#e8662a" stroke="#3a1206" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 4.6 10.4 8 8 11.4 5.6 8z" fill="#ffd36e"/><circle cx="8" cy="8" r="1.2" fill="#fffbe8"/></svg>`,
};
const LOOT_KINDS = Object.keys(LOOT_ICONS);
const LOOT_POOL = 8;

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function clamp01(v) { return v > 0 ? (v < 1 ? v : 1) : 0; }

/** One vitals bar (fill + optional lag fill + optional number). */
function vitalBar(root, cls) {
  const row = root.querySelector(cls);
  const b = {
    row,
    fill: row.querySelector('.lu-vbar__fill'),
    lag: row.querySelector('.lu-vbar__lag'),
    q: -1,
    n: -1,
    max: -1,
    low: false,
    numText: null,
    maxText: null,
  };
  const num = row.querySelector('.lu-vbar__num b');
  if (num) {
    b.numText = document.createTextNode('');
    num.appendChild(b.numText);
    b.maxText = document.createTextNode('');
    row.querySelector('.lu-vbar__max').appendChild(b.maxText);
  }
  return b;
}

/**
 * One skill-bar slot built by configureSkills: `q`, `s`, `cd`, `locked` and `poor` cache the
 * last written state; `flip` / `nope` alternate the two identical keyframes that restart the
 * ready flash / refuse shake.
 * @typedef {object} SkillSlot
 * @property {HTMLDivElement} el
 * @property {Element} box
 * @property {HTMLElement} veil
 * @property {Text} secs
 * @property {Text} count
 * @property {boolean} draught
 * @property {number} q  veil ×1000
 * @property {number} s  seconds shown
 * @property {boolean} cd
 * @property {boolean} locked
 * @property {boolean} poor
 * @property {boolean} flip
 * @property {boolean} nope
 */

export class CombatHUD {
  /**
   * @param {HTMLElement} hudElement the HUD root (`.lu-hud`)
   * @param {{ anchor?: HTMLElement | null }} [opts] anchor: the location plate (`.lu-loc`) the vitals sit under
   */
  constructor(hudElement, { anchor = null } = {}) {
    this.parent = hudElement;
    this.anchor = anchor;

    // ---- vitals (top-left, under the location plate) ----
    const v = document.createElement('div');
    v.className = 'lu-vitals';
    v.innerHTML = `
      <div class="lu-vitals__lv"><span class="lu-vitals__lvk">Lv</span><span class="lu-vitals__lvn"></span></div>
      <div class="lu-vitals__bars">
        <div class="lu-vbar lu-vbar--hp"><span class="lu-vbar__k">HP</span><span class="lu-vbar__track"><i class="lu-vbar__lag"></i><i class="lu-vbar__fill"></i></span><span class="lu-vbar__num"><b></b><span class="lu-vbar__max"></span></span></div>
        <div class="lu-vbar lu-vbar--mp"><span class="lu-vbar__k">MP</span><span class="lu-vbar__track"><i class="lu-vbar__lag"></i><i class="lu-vbar__fill"></i></span><span class="lu-vbar__num"><b></b><span class="lu-vbar__max"></span></span></div>
        <div class="lu-vbar lu-vbar--sp"><span class="lu-vbar__k">SP</span><span class="lu-vbar__track"><i class="lu-vbar__fill"></i></span></div>
      </div>
      <div class="lu-vitals__xp"><i class="lu-vbar__fill"></i></div>`;
    hudElement.appendChild(v);
    this._vitals = v;
    this._lvText = document.createTextNode('');
    v.querySelector('.lu-vitals__lvn').appendChild(this._lvText);
    this._hp = vitalBar(v, '.lu-vbar--hp');
    this._mp = vitalBar(v, '.lu-vbar--mp');
    this._sp = vitalBar(v, '.lu-vbar--sp');
    this._xp = { row: v.querySelector('.lu-vitals__xp'), fill: v.querySelector('.lu-vitals__xp .lu-vbar__fill'), lag: null, q: -1 };
    this._level = -1;
    this._winded = false;
    this._calm = false;

    // ---- skill bar + gold counter (bottom-right) ----
    const s = document.createElement('div');
    s.className = 'lu-skills';
    s.innerHTML = `
      <div class="lu-skills__gold"><i class="lu-skills__coin"></i><span class="lu-skills__goldn"></span></div>
      <div class="lu-skills__row"></div>`;
    s.style.setProperty('--lu-ico-coin', svgUrl(LOOT_ICONS.gold));
    hudElement.appendChild(s);
    this._skillsEl = s;
    this._goldEl = s.querySelector('.lu-skills__gold');
    this._goldText = document.createTextNode('0');
    s.querySelector('.lu-skills__goldn').appendChild(this._goldText);
    /** @type {HTMLElement} */
    this._row = s.querySelector('.lu-skills__row');
    this._gold = 0;
    this._goldSet = false;
    this._goldFlip = false;
    /** @type {SkillSlot[]} */
    this._slots = [];
    /**
     * Called with the slot index when a skill slot is clicked / tapped (primary button). The slots
     * catch the pointer (a click on one never reaches the canvas as an attack); null: a click
     * does nothing. (Additive to COMBAT.md §13.2.)
     * @type {((index: number) => void) | null}
     */
    this.onSlotPress = null;
    // one delegated listener for every slot (slots are rebuilt by configureSkills)
    this._row.addEventListener('pointerdown', (e) => {
      const el = e.target instanceof Element ? e.target.closest('.lu-skill__box') : null;
      if (!el) return;
      e.preventDefault();
      if (e.button !== 0) return;
      const i = this._slots.findIndex((sl) => sl.box === el);
      if (i >= 0) this.onSlotPress?.(i);
    });
    this._row.addEventListener('contextmenu', (e) => e.preventDefault());
    this._device = 'keyboard';
    this._potions = -1;
    this._potionsMax = -1;

    // ---- loot feed (right edge above the skill bar), 8 pooled rows ----
    const l = document.createElement('div');
    l.className = 'lu-loot';
    for (const k of LOOT_KINDS) l.style.setProperty(`--lu-ico-${k}`, svgUrl(LOOT_ICONS[k]));
    this._loot = [];
    for (let i = 0; i < LOOT_POOL; i++) {
      const row = document.createElement('div');
      row.className = 'lu-loot__row';
      row.innerHTML = '<div class="lu-loot__in"><i class="lu-loot__ico"></i><span class="lu-loot__t"></span></div>';
      const text = document.createTextNode('');
      row.querySelector('.lu-loot__t').appendChild(text);
      l.appendChild(row);
      this._loot.push({ el: row, text, i: LOOT_POOL, flip: false });
    }
    this._lootNext = 0;
    hudElement.appendChild(l);
    this._lootEl = l;

    // fixed vitals offset: measured now and on window resize only
    this._measure = () => this._placeVitals();
    window.addEventListener('resize', this._measure);
    this._placeVitals();
  }

  /**
   * Every frame; writes on change.
   * @param {{ hp: number, hpMax: number, mp: number, mpMax: number, sp: number, spMax: number,
   *           level: number, xp: number, xpNext: number, winded: boolean }} v
   */
  setVitals(v) {
    if (!v) return;
    this._setBar(this._hp, v.hp, v.hpMax, true);
    this._setBar(this._mp, v.mp, v.mpMax, true);
    this._setBar(this._sp, v.sp, v.spMax, false);
    this._setBar(this._xp, v.xp, v.xpNext, false);
    const low = v.hpMax > 0 && v.hp > 0 && v.hp / v.hpMax <= 0.25;
    if (low !== this._hp.low) { this._hp.low = low; this._hp.row.classList.toggle('is-low', low); }
    const lv = v.level | 0;
    if (lv !== this._level) { this._level = lv; this._lvText.nodeValue = String(lv); }
    const w = !!v.winded;
    if (w !== this._winded) { this._winded = w; this._sp.row.classList.toggle('is-winded', w); }
  }

  /**
   * Define the skill slots (three skills + the draught), in order.
   * @param {{ id: string, label: string, keys: string|string[], padKeys?: string|string[],
   *           icon: 'whirl'|'bolt'|'nova'|'draught' }[]} slots
   *   keys: createKeycaps input (e.g. 'U/1'); padKeys: e.g. 'LT+X' (defaults to keys)
   */
  configureSkills(slots = []) {
    this._row.textContent = '';
    this._slots = [];
    for (const def of slots) {
      const el = document.createElement('div');
      el.className = def.icon === 'draught' ? 'lu-skill lu-skill--draught' : 'lu-skill';
      el.dataset.skill = String(def.id ?? '');
      el.innerHTML = `
        <div class="lu-skill__box lu-panel lu-panel--simple">
          <div class="lu-skill__icon">${SKILL_ICONS[def.icon] ?? ''}</div>
          <i class="lu-skill__veil"></i><i class="lu-skill__flash"></i>
          <span class="lu-skill__secs"></span><span class="lu-skill__count"></span>
        </div>
        <div class="lu-skill__label"></div>`;
      const box = el.querySelector('.lu-skill__box');
      const kb = createKeycaps(def.keys ?? '');
      kb.classList.add('lu-skill__keys', 'lu-skill__keys--kb');
      const pad = createKeycaps(def.padKeys ?? def.keys ?? '');
      pad.classList.add('lu-skill__keys', 'lu-skill__keys--pad');
      box.append(kb, pad);
      el.querySelector('.lu-skill__label').textContent = String(def.label ?? '');
      const secs = document.createTextNode('');
      el.querySelector('.lu-skill__secs').appendChild(secs);
      const count = document.createTextNode('');
      el.querySelector('.lu-skill__count').appendChild(count);
      this._row.appendChild(el);
      this._slots.push({
        el,
        box,
        veil: /** @type {HTMLElement} */ (el.querySelector('.lu-skill__veil')),
        secs,
        count,
        draught: def.icon === 'draught',
        q: -1,
        s: -1,
        cd: false,
        locked: false,
        poor: false,
        flip: false,
        nope: false,
      });
    }
    this._skillsEl.classList.toggle('is-pad', this._device === 'gamepad');
    if (this._potions >= 0) {
      const n = this._potions;
      this._potions = -1;
      this.setPotions(n, this._potionsMax);
    }
  }

  /**
   * Swap every slot's keycaps: 'keyboard' shows `keys`, 'gamepad' shows `padKeys`.
   * @param {'keyboard'|'gamepad'|'mouse'} device ('mouse' counts as keyboard)
   */
  setDevice(device) {
    const d = device === 'gamepad' ? 'gamepad' : 'keyboard';
    if (d === this._device) return;
    this._device = d;
    this._skillsEl.classList.toggle('is-pad', d === 'gamepad');
  }

  /** The device whose keycaps the skill slots show. */
  get device() { return this._device; }

  /**
   * Every frame; writes on change.
   * @param {number} i slot index
   * @param {{ cooldown?: number, seconds?: number, locked?: boolean, affordable?: boolean }} s
   *   cooldown: remaining fraction 0..1 (veil); seconds: whole seconds left (shown while cooling down)
   */
  setSkill(i, s) {
    const slot = this._slots[i];
    if (!slot || !s) return;
    const q = Math.round(clamp01(s.cooldown ?? 0) * 1000);
    if (q !== slot.q) {
      slot.q = q;
      slot.veil.style.transform = `scaleY(${q / 1000})`;
    }
    const cd = q > 0;
    if (cd !== slot.cd) {
      slot.cd = cd;
      slot.el.classList.toggle('is-cd', cd);
      // ready again: a short gold flash (restarted by toggling two identical keyframes)
      if (!cd) {
        slot.flip = !slot.flip;
        slot.el.classList.toggle('is-ready-a', slot.flip);
        slot.el.classList.toggle('is-ready-b', !slot.flip);
      }
    }
    const sec = cd ? Math.max(0, Math.ceil(s.seconds ?? 0)) : -1;
    if (sec !== slot.s) {
      slot.s = sec;
      slot.secs.nodeValue = sec > 0 ? (sec < 10 ? DIGITS[sec] : String(sec)) : '';
    }
    const locked = !!s.locked;
    if (locked !== slot.locked) { slot.locked = locked; slot.el.classList.toggle('is-locked', locked); }
    const poor = s.affordable === false;
    if (poor !== slot.poor) { slot.poor = poor; slot.el.classList.toggle('is-poor', poor); }
  }

  /**
   * A refused press (locked, cooling down, not enough MP, no draught left): the slot shakes once
   * with a red rim (restarted by toggling two identical keyframes, like the ready flash).
   * @param {number} i slot index
   */
  refuse(i) {
    const slot = this._slots[i];
    if (!slot) return;
    slot.nope = !slot.nope;
    slot.el.classList.toggle('is-refuse-a', slot.nope);
    slot.el.classList.toggle('is-refuse-b', !slot.nope);
  }

  /**
   * @param {number} n draughts carried
   * @param {number} max carry cap
   */
  setPotions(n, max) {
    const c = Math.max(0, n | 0);
    const m = max | 0;
    if (c === this._potions && m === this._potionsMax) return;
    this._potions = c;
    this._potionsMax = m;
    for (const slot of this._slots) {
      if (!slot.draught) continue;
      slot.count.nodeValue = `×${c}`;
      slot.el.classList.toggle('is-empty', c === 0);
      slot.el.classList.toggle('is-full', m > 0 && c >= m);
    }
  }

  /** @param {number} n gold (the coin pops when it rises; not on the first call) */
  setGold(n) {
    const g = Math.max(0, Math.floor(n || 0));
    if (g === this._gold) { this._goldSet = true; return; }
    const up = g > this._gold && this._goldSet;
    this._goldSet = true;
    this._gold = g;
    this._goldText.nodeValue = String(g);
    if (up) {
      this._goldFlip = !this._goldFlip;
      this._goldEl.classList.toggle('is-up-a', this._goldFlip);
      this._goldEl.classList.toggle('is-up-b', !this._goldFlip);
    }
  }

  /**
   * Calm (5 s at full HP / MP, set by combat): the vitals dim to 35 %.
   * @param {boolean} on
   */
  setCalm(on) {
    const c = !!on;
    if (c === this._calm) return;
    this._calm = c;
    this._vitals.classList.toggle('is-calm', c);
  }

  /**
   * One loot-feed row (8 pooled rows; the newest at the bottom, older rows slide up and fade).
   * @param {string} text
   * @param {'gold'|'heart'|'mana'|'draught'|'upgrade'|'core'} kind
   */
  loot(text, kind = 'gold') {
    const k = LOOT_ICONS[kind] ? kind : 'gold';
    const row = this._loot[this._lootNext];
    this._lootNext = (this._lootNext + 1) % LOOT_POOL;
    for (const r of this._loot) {
      if (r === row || r.i >= LOOT_POOL) continue;
      r.i++;
      if (r.i === 1) r.el.classList.remove('is-new');
      r.el.style.setProperty('--i', String(r.i));
    }
    row.i = 0;
    row.text.nodeValue = String(text ?? '');
    row.flip = !row.flip;
    // is-new: jump to the bottom slot without the slide transition
    row.el.className = `lu-loot__row lu-loot__row--${k} is-new ${row.flip ? 'is-a' : 'is-b'}`;
    row.el.style.setProperty('--i', '0');
  }

  /** The vitals element (tests: its position must not change with the location plate). */
  get vitalsElement() { return this._vitals; }
  /** The skill bar + gold counter element (`.lu-skills`). */
  get skillsElement() { return this._skillsEl; }

  dispose() {
    window.removeEventListener('resize', this._measure);
    this._vitals.remove();
    this._skillsEl.remove();
    this._lootEl.remove();
  }

  // ------------------------------------------------------------------------------------------

  _setBar(b, val, max, withNumber) {
    const m = max > 0 ? max : 1;
    const v = Number.isFinite(val) ? val : 0;
    const q = Math.round(clamp01(v / m) * 1000);
    if (q !== b.q) {
      b.q = q;
      const t = `scaleX(${q / 1000})`;
      b.fill.style.transform = t;
      if (b.lag) b.lag.style.transform = t;
    }
    if (withNumber && b.numText) {
      const n = v > 0 ? Math.ceil(v - 1e-6) : 0;
      if (n !== b.n) { b.n = n; b.numText.nodeValue = String(n); }
      const mx = Math.round(max > 0 ? max : 0);
      if (mx !== b.max) { b.max = mx; b.maxText.nodeValue = `/${mx}`; }
    }
  }

  /**
   * Put the vitals under the plate's two-line height (a hidden two-line copy of the plate is
   * measured: one layout read, at construction and on window resize only).
   */
  _placeVitals() {
    const a = this.anchor;
    if (!a || !a.isConnected || !a.parentNode) return;
    const probe = /** @type {HTMLElement} */ (a.cloneNode(true));
    probe.classList.remove('is-empty', 'is-swap');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.visibility = 'hidden';
    probe.style.transition = 'none';
    const name = probe.querySelector('.lu-loc__name');
    const sub = probe.querySelector('.lu-loc__sub');
    if (name) name.textContent = 'Ag';
    if (sub) sub.textContent = 'Ag';
    a.parentNode.appendChild(probe);
    const bottom = probe.offsetTop + probe.offsetHeight;
    probe.remove();
    if (bottom > 0) this._vitals.style.setProperty('--lu-vitals-top', `${bottom}px`);
  }
}
