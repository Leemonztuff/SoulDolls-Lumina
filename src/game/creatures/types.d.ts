// Creature layer contract types ("Critters Collection" plan §5, §10). Types only: nothing here
// reaches a bundle. The species / move data types are JSDoc typedefs in `defs.js` (re-exported
// here, so a caller gets the aliases from one place); the saved-roster and encounter shapes are
// declared here because they have no JavaScript home yet (later phases build `Creature.js`,
// `CreatureRoster.js` and `CreatureSystem.js` against them).
//
// `trainer` records are untrusted on load: `CreatureRoster.fromJSON` validates every field through
// own.js and drops what it cannot read (plan §10, §15), so the shapes below describe valid data,
// not data the game already trusts.

import type { CreatureDef, MoveDef, CreatureType, MoveType, CreatureStats, CreatureStatKey, LearnsetEntry } from './defs.js';
import type { Creature } from './Creature.js';
import type { CreatureRoster } from './CreatureRoster.js';
import type { CreatureBattle } from './CreatureBattle.js';
import type { RNG } from '../../engine/utils/math.js';

export type { CreatureDef, MoveDef, CreatureType, MoveType, CreatureStats, CreatureStatKey, LearnsetEntry };

/** One caught creature (`CreatureRoster`'s active / box rows). */
export interface CreatureRecord {
  /** The instance id (unique within a roster; made from the seed and the catch order). */
  uid: string;
  /** The `CREATURE_DEFS` id (English, stable). */
  species: string;
  /** A player-given nickname, or absent for the species name. */
  nickname?: string;
  /** Its level (1..100). */
  level: number;
  /** Experience gathered towards the next level. */
  exp: number;
  /** Current HP (0 = fainted). */
  hp: number;
  /** The move ids it knows (up to 4). */
  moves: string[];
}

/**
 * The canonical roster blob (`localStorage['luminati.creatures']`, mirrored into `CampaignState`):
 * `{ version, active, box }`. `SAVE_VERSION` lives in `CreatureRoster.js`.
 */
export interface CreatureRosterData {
  /** The schema version (`CreatureRoster.SAVE_VERSION`). */
  version: number;
  /** The battle party, up to 6, in slot order. */
  active: CreatureRecord[];
  /** Everything else, capped. */
  box: CreatureRecord[];
}

/** One row of an encounter table (plan §4, §7): a weighted species and its level range. */
export interface EncounterEntry {
  /** A `CREATURE_DEFS` id. */
  species: string;
  /** The selection weight (higher is likelier). */
  weight: number;
  /** The inclusive `[min, max]` level. */
  level: [number, number];
}

/** A biome / zone encounter table. */
export interface EncounterTable {
  /** Distance travelled while inside the zone between rolls. */
  stepsPerEncounter: number;
  /** The weighted species. */
  entries: EncounterEntry[];
}

/** The shape of `public/data/creatures/encounters.json`. */
export interface EncounterData {
  /** The format id (`luminati-creatures-encounters`). */
  format: string;
  /** The format version. */
  version: number;
  /** Biome / zone id → table. */
  tables: Record<string, EncounterTable>;
}

/** The shape of `public/data/creatures/starters.json`. */
export interface StarterData {
  /** The format id (`luminati-creatures-starters`). */
  format: string;
  /** The format version. */
  version: number;
  /** The three starter `CREATURE_DEFS` ids, in choice order. */
  starters: string[];
}

// -------------------------------------------------------------------------------------------------
// The battle machine (CreatureBattle.js, phase 4a; plan §7)
// -------------------------------------------------------------------------------------------------

/** The normalized random interface `ai.js`'s `asRng` returns (an `RNG` satisfies it as it is). */
export interface Rand {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [a, b] (inclusive). */
  int(a: number, b: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** A random element of a non-empty array. */
  pick<T>(arr: T[]): T;
}

/** A random source any battle helper accepts: a seeded `RNG`, a normalized `Rand`, or a function. */
export type RngSource = RNG | Rand | (() => number);

/** The side of the battle an event or order slot belongs to. */
export type BattleSide = 'player' | 'foe';

/** The battle state machine's phases (plan §7). */
export type BattlePhase =
  | 'intro' | 'action' | 'moveSelect' | 'switch' | 'turnOrder' | 'resolve'
  | 'faint' | 'capture' | 'run' | 'noOrb' | 'xp' | 'levelUp' | 'end';

/** The player's menu action (`chooseAction`). 'bag' and 'capture' both throw an orb. */
export type BattleAction = 'fight' | 'bag' | 'pokemon' | 'run' | 'capture';

/** How a battle ended (null while it runs). */
export type BattleOutcome = 'win' | 'lose' | 'caught' | 'fled' | 'foeFled' | null;

/** What a battle event records. */
export type BattleEventKind =
  | 'move' | 'miss' | 'switch' | 'capture' | 'run' | 'faint' | 'noOrb' | 'xp' | 'end';

/** A structured battle log entry (English prose stays in strings.js). */
export interface BattleEvent {
  /** The kind of event. */
  kind: BattleEventKind;
  /** The acting / fainted side. */
  side?: BattleSide;
  /** The move id (a move or miss). */
  move?: string;
  /** HP dealt (0 on a miss). */
  damage?: number;
  /** A critical hit. */
  crit?: boolean;
  /** The type chart's multiplier against the defender. */
  effectiveness?: number;
  /** The uid of the creature hit. */
  defender?: string;
  /** The uid switched in. */
  uid?: string;
  /** The uid switched out. */
  from?: string;
  /** The capture succeeded. */
  caught?: boolean;
  /** The flee succeeded. */
  success?: boolean;
  /** The chance that was rolled (capture / flee). */
  chance?: number;
  /** Experience granted. */
  xp?: number;
  /** Levels gained. */
  levels?: number;
  /** Moves learned. */
  learned?: string[];
  /** The Souldoll Resonance that fired (the species pair; 'xp' event). */
  resonated?: { from: string, to: string } | null;
  /** How the battle ended. */
  outcome?: BattleOutcome;
}

/** A creature as the battle state and tests read it. */
export interface BattleCreatureInfo {
  /** The instance id. */
  uid: string;
  /** The `CREATURE_DEFS` id. */
  species: string;
  /** The display name (nickname else species name). */
  name: string;
  /** The species type. */
  type: CreatureType;
  /** Its level. */
  level: number;
  /** Current HP. */
  hp: number;
  /** Max HP. */
  maxHp: number;
  /** HP as a 0..1 fraction. */
  hpRatio: number;
  /** Out of HP. */
  fainted: boolean;
  /** The moves it knows. */
  moves: string[];
}

/** `CreatureBattle.state()`: a snapshot for tests and UI. */
export interface BattleState {
  /** The current phase. */
  phase: BattlePhase;
  /** Turns resolved. */
  turn: number;
  /** How the battle ended, if it has. */
  outcome: BattleOutcome;
  /** The player's active creature. */
  player: BattleCreatureInfo;
  /** The foe's active creature. */
  foe: BattleCreatureInfo;
  /** The sides that act this resolve, in order. */
  order: BattleSide[];
  /** The whole battle log. */
  events: BattleEvent[];
  /** Experience the win granted. */
  xp: number;
  /** Levels the win granted. */
  levels: number;
  /** Moves learned on the win. */
  learned: string[];
  /** The Souldoll Resonance that fired on the win (null when none). */
  resonated: { from: string, to: string } | null;
  /** A wild battle (capture and flee unlocked). */
  canCapture: boolean;
  /** The player may flee (an alias of `canCapture`). */
  canRun: boolean;
  /** Remaining orbs, or null when uncounted. */
  orbs: number | null;
  /** The uid of the captured creature, if any. */
  caught: string | null;
  /** The living party members other than the active one. */
  bench: BattleCreatureInfo[];
}

/** The foe's chosen action this turn (`ai.js` `chooseFoeAction`). */
export type FoeAction =
  | { kind: 'move'; move: string | null }
  | { kind: 'switch'; creature: Creature };

/** `new CreatureBattle(opts)` (CreatureBattle.js). */
export interface BattleOptions {
  /** The player's active creature. */
  player: Creature;
  /** The foe's active creature. */
  foe: Creature;
  /** The player's party (switching and captures), or null. */
  roster?: CreatureRoster | null;
  /** A wild battle: capture and flee are unlocked. */
  capture?: boolean;
  /** The seeded random source. */
  rng?: RngSource;
  /** Remaining orbs, or null when uncounted. */
  orbCount?: (() => number) | null;
  /** Spends one orb when a throw happens. */
  onOrb?: (() => void) | null;
}

/** `battle.hooks`, the test-facing surface of one battle (`makeHooks`). */
export interface BattleHooks {
  /** The battle snapshot. */
  state(): BattleState;
  /** The current phase. */
  phase(): BattlePhase;
  /** `intro → action`; the state. */
  begin(): BattleState;
  /** Run the current phase's work and return the state after. */
  advance(): BattleState;
  /** Choose a menu action; false when not now / unavailable. */
  chooseAction(action: BattleAction): boolean;
  /** Choose a move; false when not now / not known. */
  chooseMove(move: string): boolean;
  /** Switch the active creature; false when not now / unknown uid. */
  chooseSwitch(uid: string): boolean;
  /** Step one menu back (`moveSelect`/`switch` → `action`); false when not cancellable / a forced switch. */
  cancel(): boolean;
  /** Force the foe's move (null clears); false when the foe does not know it. */
  forceFoeMove(move: string | null): boolean;
  /** The player's active creature. */
  player(): BattleCreatureInfo;
  /** The foe's active creature. */
  foe(): BattleCreatureInfo;
  /** The battle log. */
  events(): BattleEvent[];
  /** The battle itself (scripts that need more than the hooks). */
  system: CreatureBattle;
}

// The actions CreatureInput adds to Input when a battle or the roster opens (plan §6). Every one is
// additive and absent unless the feature registers its bindings, so no `DEFAULT_BINDINGS` change.
// The keys mirror CREATURE_BINDINGS (./CreatureInput.js) but are spelled out here: this file is also
// reached by the Node tools program (tools/tsconfig.json) through the creature strings, and that
// program must not pull the browser Input/Engine graph in.
// -------------------------------------------------------------------------------------------------
// The battle UI (CreatureBattleHUD.js, phase 4b; src/game/creatures/creatureUI.js)
// -------------------------------------------------------------------------------------------------

/** One action-menu row (`CreatureBattleHUD.setMenu`). */
export interface BattleMenuItem {
  /** The shown text (translated by the caller). */
  label: string;
  /** An optional right-aligned note (a move's power). */
  sub?: string;
  /** An optional `CreatureType` id shown as the move's type icon (grass / fire / water). */
  type?: string;
  /** An optional effectiveness against the foe: 1 super effective, -1 not very (a marker is drawn). */
  eff?: number;
  /** A refused row (greyed, not selectable). */
  disabled?: boolean;
}

/** The action menu (`CreatureBattleHUD.setMenu`). */
export interface BattleMenu {
  /** The rows, in reading order. */
  items: BattleMenuItem[];
  /** The selected index. */
  cursor?: number;
  /** 2 for the 2 × 2 grid (main menu, moves), 1 for the vertical list (the party). */
  cols?: 1 | 2;
  /** Whether a cancel returns to the previous menu (a Back keycap and a backdrop tap); default true. */
  back?: boolean;
}

/**
 * The battle overlay as the game drives it (`CreatureBattleHUD`, src/engine/ui/CreatureBattleHUD.js).
 * It is a view: the caller pushes in the state and the translated strings and receives the chosen
 * index. Names default to the state's (English) when `display` omits them.
 */
export interface CreatureBattleHUDLike {
  /** The overlay element (a root child at z 7). */
  element: HTMLElement;
  /** Whether it is shown. */
  readonly visible: boolean;
  /** A menu row was chosen (a click; the caller also reads its own input). */
  onSelect: ((index: number) => void) | null;
  /** Cancel was asked (a Back keycap, or a tap on the backdrop while a cancellable menu is open). */
  onCancel: (() => void) | null;
  /** Show a battle snapshot (`display` carries the translated names). */
  setState(state: BattleState | null, display?: { player?: string; foe?: string }): void;
  /** The two already-cropped sprite canvases (copied; null hides that side). */
  setSprites(sprites?: { player?: HTMLCanvasElement | null; foe?: HTMLCanvasElement | null }): void;
  /** The log's lines, newest at the bottom (translated; at most two rows show). */
  setLog(lines?: string[]): void;
  /** The action menu, or null to close it. */
  setMenu(menu?: BattleMenu | null): void;
  /** Move the menu cursor. */
  setCursor(index: number): void;
  /** Show / hide the overlay. */
  show(): void;
  hide(): void;
  dispose(): void;
}

/** One roster row (`CreatureRosterUI.open`), a subset of the game's `CreatureRecord`. */
export interface CreatureRosterRowView {
  /** The instance id. */
  uid: string;
  /** The display name (nickname else the translated species). */
  name: string;
  /** The `CREATURE_DEFS` id (for the sprite). */
  species?: string;
  /** Its level. */
  level: number;
  /** Current HP. */
  hp: number;
  /** Max HP. */
  maxHp: number;
  /** HP as a 0..1 fraction (computed from hp / maxHp when absent). */
  hpRatio?: number;
  /** Out of HP. */
  fainted?: boolean;
  /** An already-cropped square canvas (the species' overworld pose, 20 × 20). */
  sprite?: HTMLCanvasElement | null;
}

/** `CreatureRosterUI.open(opts)`: the rows and the two lists' caps. */
export interface CreatureRosterOpts {
  /** The battle party (slot order). */
  active: CreatureRosterRowView[];
  /** The storage box. */
  box: CreatureRosterRowView[];
  /** The party cap (default 6). */
  maxActive?: number;
  /** The box cap (default 240). */
  maxBox?: number;
  /** Whether a row may be released (default: always). */
  canRelease?: (uid: string) => boolean;
  /** The key that closes it (a hint only; Esc always works). */
  closeKey?: string;
}

/**
 * The roster panel as the game drives it (`CreatureRosterUI`, src/engine/ui/CreatureRosterUI.js).
 * A view: the caller pushes the rows in and receives the swap / release the player chose (a release
 * is already confirmed). `UI.update` calls `update` while `isOpen`.
 */
export interface CreatureRosterUILike {
  /** The overlay element (a root child at z 7). */
  element: HTMLElement;
  /** Whether it is shown. */
  readonly visible: boolean;
  /** Whether it is open (`UI.update` reads it). */
  readonly isOpen: boolean;
  /** The panel closed (any way). */
  onClose: (() => void) | null;
  /** A boxed creature swapped into a party slot. */
  onSwap: ((uid: string, slot: number) => void) | null;
  /** A creature released (already confirmed by the panel). */
  onRelease: ((uid: string) => void) | null;
  /** 'menuOpen' | 'menuClose' | 'menuMove' | 'menuSelect'. */
  onSound: ((name: string) => void) | null;
  /** Show (or refill) the panel with the given rows. */
  open(opts: CreatureRosterOpts): void;
  /** Close the panel. */
  close(): void;
  /** Read the panel's actions (once per frame while open); true when it closed itself. */
  update(dt: number, input?: { actionPressed(name: string): boolean; consumeAction?(name: string): boolean }): boolean;
  /** Tear down its DOM. */
  dispose(): void;
}

/** `UI.useCreatureUI(classes)` / `UI.enableCreature(classes)`: the creature UI classes (src/game/creatures/creatureUI.js). */
export interface CreatureUIClasses {
  CreatureBattleHUD: new (parent: HTMLElement, o?: { onSelect?: ((index: number) => void) | null; onCancel?: (() => void) | null }) => CreatureBattleHUDLike;
  CreatureRosterUI?: new (parent: HTMLElement) => CreatureRosterUILike;
}

// The wild-creature overworld system (CreatureSystem.js, FASE 5; plan §5, §7).
// -------------------------------------------------------------------------------------------------

/** `CreatureSystem.state()`: the running system's snapshot (`Game.state().creatures`). */
export interface CreatureSystemState {
  /** Creature levels only (mirror of `Game`'s `creaturesEnabled`). */
  enabled: boolean;
  /** The roster as saved (`CreatureRoster.toJSON`). */
  roster: CreatureRosterData;
  /** The orbs left to throw. */
  orbs: number;
  /** The wild actors' live feet (for tests: teleport onto one to make contact). */
  creatures: { id: string; species: string; level: number; x: number; z: number }[];
  /** Each zone's step counter (`steps` walked inside, `need` until a battle). */
  zones: { id: string; steps: number; need: number }[];
  /** The battle in progress, null in the overworld. */
  battle: { phase: string; outcome: BattleOutcome | null } | null;
}

/** The web-test hooks of the creature system (`window.__game.creatures`, plan §5). */
export interface CreatureHooks {
  /** The snapshot above. */
  state(): CreatureSystemState;
  /** The live roster (a party and a box; saved by the system). */
  roster: CreatureRoster;
  /** The orbs left to throw. */
  orbs(): number;
  /** Set the orbs (a play-test may script a capture; floor 0). */
  setOrbs(n: number): void;
  /** Start a wild battle against `species` at `level`, seeded by `seed` (no party: a toast). */
  startBattle(species: string, level?: number, seed?: string): void;
  /** Seed the play-test roster: an Emberling level 5 and three orbs. */
  demo(): void;
  /** The running battle's test hooks (`begin`/`advance`/`chooseAction`/`chooseMove`/`chooseSwitch`),
   *  null in the overworld (a script drives the battle through it). */
  battle(): BattleHooks | null;
  openRoster?(): boolean;
  closeRoster?(): boolean;
  toggleRoster?(open?: boolean): boolean;
  rosterOpen?(): boolean;
}

declare module '../../engine/core/types.js' {
  interface ExtraActions {
    /** Battle menu: cursor up. */
    creatureBattleUp?: true;
    /** Battle menu: cursor down. */
    creatureBattleDown?: true;
    /** Battle menu: cursor left. */
    creatureBattleLeft?: true;
    /** Battle menu: cursor right. */
    creatureBattleRight?: true;
    /** Battle menu: confirm. */
    creatureBattleConfirm?: true;
    /** Battle menu: cancel. */
    creatureBattleCancel?: true;
    /** Open / close the roster (bound by CreatureInput when creatures are enabled). */
    creatureRoster?: true;
  }
}
