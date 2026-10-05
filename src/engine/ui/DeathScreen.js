import { SVG_DIVIDER } from './TitleScreen.js';
import './ui.css';
import './combat.css';

/**
 * DeathScreen — the full-screen defeat overlay (`.lu-death`, COMBAT.md §13.1–§13.2), styled like
 * the title screen: a dark ember vignette, a Cinzel gold title, the ornamental divider, a subtitle
 * and a blinking prompt that appears once input is accepted. `show()` resolves with the device that
 * dismissed it ('key' | 'pointer' | 'gamepad') once `armDelay` seconds have passed: keys through a
 * window capture-phase listener (the dismissing key is `stopPropagation`ed so it does not also act
 * in the game), a pointer press on the overlay, or a gamepad button (polled with
 * requestAnimationFrame while shown; only a button newly pressed after the first poll counts).
 * The screen stays up until `hide()` (the game fades to black first). z 7 (the world map's slot);
 * not hidden by photo mode. While shown, the root gets `lu-root--death` (the world labels, the
 * interaction prompt, the announcer and the banner step aside). `prime()` pre-renders it once while
 * hidden (COMBAT-02), so the first show is as cheap as any later one.
 */

const IGNORED_KEYS = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
  'MetaLeft', 'MetaRight', 'F5', 'F11', 'F12', 'CapsLock', 'Tab']);

export class DeathScreen {
  /** @param {HTMLElement} root the UI root (`#lumina-ui`) */
  constructor(root) {
    this.root = root;
    const el = document.createElement('div');
    el.className = 'lu-death is-gone';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="lu-death__inner">
        <h1 class="lu-death__title"></h1>
        <div class="lu-death__divider">${SVG_DIVIDER}</div>
        <div class="lu-death__sub"></div>
        <div class="lu-death__prompt"><span class="lu-gem"></span><span class="lu-death__prompt-text"></span><span class="lu-gem"></span></div>
      </div>`;
    // the world map's slot (z 7), above the HUD; the fader (z 8) covers it for the respawn
    root.appendChild(el);
    this.element = el;
    this._title = el.querySelector('.lu-death__title');
    this._sub = el.querySelector('.lu-death__sub');
    this._prompt = el.querySelector('.lu-death__prompt-text');

    this._visible = false;
    this._accept = false;
    this._armedAt = 0;
    this._armTimer = 0;
    this._goneTimer = 0;
    this._raf = 0;
    this._resolve = null;
    this._padPrev = [];
    this._padInit = false;
    this._primeRaf = 0;
    this._primed = false;

    this._onKey = (e) => {
      if (!this._accepting() || e.repeat || IGNORED_KEYS.has(e.code)) return;
      e.preventDefault();
      e.stopPropagation();
      this._dismiss('key');
    };
    this._onPointer = (e) => {
      if (!this._accepting()) return;
      e.preventDefault();
      e.stopPropagation();
      this._dismiss('pointer');
    };
    this._poll = () => {
      this._raf = 0;
      if (!this._accept) return;
      if (this._pollGamepads() && this._accepting()) { this._dismiss('gamepad'); return; }
      this._raf = requestAnimationFrame(this._poll);
    };
  }

  /** True from show() until hide(). */
  get visible() { return this._visible; }

  /** True once `prime()` has pre-rendered the screen. */
  get primed() { return this._primed; }

  /**
   * Pre-render the hidden screen (COMBAT-02; `UI.enableCombat()` calls it while the level loads):
   * for 3 frames the overlay is laid out and painted at a near-zero opacity with these texts, the
   * title, divider and prompt on their own layers as during the real fade-in, then it goes back to
   * `display: none`. The first real `show()` then no longer pays for the first style resolution,
   * glyph rasterisation and the gradient / mask / text-shadow raster setup — measured with the
   * engine stopped: two long frames (≈ 55 and ≈ 70 ms) and 4–6 ms of style and layout on the first
   * show, none on later ones. Ignored while shown; `show()` during the priming takes over.
   * @param {{ title?: string, subtitle?: string, prompt?: string }} [opts]
   */
  prime({ title = '', subtitle = '', prompt = '' } = {}) {
    if (this._visible || this._primeRaf || typeof requestAnimationFrame !== 'function') return;
    this._title.textContent = String(title ?? '');
    this._sub.textContent = String(subtitle ?? '');
    this._prompt.textContent = String(prompt ?? '');
    const el = this.element;
    el.classList.remove('is-gone');
    el.classList.add('is-prime');
    let frames = 0;
    const tick = () => {
      this._primeRaf = 0;
      if (this._visible || !el.classList.contains('is-prime')) return;
      if (++frames < 3) {
        this._primeRaf = requestAnimationFrame(tick);
        return;
      }
      el.classList.remove('is-prime');
      el.classList.add('is-gone');
      this._primed = true;
    };
    this._primeRaf = requestAnimationFrame(tick);
  }

  /**
   * @param {{ title?: string, subtitle?: string, prompt?: string, armDelay?: number }} [opts]
   *   armDelay: seconds before input is accepted (1.0); the prompt appears then
   * @returns {Promise<'key'|'pointer'|'gamepad'|undefined>} undefined when hide() / a new show() came first
   */
  show({ title = '', subtitle = '', prompt = '', armDelay = 1.0 } = {}) {
    this._settle(undefined);
    this._detach();
    clearTimeout(this._goneTimer);
    clearTimeout(this._armTimer);
    this._cancelPrime();
    this._title.textContent = String(title ?? '');
    this._sub.textContent = String(subtitle ?? '');
    this._prompt.textContent = String(prompt ?? '');
    const el = this.element;
    // fade in with a CSS animation (it starts from display: none without a forced layout)
    el.classList.remove('is-gone', 'is-armed', 'is-done', 'is-off');
    el.classList.add('is-on');
    el.setAttribute('aria-hidden', 'false');
    this.root.classList.add('lu-root--death');
    this._visible = true;
    const delay = Math.max(0, Number.isFinite(armDelay) ? armDelay : 1);
    this._armedAt = performance.now() + delay * 1000;
    this._armTimer = setTimeout(() => { this._armTimer = 0; el.classList.add('is-armed'); }, delay * 1000);
    this._accept = true;
    this._padInit = false;
    window.addEventListener('keydown', this._onKey, true);
    el.addEventListener('pointerdown', this._onPointer);
    if (!this._raf) this._raf = requestAnimationFrame(this._poll);
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  /** Remove the screen (fades out 0.35 s; a pending show() resolves with undefined). */
  hide() {
    this._detach();
    this._settle(undefined);
    clearTimeout(this._armTimer);
    this._armTimer = 0;
    if (!this._visible) return;
    this._visible = false;
    const el = this.element;
    el.classList.remove('is-on');
    el.classList.add('is-off');
    el.setAttribute('aria-hidden', 'true');
    this.root.classList.remove('lu-root--death');
    clearTimeout(this._goneTimer);
    this._goneTimer = setTimeout(() => {
      if (!this._visible) { el.classList.remove('is-off'); el.classList.add('is-gone'); }
    }, 400);
  }

  dispose() {
    this._detach();
    this._settle(undefined);
    clearTimeout(this._armTimer);
    clearTimeout(this._goneTimer);
    this._cancelPrime();
    this.root.classList.remove('lu-root--death');
    this.element.remove();
  }

  // ------------------------------------------------------------------------------------------

  _cancelPrime() {
    if (this._primeRaf) cancelAnimationFrame(this._primeRaf);
    this._primeRaf = 0;
    this.element.classList.remove('is-prime');
  }

  _accepting() { return this._accept && performance.now() >= this._armedAt; }

  _dismiss(source) {
    this._detach();
    this.element.classList.add('is-done');
    this._settle(source);
  }

  _detach() {
    this._accept = false;
    window.removeEventListener('keydown', this._onKey, true);
    this.element.removeEventListener('pointerdown', this._onPointer);
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  _settle(value) {
    const r = this._resolve;
    this._resolve = null;
    if (r) r(value);
  }

  /** @returns {boolean} true when a gamepad button was newly pressed since the previous poll. */
  _pollGamepads() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null;
    if (!pads) return false;
    let pressed = false;
    let k = 0;
    for (let p = 0; p < pads.length; p++) {
      const pad = pads[p];
      if (!pad) continue;
      for (let b = 0; b < pad.buttons.length; b++, k++) {
        const down = pad.buttons[b].pressed;
        if (this._padInit && down && !this._padPrev[k]) pressed = true;
        this._padPrev[k] = down;
      }
    }
    this._padInit = true;
    return pressed;
  }
}
