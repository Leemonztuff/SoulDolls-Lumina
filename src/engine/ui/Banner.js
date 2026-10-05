import './ui.css';

/**
 * Octopath-style area-entry title card (top-centre): thin gold rules that extend outward, ornamental
 * scroll flourishes, a Cinzel title whose letter-spacing settles in, and an italic subtitle.
 */

const FLOURISH_PATHS = `
  <path d="M0 20H92"/>
  <path d="M56 20C61 13.2 68 11.8 75 12.8C69 15 63.5 17 56 20zM56 20C61 26.8 68 28.2 75 27.2C69 25 63.5 23 56 20z" fill="#e8cf8a" stroke-width=".6"/>
  <path d="M92 20C104 20 108 8 120 8.5C131 9 133 21 125 22.5C119 23.6 116.5 16.5 121.5 15.6"/>
  <path d="M92 20C104 20 108 32 120 31.5C131 31 133 19 125 17.5C119 16.4 116.5 23.5 121.5 24.4"/>
  <circle cx="22" cy="20" r="1.7" fill="#e8cf8a" stroke="none"/>
  <path d="M40 17 43 20 40 23 37 20z" fill="#e8cf8a" stroke="none"/>
  <path d="M148 12.5 155.5 20 148 27.5 140.5 20z" fill="#c9a45c" stroke="#1a1208" stroke-width=".9"/>
  <path d="M148 13.9 154.1 20H141.9z" fill="#fbecc0" stroke="none"/>
  <path d="M148 17.4 150.6 20 148 22.6 145.4 20z" fill="#6b4a1a" stroke="none"/>`;

// The drop shadow is baked in (a dark copy one unit lower) instead of a CSS filter: filtered,
// animated layers are expensive to (re)rasterise.
const FLOURISH_SHADOW = FLOURISH_PATHS.replace(/#[0-9a-fA-F]{6}/g, '#000');
const SVG_FLOURISH = `<svg viewBox="0 0 160 40" aria-hidden="true" fill="none" stroke="#e8cf8a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <g transform="translate(0 1.2)" stroke="#000" opacity="0.75">${FLOURISH_SHADOW}</g>
  ${FLOURISH_PATHS}
</svg>`;

const FADE_OUT = 1.1; // seconds, matches .lu-banner.is-out animation

export class Banner {
  /** @param {HTMLElement} parent */
  constructor(parent = document.body) {
    const el = document.createElement('div');
    el.className = 'lu-banner';
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <div class="lu-banner__shade"></div>
      <div class="lu-banner__row">
        <span class="lu-banner__rule lu-banner__rule--l"></span>
        <span class="lu-banner__flourish lu-banner__flourish--l">${SVG_FLOURISH}</span>
        <h2 class="lu-banner__title"></h2>
        <span class="lu-banner__flourish lu-banner__flourish--r">${SVG_FLOURISH}</span>
        <span class="lu-banner__rule lu-banner__rule--r"></span>
      </div>
      <div class="lu-banner__sub"></div>
      <div class="lu-banner__under"></div>`;
    parent.appendChild(el);
    this.element = el;
    this._title = el.querySelector('.lu-banner__title');
    this._sub = el.querySelector('.lu-banner__sub');
    this._t1 = 0;
    this._t2 = 0;
    this._resolve = null;
    this._visible = false;
  }

  /** True while the banner is on screen (including its fade-out). */
  get visible() { return this._visible; }

  /**
   * Show an area title card.
   * @param {string} title
   * @param {string} [subtitle]
   * @param {{ duration?: number }} [opts] `duration`: seconds from show until the fade-out starts
   *   (the fade-out adds ~1.1 s).
   * @returns {Promise<void>} resolves once the banner has fully faded out (or was replaced).
   */
  show(title, subtitle = '', { duration = 3.5 } = {}) {
    this._settle();
    clearTimeout(this._t1);
    clearTimeout(this._t2);
    const el = this.element;
    this._title.textContent = String(title ?? '');
    this._sub.textContent = String(subtitle ?? '');
    el.classList.remove('is-in', 'is-out');
    void el.offsetWidth; // restart CSS animations
    el.classList.add('is-in');
    this._visible = true;
    this._t1 = setTimeout(() => this.hide(), Math.max(1.2, duration) * 1000);
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  /** Start the fade-out now (no-op when hidden). */
  hide() {
    if (!this._visible || this.element.classList.contains('is-out')) return;
    clearTimeout(this._t1);
    const el = this.element;
    el.classList.remove('is-in');
    el.classList.add('is-out');
    this._t2 = setTimeout(() => {
      el.classList.remove('is-out');
      this._visible = false;
      this._settle();
    }, FADE_OUT * 1000);
  }

  dispose() {
    clearTimeout(this._t1);
    clearTimeout(this._t2);
    this._settle();
    this.element.remove();
  }

  _settle() {
    const r = this._resolve;
    this._resolve = null;
    if (r) r();
  }
}
