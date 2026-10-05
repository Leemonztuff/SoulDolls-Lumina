import { RNG } from '../utils/math.js';
import { createKeycaps } from './HUD.js';
import './ui.css';

/**
 * Full-screen title card over the live 3D scene: soft dark vignette, a gold-gradient Cinzel title
 * with a breathing glow and an occasional light sweep, drifting bokeh motes, an ornamental divider,
 * subtitle, a blinking "Press any key" prompt and a small credit line. Dismissed by any key, a
 * click/tap or any gamepad button (gamepads are polled with requestAnimationFrame while visible).
 */

let uid = 0;

/** Deterministic drifting light motes (pure CSS animation, compositor-only). */
function motesHtml(count = 22, seed = 2024) {
  const rng = new RNG(seed);
  let html = '';
  for (let i = 0; i < count; i++) {
    const size = rng.range(4, 13).toFixed(1);
    const x = rng.range(4, 96).toFixed(1);
    const dur = rng.range(11, 22).toFixed(1);
    const delay = (-rng.range(0, 22)).toFixed(1);
    const sway = rng.range(-40, 40).toFixed(0);
    const alpha = rng.range(0.45, 0.95).toFixed(2);
    html += `<span class="lu-mote" style="--x:${x}%;--s:${size}px;--d:${dur}s;--dl:${delay}s;--sw:${sway}px;--a:${alpha}"></span>`;
  }
  return html;
}

function crestSvg(id) {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff5d2"/><stop offset=".45" stop-color="#e8cf8a"/><stop offset="1" stop-color="#9c7331"/>
    </linearGradient>
  </defs>
  <g class="lu-crest-spin"><circle cx="32" cy="32" r="20" fill="none" stroke="#c9a45c" stroke-width=".9" stroke-dasharray="1.2 3.2" opacity=".85"/></g>
  <circle cx="32" cy="32" r="14.5" fill="none" stroke="#e8cf8a" stroke-width="1" opacity=".9"/>
  <path d="M42.6 21.4 34.6 32 42.6 42.6 32 34.6 21.4 42.6 29.4 32 21.4 21.4 32 29.4z" fill="#c9a45c" stroke="#2a1c0a" stroke-width=".7" stroke-linejoin="round"/>
  <path d="M32 1.5 35.2 28.8 62.5 32 35.2 35.2 32 62.5 28.8 35.2 1.5 32 28.8 28.8z" fill="url(#${id})" stroke="#2a1c0a" stroke-width=".8" stroke-linejoin="round"/>
  <path d="M32 1.5 32 32 28.8 28.8zM1.5 32 32 32 28.8 35.2zM62.5 32 32 32 35.2 28.8zM32 62.5 32 32 35.2 35.2z" fill="#fff8e0" opacity=".55"/>
  <circle cx="32" cy="32" r="3.4" fill="#fff6d6" stroke="#2a1c0a" stroke-width=".8"/>
</svg>`;
}

/** The ornamental gold divider under the title (also used by the combat DeathScreen). */
export const SVG_DIVIDER = `<svg viewBox="0 0 400 28" aria-hidden="true" fill="none" stroke="#e8cf8a" stroke-width="1.1" stroke-linecap="round">
  <path d="M4 14H164M236 14H396"/>
  <path d="M164 14C172 14 175 7 182 7.5C188 8 188.5 14.5 184 15C180.5 15.4 179.5 11.5 182.5 11"/>
  <path d="M164 14C172 14 175 21 182 20.5C188 20 188.5 13.5 184 13C180.5 12.6 179.5 16.5 182.5 17"/>
  <path d="M236 14C228 14 225 7 218 7.5C212 8 211.5 14.5 216 15C219.5 15.4 220.5 11.5 217.5 11"/>
  <path d="M236 14C228 14 225 21 218 20.5C212 20 211.5 13.5 216 13C219.5 12.6 220.5 16.5 217.5 17"/>
  <path d="M200 4.5 209.5 14 200 23.5 190.5 14z" fill="#c9a45c" stroke="#1a1208" stroke-width=".9"/>
  <path d="M200 5.9 208.1 14H191.9z" fill="#fbecc0" stroke="none"/>
  <path d="M200 10 204 14 200 18 196 14z" fill="#6b4a1a" stroke="none"/>
  <path d="M126 11.4 128.6 14 126 16.6 123.4 14zM274 11.4 276.6 14 274 16.6 271.4 14z" fill="#e8cf8a" stroke="none"/>
  <circle cx="92" cy="14" r="1.4" fill="#e8cf8a" stroke="none"/><circle cx="308" cy="14" r="1.4" fill="#e8cf8a" stroke="none"/>
</svg>`;

const IGNORED_KEYS = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
  'MetaLeft', 'MetaRight', 'F5', 'F11', 'F12', 'CapsLock', 'Tab']);

/** Keys that travel to a changed destination (the confirm keys). */
const CONFIRM_KEYS = new Set(['Enter', 'NumpadEnter', 'Space']);
/** Standard-mapping gamepad buttons used by the destination row. */
const PAD_A = 0;
const PAD_LEFT = 14;
const PAD_RIGHT = 15;

const SVG_PREV = '<svg viewBox="0 0 10 12" aria-hidden="true"><path d="M8.6 1.2 1.6 6l7 4.8z" fill="#e8cf8a" stroke="#1a1208" stroke-width="1" stroke-linejoin="round"/></svg>';
const SVG_NEXT = '<svg viewBox="0 0 10 12" aria-hidden="true"><path d="M1.4 1.2 8.4 6l-7 4.8z" fill="#e8cf8a" stroke="#1a1208" stroke-width="1" stroke-linejoin="round"/></svg>';

export class TitleScreen {
  /** @param {HTMLElement} parent */
  constructor(parent = document.body) {
    const el = document.createElement('div');
    // `is-gone` = display:none while fully hidden, so the motes / crest / shimmer animations (and
    // the motes' compositor layers) don't keep running for the rest of the game.
    el.className = 'lu-title is-gone';
    el.innerHTML = `
      <div class="lu-title__motes" aria-hidden="true">${motesHtml()}</div>
      <div class="lu-title__inner">
        <div class="lu-title__crest">${crestSvg(`lu-crest-${++uid}`)}</div>
        <div class="lu-title__namewrap">
          <div class="lu-title__glow" aria-hidden="true"></div>
          <h1 class="lu-title__name"></h1>
        </div>
        <div class="lu-title__divider">${SVG_DIVIDER}</div>
        <div class="lu-title__sub"></div>
        <div class="lu-title__prompt"><span class="lu-gem"></span><span class="lu-title__prompt-text"></span><span class="lu-gem"></span></div>
      </div>
      <div class="lu-title__credit"></div>`;
    parent.appendChild(el);
    this.element = el;
    this._name = el.querySelector('.lu-title__name');
    this._glow = el.querySelector('.lu-title__glow');
    this._sub = el.querySelector('.lu-title__sub');
    this._prompt = el.querySelector('.lu-title__prompt-text');
    this._credit = el.querySelector('.lu-title__credit');

    /** Seconds after show() before input is accepted (avoids accidental instant dismissal). */
    this.armDelay = 0.45;
    /**
     * @type {((source: 'key'|'pointer'|'gamepad') => void) | null}
     * Called synchronously inside the dismissing event handler — the place to unlock WebAudio.
     */
    this.onDismiss = null;

    this._visible = false;
    this._leaving = false;
    this._armedAt = 0;
    this._resolve = null;
    this._raf = 0;
    this._hideTimer = 0;
    this._padPrev = [];
    this._padInit = false;
    this._promptText = '';
    /** Destination row (exists only while `show()` was given `destinations`). */
    this._destEl = null;
    this._destLabel = null;
    /** @type {{ value: string, label: string }[] | null} */
    this._dests = null;
    this._destIndex = 0;
    this._curIndex = 0;
    this._current = null;

    this._onKey = (e) => {
      if (!this._accepting() || e.repeat || IGNORED_KEYS.has(e.code)) return;
      e.preventDefault();
      e.stopPropagation(); // don't let the dismissing key leak into gameplay input
      if (this._dests) {
        // only the arrows cycle; only a confirm key travels; any other key resets and dismisses
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { this._cycle(e.code === 'ArrowLeft' ? -1 : 1); return; }
        if (!CONFIRM_KEYS.has(e.code)) this._resetDest();
      }
      this._dismiss('key');
    };
    this._onPointer = (e) => {
      if (!this._accepting()) return;
      e.preventDefault();
      // a click on the destination label confirms it; anywhere else resets it first
      if (this._dests && !e.target?.closest?.('.lu-title__dest-label')) this._resetDest();
      this._dismiss('pointer');
    };
    this._poll = () => {
      this._raf = 0;
      if (!this._visible || this._leaving) return;
      const b = this._pollGamepads();
      if (b >= 0 && this._accepting()) {
        if (!this._dests) { this._dismiss('gamepad'); return; }
        if (b === PAD_LEFT || b === PAD_RIGHT) this._cycle(b === PAD_LEFT ? -1 : 1);
        else {
          if (b !== PAD_A) this._resetDest();
          this._dismiss('gamepad');
          return;
        }
      }
      this._raf = requestAnimationFrame(this._poll);
    };
  }

  /** True from show() until the fade-out has completed. */
  get visible() { return this._visible; }

  /**
   * The selected destination `value` (read it once `show()` has resolved): the `current` value
   * unless the player cycled to another entry and confirmed it. null without `destinations`.
   * @returns {string|null}
   */
  get destination() {
    if (!this._dests) return null;
    return this._destIndex === this._curIndex ? this._current : this._dests[this._destIndex].value;
  }

  /**
   * Show the title screen.
   *
   * With `destinations` a `◂ label ▸` row under the prompt offers other levels: ArrowLeft /
   * ArrowRight, d-pad left / right and clicks on the ◂ ▸ glyphs cycle it (A / D and the stick never
   * do); while the selection differs from `current` the prompt reads "Enter / A — Travel to
   * <label>", and only a confirm (Enter, Space, pad A or a click on the label) resolves with it
   * selected; any other key, button or click first resets the selection to `current` and
   * dismisses as usual. Read the choice from `destination`. Without `destinations` nothing changes.
   * @param {{ title?: string, subtitle?: string, prompt?: string, credit?: string,
   *           destinations?: { value: string, label: string }[], current?: string }} [opts]
   * @returns {Promise<'key'|'pointer'|'gamepad'|undefined>} resolves as soon as the player presses
   *   a key / clicks / presses a gamepad button (the screen then fades out over ~1.1 s), or with
   *   undefined when hide() is called programmatically.
   */
  show({ title = 'Lumina', subtitle = '', prompt = 'Press any key', credit = 'Lumina HD-2D Engine — three.js',
    destinations, current } = {}) {
    this._settle(undefined);
    clearTimeout(this._hideTimer);
    this._name.textContent = title;
    this._glow.textContent = title;
    this._sub.textContent = subtitle || '';
    this._promptText = prompt || '';
    this._prompt.textContent = this._promptText;
    this._credit.textContent = credit || '';
    this._setDestinations(destinations, current);
    const el = this.element;
    el.classList.remove('is-on', 'is-leaving', 'is-gone');
    void el.offsetWidth; // establish the hidden (opacity 0) style so the fade-in transition runs
    el.classList.add('is-on');
    this._visible = true;
    this._leaving = false;
    this._armedAt = performance.now() + this.armDelay * 1000;
    this._padInit = false;
    window.addEventListener('keydown', this._onKey, true);
    el.addEventListener('pointerdown', this._onPointer);
    if (!this._raf) this._raf = requestAnimationFrame(this._poll);
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  /** Fade the title screen out (resolves a pending show() promise with undefined). */
  hide() {
    if (!this._visible || this._leaving) return;
    this._leave();
    this._settle(undefined);
  }

  dispose() {
    this._detach();
    clearTimeout(this._hideTimer);
    this._settle(undefined);
    this.element.remove();
  }

  // ------------------------------------------------------------------------------------------

  _accepting() { return this._visible && !this._leaving && performance.now() >= this._armedAt; }

  _dismiss(source) {
    this._leave();
    if (this.onDismiss) this.onDismiss(source);
    this._settle(source);
  }

  _leave() {
    this._leaving = true;
    this._detach();
    const el = this.element;
    el.classList.add('is-leaving');
    el.classList.remove('is-on');
    clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => {
      el.classList.remove('is-leaving');
      el.classList.add('is-gone');
      this._visible = false;
      this._leaving = false;
    }, 1150);
  }

  _detach() {
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

  /** Build / update / remove the destination row for a show() call. */
  _setDestinations(destinations, current) {
    const list = Array.isArray(destinations)
      ? destinations.filter((d) => d && d.value != null).map((d) => ({ value: String(d.value), label: String(d.label ?? d.value) }))
      : [];
    if (!list.length) {
      this._dests = null;
      this._current = null;
      if (this._destEl) { this._destEl.remove(); this._destEl = null; this._destLabel = null; }
      return;
    }
    this._dests = list;
    this._current = current != null ? String(current) : list[0].value;
    // a current value missing from the list stays the result unless the player picks an entry
    this._curIndex = Math.max(0, list.findIndex((d) => d.value === this._current));
    this._destIndex = this._curIndex;
    if (!this._destEl) {
      const row = document.createElement('div');
      row.className = 'lu-title__dest';
      row.innerHTML = '<div class="lu-title__dest-row">'
        + `<span class="lu-title__dest-arrow lu-title__dest-arrow--prev" role="button" aria-label="Previous level">${SVG_PREV}</span>`
        + '<span class="lu-title__dest-label"></span>'
        + `<span class="lu-title__dest-arrow lu-title__dest-arrow--next" role="button" aria-label="Next level">${SVG_NEXT}</span>`
        + '</div><div class="lu-title__dest-hint"></div>';
      const hint = row.querySelector('.lu-title__dest-hint');
      hint.append(createKeycaps('ArrowLeft/ArrowRight'), document.createTextNode(' Choose a level'));
      const glyph = (dir) => (e) => {
        // the glyphs cycle and never dismiss
        e.preventDefault();
        e.stopPropagation();
        if (this._accepting() && this._dests) this._cycle(dir);
      };
      row.querySelector('.lu-title__dest-arrow--prev').addEventListener('pointerdown', glyph(-1));
      row.querySelector('.lu-title__dest-arrow--next').addEventListener('pointerdown', glyph(1));
      this._destLabel = row.querySelector('.lu-title__dest-label');
      this.element.querySelector('.lu-title__inner').appendChild(row);
      this._destEl = row;
    }
    this._renderDest();
  }

  _cycle(dir) {
    const n = this._dests.length;
    this._destIndex = (this._destIndex + dir + n) % n;
    this._renderDest();
  }

  _resetDest() {
    if (!this._dests || this._destIndex === this._curIndex) return;
    this._destIndex = this._curIndex;
    this._renderDest();
  }

  _renderDest() {
    const d = this._dests[this._destIndex];
    const changed = this._destIndex !== this._curIndex;
    this._destLabel.textContent = d.label;
    this._destEl.classList.toggle('is-changed', changed);
    this._prompt.textContent = changed ? `Enter / A — Travel to ${d.label}` : this._promptText;
  }

  /** @returns {number} the index of a gamepad button newly pressed since the previous poll, or -1. */
  _pollGamepads() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null;
    if (!pads) return -1;
    let pressed = -1;
    let k = 0;
    for (let p = 0; p < pads.length; p++) {
      const pad = pads[p];
      if (!pad) continue;
      for (let b = 0; b < pad.buttons.length; b++, k++) {
        const down = pad.buttons[b].pressed;
        if (this._padInit && down && !this._padPrev[k] && pressed < 0) pressed = b;
        this._padPrev[k] = down;
      }
    }
    this._padInit = true;
    return pressed;
  }
}
