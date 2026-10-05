import './ui.css';

/**
 * Octopath-style dialog window: bottom-centre ornate panel, speaker name plate overlapping the
 * top-left border, typewriter text with punctuation pauses, a bobbing ▼ "next" indicator and an
 * optional vertical choice list with a gold cursor.
 *
 * Text markup: `{word}` renders "word" highlighted in gold, `\n` forces a line break.
 *
 * Input (via `update(dt, input)`, using `input.consumeAction(name)` when the Input has it — so the
 * press is swallowed for the rest of the frame — otherwise `input.actionPressed(name)`):
 *  - `confirm` while typing → completes the line; otherwise advances (or selects the choice)
 *  - `cancel` while typing  → completes the line
 *  - `up` / `down`          → move the choice cursor (wrapping; nothing on a one-item list)
 * Mouse: clicking the window acts as confirm; hovering / clicking a choice selects it.
 * A choice list may have a single item (the confirm then picks index 0).
 */

const SVG_NEXT = `<svg viewBox="0 0 16 12" aria-hidden="true">
  <g class="lu-arrow">
    <path d="M1.4 1.4h13.2L8 11.1z" fill="#c9a45c" stroke="#1a1208" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M3.9 2.55h8.2L8 7.5z" fill="#f7e4ab"/>
  </g>
  <g class="lu-end">
    <path d="M8 .9 13.1 6 8 11.1 2.9 6z" fill="#c9a45c" stroke="#1a1208" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M8 2.6 11.4 6H4.6z" fill="#f7e4ab"/>
  </g>
</svg>`;

const SVG_CURSOR = `<svg viewBox="0 0 10 12" aria-hidden="true">
  <path d="M1.2 1.2 9 6 1.2 10.8z" fill="#c9a45c" stroke="#1a1208" stroke-width="1.1" stroke-linejoin="round"/>
  <path d="M2.35 2.9 6.5 6H2.35z" fill="#f7e4ab"/>
</svg>`;

/** Seconds of extra pause after punctuation (only when followed by whitespace / end of line). */
const PAUSES = { ',': 0.12, ';': 0.16, ':': 0.16, '—': 0.14, '.': 0.22, '!': 0.22, '?': 0.22, '…': 0.42 };
const CLOSERS = '"\'”’)]»';

/**
 * @typedef {{ speaker?: string|null, text: string, choices?: string[] }} DialogLine
 */

export class DialogBox {
  /**
   * @param {HTMLElement} parent element the dialog is appended to (normally the UI root)
   */
  constructor(parent = document.body) {
    /** Typewriter speed in characters per second (<= 0 → instant). */
    this.speed = 45;
    /** Seconds after open() during which confirm is ignored (avoids the "talk" press skipping text). */
    this.inputGuard = 0.15;
    /**
     * Seconds after the choices appear during which input is ignored, so a player mashing confirm
     * through the text doesn't pick the pre-selected first choice by accident.
     */
    this.choiceGuard = 0.25;
    /** @type {((char: string) => void) | null} called for every revealed visible character (dialog blip hook). */
    this.onChar = null;
    /**
     * @type {((name: 'open'|'close'|'confirm'|'blip') => void) | null}
     * Optional sound hook; names match AudioSystem.playSfx names.
     */
    this.onSound = null;

    const root = document.createElement('div');
    root.className = 'lu-dialog';
    root.setAttribute('role', 'dialog');
    root.innerHTML = `
      <div class="lu-dialog__panel lu-panel">
        <div class="lu-dialog__sheen"></div>
        <div class="lu-dialog__name is-empty"><span class="lu-dialog__gem"></span><span class="lu-dialog__speaker"></span></div>
        <div class="lu-dialog__text" aria-live="polite"></div>
        <div class="lu-dialog__next">${SVG_NEXT}</div>
      </div>
      <ul class="lu-dialog__choices lu-panel lu-panel--simple"></ul>`;
    parent.appendChild(root);

    this.element = root;
    this._panel = root.querySelector('.lu-dialog__panel');
    /** @type {HTMLElement} */
    this._nameEl = root.querySelector('.lu-dialog__name');
    this._speakerEl = root.querySelector('.lu-dialog__speaker');
    this._textEl = root.querySelector('.lu-dialog__text');
    this._nextEl = root.querySelector('.lu-dialog__next');
    this._choicesEl = root.querySelector('.lu-dialog__choices');

    /** @type {DialogLine[]} */
    this._lines = [];
    this._index = 0;
    this._defaultSpeaker = '';
    this._currentSpeaker = null;
    /** @type {{ el: HTMLElement|null, ch: string, pause: number }[]} */
    this._glyphs = [];
    this._revealed = 0;
    this._timer = 0;
    this._typing = false;
    this._open = false;
    this._closing = false;
    this._guard = 0;
    this._choiceEls = [];
    this._choiceIndex = 0;
    this._choicesActive = false;
    this._choiceDelay = -1;
    this._lastChoice = undefined;
    this._clickQueued = false;
    this._resolve = null;
    this._closeTimer = 0;

    this._onPanelClick = (e) => {
      e.preventDefault();
      if (this._open && !this._closing) this._clickQueued = true;
    };
    this._panel.addEventListener('click', this._onPanelClick);
  }

  /** True from open() until the close animation has finished. */
  get isOpen() { return this._open; }
  /** True while the typewriter is revealing text. */
  get isTyping() { return this._typing; }
  /** True while the choice list is active. */
  get isChoosing() { return this._choicesActive; }

  /**
   * Open the dialog.
   * @param {{ speaker?: string, lines?: string | (string | DialogLine)[],
   *   portraitColor?: string }} [opts]
   *   `speaker` is the default name plate for lines that don't set their own; `portraitColor` tints
   *   the small gem on the name plate (any CSS color).
   * @returns {Promise<number|undefined>} resolves after the close animation with the last chosen
   *   choice index (or undefined when no choice was made). If another open() interrupts it, it
   *   resolves immediately with the choice made so far.
   */
  open({ speaker = '', lines = [], portraitColor } = {}) {
    // Settle a dialog that is still open / closing — with the choice already made, so a dialog
    // re-opened during the previous one's close animation doesn't lose the player's answer.
    if (this._resolve) this._finishClose(true);

    const list = typeof lines === 'string' ? [lines] : Array.isArray(lines) ? lines : [];
    this._lines = list.map((l) => (typeof l === 'string' ? { text: l } : { ...l, text: String(l?.text ?? '') }));
    if (!this._lines.length) return Promise.resolve(undefined);

    this._defaultSpeaker = speaker ?? '';
    this._currentSpeaker = null;
    this._index = 0;
    this._lastChoice = undefined;
    this._closing = false;
    this._open = true;
    this._guard = this.inputGuard;
    this._clickQueued = false;
    if (portraitColor) this.element.style.setProperty('--lu-portrait', portraitColor);
    else this.element.style.removeProperty('--lu-portrait');

    this.element.classList.remove('is-closing');
    this.element.classList.add('is-open');
    this._setLine(0);
    this._sound('open');
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  /**
   * Advance the typewriter and consume input. Call once per frame.
   * @param {number} dt seconds
   * @param {{ actionPressed(name: string): boolean, consumeAction?(name: string): boolean }} [input]
   */
  update(dt, input) {
    if (!this._open || this._closing) return;
    // input first, so a press always acts on what the player currently sees
    this._handleInput(dt, input);
    if (!this._open || this._closing) return;

    // typewriter
    if (this._typing) {
      if (this.speed <= 0) this._completeLine();
      else {
        this._timer -= dt;
        let n = this._glyphs.length;
        while (this._typing && this._timer <= 0 && n-- > 0) this._revealNext();
      }
    }
    if (this._choiceDelay >= 0) {
      this._choiceDelay -= dt;
      if (this._choiceDelay < 0) this._activateChoices();
    }
  }

  /** Close the dialog (animated). The open() promise resolves when the animation completes. */
  close() {
    if (!this._open || this._closing) return;
    this._closing = true;
    this._typing = false;
    this._choiceDelay = -1;
    this._setChoicesVisible(false);
    this._nextEl.classList.remove('is-on');
    this.element.classList.remove('is-open');
    this.element.classList.add('is-closing');
    this._sound('close');
    clearTimeout(this._closeTimer);
    this._closeTimer = setTimeout(() => this._finishClose(false), 320);
  }

  /** Reveal the whole current line immediately. */
  skip() { if (this._typing) this._completeLine(); }

  dispose() {
    clearTimeout(this._closeTimer);
    this._panel.removeEventListener('click', this._onPanelClick);
    if (this._resolve) { const r = this._resolve; this._resolve = null; r(undefined); }
    this.element.remove();
  }

  // ------------------------------------------------------------------------------------------

  _sound(name) { if (this.onSound) this.onSound(name); }

  /**
   * Read an action edge. Uses `input.consumeAction(name)` when the Input provides it (the engine's
   * Input does) so gameplay code running later in the same frame doesn't also see the press.
   */
  _pressed(input, name) {
    if (!input) return false;
    return typeof input.consumeAction === 'function' ? input.consumeAction(name) : input.actionPressed(name);
  }

  _handleInput(dt, input) {
    if (this._guard > 0) {
      this._guard -= dt;
      this._clickQueued = false;
      return;
    }
    const confirm = this._pressed(input, 'confirm') || this._clickQueued;
    this._clickQueued = false;

    if (this._choicesActive) {
      if (this._pressed(input, 'up')) this._moveChoice(-1);
      if (this._pressed(input, 'down')) this._moveChoice(1);
      if (confirm) this._selectChoice(this._choiceIndex);
      return;
    }
    if (this._typing) {
      if (confirm || this._pressed(input, 'cancel')) this._completeLine();
      return;
    }
    if (confirm && this._choiceDelay < 0) {
      this._sound('confirm');
      this._advance();
    }
  }

  _finishClose(immediate) {
    clearTimeout(this._closeTimer);
    this._open = false;
    this._closing = false;
    this._typing = false;
    this._choicesActive = false;
    this._choiceDelay = -1;
    this.element.classList.remove('is-closing', 'is-open');
    if (immediate) this._setChoicesVisible(false);
    this._textEl.textContent = '';
    this._glyphs.length = 0;
    const r = this._resolve;
    this._resolve = null;
    if (r) r(this._lastChoice);
  }

  _setLine(i) {
    this._index = i;
    const line = this._lines[i];
    const speaker = line.speaker === undefined ? this._defaultSpeaker : (line.speaker ?? '');
    this._setSpeaker(speaker);
    this._buildText(line.text);
    this._revealed = 0;
    this._timer = 0.06; // a breath before the first character
    this._typing = this._glyphs.length > 0;
    this._choiceDelay = -1;
    this._setChoicesVisible(false);
    this._nextEl.classList.remove('is-on');
    this._nextEl.classList.toggle('is-last', i === this._lines.length - 1);
    if (!this._typing) this._finishLine();
  }

  _setSpeaker(name) {
    if (name === this._currentSpeaker) return;
    const had = !!this._currentSpeaker;
    this._currentSpeaker = name;
    this._speakerEl.textContent = name || '';
    this._nameEl.classList.toggle('is-empty', !name);
    if (name && had) {
      // quick re-entrance when the speaker changes mid-conversation
      this._nameEl.classList.add('is-swap');
      void this._nameEl.offsetWidth;
      this._nameEl.classList.remove('is-swap');
    }
  }

  _buildText(text) {
    const root = this._textEl;
    const glyphs = this._glyphs;
    root.textContent = '';
    glyphs.length = 0;
    const frag = document.createDocumentFragment();
    let word = null;
    let hl = false;
    for (const ch of text) {
      if (ch === '{') { hl = true; continue; }
      if (ch === '}') { hl = false; continue; }
      if (ch === '\n') {
        word = null;
        frag.appendChild(document.createElement('br'));
        glyphs.push({ el: null, ch, pause: 0 });
        continue;
      }
      if (ch === ' ' || ch === '\t') {
        word = null;
        frag.appendChild(document.createTextNode(' '));
        glyphs.push({ el: null, ch: ' ', pause: 0 });
        continue;
      }
      if (!word) {
        word = document.createElement('span');
        word.className = 'lu-w';
        frag.appendChild(word);
      }
      const c = document.createElement('span');
      c.className = hl ? 'lu-c lu-hl' : 'lu-c';
      c.textContent = ch;
      word.appendChild(c);
      glyphs.push({ el: c, ch, pause: 0 });
    }
    root.appendChild(frag);

    // punctuation pauses: only when the mark ends a phrase (followed by space / end / closer)
    for (let i = 0; i < glyphs.length; i++) {
      const p = PAUSES[glyphs[i].ch];
      if (!p) continue;
      let j = i + 1;
      while (j < glyphs.length && CLOSERS.includes(glyphs[j].ch)) j++;
      const next = j < glyphs.length ? glyphs[j].ch : ' ';
      if (next === ' ' || next === '\n') {
        const ellipsis = glyphs[i].ch === '.' && i > 0 && glyphs[i - 1].ch === '.';
        glyphs[j - 1].pause = ellipsis ? PAUSES['…'] : p;
      }
    }
  }

  _revealNext() {
    const g = this._glyphs[this._revealed++];
    if (g.el) {
      g.el.classList.add('is-on');
      if (this.onChar) this.onChar(g.ch);
    }
    this._timer += 1 / this.speed + g.pause;
    if (this._revealed >= this._glyphs.length) this._finishLine();
  }

  _completeLine() {
    const glyphs = this._glyphs;
    for (let i = this._revealed; i < glyphs.length; i++) if (glyphs[i].el) glyphs[i].el.classList.add('is-on');
    this._revealed = glyphs.length;
    this._finishLine();
  }

  _finishLine() {
    this._typing = false;
    const line = this._lines[this._index];
    if (line && Array.isArray(line.choices) && line.choices.length) {
      this._buildChoices(line.choices);
      this._choiceDelay = 0.12;
    } else {
      this._nextEl.classList.add('is-on');
    }
  }

  _advance() {
    if (this._index + 1 >= this._lines.length) this.close();
    else this._setLine(this._index + 1);
  }

  _buildChoices(choices) {
    const ul = this._choicesEl;
    ul.textContent = '';
    this._choiceEls.length = 0;
    choices.forEach((label, i) => {
      const li = document.createElement('li');
      li.className = 'lu-choice';
      li.innerHTML = `<span class="lu-choice__cursor">${SVG_CURSOR}</span><span class="lu-choice__label"></span>`;
      li.lastChild.textContent = String(label);
      li.addEventListener('mouseenter', () => { if (this._choicesActive && this._choiceIndex !== i) this._setChoice(i, true); });
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._choicesActive && this._guard <= 0) this._selectChoice(i);
      });
      ul.appendChild(li);
      this._choiceEls.push(li);
    });
    this._setChoice(0, false);
  }

  _activateChoices() {
    this._choiceDelay = -1;
    this._guard = Math.max(this._guard, this.choiceGuard);
    this._choicesActive = true;
    this._setChoicesVisible(true);
  }

  _setChoicesVisible(on) {
    if (!on) this._choicesActive = false;
    this._choicesEl.classList.toggle('is-on', on);
  }

  _setChoice(i, sound) {
    const n = this._choiceEls.length;
    if (!n) return;
    this._choiceIndex = ((i % n) + n) % n;
    for (let k = 0; k < n; k++) this._choiceEls[k].classList.toggle('is-sel', k === this._choiceIndex);
    if (sound) this._sound('blip');
  }

  _moveChoice(delta) {
    // a one-item list has nowhere to go: no move, no blip (the press is still consumed)
    if (this._choiceEls.length > 1) this._setChoice(this._choiceIndex + delta, true);
  }

  _selectChoice(i) {
    this._lastChoice = i;
    this._sound('confirm');
    this._setChoicesVisible(false);
    this._advance();
  }
}
