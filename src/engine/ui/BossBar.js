import './ui.css';
import './combat.css';

/**
 * BossBar — the boss health bar at the bottom centre of the HUD (`.lu-bossbar`, COMBAT.md
 * §13.1–§13.2): a Cinzel name plate, an italic epithet, `.lu-gem` phase gems and a double-gold
 * framed bar whose fill scales with `transform: scaleX()` over a lagging second fill. Created by
 * `UI.enableCombat()` on combat levels only; hidden with the HUD (title, photo) and while a
 * dialog is open. `set()` is cheap to call every frame (writes on change).
 */
export class BossBar {
  /** @param {HTMLElement} hudElement the HUD root (`.lu-hud`) */
  constructor(hudElement) {
    this.parent = hudElement;
    const el = document.createElement('div');
    el.className = 'lu-bossbar';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="lu-bossbar__head">
        <span class="lu-bossbar__name"></span>
        <span class="lu-bossbar__epithet"></span>
        <span class="lu-bossbar__gems"></span>
      </div>
      <div class="lu-bossbar__frame"><div class="lu-bossbar__track"><i class="lu-bossbar__lag"></i><i class="lu-bossbar__fill"></i><i class="lu-bossbar__hit"></i></div></div>`;
    hudElement.appendChild(el);
    this.element = el;
    this._name = el.querySelector('.lu-bossbar__name');
    this._epithet = el.querySelector('.lu-bossbar__epithet');
    this._gemsEl = el.querySelector('.lu-bossbar__gems');
    /** @type {HTMLElement} */
    this._fill = el.querySelector('.lu-bossbar__fill');
    /** @type {HTMLElement} */
    this._lag = el.querySelector('.lu-bossbar__lag');
    this._track = el.querySelector('.lu-bossbar__track');
    /** @type {HTMLElement[]} */
    this._gems = [];
    this._q = -1;
    this._phase = -1;
    this._visible = false;
    this._flip = false;
  }

  /** True between show() and hide(). */
  get visible() { return this._visible; }

  /**
   * Show the bar at full HP, phase 1.
   * @param {{ name?: string, epithet?: string, phases?: number }} [opts] phases: number of phase
   *   gems (1 = none); name defaults to ''
   */
  show({ name = '', epithet = '', phases = 1 } = {}) {
    this._name.textContent = String(name);
    this._epithet.textContent = String(epithet ?? '');
    const count = Math.max(1, phases | 0);
    if (count !== this._gems.length) {
      this._gemsEl.textContent = '';
      this._gems = [];
      if (count > 1) {
        for (let i = 0; i < count; i++) {
          const g = document.createElement('i');
          g.className = 'lu-gem lu-bossbar__gem';
          this._gemsEl.appendChild(g);
          this._gems.push(g);
        }
      }
    }
    // snap both fills to full (no drain from a previous fight)
    this._lag.classList.add('is-snap');
    this._q = -1;
    this._phase = -1;
    this.set(1, 1);
    this._snapPending = true;
    if (!this._visible) {
      this._visible = true;
      this.element.classList.add('is-on');
    }
  }

  /**
   * Every frame; writes on change.
   * @param {number} hpFrac 0..1
   * @param {number} [phase] current phase (1-based): gems up to it are lit, the current one glows
   */
  set(hpFrac, phase = 1) {
    if (this._snapPending) {
      this._snapPending = false;
      this._lag.classList.remove('is-snap');
    }
    const f = hpFrac > 0 ? (hpFrac < 1 ? hpFrac : 1) : 0;
    const q = Math.round(f * 1000);
    if (q !== this._q) {
      const hit = this._q >= 0 && q < this._q;
      this._q = q;
      const t = `scaleX(${q / 1000})`;
      this._fill.style.transform = t;
      this._lag.style.transform = t;
      if (hit) {
        this._flip = !this._flip;
        this._track.classList.toggle('is-hit-a', this._flip);
        this._track.classList.toggle('is-hit-b', !this._flip);
      }
    }
    const p = phase | 0;
    if (p !== this._phase) {
      this._phase = p;
      for (let i = 0; i < this._gems.length; i++) {
        this._gems[i].classList.toggle('is-lit', i < p);
        this._gems[i].classList.toggle('is-current', i === p - 1);
      }
    }
  }

  /** Fade the bar out. */
  hide() {
    if (!this._visible) return;
    this._visible = false;
    this.element.classList.remove('is-on');
  }

  dispose() {
    this.element.remove();
  }
}
