/**
 * The wild-creature overworld system (the "Critters Collection" plan §5): the `creature` and
 * `creature_zone` level objects (docs/specs/OBJECT_CATALOG.md) come alive here — free-roaming wild
 * actors with contact battles, encounter zones with a distance counter, and the battle lifecycle
 * around `CreatureBattle`: the creature UI (`UI.enableCreature`) over the world, the bindings a
 * battle needs (saved and restored around it, like CombatSystem), and the translated log and menus
 * fed to the battle HUD until an outcome ends the battle (the battle pane keeps its own module).
 *
 * Data-driven (plan §7): every tunable — the encounter steps per table, the species and levels a
 * table rolls (public/data/creatures/encounters.json, loaded at runtime through
 * `import.meta.env.BASE_URL`; unknown tables / a missing file leave the zones empty with a warn).
 * The actors' wander range comes from the level objects. Nothing here is hardcoded game data.
 *
 * Deterministic: every actor and every battle is seeded from the level object's id (`RNG` +
 * `hashString`), so the same level plays the same battles; no `Math.random()`.
 *
 * Lifecycle: created by `Game._buildLevel` on a level with creatures (`levelHasCreatures`),
 * disposed by `Game._detachLevel` like combat — the actors re-seed from the level objects when the
 * level is built again; the roster and the orbs live on (the roster saves through its own keys).
 */
import { UI } from '../../engine/index.js';
import { RNG, hashString } from '../../engine/utils/math.js';
import { Sprite3D } from '../../engine/sprite/Sprite3D.js';
import { createSpeciesSheet } from '../../engine/pixel/CreatureSprites.js';
import { CREATURE_KINDS, CREATURE_TABLES, isCreatureType } from '../../engine/level/ObjectCatalog.js';
import { CHARACTER_SPRITE_OPTS } from '../config.js';
import { Creature } from './Creature.js';
import { moveDef } from './defs.js';
import { typeMultiplier } from './rules.js';
import { CreatureRoster } from './CreatureRoster.js';
import { CreatureBattle } from './CreatureBattle.js';
import { CreatureInput, CREATURE_BINDINGS, CREATURE_HOTKEY_BINDINGS } from './CreatureInput.js';
import { ct } from './strings.js';
import { creatureUIClasses } from './creatureUI.js';
import { createRosterController } from './rosterUI.js';

/**
 * @import { LevelObject } from '../../engine/level/types.d.ts'
 * @import { BattleAction, BattleEvent, BattleMenu, BattleOutcome, BattleState } from './types.d.ts'
 */

/** Seconds a standing creature waits before it picks a new walk target (its idle pacing). */
const RETARGET_EVERY = 3;
/** Seconds a creature pauses after a walk ends (it stands still for a while). */
const PAUSE = [1, 3];
/** The actors' collision radius passed to `tileMap.move` (critters use the same body). */
const BODY_RADIUS = 0.18;
/** The largest step one `tileMap.move` call may take (matches the critters). */
const MOVE_STEP = 0.55;
/** Base walk speed in tiles per second (a bit of random variation per creature). */
const WALK_SPEED = 1.1;
/** Contact distance: a player this close to a creature's centre triggers a battle (plan §5:
 *  fixed — the actor's `radius` is a wander amplitude, not a trigger range). */
const CONTACT = 1.0;
/** Seconds an automatic battle phase waits before it advances (the battle sandbox's STEP). */
const STEP = 0.55;
/** The battle phases that wait for a menu choice (the others run on the STEP timer). */
const MENU_PHASES = ['action', 'moveSelect', 'switch'];
/** The main battle menu in reading order (the ids `CreatureBattle.chooseAction` reads). */
/** @type {BattleAction[]} */
const ACTIONS = ['fight', 'bag', 'pokemon', 'run'];
/** The newest log lines the battle HUD keeps. */
const LOG_LINES = 8;
/** After a battle ends, seconds before another may start — a player standing on the spot is not
 *  re-caught the frame it ends; walking away is the way out. */
const BATTLE_COOLDOWN = 2;
/** Seconds between "no companion to fight with" toasts (a party with no one standing is not
 *  spammed every frame). */
const NOPARTY_COOLDOWN = 2.5;
/** The roster panel's UI sounds → the game's SFX (as the party's own panel does). */
const ROSTER_SFX = { menuMove: 'blip', menuSelect: 'confirm', menuOpen: 'open', menuClose: 'close' };

/**
 * A free-roaming wild creature actor: its overworld species sprite drifts around the spot the level
 * placed it — the point object's world x, z — within `obj.radius` while the player is on foot, with
 * the critters' collision (tileMap.move) and idle/walk animation states. Frozen (standing) while the
 * player talks, maps, or photographs; `wander: false` creatures never leave their spot.
 */
class WildActor {
  /**
   * @param {CreatureSystem} system
   * @param {LevelObject} obj the `creature` object (species, level, radius, wander)
   */
  constructor(system, obj) {
    const o = obj;
    const species = CREATURE_KINDS.includes(o.species) ? o.species : 'leafling';
    if (species !== o.species) {
      console.warn(`[Luminati] creature "${o.id}": unknown species "${o.species}" — a Leafling stands instead`);
    }
    this.system = system;
    this.obj = o;
    /** The resolved species (an unknown one fell back to 'leafling'). */
    this.species = species;
    /** The level the contact battle is fought at (`obj.level`, default 3). */
    this.level = typeof o.level === 'number' ? o.level : 3;
    // the actor's home: the point object's world position (the level's x, z)
    const x = o.x;
    const z = o.z;
    this.home = { x, z };
    /** The actor's feet (the body the contact test reads). */
    this.x = x;
    this.z = z;
    this.radius = typeof o.radius === 'number' ? o.radius : 2.5;
    this.wander = o.wander !== false;
    this.rng = new RNG((hashString(`wild:${o.id}`) >>> 0));
    this.speed = WALK_SPEED + this.rng.range(0, 0.4);
    /** 'idle' | 'walk' */
    this.state = 'idle';
    /** Seconds spent idle without a target (after the pause). */
    this.stateT = RETARGET_EVERY;
    /** Seconds of the pause still to wait (a creature stands a while after a walk). */
    this.pause = 0;
    /** @type {{ x: number, z: number }|null} the walk target */
    this._target = null;
    /** @type {{ x: number, z: number }} the scratch `tileMap.move` result */
    this._out = { x, z };
    const sheet = createSpeciesSheet(species, { pose: 'overworld' });
    const sprite = new Sprite3D(sheet, { ...CHARACTER_SPRITE_OPTS, ...sheet.spriteOptions });
    sprite.position.set(x, system.tileMap.getHeight(x, z), z);
    sprite.setDirection('down');
    sprite.play('idle');
    this.sprite = sprite;
  }

  /**
   * One frame of the actor: the idle/walk cycle while the player is active; standing still
   * (animation held) otherwise.
   * @param {number} dt
   * @param {{ active: boolean }} ctx whether the player is on foot right now
   */
  update(dt, ctx) {
    if (!ctx.active) {
      if (this.state !== 'idle') {
        this.state = 'idle';
        this.sprite.play('idle');
      }
      return;
    }
    if (this.state === 'idle') {
      if (!this.wander) return;
      if (this.pause > 0) {
        this.pause -= dt;
        return;
      }
      this.stateT += dt;
      if (this.stateT >= RETARGET_EVERY) this._go();
      return;
    }
    this._walk(dt);
  }

  /** Pick a walk target within `radius` of home and start walking. */
  _go() {
    const a = this.rng.range(0, Math.PI * 2);
    const r = this.rng.range(0, Math.max(0.5, this.radius));
    this._target = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
    this.state = 'walk';
  }

  /** Stop walking: pause a random while, then the re-target timer starts again. */
  _pauseIdle() {
    this.state = 'idle';
    this.stateT = 0;
    this.pause = this.rng.range(PAUSE[0], PAUSE[1]);
    this._target = null;
    this.sprite.play('idle');
  }

  /** One walking frame toward `_target` (a wall stops the walk with a pause). */
  _walk(dt) {
    const t = this._target;
    if (!t) {
      this._pauseIdle();
      return;
    }
    const dx = t.x - this.x;
    const dz = t.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) {
      this._pauseIdle();
      return;
    }
    const step = Math.min(this.speed * dt, d);
    const pos = this.sprite.position;
    const out = this.system.tileMap.move(pos, (dx / d) * step, (dz / d) * step, BODY_RADIUS, MOVE_STEP, this._out);
    if (out && (out.x !== this.x || out.z !== this.z)) {
      this.x = out.x;
      this.z = out.z;
      pos.x = out.x;
      pos.z = out.z;
      pos.y = this.system.tileMap.getHeight(out.x, out.z);
      this.sprite.faceVector(dx, dz);
      this.sprite.play('walk');
    } else {
      // against a wall (or already at the spot): stop and look again after a pause
      this._pauseIdle();
    }
  }
}

/**
 * A `creature_zone` object's live state: the rect, the player's distance walked inside it (the
 * steps), and how many times it already rolled an encounter (each battle is seeded with `rolls`,
 * so the same zone gives a different battle every time).
 */
class CreatureZone {
  /**
   * @param {LevelObject} obj the `creature_zone` object (table, steps)
   */
  constructor(obj) {
    const o = /** @type {LevelObject & { minX?: number, maxX?: number, minZ?: number, maxZ?: number }} */ (obj);
    this.obj = o;
    this.table = String(o.table ?? '').trim();
    // a rect object: its world rectangle (minX/minZ to maxX/maxZ)
    this.minX = o.minX ?? 0;
    this.maxX = o.maxX ?? 0;
    this.minZ = o.minZ ?? 0;
    this.maxZ = o.maxZ ?? 0;
    this.lastX = NaN;
    this.lastZ = NaN;
    /** The distance the player walked inside the rect (teleports count; a leave resets). */
    this.steps = 0;
    /** How many battles this zone rolled (its seed counter). */
    this.rolls = 0;
  }
}

/**
 * The wild-creature overworld system (header comment above): the actors and zones of the level,
 * the battle lifecycle, the roster and the orbs. Created by `Game._buildLevel` when the level has
 * creature objects (`levelHasCreatures`), updated from `Game.update` (overworld) or — during a
 * battle — with `updateBattle` instead, exposed to the test page through `hooks`.
 */
export class CreatureSystem {
  /**
   * @param {{ game: import('../Game.js').Game, tileMap: import('../../engine/world/TileMap.js').TileMap,
   *   scene: import('three').Scene, spriteManager: import('../../engine/sprite/SpriteManager.js').SpriteManager,
   *   objects: LevelObject[] }} o
   */
  constructor({ game, tileMap, scene, spriteManager, objects }) {
    /** The running game (its UI for toasts and the creature overlay). */
    this.game = game;
    this.tileMap = tileMap;
    this.scene = scene;
    this.spriteManager = spriteManager;
    /** The battle party and storage box (plan §12). A play-test start (`&level=`, a sandbox) keeps
     *  its own key and never touches the real roster; a campaign run links the save's mirror
     *  (`state: game.campaign?.state`) so the roster travels with it (plan §10). */
    this.roster = new CreatureRoster({ state: game.campaign?.state ?? null, test: !game._shippedSlug() });
    this.roster.load();
    /**
     * The campaign seat (plan §10): while this level runs, the runtime's `creatures` slot points at
     * this roster — `setState` repoints it at a new journey's save, `onTravel` saves the mirror
     * into the campaign state. Null without a campaign (a loose level); `dispose` clears the seat
     * again, so the runtime's guarded slot lies unused between creature levels.
     * @type {null | { setState: (s: import('../campaign/CampaignState.js').CampaignState) => void,
     *   onTravel: () => boolean }}
     */
    this._campaignSeat = null;
    if (game.campaign) {
      this._campaignSeat = {
        setState: (s) => this.roster.setState(s),
        onTravel: () => this.roster.save(),
      };
      game.campaign.creatures = this._campaignSeat;
    }
    /** The orbs left to throw (phase 13: the campaign's `orb` story count replaces this). */
    this.orbs = 0;
    /** The battle running, null in the overworld. @type {CreatureBattle|null} */
    this.battle = null;
    /** The bindings saved when a battle starts (`input.saveBindings`), restored when it ends. */
    this.saved = null;
    /** @type {CreatureInput|null} the battle's input, while a battle runs */
    this.input = null;
    /** @type {import('./types.d.ts').CreatureBattleHUDLike|null} */
    this.hud = null;
    /** Capture allowed on this level (`environment.capture`; the battle pane's Run is its alias). */
    this._capture = game.env.capture !== false;
    /** The encounters tables (public/data/creatures/encounters.json), null until `load()` lands. */
    this.tables = null;
    /** The wild actors, one per `creature` object, in level order. @type {WildActor[]} */
    this.actors = [];
    /** The encounter zones, one per `creature_zone` object. @type {CreatureZone[]} */
    this.zones = [];
    /** Seconds before a new battle may start (the anti-chain guard). */
    this._cooldown = 0;
    /** The last no-party toast's time (ms). */
    this._lastNoParty = -Infinity;
    /** The battle loop's step timer, cursor phase, and the HUD's sprite pair cache. */
    this._stepT = 0;
    this._phase = '';
    /** @type {[string, string]} the last species pair sent to `hud.setSprites` */
    this._species = ['', ''];
    /** @type {Map<string, { canvas: HTMLCanvasElement, dispose(): void }>} the battle pane's sheets
     *  by species (disposed with the system). */
    this._sheets = new Map();
    /** Roster UI controller */
    this._rosterCtrl = null;
    /** Saved bindings for hotkeys (creatureRoster) */
    this._bindingsSaved = null;
    /** Whether creature UI is enabled */
    this._creaturesEnabled = false;
    // The roster hotkey (C) is opt-in with the creature system: bound for the level's lifetime (a
    // peaceful level never reaches here, so it never carries the binding) and restored on dispose.
    try {
      this._bindingsSaved = game.engine.input.saveBindings();
      game.engine.input.addBindings(CREATURE_HOTKEY_BINDINGS);
    } catch (err) {
      this._bindingsSaved = null;
    }
    for (const obj of objects) {
      if (!isCreatureType(obj.type)) continue;
      if (obj.type === 'creature') this._addActor(obj);
      else if (obj.type === 'creature_zone') this._addZone(obj);
    }
  }

  _ensureCreatureUI() {
    if (this._creaturesEnabled) return;
    const game = this.game;
    UI.useCreatureUI(creatureUIClasses());
    game.ui.enableCreature();
    this._creaturesEnabled = true;
    if (!this._rosterCtrl && game.ui.creature?.roster) {
      this._rosterCtrl = createRosterController({
        roster: this.roster,
        panel: game.ui.creature.roster,
        onChanged: () => this._syncStory(),
        onSound: (name) => {
          const sfx = Object.hasOwn(ROSTER_SFX, name) ? ROSTER_SFX[name] : null;
          if (sfx) game.audio?.playSfx(sfx, { volume: 0.5 });
        },
      });
    }
  }

  /** The wild actors' sprites (the level's actor pass: warm fill, contact shadows, blobs). */
  get actorSprites() {
    return this.actors.map((a) => a.sprite);
  }

  /**
   * Bring in the encounter tables (plan §7): the species and levels each table rolls and the steps
   * per encounter (public/data/creatures/encounters.json through `import.meta.env.BASE_URL`). A
   * zone without the file (a static page: `npm run preview` has no level-save API) stands empty
   * with a warn; a table with no entries never triggers.
   * @returns {Promise<void>}
   */
  async load() {
    try {
      const res = await fetch(import.meta.env.BASE_URL + 'data/creatures/encounters.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json || json.format !== 'luminati-creatures-encounters' || !json.tables) {
        throw new Error('unexpected shape');
      }
      this.tables = json.tables;
    } catch (err) {
      console.warn('[Luminati] creature encounters could not be loaded; the encounter zones stay empty:', err);
      this.tables = null;
    }
    // (the story's `creature` conditions read the roster snapshot: seeded as soon as the system is up)
    this._syncStory();
  }

  /**
   * One overworld frame (`Game.update`, after the player has moved): the actors roam while the
   * player is on foot, contacts start battles, and the zones count the player's steps. A battle
   * runs on its own frame instead (`updateBattle`).
   * @param {number} dt
   * @param {{ active: boolean }} ctx the player's play state (frozen while talking, in a map or in
   *   photo mode — the actors stand and the zones wait)
   */
  update(dt, ctx) {
    if (this.battle) return;
    if (this._cooldown > 0) this._cooldown -= dt;
    for (const a of this.actors) a.update(dt, ctx);
    if (!ctx.active) return;
    // contacts first (a standing creature still catches the player)
    const p = this.game.player.position;
    for (const a of this.actors) {
      const dx = a.x - p.x;
      const dz = a.z - p.z;
      if (dx * dx + dz * dz < CONTACT * CONTACT) {
        this._onContact(a);
        return;
      }
    }
    // encounter zones: the player's distance walked inside the rect
    for (const z of this.zones) this._tickZone(z, p.x, p.z);
  }

  /**
   * A player walked into a wild creature: one battle at a time, and only after the cooldown — a
   * player standing on the spot is not re-caught the frame a battle ends.
   * @param {WildActor} actor
   */
  _onContact(actor) {
    if (this._cooldown > 0) return;
    const obj = actor.obj;
    this.startBattle(
      new Creature(actor.species, { level: actor.level }),
      new RNG((hashString(`contact:${obj.id}`) >>> 0)),
    );
  }

  /**
   * Count the player's distance walked inside the zone: entering starts the counter, leaving resets
   * it (a teleport counts: its jump appears as a step). At the zone's steps — its own `steps`, else
   * the table's `stepsPerEncounter` — a battle is rolled (design decision: absent/0 = the default).
   * @param {CreatureZone} zone
   * @param {number} px
   * @param {number} pz
   */
  _tickZone(zone, px, pz) {
    if (px < zone.minX || px >= zone.maxX || pz < zone.minZ || pz >= zone.maxZ) {
      zone.steps = 0;
      zone.lastX = NaN;
      zone.lastZ = NaN;
      return;
    }
    if (Number.isNaN(zone.lastX)) {
      zone.lastX = px;
      zone.lastZ = pz;
      return;
    }
    const dx = px - zone.lastX;
    const dz = pz - zone.lastZ;
    zone.lastX = px;
    zone.lastZ = pz;
    zone.steps += Math.hypot(dx, dz);
    const need = this._zoneNeed(zone);
    if (need > 0 && zone.steps >= need) {
      zone.steps = 0;
      if (this._cooldown <= 0) this._zoneBattle(zone);
    }
  }

  /** The steps a `creature_zone` waits for: its own `steps`, else the table's default. */
  _zoneNeed(zone) {
    if (typeof zone.obj.steps === 'number' && zone.obj.steps > 0) return zone.obj.steps;
    return this.tables?.[zone.table]?.stepsPerEncounter ?? 0;
  }

  /**
   * Roll a wild foe from the zone's table (weighted, level in the entry's range) and start the
   * battle. Seeded with the zone's id and how many battles it already rolled, so the same zone
   * plays a different battle every time — deterministically.
   * @param {CreatureZone} zone
   */
  _zoneBattle(zone) {
    const entries = this.tables?.[zone.table]?.entries;
    if (!Array.isArray(entries) || entries.length === 0) return;
    const rng = new RNG((hashString(`zone:${zone.obj.id}:${zone.rolls}`) >>> 0));
    zone.rolls++;
    let total = 0;
    for (const e of entries) total += e.weight ?? 1;
    let pick = rng.range(0, total);
    let spec = entries[0];
    for (const e of entries) {
      pick -= e.weight ?? 1;
      if (pick <= 0) {
        spec = e;
        break;
      }
    }
    const lo = spec.level?.[0] ?? 1;
    const hi = spec.level?.[1] ?? lo;
    const level = Math.max(1, Math.round(rng.range(lo, hi)));
    this.startBattle(new Creature(spec.species, { level }), rng);
  }

  /**
   * Start a wild battle against `foe`: the party's leader (the first active creature standing)
   * steps out, the creature UI and bindings go on (the engine bindings are saved first and
   * restored when the battle ends; the Input has no `removeBindings`), and the battle loops in
   * `updateBattle` until its outcome, then `_endBattle` puts the overworld back. A party with no
   * one standing gets a toast instead of a battle (plan §5: no battle without a companion).
   * @param {Creature} foe the wild creature
   * @param {RNG} rng a seeded random source (contacts and zones always pass one)
   */
  startBattle(foe, rng) {
    const leader = this.roster.active.find((c) => !c.fainted);
    if (!leader) {
      this._toastNoParty();
      return;
    }
    const game = this.game;
    const input = game.engine.input;
    this._ensureCreatureUI();
    this.saved = input.saveBindings();
    input.addBindings(CREATURE_BINDINGS);
    this.battle = new CreatureBattle({
      player: leader,
      foe,
      roster: this.roster,
      capture: this._capture,
      rng,
      orbCount: () => this.orbCount(),
      onOrb: () => this.spendOrb(),
    });
    this.input = new CreatureInput(input);
    /** @type {import('./types.d.ts').CreatureBattleHUDLike} */
    const hud = game.ui.creature.hud;
    // (the HUD is created without callbacks; a menu click reaches the same `_choose` as the keys)
    hud.onSelect = (i) => this._choose(i);
    hud.onCancel = () => { this.battle?.cancel(); };
    hud.show();
    this.hud = hud;
    this._phase = '';
    this._stepT = 0;
    this._species = ['', ''];
    this.battle.begin();
    this._syncHud(null);
  }

  /**
   * One battle frame (`Game.update` routes the whole frame here while a battle runs): the menus
   * react to the creature bindings, the other phases run on a STEP timer, and the HUD is fed the
   * battle's translated log and menu. An outcome ends the battle (`_endBattle`).
   * @param {number} dt
   */
  updateBattle(dt) {
    const b = this.battle;
    const ci = this.input;
    if (!b || !ci) return;
    ci.collect();
    const st = b.state();
    const phase = b.phase;
    if (phase !== this._phase) {
      this._phase = phase;
      ci.index = 0;
      this._stepT = 0;
      if (phase === 'end') {
        // the final events on the HUD, then the world back
        this._syncHud(null);
        this._endBattle(st.outcome ?? null, st);
        return;
      }
    }
    /** @type {BattleMenu|null} */
    let menu = null;
    if (MENU_PHASES.includes(phase)) {
      // a cancel steps back one menu (moveSelect / switch → action); on `action` it is a no-op
      if (phase !== 'action' && ci.take('creatureBattleCancel') && b.cancel()) {
        ci.index = 0;
        this._phase = b.phase;
      }
      const ph = b.phase;
      if (ph === 'action') menu = this._actionMenu(st);
      else if (ph === 'moveSelect') menu = this._moveMenu();
      else if (ph === 'switch') menu = this._switchMenu(st);
      if (menu) {
        ci.navigate(menu.items.length, { cols: menu.cols, enabled: (i) => !menu?.items[i]?.disabled });
        menu = { ...menu, cursor: ci.index };
        if (ci.take('creatureBattleConfirm')) {
          this._choose(ci.index);
          menu = null; // the phase moved on (the new phase's menu is built next frame)
        }
      }
    } else {
      ci.take('creatureBattleCancel'); // discard a cancel pressed while the battle runs on its own
      this._stepT += dt;
      if (this._stepT >= STEP) {
        this._stepT = 0;
        b.advance();
      }
    }
    ci.tick(dt);
    this._syncHud(menu);
  }

  /**
   * The menu cursor means the same in every phase: the index into the phase's list (the 2 × 2
   * actions, the 2 × 2 moves, the 1 × n party). The phase is re-read: the battle may have moved on
   * between a press and now.
   * @param {number} i
   */
  _choose(i) {
    const b = this.battle;
    if (!b) return;
    const st = b.state();
    if (b.phase === 'action') {
      const action = ACTIONS[i];
      if (action) b.chooseAction(action);
    } else if (b.phase === 'moveSelect') {
      const id = b.player.moves[i];
      if (id) b.chooseMove(id);
    } else if (b.phase === 'switch') {
      const info = st.bench[i];
      if (info) b.chooseSwitch(info.uid);
    }
  }

  /**
   * The 2 × 2 action menu (Orbs and Run off when the battle forbids them, Party off when empty). No
   * back step from the top menu.
   * @returns {BattleMenu}
   */
  _actionMenu(st) {
    return {
      items: [
        { label: ct('battle.fight', 'Fight') },
        { label: ct('battle.bag', 'Orbs'), disabled: !st.canCapture },
        { label: ct('battle.party', 'Party'), disabled: st.bench.length === 0 },
        { label: ct('battle.run', 'Run'), disabled: !st.canRun },
      ],
      cursor: 0,
      cols: 2,
      back: false,
    };
  }

  /**
   * The 2 × 2 move menu: each move's name, its type icon, its power, and an effectiveness marker
   * (a super / weak arrow when the move's type is not neutral against the foe).
   * @returns {BattleMenu}
   */
  _moveMenu() {
    const b = this.battle;
    const foeType = b?.foe.def.type;
    const items = b.player.moves.slice(0, 4).map((id) => {
      const m = moveDef(id);
      const mult = m && foeType ? typeMultiplier(m.type, foeType) : 1;
      return {
        label: ct(`move.${id}`, m ? m.name : id),
        sub: m ? String(m.power) : '',
        type: m && m.type !== 'neutral' ? m.type : undefined,
        eff: mult > 1 ? 1 : mult < 1 ? -1 : 0,
      };
    });
    return { items, cursor: 0, cols: 2, back: true };
  }

  /**
   * The 1 × n bench menu (the translated species names, the level beside them).
   * @returns {BattleMenu}
   */
  _switchMenu(st) {
    const items = st.bench.map((c) => ({
      label: ct(`species.${c.species}`, c.name),
      sub: ct('roster.level', 'Lv {n}', { n: c.level }),
    }));
    return { items, cursor: 0, cols: 1, back: true };
  }

  /**
   * Feed the battle HUD the current state (with the translated names), the translated log and the
   * menu (null: none). Every setter is cheap and idempotent; the pane sprites change only when a
   * side's species does.
   * @param {BattleMenu|null} menu
   */
  _syncHud(menu) {
    const b = this.battle;
    const hud = this.hud;
    if (!b || !hud) return;
    const st = b.state();
    hud.setState(st, { player: this._nameOf(b.player), foe: this._nameOf(b.foe) });
    hud.setLog(this._logLines(st.events));
    hud.setMenu(menu);
    const ps = b.player.species;
    const fs = b.foe.species;
    if (ps !== this._species[0] || fs !== this._species[1]) {
      this._species = [ps, fs];
      hud.setSprites({ player: this._spriteCanvas(ps), foe: this._spriteCanvas(fs) });
    }
  }

  /** The translated log lines, the newest `LOG_LINES` (what the battle HUD shows). */
  _logLines(events) {
    const b = this.battle;
    /** @type {string[]} */
    const out = [];
    const sideName = (side) => (side === 'player' ? this._nameOf(b.player) : this._nameOf(b.foe));
    for (const ev of events) {
      switch (ev.kind) {
        case 'move':
          out.push(ct('battle.used', '{name} used {move}!', { name: sideName(ev.side), move: ct(`move.${ev.move}`, ev.move) }));
          if (ev.crit) out.push(ct('battle.crit', 'A critical hit!'));
          if (typeof ev.effectiveness === 'number' && ev.effectiveness !== 1) {
            out.push(ev.effectiveness > 1 ? ct('battle.super', 'It’s super effective!') : ct('battle.weak', 'It’s not very effective…'));
          }
          break;
        case 'miss':
          out.push(ct('battle.miss', '{name}’s attack missed!', { name: sideName(ev.side) }));
          break;
        case 'switch':
          out.push(ct(ev.side === 'player' ? 'battle.go' : 'battle.foeIn',
            ev.side === 'player' ? 'Go, {name}!' : 'The wild {name} appeared!', { name: this._nameOfUid(ev.uid) }));
          break;
        case 'faint':
          out.push(ct('battle.fainted', '{name} fainted!', { name: this._nameOfUid(ev.uid) || sideName(ev.side) }));
          break;
        case 'capture':
          out.push(ev.caught
            ? ct('ui.caught', '{name} was caught!', { name: this._nameOfUid(ev.uid) || this._nameOf(b.foe) })
            : ct('battle.brokeFree', '{name} broke free!', { name: this._nameOf(b.foe) }));
          break;
        case 'run':
          out.push(ev.success ? ct('battle.gotAway', 'Got away safely!') : ct('battle.cantEscape', 'Couldn’t get away!'));
          break;
        case 'noOrb':
          out.push(ct('ui.noOrb', 'No orb'));
          break;
        case 'xp':
          out.push(ct('battle.xp', '{name} gained {n} EXP.', { name: this._nameOf(b.player), n: ev.xp ?? 0 }));
          break;
        default:
          break;
      }
    }
    return out.slice(-LOG_LINES);
  }

  /** A creature's display name: its nickname, else the translated species name. */
  _nameOf(c) {
    const nick = /** @type {{ nickname?: string }} */ (c).nickname;
    return (typeof nick === 'string' && nick ? nick : '') || ct(`species.${c.species}`, c.name);
  }

  /** The roster's (or the foe's) creature of `uid`, for a log line's name. */
  _nameOfUid(uid) {
    if (typeof uid !== 'string' || !uid) return '';
    const c = this.roster.find(uid) ?? (this.battle?.foe.uid === uid ? this.battle.foe : null);
    return c ? this._nameOf(c) : '';
  }

  /**
   * The 32 × 32 front-sheet frame 0 of a species, cached (the battle pane's sprites; the sheets
   * are disposed with the system).
   * @param {string} id
   * @returns {HTMLCanvasElement}
   */
  _spriteCanvas(id) {
    let c = this._sheets.get(id)?.canvas;
    if (c) return c;
    const sheet = createSpeciesSheet(id, { pose: 'front' });
    c = document.createElement('canvas');
    c.width = sheet.frameWidth;
    c.height = sheet.frameHeight;
    const g = c.getContext('2d');
    if (g) g.drawImage(sheet.canvas, 0, 0, sheet.frameWidth, sheet.frameHeight, 0, 0, c.width, c.height);
    this._sheets.set(id, { canvas: c, dispose: () => sheet.dispose() });
    return c;
  }

  /**
   * A battle ended: the last events are already on the HUD; toast the outcome (a catch, or a foe
   * that fled — a wipe speaks for itself in the log), save the roster, and put the overworld back
   * (the creature UI off, the engine bindings restored). A caught creature the box could not hold
   * (boxFull: `roster.add` returned null) gets the box-full toast.
   * @param {BattleOutcome|null} outcome
   * @param {BattleState} st the battle's final state
   */
  _endBattle(outcome, st) {
    const b = this.battle;
    if (!b) return;
    const hud = this.hud;
    if (hud) {
      hud.setLog(this._logLines(st.events));
      hud.setMenu(null);
    }
    const foeName = this._nameOf(b.foe);
    if (outcome === 'caught') {
      const stored = this.roster.find(b.foe.uid);
      this.game.ui.hud?.toast(
        stored ? ct('ui.got', 'You got {name}!', { name: foeName }) : ct('ui.boxFull', 'The box is full.'),
        3,
      );
    } else if (outcome === 'fled') {
      this.game.ui.hud?.toast(ct('ui.fled', '{name} fled.', { name: foeName }), 3);
    }
    this.roster.save();
    this._cooldown = BATTLE_COOLDOWN;
    this._teardownBattle();
  }

  /** Put the overworld back after a battle: the creature UI off, the bindings restored. */
  _teardownBattle() {
    if (this.saved) {
      try {
        this.game.engine.input.restoreBindings(this.saved);
      } catch (err) {
        console.warn('[Luminati] creature battle bindings could not be restored:', err);
      }
      this.saved = null;
    }
    this.battle = null;
    this.input = null;
    if (this.hud) {
      try { this.hud.hide(); } catch (err) { /* ignore */ }
    }
    this.hud = null;
    this._phase = '';
    this._stepT = 0;
  }

  /**
   * A battle asked for without a standing companion: one toast, every NOPARTY_COOLDOWN at most (a
   * player standing among creatures with nobody to fight is not spammed every frame).
   */
  _toastNoParty() {
    const now = performance.now();
    if (now - this._lastNoParty < NOPARTY_COOLDOWN * 1000) return;
    this._lastNoParty = now;
    this.game.ui.hud?.toast(ct('ui.noParty', 'You have no companion to fight with.'), 3);
  }

  /**
   * The play-test seed (the `demo()` hook): an Emberling level 5 in the party and three orbs —
   * nothing else, so a page may script a capture without touching a real save. The play-test key
   * keeps it away from the real roster.
   */
  demo() {
    this.roster.active = [new Creature('emberling', { level: 5 })];
    this.roster.box = [];
    this.setOrbs(3);
    this.roster.save();
    this._syncStory();
  }

  // ---------------------------------------------------------------------------------------------
  // Orbs, the roster and the story's `creature` command (plan §13)
  // ---------------------------------------------------------------------------------------------

  /** The story's state when one runs (the `orb` item and the roster snapshot live there), else null. */
  _orbState() {
    return this.game.story?.state ?? null;
  }

  /**
   * The orbs left to throw: the story's `orb` item when a story runs (the campaign keeps them with
   * the save), else the level's own count (a play-test start or a sandbox with no story).
   */
  orbCount() {
    const st = this._orbState();
    return st ? st.count('orb') : this.orbs;
  }

  /** Spend one orb (a throw): the story item when one runs, else the level's own count. */
  spendOrb() {
    const st = this._orbState();
    if (st) st.addItem('orb', -1);
    else this.orbs = Math.max(0, this.orbs - 1);
  }

  /** Set the orbs left (the play-test hook): the story item when one runs, else the level's count. */
  setOrbs(n) {
    const v = Math.max(0, Math.floor(Number(n) || 0));
    const st = this._orbState();
    if (st) st.addItem('orb', v - st.count('orb'));
    else this.orbs = v;
  }

  /** The first roster creature of a species (party before box), or null. @param {string} species */
  _ofSpecies(species) {
    const low = String(species).toLowerCase();
    return this.roster.active.find((c) => c.species.toLowerCase() === low)
      ?? this.roster.box.find((c) => c.species.toLowerCase() === low) ?? null;
  }

  /**
   * Give the player a creature (`creature give` / `creature starter`): a new one of `species` at
   * `level`, to the party while it has room, else the box. Returns it, or null (an unknown species,
   * a full box) with a warning logged by the caller. A toast (`creature.ui.got`) names what joined
   * — `opts.quiet` (a skipped cutscene) skips it.
   * @param {string} species
   * @param {number} [level]
   * @param {{ quiet?: boolean }} [opts]
   * @returns {Creature|null}
   */
  give(species, level = 5, opts = {}) {
    if (!CREATURE_KINDS.includes(species)) return null;
    const added = this.roster.add(new Creature(species, { level }));
    if (!added) return null;
    this.roster.save();
    this._syncStory();
    if (!opts.quiet) {
      this.game.ui?.hud?.toast?.(ct('ui.got', 'You got {name}!', { name: this._nameOf(added) }), 2.6, { kind: 'item' });
    }
    return added;
  }

  /** Heal the whole roster (`creature heal`); returns the HP restored. */
  heal() {
    const healed = this.roster.healAll();
    this.roster.save();
    this._syncStory();
    return healed;
  }

  /**
   * Bring the named species to the front of the party (the battle leader) — `creature active`. A
   * boxed one is brought into the party. False when the roster holds no such species.
   * @param {string} species
   * @returns {boolean}
   */
  makeActive(species) {
    const c = this._ofSpecies(species);
    if (!c) return false;
    const i = this.roster.active.indexOf(c);
    if (i === 0) return true;
    if (i > 0) {
      this.roster.active.splice(i, 1);
      this.roster.active.unshift(c);
    } else if (!this.roster.toActive(c.uid, 0)) return false;
    this.roster.save();
    this._syncStory();
    return true;
  }

  /**
   * Move the named species to the box (`creature box`). False when the roster holds no such species
   * or the box is full.
   * @param {string} species
   * @returns {boolean}
   */
  moveToBox(species) {
    const c = this._ofSpecies(species);
    if (!c || this.roster.active.indexOf(c) < 0) return false;
    if (!this.roster.toBox(c.uid)) return false;
    this.roster.save();
    this._syncStory();
    return true;
  }

  /**
   * Keep `game.story.state.creatures` (what a `creature` / `creature:<species>` condition reads)
   * in step with the roster after every change. A no-op without a story.
   */
  _syncStory() {
    const st = this._orbState();
    if (st) st.setCreatures(this.roster.all.map((c) => c.species));
  }

  /**
   * The system's snapshot for `Game.state()`: the roster (the saved blob), the orbs, each zone's
   * step counter, and the battle in progress (null in the overworld).
   * @returns {import('./types.d.ts').CreatureSystemState}
   */
  state() {
    return {
      enabled: true,
      roster: this.roster.toJSON(),
      orbs: this.orbCount(),
      creatures: this.actors.map((a) => ({
        id: a.obj.id,
        species: a.species,
        level: a.level,
        x: Math.round(a.x * 100) / 100,
        z: Math.round(a.z * 100) / 100,
      })),
      zones: this.zones.map((z) => ({
        id: z.obj.id,
        steps: Math.round(z.steps * 100) / 100,
        need: this._zoneNeed(z),
      })),
      battle: this.battle ? { phase: this.battle.phase, outcome: this.battle.outcome } : null,
    };
  }

  /**
   * The web-test hooks (`window.__game.creatures`, plan §5; docs/specs/AUTOMATION_API.md).
   * @returns {import('./types.d.ts').CreatureHooks}
   */
  get hooks() {
    return {
      state: () => this.state(),
      roster: this.roster,
      orbs: () => this.orbCount(),
      setOrbs: (n) => { this.setOrbs(n); },
      startBattle: (species, level = 3, seed = 'play-test') => {
        const id = typeof species === 'string' && species ? species : 'leafling';
        this.startBattle(new Creature(id, { level }), new RNG((hashString(seed) >>> 0)));
      },
      demo: () => this.demo(),
      battle: () => (this.battle ? this.battle.hooks : null),
      openRoster: () => this.openRoster(),
      closeRoster: () => this.closeRoster(),
      toggleRoster: (open) => this.toggleRoster(open),
      rosterOpen: () => this.rosterOpen,
    };
  }

  openRoster() {
    if (this.battle) return false;
    this._ensureCreatureUI();
    this._rosterCtrl?.open();
    return true;
  }

  closeRoster() {
    this._rosterCtrl?.close();
    return !this.rosterOpen;
  }

  toggleRoster(open) {
    if (open === undefined) return this.rosterOpen ? this.closeRoster() : this.openRoster();
    return open ? this.openRoster() : this.closeRoster();
  }

  get rosterOpen() {
    return !!this._rosterCtrl?.panel?.isOpen;
  }

  /** Release the level's creatures: the actors' sprites, the battle-pane sheets, and the campaign
   *  seat (when it still points at this system — a replaced one leaves the slot alone). */
  dispose() {
    if (this.game.campaign?.creatures === this._campaignSeat) this.game.campaign.creatures = null;
    this._campaignSeat = null;
    for (const a of this.actors) {
      this.spriteManager.remove(a.sprite);
      a.sprite.removeFromParent();
      a.sprite.dispose();
    }
    this.actors = [];
    for (const s of this._sheets.values()) s.dispose();
    this._sheets.clear();
    if (this.battle) this._teardownBattle();
    if (this._rosterCtrl) {
      try { this._rosterCtrl.close(); } catch (err) { /* ignore */ }
      try { this._rosterCtrl.dispose(); } catch (err) { /* ignore */ }
      this._rosterCtrl = null;
    }
    if (this._bindingsSaved && this.game?.engine?.input) {
      try { this.game.engine.input.restoreBindings(this._bindingsSaved); } catch (err) { /* ignore */ }
      this._bindingsSaved = null;
    }
    try { this.game.ui.disableCreature(); } catch (err) { /* ignore */ }
    this._creaturesEnabled = false;
  }

  /** @param {LevelObject} obj */
  _addActor(obj) {
    const actor = new WildActor(this, obj);
    this.actors.push(actor);
    this.scene.add(actor.sprite);
    this.spriteManager.add(actor.sprite);
  }

  /** @param {LevelObject} obj */
  _addZone(obj) {
    const zone = new CreatureZone(obj);
    if (!CREATURE_TABLES.includes(zone.table)) {
      console.warn(`[Luminati] creature_zone "${obj.id}": unknown table "${zone.table}" (meadow/forest/mountains/shore): it never triggers`);
      zone.table = ''; // `_zoneNeed`'s table lookup then misses: no battles
    }
    this.zones.push(zone);
  }
}