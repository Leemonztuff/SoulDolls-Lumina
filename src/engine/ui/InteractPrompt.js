import * as THREE from 'three';
import './ui.css';

/**
 * Floating interaction icon: a pixel-art speech bubble (with animated "…" dots) and a small label
 * plate, anchored above a world position that is projected into CSS pixels every frame. Hidden
 * automatically when the point is behind the camera or off-screen.
 */

// 16×12 pixel-art speech bubble. O outline · W paper · H highlight · S shade · 1-3 dots
const BUBBLE = [
  '..OOOOOOOOOOOO..',
  '.OHHWWWWWWWWWWO.',
  'OHWWWWWWWWWWWWSO',
  'OWWWWWWWWWWWWWSO',
  'OWW11WW22WW33WSO',
  'OWW11WW22WW33WSO',
  'OWWWWWWWWWWWWWSO',
  'OSWWWWWWWWWWWSSO',
  '.OSSSSSSSSSSSSO.',
  '..OOOSSOOOOOOO..',
  '....OSO.........',
  '....OO..........',
];
const BUBBLE_COLORS = { O: '#1c1524', W: '#fbf5e6', H: '#ffffff', S: '#d9c49c', 1: '#4a3322', 2: '#4a3322', 3: '#4a3322' };

function buildBubbleSvg() {
  const groups = { base: '', 1: '', 2: '', 3: '' };
  for (let y = 0; y < BUBBLE.length; y++) {
    const row = BUBBLE[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      if (ch !== '.') {
        const rect = `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${BUBBLE_COLORS[ch]}"/>`;
        if (ch === '1' || ch === '2' || ch === '3') {
          groups[ch] += rect;
          groups.base += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${BUBBLE_COLORS.W}"/>`;
        } else groups.base += rect;
      }
      x += run;
    }
  }
  return `<svg viewBox="0 0 16 12" aria-hidden="true">${groups.base}` +
    `<g class="lu-dot">${groups[1]}</g><g class="lu-dot lu-dot2">${groups[2]}</g><g class="lu-dot lu-dot3">${groups[3]}</g></svg>`;
}
const SVG_BUBBLE = buildBubbleSvg();

const _v = new THREE.Vector3();

export class InteractPrompt {
  /** @param {HTMLElement} parent the UI root (the prompt is positioned in its coordinate space) */
  constructor(parent = document.body) {
    const el = document.createElement('div');
    el.className = 'lu-prompt';
    el.innerHTML = `
      <div class="lu-prompt__anchor">
        <div class="lu-prompt__inner">
          <div class="lu-prompt__bubble">${SVG_BUBBLE}</div>
          <div class="lu-prompt__label"></div>
        </div>
      </div>`;
    parent.appendChild(el);
    this.element = el;
    /** @type {HTMLElement} */
    this._inner = el.querySelector('.lu-prompt__inner');
    this._label = el.querySelector('.lu-prompt__label');
    this._parent = parent;

    /**
     * Optional key hint shown as a keycap before the label (e.g. 'Space'); null for none.
     * @type {string|null}
     */
    this.keyHint = null;

    this._shown = false;
    this._inView = false;
    /** @type {THREE.Object3D|null} tracked object (null → use _pos) */
    this._target = null;
    this._pos = new THREE.Vector3();
    this._offsetY = 0;
    this._labelText = null;
    this._keyText = null;
    this._x = NaN;
    this._y = NaN;
    this._w = parent.clientWidth || window.innerWidth;
    this._h = parent.clientHeight || window.innerHeight;
    this._applyPixelScale();

    this._ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        this._w = parent.clientWidth || window.innerWidth;
        this._h = parent.clientHeight || window.innerHeight;
        this._x = NaN;
        this._applyPixelScale();
      })
      : null;
    if (this._ro) this._ro.observe(parent);
  }

  /** True between show() and hide(). */
  get visible() { return this._shown; }

  /**
   * Show the prompt above a world position. Cheap to call every frame (the DOM only changes when
   * the label changes). A Vector3 is copied; pass an Object3D instead to make the prompt follow it
   * automatically (its world position is re-read every update).
   * @param {(THREE.Vector3 & { isObject3D?: false })|THREE.Object3D} worldPos (a Vector3 has no
   *   `isObject3D`, which is how show() tells the two apart)
   * @param {string} [label]
   * @param {{ offsetY?: number, key?: string|null }} [opts] `offsetY` world units added to y;
   *   `key` overrides `keyHint` for this prompt.
   */
  show(worldPos, label = 'Talk', { offsetY = 0, key } = {}) {
    if (worldPos && worldPos.isObject3D) {
      if (this._target !== worldPos && this._shown) this._repop();
      this._target = worldPos;
    } else {
      this._target = null;
      if (worldPos) this._pos.copy(/** @type {THREE.Vector3} */ (worldPos)); // not an Object3D here
    }
    this._offsetY = offsetY;
    const k = key === undefined ? this.keyHint : key;
    if (label !== this._labelText || k !== this._keyText) {
      this._labelText = label;
      this._keyText = k;
      this._label.textContent = '';
      if (k) {
        const cap = document.createElement('kbd');
        cap.className = 'lu-key';
        cap.textContent = k;
        this._label.appendChild(cap);
      }
      if (label) this._label.appendChild(document.createTextNode(label));
    }
    if (!this._shown) {
      this._shown = true;
      this._x = NaN;
      this.element.classList.add('is-on');
    }
  }

  hide() {
    if (!this._shown) return;
    this._shown = false;
    // also drop the in-view state so a later show() stays invisible until update() has projected
    // the new anchor (otherwise it could flash for a frame at the previous screen position)
    this._inView = false;
    this.element.classList.remove('is-on', 'is-inview');
  }

  /**
   * Project the anchor into screen space. Call once per frame (after the camera moved).
   * @param {THREE.Camera & { near?: number }} camera (`near` 0.01 when the camera has none)
   */
  update(camera) {
    if (!this._shown || !camera) return;
    if (this._target) this._target.getWorldPosition(_v);
    else _v.copy(this._pos);
    _v.y += this._offsetY || 0;

    camera.updateMatrixWorld();
    _v.applyMatrix4(camera.matrixWorldInverse);
    const behind = _v.z > -(camera.near ?? 0.01);
    _v.applyMatrix4(camera.projectionMatrix);
    const inView = !behind && _v.x > -1.08 && _v.x < 1.08 && _v.y > -1.08 && _v.y < 1.12;
    if (inView !== this._inView) {
      this._inView = inView;
      this.element.classList.toggle('is-inview', inView);
    }
    if (!inView) return;
    const x = Math.round((_v.x * 0.5 + 0.5) * this._w);
    const y = Math.round((-_v.y * 0.5 + 0.5) * this._h);
    if (x !== this._x || y !== this._y) {
      this._x = x;
      this._y = y;
      this.element.style.transform = `translate3d(${x}px,${y}px,0)`;
    }
  }

  dispose() {
    if (this._ro) this._ro.disconnect();
    this.element.remove();
  }

  /** Replay the pop-in animation (e.g. when the prompt jumps to another NPC). */
  _repop() {
    const inner = this._inner;
    inner.style.animation = 'none';
    void inner.offsetWidth;
    inner.style.animation = '';
  }

  _applyPixelScale() {
    // integer pixel-art scale for the bubble so its pixels stay crisp and even
    const px = Math.max(2, Math.round(this._w / 430));
    this.element.style.setProperty('--lu-px', String(px));
  }
}
