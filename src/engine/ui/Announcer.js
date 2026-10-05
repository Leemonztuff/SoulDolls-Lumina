import './ui.css';
import './combat.css';

/**
 * Announcer — centred combat announcements (`.lu-announce`, COMBAT.md §13.1–§13.2): the level-up
 * card ('level': Cinzel gold title and an italic gains line) and the wider boss 'results' card (a
 * panel with the sub line in Pixelify). Queued: each announcement starts when the previous one has
 * ended, and its promise resolves when it has finished. Its own element at 34vh (never the area
 * Banner; `compact`: smaller, at 21vh — a level-up mid-fight); hidden in photo mode only.
 *
 * `duration` is the whole time on screen, fades included (in 0.45 s, out 0.55 s; at least 1.2 s),
 * counted on the wall clock. CSS animations restart by toggling between two identical keyframe
 * names (no forced layout).
 */

const IN = 0.45;
const OUT = 0.55;

export class Announcer {
  /** @param {HTMLElement} root the UI root (`#lumina-ui`) */
  constructor(root) {
    this.root = root;
    const el = document.createElement('div');
    el.className = 'lu-announce';
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <div class="lu-announce__card">
        <div class="lu-announce__shade"></div>
        <div class="lu-announce__rule"></div>
        <div class="lu-announce__title"></div>
        <div class="lu-announce__sub"></div>
        <div class="lu-announce__rule lu-announce__rule--b"></div>
      </div>`;
    root.appendChild(el);
    this.element = el;
    this._title = el.querySelector('.lu-announce__title');
    this._sub = el.querySelector('.lu-announce__sub');
    this._queue = Promise.resolve();
    /** Pending timer id → its resolver (dispose resolves them at once). */
    this._pending = new Map();
    this._disposed = false;
    this._flip = false;
    this._showing = false;
    /** Bumped by clear(): queued announcements of an older generation end at once. */
    this._gen = 0;
  }

  /** True while an announcement is on screen. */
  get visible() { return this._showing; }

  /**
   * @param {string} title
   * @param {string} [sub]
   * @param {{ duration?: number, kind?: 'level'|'results', compact?: boolean }} [opts] seconds on
   *   screen (2.4); 'results': the wider card, sub line in Pixelify; compact: a smaller card at
   *   21vh instead of 34vh (a level-up in the middle of a fight; additive to COMBAT.md §13.2)
   * @returns {Promise<void>} resolves when this announcement has finished
   */
  announce(title, sub = '', { duration = 2.4, kind = 'level', compact = false } = {}) {
    const d = Math.max(IN + OUT + 0.2, Number.isFinite(duration) ? duration : 2.4);
    const k = kind === 'results' ? 'results' : 'level';
    const gen = this._gen;
    /** @type {() => Promise<void>} */
    const run = () => new Promise((resolve) => {
      if (this._disposed || gen !== this._gen) { resolve(); return; }
      this._show(String(title ?? ''), String(sub ?? ''), d, k, !!compact);
      const id = setTimeout(() => {
        this._pending.delete(id);
        this._hide();
        resolve();
      }, d * 1000);
      this._pending.set(id, resolve);
    });
    this._queue = this._queue.then(run);
    return this._queue;
  }

  /**
   * Drop every queued announcement and hide the one on screen (their promises resolve at once) —
   * the combat test `reset()` hook.
   */
  clear() {
    this._gen++;
    for (const [id, resolve] of this._pending) { clearTimeout(id); resolve(); }
    this._pending.clear();
    if (this._showing) this._hide();
  }

  dispose() {
    this._disposed = true;
    for (const [id, resolve] of this._pending) { clearTimeout(id); resolve(); }
    this._pending.clear();
    this.element.remove();
  }

  _show(title, sub, d, kind, compact) {
    this._title.textContent = title;
    this._sub.textContent = sub;
    const el = this.element;
    el.style.setProperty('--lu-an-out', `${(d - OUT).toFixed(3)}s`);
    this._flip = !this._flip;
    el.className = `lu-announce lu-announce--${kind}${compact ? ' lu-announce--compact' : ''} ${this._flip ? 'is-a' : 'is-b'}`;
    this._showing = true;
  }

  _hide() {
    this._showing = false;
    this.element.className = 'lu-announce';
  }
}
