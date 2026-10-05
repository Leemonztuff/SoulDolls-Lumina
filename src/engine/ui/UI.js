import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/crimson-pro/400.css';
import '@fontsource/crimson-pro/500.css';
import '@fontsource/crimson-pro/600.css';
import '@fontsource/crimson-pro/400-italic.css';
import '@fontsource/crimson-pro/600-italic.css';
import '@fontsource/pixelify-sans/400.css';
import './ui.css';

import { DialogBox } from './DialogBox.js';
import { Banner } from './Banner.js';
import { TitleScreen } from './TitleScreen.js';
import { HUD } from './HUD.js';
import { InteractPrompt } from './InteractPrompt.js';
import { Fader } from './Fader.js';
import { DebugPanel } from './DebugPanel.js';
import { Minimap, WorldMap } from './Minimap.js';

/**
 * @import * as THREE from 'three'
 * @import { CombatHUD } from './CombatHUD.js'
 * @import { BossBar } from './BossBar.js'
 * @import { WorldLabels } from './WorldLabels.js'
 * @import { Announcer } from './Announcer.js'
 * @import { DeathScreen } from './DeathScreen.js'
 */

/** The combat UI classes registered by `UI.useCombatUI()` (null: none yet). */
let combatClasses = null;

const FONT_FACES = [
  '400 16px "Cinzel"', '600 16px "Cinzel"', '700 16px "Cinzel"',
  '400 16px "Crimson Pro"', '500 16px "Crimson Pro"', '600 16px "Crimson Pro"',
  'italic 400 16px "Crimson Pro"', 'italic 600 16px "Crimson Pro"', '400 16px "Pixelify Sans"',
];

/**
 * The Lumina DOM overlay: composes the dialog box, area banner, title screen, HUD, interaction
 * prompt, fader and debug panel inside one `#lumina-ui` root. The root ignores the pointer; only
 * interactive children (dialog window, choices, title screen, debug panel) receive events.
 * Combat levels call `enableCombat()` once, which adds the combat components (COMBAT.md §13:
 * vitals, skill bar, loot feed, boss bar, world labels, announcer, death screen) as `ui.combat`.
 * The combat classes reach it from the caller — registered once with `UI.useCombatUI(classes)`
 * (CombatSystem imports them from their own files) or passed as `enableCombat(classes)` — so this
 * module never uses them itself and a peaceful level's bundle does not hold them (COMBAT-17; the
 * re-exports at the end are side-effect free, vite.config.js).
 *
 * Keyboard shortcuts (help, debug, photo mode) are left to the game so they can be rebound:
 * e.g. `if (input.actionPressed('debug')) ui.debug.toggle()`.
 */
export class UI {
  /** @param {HTMLElement} [container] element to overlay (document.body → fixed full-screen) */
  constructor(container = document.body) {
    const root = document.createElement('div');
    root.id = 'lumina-ui';
    root.className = 'lu-root';
    if (container !== document.body) {
      root.classList.add('lu-root--contained');
      if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    }
    container.appendChild(root);

    this.container = container;
    /** @type {HTMLDivElement} */
    this.root = root;
    // DOM order doubles as a paint-order fallback; z-index in ui.css is authoritative.
    /** @type {InteractPrompt} */
    this.prompt = new InteractPrompt(root);
    /** @type {HUD} */
    this.hud = new HUD(root);
    /** @type {Minimap} HUD minimap (hidden until it gets a map: `minimap.setMap()`) */
    this.minimap = new Minimap(this.hud.element, { anchor: this.hud.clockElement });
    /** @type {Banner} */
    this.banner = new Banner(root);
    /** @type {DialogBox} */
    this.dialog = new DialogBox(root);
    /** @type {TitleScreen} */
    this.title = new TitleScreen(root);
    /** @type {WorldMap} full-screen world map overlay (`worldMap.setMap()`, `open()` / `close()`) */
    this.worldMap = new WorldMap(root);
    /** @type {Fader} */
    this.fader = new Fader(root);
    /** @type {DebugPanel} */
    this.debug = new DebugPanel(root, { anchor: this.hud.clockElement });

    /**
     * Combat components, created by `enableCombat()` on combat levels only (null otherwise):
     * `{ hud: CombatHUD, boss: BossBar, labels: WorldLabels, announcer: Announcer, death: DeathScreen }`.
     */
    this.combat = null;

    this._visible = true;
    this._talking = false;
    this._titled = false;

    /** Resolves when the UI web fonts are loaded (never rejects). */
    this.fontsReady = typeof document !== 'undefined' && document.fonts
      ? Promise.all(FONT_FACES.map((f) => document.fonts.load(f).catch(() => null))).then(() => undefined)
      : Promise.resolve();
  }

  /**
   * Register the combat UI classes once (`src/engine/ui/{CombatHUD,BossBar,WorldLabels,Announcer,
   * DeathScreen}.js`) for `enableCombat()` (additive; CombatSystem does it before enabling). Kept
   * out of this module's imports so a peaceful level's bundle does not hold them (COMBAT-17).
   * @param {{ CombatHUD: Function, BossBar: Function, WorldLabels: Function, Announcer: Function, DeathScreen: Function }} classes
   */
  static useCombatUI(classes) {
    combatClasses = classes ?? null;
  }

  /**
   * Create the combat UI (COMBAT.md §13.1): combat HUD, boss bar, world labels, announcer and
   * death screen, plus the root class `lu-root--combat`. The world labels keep out of the HUD
   * panels (COMBAT-07) and the death screen is pre-rendered once (COMBAT-02). Idempotent; peaceful
   * levels never call it. The classes are the ones registered with `UI.useCombatUI()`, or
   * `classes` when given (either way the caller imports them — also re-exported by this module and
   * the engine barrel), so importing this module does not pull the combat UI into a peaceful
   * level's bundle (COMBAT-17). Throws when neither holds them.
   * @param {{ CombatHUD: typeof CombatHUD, BossBar: typeof BossBar,
   *   WorldLabels: typeof WorldLabels, Announcer: typeof Announcer,
   *   DeathScreen: typeof DeathScreen }} classes default: the registered ones
   * @returns {{ hud: CombatHUD, boss: BossBar,
   *   labels: WorldLabels, announcer: Announcer,
   *   death: DeathScreen }}
   */
  enableCombat(classes = combatClasses) {
    if (this.combat) return this.combat;
    const { CombatHUD, BossBar, WorldLabels, Announcer, DeathScreen } = classes ?? {};
    if (!CombatHUD || !BossBar || !WorldLabels || !Announcer || !DeathScreen) {
      throw new Error('UI.enableCombat: register the combat UI classes first (UI.useCombatUI({ CombatHUD, BossBar, WorldLabels, Announcer, DeathScreen })) or pass them');
    }
    const hudEl = this.hud.element;
    this.combat = {
      hud: new CombatHUD(hudEl, { anchor: hudEl.querySelector('.lu-loc') }),
      boss: new BossBar(hudEl),
      labels: new WorldLabels(this.root),
      announcer: new Announcer(this.root),
      death: new DeathScreen(this.root),
    };
    this.root.classList.add('lu-root--combat');
    const c = this.combat;
    // COMBAT-07: numbers, bars, pips, alerts, the reticle and edge arrows keep out of the HUD
    // panels (the label layer is under the HUD); `shown` reads class / JS state only
    const hud = this.hud;
    const loc = hud.locationElement;
    const help = hud.helpElement;
    c.labels.setPanels([
      { el: loc, shown: () => !loc.classList.contains('is-empty') },
      hud.clockElement,
      { el: this.minimap.element, shown: () => this.minimap.visible },
      { el: help, shown: () => !help.classList.contains('is-hidden') },
      c.hud.vitalsElement,
      c.hud.skillsElement,
      { el: c.boss.element, shown: () => c.boss.visible },
    ]);
    // COMBAT-02: pre-render the death screen now (its first show was one long frame)
    c.death.prime({ title: 'You Have Fallen', prompt: 'Press any key to rise at the camp' });
    return c;
  }

  /** Whether the overlay is shown (false = photo mode). */
  get visible() { return this._visible; }

  /**
   * Show / hide the whole overlay (photo mode). The fader stays active.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this._visible = !!visible;
    this.root.classList.toggle('lu-root--hidden', !this._visible);
  }

  /**
   * Per-frame update: typewriter + dialog input, prompt projection, HUD.
   * @param {number} dt seconds
   * @param {{ camera?: THREE.Camera, input?: { actionPressed(name: string): boolean } }} [ctx]
   */
  update(dt, ctx) {
    const camera = ctx ? ctx.camera : undefined;
    const input = ctx ? ctx.input : undefined;
    // dialog only takes input while the overlay is visible and the title screen is gone
    const acceptInput = this._visible && !this.title.visible;
    this.dialog.update(dt, acceptInput ? input : undefined);
    // state classes: dialog tucks the controls legend & prompt away, title hides HUD & prompt
    const talking = this.dialog.isOpen;
    if (talking !== this._talking) {
      this._talking = talking;
      this.root.classList.toggle('lu-root--dialog', talking);
    }
    const titled = this.title.visible;
    if (titled !== this._titled) {
      this._titled = titled;
      this.root.classList.toggle('lu-root--title', titled);
    }
    if (camera) this.prompt.update(camera);
    if (camera && this.combat) this.combat.labels.update(dt, camera);
    this.hud.update(dt);
  }

  dispose() {
    if (this.combat) {
      const c = this.combat;
      this.combat = null;
      c.death.dispose();
      c.announcer.dispose();
      c.labels.dispose();
      c.boss.dispose();
      c.hud.dispose();
    }
    this.debug.dispose();
    this.worldMap.dispose();
    this.minimap.dispose();
    this.fader.dispose();
    this.title.dispose();
    this.dialog.dispose();
    this.banner.dispose();
    this.hud.dispose();
    this.prompt.dispose();
    this.root.remove();
  }
}

export { DialogBox, Banner, TitleScreen, HUD, InteractPrompt, Fader, DebugPanel, Minimap, WorldMap };
// combat levels only (COMBAT.md §13): re-exported from their own files; side-effect free
// (vite.config.js), so a bundle that does not use them does not hold them
export { CombatHUD } from './CombatHUD.js';
export { BossBar } from './BossBar.js';
export { WorldLabels } from './WorldLabels.js';
export { Announcer } from './Announcer.js';
export { DeathScreen } from './DeathScreen.js';
