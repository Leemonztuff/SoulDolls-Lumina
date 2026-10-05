/**
 * Catalog of every object type a Lumina level can contain: defaults, placement style, editor
 * metadata (category, palette glyph/colour) and a field schema that drives the editor inspector.
 *
 * Object shapes (all have `id` and `type`):
 *   point  { id, type, x, z, rotation?, opts?, ...fields }                   (tile centre = i + 0.5)
 *   line   { id, type, x0, z0, x1, z1, opts?, ...fields }                    (fence, bridge)
 *   rect   { id, type, minX, maxX, minZ, maxZ, ...fields }                   (region)
 * `opts` is passed straight to the matching PropFactory method (see src/engine/world/Props.js).
 *
 * Field schema entries: { key, label, type, min?, max?, step?, nullable?, options?, help? } where
 * `key` is a dotted path into the object ('opts.width'), `nullable` lets a number be left blank
 * (stored as null: bridge.deckY, region.minY) and `type` is one of:
 *   'number' | 'int' | 'angle' (radians stored, degrees shown) | 'bool' | 'select' | 'text' |
 *   'textarea' | 'lines' (string[], one entry per paragraph) | 'dialogue' (see NPC) | 'color'
 */
import { RNG, hashString } from '../utils/math.js';
import { isOwnKey, showValue, toText, toNumber } from '../utils/own.js';

/**
 * @import { Level, LevelEnvironment, LevelObject, LevelObjectOf, ObjectType, ObjectOverrides,
 *   DialoguePage, Rect, XZ, ObjectTypeDef, FieldDef } from './types.js'
 */

export const WALL_TEXTURES = ['timber_frame', 'plaster', 'brick', 'stone_brick', 'log_wall', 'wood_planks', 'wood_planks_dark'];
export const ROOF_TEXTURES = ['roof_red', 'roof_blue', 'roof_thatch', 'roof_slate'];
export const TREE_KINDS = ['oak', 'autumn', 'pine', 'birch'];
export const CLOTH_TEXTURES = ['cloth_stripe', 'cloth_red'];
export const FACINGS = ['down', 'left', 'right', 'up'];
export const CARDINALS = ['N', 'S', 'E', 'W'];
export const CHARACTER_PRESET_NAMES = [
  'traveler', 'swordsman', 'merchant', 'cleric', 'scholar', 'dancer', 'hunter',
  'villager', 'farmer', 'elder', 'child', 'guard', 'innkeeper', 'bard',
];
export const CRITTER_KINDS = ['chicken', 'cat', 'bird', 'dog'];
export const EMITTER_PRESETS = ['fireflies', 'leaves', 'petals', 'dust', 'embers', 'smoke', 'mist', 'sparkle', 'snow', 'rain'];

/** Built-in NPC behaviours a level can attach to an NPC (implemented by the game). */
export const NPC_ACTIONS = [
  { value: 'none', label: 'Just talk' },
  { value: 'rest', label: 'Innkeeper: offer rest until morning' },
  { value: 'shop', label: 'Merchant: sell an item' },
  { value: 'music', label: 'Bard: play music (offers quiet when playing)' },
];

/** How an NPC moves (implemented by the game's Npc): wander around home, stand at a post and look around, perform (face the audience), chase the chickens. */
export const NPC_BEHAVIOURS = ['wander', 'post', 'perform', 'chase'];

/**
 * Hand-written conversations (implemented in src/demo/dialogue.js). '' = use `dialogue`.
 * 'drillmaster' is the combat tutorial guard and 'shopkeeper' the combat shop's menu (draughts and
 * one-time wares for gold) — both combat levels only (COMBAT.md §6.12); on a peaceful level they
 * play the NPC's own dialogue and action.
 */
export const NPC_SCRIPTS = ['', 'elder', 'innkeeper', 'merchant', 'guard', 'farmer', 'child', 'bard', 'scholar', 'drillmaster', 'shopkeeper'];

/** Editor palette categories, in display order ('Combat': the combat-only types, COMBAT.md §14). */
export const OBJECT_CATEGORIES = ['Buildings', 'Nature', 'Lights', 'Props', 'Structures', 'Water', 'Characters', 'Markers', 'Combat'];

/** Hostile kinds an `enemy` group can spawn (COMBAT.md §7.1); the game's stats are in src/demo/combat/defs.js. */
export const ENEMY_KINDS = ['slime', 'goblin', 'archer', 'shaman', 'bat', 'boar', 'dummy', 'golem'];

/** Node-safe traits of every enemy kind, for the editor and the level generators. */
export const ENEMY_INFO = Object.freeze({
  slime:  { label: 'Moss Slime',     flier: false, boss: false, passive: false, humanoid: false },
  goblin: { label: 'Bramble Goblin', flier: false, boss: false, passive: false, humanoid: true },
  archer: { label: 'Thorn Archer',   flier: false, boss: false, passive: false, humanoid: true },
  shaman: { label: 'Hex Shaman',     flier: false, boss: false, passive: false, humanoid: true },
  bat:    { label: 'Cinder Bat',     flier: true,  boss: false, passive: false, humanoid: false },
  boar:   { label: 'Ironhide Boar',  flier: false, boss: false, passive: false, humanoid: false },
  dummy:  { label: 'Straw Dummy',    flier: false, boss: false, passive: true,  humanoid: false },
  golem:  { label: 'Cinderheart (boss)', flier: false, boss: true, passive: false, humanoid: false },
});

/** What a `chest` can hold besides gold and draughts (COMBAT.md §6.1: +20 max HP, +10 max MP, +3 attack). */
export const CHEST_UPGRADES = ['none', 'maxHp', 'maxMp', 'attack'];
/** Inspector labels of the chest upgrades (the stored values stay `CHEST_UPGRADES`; amounts from the game's rules). */
const CHEST_UPGRADE_LABELS = { none: 'None', maxHp: 'Max HP +20', maxMp: 'Max MP +10', attack: 'Attack +3' };

/** @type {FieldDef} */
const ROT = { key: 'rotation', label: 'Rotation', type: 'angle', step: 15 };
/** @type {FieldDef} */
const SEED = { key: 'opts.seed', label: 'Variation seed', type: 'int', min: 0, max: 9999 };
/** @type {FieldDef} */
const TEXT = { key: 'text', label: 'Text when examined', type: 'lines', help: 'One paragraph per dialog page. {word} is shown in gold.' };

/**
 * Checked with `satisfies`, not typed as a Record: each entry keeps its literal placement and the
 * shape of its defaults, from which ./types.d.ts derives the level object types (`LevelObject`,
 * `ObjectType`). A read with a plain string key (`OBJECT_TYPES[name]`) is untyped; with an
 * `ObjectType` it is the union of the entries, so declare the result as an `ObjectTypeDef` to
 * read the optional members (rotatable, snap, help, combat).
 * @satisfies {Record<string, ObjectTypeDef>}
 */
export const OBJECT_TYPES = {
  // ------------------------------------------------------------------ Buildings
  house: {
    label: 'House', category: 'Buildings', placement: 'point', kind: 'prop', glyph: '⌂', color: '#d9824b', radius: 2.2, rotatable: true, snap: 0.5,
    help: 'Windows glow at night, the chimney smokes. The door is interactive once “Text when knocking” is filled in.',
    defaults: { rotation: 0, name: '', light: false, text: [], opts: { width: 4, depth: 3, stories: 1, wall: 'timber_frame', upperWall: '', roof: 'roof_red', chimney: true, shutters: true, sign: false, doorHood: false, woodpile: false, gableFront: false, seed: 1 } },
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      ROT,
      { key: 'opts.width', label: 'Width', type: 'number', min: 3, max: 8, step: 0.5 },
      { key: 'opts.depth', label: 'Depth', type: 'number', min: 2.5, max: 6, step: 0.5 },
      { key: 'opts.stories', label: 'Stories', type: 'int', min: 1, max: 2 },
      { key: 'opts.wall', label: 'Walls', type: 'select', options: WALL_TEXTURES },
      { key: 'opts.upperWall', label: 'Upper walls', type: 'select', options: ['', ...WALL_TEXTURES] },
      { key: 'opts.roof', label: 'Roof', type: 'select', options: ROOF_TEXTURES },
      { key: 'opts.chimney', label: 'Chimney', type: 'bool' },
      { key: 'opts.shutters', label: 'Shutters', type: 'bool' },
      { key: 'opts.sign', label: 'Hanging sign', type: 'bool' },
      { key: 'opts.doorHood', label: 'Door hood', type: 'bool' },
      { key: 'opts.woodpile', label: 'Woodpile', type: 'bool' },
      { key: 'opts.gableFront', label: 'Gable faces front', type: 'bool' },
      { key: 'light', label: 'Door lantern casts light', type: 'bool', help: 'A real light while near the camera (the game shares 12 point lights among all lights).' },
      { ...TEXT, label: 'Text when knocking', help: 'One paragraph per dialog page. Blank = the door is not interactive. {word} is shown in gold.' },
      SEED,
    ],
  },
  windmill: {
    label: 'Windmill', category: 'Buildings', placement: 'point', kind: 'prop', glyph: '✢', color: '#e0c68e', radius: 1.8, rotatable: true,
    defaults: { rotation: 0, opts: { height: 6, roof: 'roof_thatch' } },
    fields: [ROT, { key: 'opts.height', label: 'Height', type: 'number', min: 4, max: 9, step: 0.2 }, { key: 'opts.roof', label: 'Roof', type: 'select', options: ROOF_TEXTURES }, SEED],
  },
  well: {
    label: 'Well', category: 'Buildings', placement: 'point', kind: 'prop', glyph: '◎', color: '#9aa0a8', radius: 1.0, rotatable: true,
    defaults: { rotation: 0, text: ['The well is deep and cold. You make a small wish.'], opts: { roof: 'wood_planks' } },
    fields: [ROT, { key: 'opts.roof', label: 'Roof', type: 'select', options: ['wood_planks', ...ROOF_TEXTURES] }, TEXT],
  },
  marketStall: {
    label: 'Market stall', category: 'Buildings', placement: 'point', kind: 'prop', glyph: '▤', color: '#d24b4b', radius: 1.6, rotatable: true, snap: 0.5,
    defaults: { rotation: 0, opts: { cloth: 'cloth_stripe', width: 3 } },
    fields: [ROT, { key: 'opts.cloth', label: 'Awning', type: 'select', options: CLOTH_TEXTURES }, { key: 'opts.width', label: 'Width', type: 'number', min: 2, max: 4, step: 0.25 }, SEED],
  },

  // ------------------------------------------------------------------ Nature
  tree: {
    label: 'Tree', category: 'Nature', placement: 'point', kind: 'prop', glyph: '♣', color: '#3f8f45', radius: 0.6,
    defaults: { collider: true, opts: { kind: 'oak', height: 4.5, seed: 1 } },
    fields: [
      { key: 'opts.kind', label: 'Kind', type: 'select', options: TREE_KINDS },
      { key: 'opts.height', label: 'Height', type: 'number', min: 2.5, max: 8, step: 0.1 },
      { key: 'collider', label: 'Blocks the player', type: 'bool' },
      SEED,
    ],
  },
  rock: {
    label: 'Rock', category: 'Nature', placement: 'point', kind: 'prop', glyph: '●', color: '#8a8a92', radius: 0.5,
    defaults: { opts: { size: 1, seed: 1 } },
    fields: [{ key: 'opts.size', label: 'Size', type: 'number', min: 0.3, max: 2.5, step: 0.05 }, SEED],
  },
  haystack: {
    label: 'Haystack', category: 'Nature', placement: 'point', kind: 'prop', glyph: '▲', color: '#d8b453', radius: 0.9,
    defaults: { opts: { size: 1 } },
    fields: [{ key: 'opts.size', label: 'Size', type: 'number', min: 0.5, max: 1.6, step: 0.05 }, SEED],
  },

  // ------------------------------------------------------------------ Lights
  lamppost: {
    label: 'Lamppost', category: 'Lights', placement: 'point', kind: 'prop', glyph: '☀', color: '#ffc46b', radius: 0.3, rotatable: true,
    help: 'A street lantern; a real light while near the camera (the game shares 12 point lights).',
    defaults: { rotation: 0, opts: { style: 'arm' } },
    fields: [ROT, { key: 'opts.style', label: 'Style', type: 'select', options: ['arm', 'top'] }],
  },
  wallTorch: {
    label: 'Wall torch', category: 'Lights', placement: 'point', kind: 'prop', glyph: '♨', color: '#ff8a3d', radius: 0.25, rotatable: true,
    help: 'Mount against a wall: rotation points the flame away from the wall. Uses one point light.',
    defaults: { rotation: 0, dy: 2.1, opts: { embers: false } },
    fields: [ROT, { key: 'dy', label: 'Height above ground', type: 'number', min: 0.5, max: 4, step: 0.05 }, { key: 'opts.embers', label: 'Embers', type: 'bool' }],
  },
  campfire: {
    label: 'Campfire', category: 'Lights', placement: 'point', kind: 'prop', glyph: '✹', color: '#ff6a2a', radius: 0.8, rotatable: true,
    help: 'Fire, embers and smoke; burns day and night. Uses one point light.',
    defaults: { rotation: 0.8, opts: { seat: false } },
    fields: [ROT, { key: 'opts.seat', label: 'Log seats', type: 'bool' }],
  },
  light: {
    label: 'Point light', category: 'Lights', placement: 'point', kind: 'prop', glyph: '✦', color: '#ffe08a', radius: 0.25,
    help: 'An invisible light (e.g. a glow in a window); a real light while near the camera (the game shares 12 point lights).',
    defaults: { dy: 1.5, color: '#ffb46b', intensity: 8, distance: 8, flicker: 0.2, nightOnly: true },
    fields: [
      { key: 'dy', label: 'Height above ground', type: 'number', min: 0, max: 6, step: 0.1 },
      { key: 'color', label: 'Colour', type: 'color' },
      { key: 'intensity', label: 'Intensity', type: 'number', min: 0, max: 40, step: 0.5 },
      { key: 'distance', label: 'Range', type: 'number', min: 2, max: 20, step: 0.5 },
      { key: 'flicker', label: 'Flicker', type: 'number', min: 0, max: 1, step: 0.05 },
      { key: 'nightOnly', label: 'Only at night', type: 'bool' },
    ],
  },

  // ------------------------------------------------------------------ Props
  bench: {
    label: 'Bench', category: 'Props', placement: 'point', kind: 'prop', glyph: '▭', color: '#a0703f', radius: 0.9, rotatable: true,
    defaults: { rotation: 0, opts: { length: 1.8, back: true } },
    fields: [ROT, { key: 'opts.length', label: 'Length', type: 'number', min: 1, max: 3, step: 0.1 }, { key: 'opts.back', label: 'Backrest', type: 'bool' }],
  },
  barrel: {
    label: 'Barrel', category: 'Props', placement: 'point', kind: 'prop', glyph: '◍', color: '#8e5a2e', radius: 0.45, rotatable: true,
    defaults: { rotation: 0, opts: { height: 1.0, lying: false } },
    fields: [ROT, { key: 'opts.height', label: 'Height', type: 'number', min: 0.6, max: 1.4, step: 0.05 }, { key: 'opts.lying', label: 'Lying down', type: 'bool' }],
  },
  crate: {
    label: 'Crate', category: 'Props', placement: 'point', kind: 'prop', glyph: '■', color: '#b07b44', radius: 0.5, rotatable: true,
    defaults: { rotation: 0, opts: { size: 0.9 } },
    fields: [ROT, { key: 'opts.size', label: 'Size', type: 'number', min: 0.4, max: 1.4, step: 0.05 }],
  },
  crateStack: {
    label: 'Crate stack', category: 'Props', placement: 'point', kind: 'prop', glyph: '▦', color: '#b07b44', radius: 0.8, rotatable: true,
    defaults: { rotation: 0, opts: { count: 3, size: 0.85 } },
    fields: [ROT, { key: 'opts.count', label: 'Crates', type: 'int', min: 1, max: 4 }, { key: 'opts.size', label: 'Crate size', type: 'number', min: 0.5, max: 1.2, step: 0.05 }, SEED],
  },
  flowerbox: {
    label: 'Flower box', category: 'Props', placement: 'point', kind: 'prop', glyph: '✿', color: '#e27aa8', radius: 0.6, rotatable: true,
    defaults: { rotation: 0, opts: { length: 1.2 } },
    fields: [ROT, { key: 'opts.length', label: 'Length', type: 'number', min: 0.6, max: 2.4, step: 0.1 }],
  },
  signpost: {
    label: 'Signpost', category: 'Props', placement: 'point', kind: 'prop', glyph: '⚑', color: '#c9a45c', radius: 0.3, rotatable: true,
    defaults: { rotation: 0, speaker: 'Signpost', text: ['↑ Somewhere nice'], opts: { boards: 2 } },
    fields: [ROT, { key: 'opts.boards', label: 'Boards', type: 'int', min: 1, max: 3 }, { key: 'speaker', label: 'Speaker', type: 'text' }, { ...TEXT, label: 'Sign text' }],
  },

  // ------------------------------------------------------------------ Structures (two-point)
  fence: {
    label: 'Fence', category: 'Structures', placement: 'line', kind: 'prop', glyph: '╪', color: '#8e6038', radius: 0.2,
    help: 'Click the start point, then the end point.',
    defaults: { opts: {} },
    fields: [],
  },
  bridge: {
    label: 'Bridge', category: 'Structures', placement: 'line', kind: 'prop', glyph: '═', color: '#a0703f', radius: 1,
    help: 'Click one bank, then the other. The deck is walkable over water.',
    defaults: { deckY: null, opts: { width: 2, arch: 0.25 } },
    fields: [
      { key: 'opts.width', label: 'Width', type: 'number', min: 1.2, max: 3.5, step: 0.1 },
      { key: 'opts.arch', label: 'Arch', type: 'number', min: 0, max: 0.6, step: 0.02 },
      { key: 'deckY', label: 'Deck height (blank = auto)', type: 'number', min: -2, max: 20, step: 0.05, nullable: true },
    ],
  },

  // ------------------------------------------------------------------ Water
  waterfall: {
    label: 'Waterfall', category: 'Water', placement: 'point', kind: 'prop', glyph: '⇣', color: '#8fd3ff', radius: 1,
    help: 'Place on the edge between a higher and a lower water tile; `facing` is the direction the water falls toward.',
    defaults: { width: 2, facing: 'S' },
    fields: [
      { key: 'width', label: 'Width', type: 'number', min: 1, max: 6, step: 0.5 },
      { key: 'facing', label: 'Falls toward', type: 'select', options: CARDINALS },
    ],
  },

  // ------------------------------------------------------------------ Characters
  npc: {
    label: 'Villager (NPC)', category: 'Characters', placement: 'point', kind: 'actor', glyph: '☺', color: '#f2e2b5', radius: 0.35,
    help: 'A character who wanders near here and talks when the player presses Space.',
    defaults: { name: 'Villager', preset: 'villager', facing: 'down', wander: 1.2, speed: 1, portraitColor: '#c9a45c', action: 'none', item: '', behaviour: 'wander', script: '', dialogue: ['Hello, traveler!'] },
    fields: [
      // what a designer edits most comes first (the inspector shows fields in this order)
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'dialogue', label: 'Dialogue', type: 'dialogue', help: 'One page per paragraph. A page like "Question? [Yes | No]" offers choices (one choice: "[Okay |]"); \\[ \\] \\| are literal. {word} is gold.' },
      { key: 'action', label: 'Special action', type: 'select', options: NPC_ACTIONS, help: 'Rest / shop: picking any answer but the first of the closing question runs it (a closing page of your own with one choice, "[Okay |]": that answer runs it). Music: starts the music (a closing question of your own: any answer but the first plays it — with one choice, that one; when the music is already playing, the built-in question offers to stop it).' },
      { key: 'item', label: 'Item sold (shop action)', type: 'text', help: 'Blank = "Crisp Apple".' },
      { key: 'preset', label: 'Look', type: 'select', options: CHARACTER_PRESET_NAMES },
      { key: 'facing', label: 'Facing', type: 'select', options: FACINGS },
      { key: 'behaviour', label: 'Behaviour', type: 'select', options: NPC_BEHAVIOURS },
      { key: 'wander', label: 'Wander radius', type: 'number', min: 0, max: 5, step: 0.1 },
      { key: 'speed', label: 'Walk speed', type: 'number', min: 0.3, max: 2, step: 0.05 },
      { key: 'portraitColor', label: 'Name plate colour', type: 'color' },
      { key: 'script', label: 'Built-in script (overrides dialogue)', type: 'select', options: NPC_SCRIPTS },
    ],
  },
  critters: {
    label: 'Critters', category: 'Characters', placement: 'point', kind: 'actor', glyph: '🐾', color: '#f0a060', radius: 0.4,
    defaults: { kind: 'chicken', count: 4, radius: 2.5 },
    fields: [
      { key: 'kind', label: 'Kind', type: 'select', options: CRITTER_KINDS },
      { key: 'count', label: 'Count', type: 'int', min: 1, max: 8 },
      { key: 'radius', label: 'Roam radius', type: 'number', min: 0.5, max: 8, step: 0.1 },
    ],
  },

  // ------------------------------------------------------------------ Markers
  emitter: {
    label: 'Particle area', category: 'Markers', placement: 'point', kind: 'marker', glyph: '∴', color: '#b8f07a', radius: 0.5,
    help: 'Fireflies (night only), falling leaves, petals, dust… inside a box centred here.',
    defaults: { preset: 'fireflies', size: [8, 2.4, 8], count: 30, dy: 1.2 },
    fields: [
      { key: 'preset', label: 'Effect', type: 'select', options: EMITTER_PRESETS },
      { key: 'size.0', label: 'Size X', type: 'number', min: 0.5, max: 40, step: 0.5 },
      { key: 'size.1', label: 'Size Y', type: 'number', min: 0.5, max: 12, step: 0.1 },
      { key: 'size.2', label: 'Size Z', type: 'number', min: 0.5, max: 40, step: 0.5 },
      { key: 'dy', label: 'Height above ground', type: 'number', min: 0, max: 10, step: 0.1 },
      { key: 'count', label: 'Particles', type: 'int', min: 1, max: 200 },
    ],
  },
  region: {
    label: 'Region name', category: 'Markers', placement: 'rect', kind: 'marker', glyph: '▢', color: '#c9a45c', radius: 0,
    help: 'Drag a rectangle. The HUD shows its name while the player is inside (first match wins).',
    defaults: { name: 'New area', sub: '', minY: null, banner: '' },
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'sub', label: 'Subtitle', type: 'text' },
      { key: 'minY', label: 'Only above height (blank = any)', type: 'number', min: -5, max: 20, step: 0.1, nullable: true },
      { key: 'banner', label: 'Arrival banner subtitle (blank = none)', type: 'text', help: 'Shown with the region name the first time the player enters.' },
    ],
  },

  // ------------------------------------------------------------------ Combat (COMBAT.md §14)
  // Optional `enemy` fields, never in `defaults` and all relative to x / z: spotOffsets [[dx, dz], …],
  // area { minX, maxX, minZ, maxZ }, seed (int), arena { minX, maxX, minZ, maxZ } and
  // gate [dx0, dz0, dx1, dz1] (both required for a golem).
  enemy: {
    label: 'Enemy group', category: 'Combat', placement: 'point', kind: 'actor', combat: true,
    glyph: '⚔', color: '#e0674f', radius: 0.45,
    help: 'A group of hostile creatures that turns combat on for the level. The boss (Cinderheart) needs an arena and a gate.',
    defaults: { kind: 'slime', count: 3, radius: 3, level: 1, elite: false, name: '' },
    fields: [
      { key: 'kind', label: 'Kind', type: 'select', options: ENEMY_KINDS.map((k) => ({ value: k, label: ENEMY_INFO[k].label })) },
      { key: 'count', label: 'Count', type: 'int', min: 1, max: 8 },
      { key: 'radius', label: 'Home radius', type: 'number', min: 0.5, max: 12, step: 0.1 },
      { key: 'level', label: 'Level', type: 'int', min: 1, max: 10 },
      { key: 'elite', label: 'Elite', type: 'bool' },
      { key: 'name', label: 'Name plate (optional)', type: 'text' },
    ],
  },
  chest: {
    label: 'Treasure chest', category: 'Combat', placement: 'point', kind: 'prop', combat: true,
    glyph: '▣', color: '#e8cf8a', radius: 0.5, rotatable: true,
    help: 'Opened with Space on a combat level; its contents pop out as pickups. On a peaceful level it is only examined.',
    defaults: { rotation: 0, gold: 20, potions: 0, upgrade: 'none' },
    fields: [ROT,
      { key: 'gold', label: 'Gold', type: 'int', min: 0, max: 500 },
      { key: 'potions', label: 'Healing Draughts', type: 'int', min: 0, max: 5 },
      { key: 'upgrade', label: 'Upgrade', type: 'select', options: CHEST_UPGRADES.map((v) => ({ value: v, label: CHEST_UPGRADE_LABELS[v] ?? v })) }],
  },
  waystone: {
    label: 'Waystone (checkpoint)', category: 'Combat', placement: 'point', kind: 'prop', combat: true,
    glyph: '◆', color: '#7fe3ff', radius: 0.6,
    help: 'Walk close to attune (respawn point); Space to rest (heal, enemies return).',
    defaults: { name: 'Waystone' },
    fields: [{ key: 'name', label: 'Name', type: 'text' }],
  },
};

/** The player spawn is stored in `level.spawn`, not in `objects`; editors show it as a marker. */
export const SPAWN_MARKER = { label: 'Player start', glyph: '★', color: '#7fe3ff', radius: 0.35 };

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/**
 * Read a dotted-path field ('opts.width', 'size.0').
 * @param {object} obj a level object (or any plain object)
 * @param {string} key dotted path (`FieldDef.key`)
 * @returns {any} undefined when a step of the path is missing
 */
export function getField(obj, key) {
  let v = obj;
  for (const k of key.split('.')) {
    if (v == null) return undefined;
    v = v[k];
  }
  return v;
}

/**
 * Write a dotted-path field, creating intermediate objects (an array when the next step is an
 * index). Returns obj.
 * @template {object} T
 * @param {T} obj
 * @param {string} key dotted path (`FieldDef.key`)
 * @param {any} value
 * @returns {T}
 */
export function setField(obj, key, value) {
  const parts = key.split('.');
  let v = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (v[k] == null || typeof v[k] !== 'object') v[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    v = v[k];
  }
  v[parts[parts.length - 1]] = value;
  return obj;
}

/**
 * New object of `type` at (x, z) with catalog defaults (id left empty — use
 * LevelFormat.addObject / generateObjectId to assign one).
 * For 'line' types (x, z) is the start and the end defaults to 2 units east; for 'rect' types
 * a 4×4 rectangle centred on (x, z). `overrides` are deep-merged over the defaults (arrays
 * replace). Throws for an unknown type.
 * @template {ObjectType} T
 * @param {T} type
 * @param {number} x
 * @param {number} z
 * @param {ObjectOverrides<T>} [overrides]
 * @returns {LevelObjectOf<T>}
 */
export function createObject(type, x, z, overrides = {}) {
  if (!isOwnKey(OBJECT_TYPES, type)) throw new Error(`Unknown object type "${showValue(type)}"`);
  const def = OBJECT_TYPES[type];
  // canonical key order (id, type, position, then the defaults) — the order files are written in,
  // so a saved level re-serialises byte-identically after a reload (normalizeObject keeps it)
  const obj = { id: '', type };
  if (def.placement === 'point') Object.assign(obj, { x, z });
  else if (def.placement === 'line') Object.assign(obj, { x0: x, z0: z, x1: x + 2, z1: z });
  else Object.assign(obj, { minX: x - 2, maxX: x + 2, minZ: z - 2, maxZ: z + 2 });
  Object.assign(obj, clone(def.defaults));
  return deepMerge(obj, clone(overrides));
}

/**
 * Fill in missing defaults / coerce types of a (possibly hand-edited) object. The object's own
 * keys keep their order (defaults it lacks are appended), so load → save is byte-stable. Legacy
 * absolute NPC / critter fields (`talkPoint`, `bounds`, `spots`) become their relative forms
 * (`talkOffset`, `area`, `spotOffsets` — the game reads both), so they move with the object in
 * the editor. `o.type` must be a catalog type (normalizeLevel and the editor's paste drop the
 * others first); throws for any other type.
 * @param {{ type: ObjectType, [key: string]: any }} o raw object (not modified: the result is a copy)
 * @returns {LevelObject}
 */
export function normalizeObject(o) {
  if (!o || !isOwnKey(OBJECT_TYPES, o.type)) throw new Error(`Unknown object type "${showValue(o?.type)}"`);
  const def = OBJECT_TYPES[o.type];
  const out = fillDefaults(clone(o), clone(def.defaults) ?? {});
  // (toNumber / toText: a value Number() / String() cannot convert — a JSON object with an own
  // `toString` key — is not a number / gives '', i.e. normalizeLevel renames the object)
  const num = (k, d = 0) => { out[k] = Number.isFinite(toNumber(out[k])) ? toNumber(out[k]) : d; };
  if (def.placement === 'point') { num('x'); num('z'); }
  if (def.placement === 'line') { num('x0'); num('z0'); num('x1', out.x0 + 2); num('z1', out.z0); }
  if (def.placement === 'rect') {
    num('minX'); num('maxX', out.minX + 4); num('minZ'); num('maxZ', out.minZ + 4);
    if (out.maxX < out.minX) [out.minX, out.maxX] = [out.maxX, out.minX];
    if (out.maxZ < out.minZ) [out.minZ, out.maxZ] = [out.maxZ, out.minZ];
  }
  if ('rotation' in def.defaults || out.rotation != null) num('rotation');
  out.id = toText(out.id ?? '', '');
  if (def.placement === 'point' && (o.type === 'npc' || o.type === 'critters')) relativizeLegacy(out);
  return out;
}

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const isPt = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const isRectLike = (r) => !!r && typeof r === 'object' && ['minX', 'maxX', 'minZ', 'maxZ'].every((k) => Number.isFinite(r[k]));

/** talkPoint / bounds / spots (absolute world coordinates) → talkOffset / area / spotOffsets. */
function relativizeLegacy(o) {
  const { x, z } = o;
  if (isPt(o.talkPoint)) {
    if (!isPt(o.talkOffset)) o.talkOffset = [r6(o.talkPoint[0] - x), r6(o.talkPoint[1] - z)];
    delete o.talkPoint;
  }
  if (isRectLike(o.bounds)) {
    if (!isRectLike(o.area)) o.area = { minX: r6(o.bounds.minX - x), maxX: r6(o.bounds.maxX - x), minZ: r6(o.bounds.minZ - z), maxZ: r6(o.bounds.maxZ - z) };
    delete o.bounds;
  }
  if (Array.isArray(o.spots)) {
    if (!Array.isArray(o.spotOffsets)) o.spotOffsets = o.spots.filter(isPt).map((p) => [r6(p[0] - x), r6(p[1] - z)]);
    delete o.spots;
  }
}

/** Add the keys of `defaults` that `target` lacks (recursing into plain objects); `target` wins. */
function fillDefaults(target, defaults) {
  for (const [k, v] of Object.entries(defaults)) {
    if (!(k in target) || target[k] === undefined) target[k] = v;
    else if (isPlain(v) && isPlain(target[k])) fillDefaults(target[k], v);
  }
  return target;
}

const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function deepMerge(target, src) {
  if (!src || typeof src !== 'object') return target;
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

/**
 * Representative world position of an object (point, line midpoint or rect centre).
 * @param {LevelObject} obj
 * @returns {{ x: number, z: number }}
 */
export function objectCenter(obj) {
  const def = OBJECT_TYPES[obj.type];
  if (def.placement === 'line') return { x: (obj.x0 + obj.x1) / 2, z: (obj.z0 + obj.z1) / 2 };
  if (def.placement === 'rect') return { x: (obj.minX + obj.maxX) / 2, z: (obj.minZ + obj.maxZ) / 2 };
  return { x: obj.x, z: obj.z };
}

/**
 * Approximate world-space XZ bounds of an object, for picking, selection outlines and 2D map
 * drawing. Houses / stalls use their width × depth rotated; lines are padded by half their width.
 * @param {LevelObject} obj
 * @returns {Rect}
 */
export function objectBounds(obj) {
  const def = OBJECT_TYPES[obj.type];
  if (def.placement === 'rect') return { minX: obj.minX, maxX: obj.maxX, minZ: obj.minZ, maxZ: obj.maxZ };
  if (def.placement === 'line') {
    const pad = obj.type === 'bridge' ? (obj.opts?.width ?? 2) / 2 : 0.2;
    return { minX: Math.min(obj.x0, obj.x1) - pad, maxX: Math.max(obj.x0, obj.x1) + pad, minZ: Math.min(obj.z0, obj.z1) - pad, maxZ: Math.max(obj.z0, obj.z1) + pad };
  }
  let hw = def.radius;
  let hd = def.radius;
  if (obj.type === 'house') { hw = (obj.opts?.width ?? 4) / 2 + 0.35; hd = (obj.opts?.depth ?? 3) / 2 + 0.35; }
  else if (obj.type === 'marketStall') { hw = (obj.opts?.width ?? 3) / 2 + 0.2; hd = 0.9; }
  else if (obj.type === 'bench') { hw = (obj.opts?.length ?? 1.8) / 2; hd = 0.35; }
  else if (obj.type === 'flowerbox') { hw = (obj.opts?.length ?? 1.2) / 2; hd = 0.25; }
  else if (obj.type === 'waterfall') { hw = (obj.width ?? 2) / 2; hd = 0.3; }
  else if (obj.type === 'emitter') { hw = (obj.size?.[0] ?? 8) / 2; hd = (obj.size?.[2] ?? 8) / 2; }
  else if (obj.type === 'critters') { hw = hd = obj.radius ?? 2.5; }
  else if (obj.type === 'enemy') { hw = hd = obj.radius ?? 3; }
  const rot = obj.type === 'waterfall' ? (obj.facing === 'E' || obj.facing === 'W' ? Math.PI / 2 : 0) : (obj.rotation ?? 0);
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  const ex = hw * c + hd * s;
  const ez = hw * s + hd * c;
  return { minX: obj.x - ex, maxX: obj.x + ex, minZ: obj.z - ez, maxZ: obj.z + ez };
}

/**
 * Does world point (x, z) hit the object (for picking)? Uses the bounds, or the radius for small
 * point objects, or the distance to the segment for line objects.
 * @param {LevelObject} obj
 * @param {number} x
 * @param {number} z
 * @param {number} [tolerance] extra reach in world units (0.25)
 * @returns {boolean}
 */
export function hitTestObject(obj, x, z, tolerance = 0.25) {
  const def = OBJECT_TYPES[obj.type];
  if (def.placement === 'line') {
    const dx = obj.x1 - obj.x0;
    const dz = obj.z1 - obj.z0;
    const L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - obj.x0) * dx + (z - obj.z0) * dz) / L2));
    const px = obj.x0 + dx * t - x;
    const pz = obj.z0 + dz * t - z;
    const half = obj.type === 'bridge' ? (obj.opts?.width ?? 2) / 2 : 0.3;
    return Math.hypot(px, pz) <= half + tolerance;
  }
  const b = objectBounds(obj);
  return x >= b.minX - tolerance && x <= b.maxX + tolerance && z >= b.minZ - tolerance && z <= b.maxZ + tolerance;
}

/**
 * Parse editor dialogue text into the level `dialogue` array, and back. Pages are separated by
 * blank lines; a page ending in a bracket group with a "|" is a choice page:
 * "Question? [Yes | No]" (one choice: "Question? [Yes |]"). `\[`, `\]`, `\|` and `\\` are literal
 * characters, so any page survives text → parse → text unchanged.
 * @param {string} text
 * @returns {DialoguePage[]}
 */
export function parseDialogueText(text) {
  return String(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(parseDialoguePage);
}

const escapeDialogue = (s) => String(s).replace(/[\\[\]|]/g, '\\$&');
const unescapeDialogue = (s) => String(s).replace(/\\([\\[\]|])/g, '$1');

/** One page of dialogue text → a string or a { text, choices } page. */
function parseDialoguePage(p) {
  // the last unescaped '[' whose group closes with the page's last character
  let open = -1;
  let close = -1;
  for (let k = 0; k < p.length; k++) {
    const c = p[k];
    if (c === '\\') { k++; continue; }
    if (c === '[') { open = k; close = -1; } else if (c === ']' && open >= 0) close = k;
  }
  if (open >= 0 && close === p.length - 1) {
    const inner = p.slice(open + 1, close);
    const parts = [];
    let cur = '';
    let bar = false;
    for (let k = 0; k < inner.length; k++) {
      const c = inner[k];
      if (c === '\\' && k + 1 < inner.length) { cur += c + inner[k + 1]; k++; continue; }
      if (c === '|') { parts.push(cur); cur = ''; bar = true; continue; }
      cur += c;
    }
    parts.push(cur);
    const choices = parts.map((c) => unescapeDialogue(c.trim())).filter(Boolean);
    // a group without '|' is plain text in brackets
    if (bar && choices.length) return { text: unescapeDialogue(p.slice(0, open).trim()), choices };
  }
  return unescapeDialogue(p);
}

/**
 * Editor text of one dialogue page. Blank choices are left out (the parser and the game drop them
 * too); a single choice keeps the trailing "|" ("Question? [Okay |]") so it parses back as a
 * choice page rather than as plain text in brackets.
 */
function dialoguePageText(d) {
  if (typeof d === 'string') return escapeDialogue(d);
  if (!d || typeof d !== 'object') return '';
  const choices = (Array.isArray(d.choices) ? d.choices : []).map(String).filter((c) => c.trim()).map((c) => escapeDialogue(c));
  const text = escapeDialogue(d.text ?? '');
  if (!choices.length) return text;
  return `${text} [${choices.length === 1 ? `${choices[0]} |` : choices.join(' | ')}]`;
}

/**
 * Editor text of an NPC's `dialogue` (a single page is taken as a one-page list).
 * @param {DialoguePage[]|DialoguePage} [dialogue]
 * @returns {string}
 */
export function dialogueToText(dialogue = []) {
  return (Array.isArray(dialogue) ? dialogue : [dialogue]).map(dialoguePageText).join('\n\n');
}

/**
 * Apply an edit of a page list's text to the original pages: pages whose text the edit did not
 * touch are kept exactly as they were (extra keys, blank lines, padding…); only the edited ones
 * are parsed again.
 * @param {any[]} pages the original pages
 * @param {string} text the edited text
 * @param {(page:any) => string} pageText page → its text (the list is `join('\n\n')`)
 * @param {(text:string) => any[]} parse text → pages
 */
export function mergePagesText(pages, text, pageText, parse) {
  const orig = Array.isArray(pages) ? pages : [];
  const blocks = orig.map(pageText);
  const old = blocks.join('\n\n');
  const next = String(text);
  if (next === old) return orig.map((p) => clone(p));
  // unchanged prefix / suffix of the text
  let p = 0;
  const maxP = Math.min(old.length, next.length);
  while (p < maxP && old[p] === next[p]) p++;
  let s = 0;
  const maxS = Math.min(old.length, next.length) - p;
  while (s < maxS && old[old.length - 1 - s] === next[next.length - 1 - s]) s++;
  const changedEnd = old.length - s; // [p, changedEnd) changed in the old text
  // page k spans [start_k, end_k) in the old text. A page is kept when its text is outside the
  // changed range and the new text still separates it from its neighbours by a blank line.
  const starts = [];
  let at = 0;
  for (const b of blocks) { starts.push(at); at += b.length + 2; }
  let keepHead = 0;
  let m0 = 0; // where the re-parsed middle starts in the new text
  while (keepHead < blocks.length) {
    const end = starts[keepHead] + blocks[keepHead].length;
    if (end > p || starts[keepHead] !== m0) break;
    if (end === next.length) { m0 = end; keepHead++; break; }
    const sep = /^\n\s*\n/.exec(next.slice(end, end + 64));
    if (!sep) break;
    m0 = end + sep[0].length;
    keepHead++;
  }
  let keepTail = 0;
  let m1 = next.length; // where the re-parsed middle ends in the new text
  while (keepTail < blocks.length - keepHead) {
    const k = blocks.length - 1 - keepTail;
    if (starts[k] < changedEnd) break;
    const pos = next.length - (old.length - starts[k]);
    if (pos < m0 || pos + blocks[k].length !== m1) break;
    if (pos === m0) { m1 = pos; keepTail++; break; }
    const sep = /\n\s*\n$/.exec(next.slice(Math.max(m0, pos - 64), pos));
    if (!sep) break;
    m1 = pos - sep[0].length;
    keepTail++;
  }
  const middle = m1 > m0 ? next.slice(m0, m1) : '';
  return [
    ...orig.slice(0, keepHead).map((x) => clone(x)),
    ...parse(middle),
    ...orig.slice(blocks.length - keepTail).map((x) => clone(x)),
  ];
}

/**
 * `dialogue` after an edit of its text (see mergePagesText).
 * @param {DialoguePage[]} dialogue
 * @param {string} text
 * @returns {DialoguePage[]}
 */
export function mergeDialogueText(dialogue, text) {
  return mergePagesText(dialogue, text, dialoguePageText, parseDialogueText);
}

/**
 * `text` / `lines` pages (string[], one paragraph per page) ↔ editor text.
 * @param {string[]|string} arr
 * @returns {string}
 */
export const linesToText = (arr) => (Array.isArray(arr) ? arr.map((x) => String(x ?? '')).join('\n\n') : String(arr ?? ''));
/**
 * Editor text → pages (split at blank lines, trimmed, blank pages dropped).
 * @param {string} t
 * @returns {string[]}
 */
export const textToLines = (t) => String(t).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
/**
 * `lines` after an edit of their text (see mergePagesText).
 * @param {string[]} lines
 * @param {string} text
 * @returns {string[]}
 */
export function mergeLinesText(lines, text) {
  return mergePagesText(Array.isArray(lines) ? lines : [], text, (x) => String(x ?? ''), textToLines);
}


// ---------------------------------------------------------------------------------------------
// Critter groups: where the game starts the animals (src/demo/Critters.js rules)
// ---------------------------------------------------------------------------------------------

const isFinitePoint = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const isFiniteRect = (r) => !!r && ['minX', 'maxX', 'minZ', 'maxZ'].every((k) => Number.isFinite(r[k])) && r.maxX >= r.minX && r.maxZ >= r.minZ;

/**
 * A critter group's explicit yard (world rect) — the relative `area` (offsets from x / z) or the
 * absolute legacy `bounds` — or null (the animals roam `radius` around the point).
 * @param {LevelObjectOf<'critters'>} g critters level object
 * @returns {Rect|null}
 */
export function critterYard(g) {
  const x = Number(g.x) || 0;
  const z = Number(g.z) || 0;
  if (isFiniteRect(g.area)) return { minX: x + g.area.minX, maxX: x + g.area.maxX, minZ: z + g.area.minZ, maxZ: z + g.area.maxZ };
  if (isFiniteRect(g.bounds)) return { minX: g.bounds.minX, maxX: g.bounds.maxX, minZ: g.bounds.minZ, maxZ: g.bounds.maxZ };
  return null;
}

/**
 * World start positions of a critter group's animals, exactly as the game chooses them: `count`
 * animals (0–16; the number of spots when blank), the first ones on the exact spots (relative
 * `spotOffsets`, or the absolute legacy `spots`), the others scattered over the yard
 * (`critterYard`, else the roam-radius square) with the group's seeded RNG (`seed`, default a
 * hash of the id) and up to 6 tries onto ground `isWalkable` accepts.
 * @param {LevelObjectOf<'critters'>} g critters level object
 * @param {((x:number, z:number) => boolean)|null} [isWalkable] (game: TileMap.isWalkable)
 * @returns {XZ[]}
 */
export function critterStartPoints(g, isWalkable = null) {
  const kind = CRITTER_KINDS.includes(g.kind) ? g.kind : 'chicken';
  const x = Number(g.x) || 0;
  const z = Number(g.z) || 0;
  const R = Math.max(0.3, Number(g.radius) || 2.5);
  let spots = null;
  if (Array.isArray(g.spotOffsets)) spots = g.spotOffsets.filter(isFinitePoint).map(([dx, dz]) => [x + dx, z + dz]);
  else if (Array.isArray(g.spots)) spots = g.spots.filter(isFinitePoint).map(([px, pz]) => [px, pz]);
  spots = spots?.slice(0, 16) ?? null;
  const count = Number.isFinite(Number(g.count)) && g.count !== null && g.count !== ''
    ? Math.max(0, Math.min(16, Math.round(Number(g.count))))
    : (spots?.length ?? 0);
  let bounds = { minX: x - R, maxX: x + R, minZ: z - R, maxZ: z + R };
  if (isFiniteRect(g.area)) bounds = { minX: x + g.area.minX, maxX: x + g.area.maxX, minZ: z + g.area.minZ, maxZ: z + g.area.maxZ };
  else if (isFiniteRect(g.bounds)) bounds = { ...g.bounds };
  const hash = hashString(String(g.id ?? kind));
  const rng = new RNG((Number.isFinite(g.seed) ? g.seed : hash) >>> 0);
  const out = [];
  for (let i = 0; i < count; i++) {
    let px = x;
    let pz = z;
    if (spots && i < spots.length) [px, pz] = spots[i];
    else if (count > 1) {
      for (let k = 0; k < 6; k++) {
        px = rng.range(bounds.minX + 0.3, bounds.maxX - 0.3);
        pz = rng.range(bounds.minZ + 0.2, bounds.maxZ - 0.2);
        if (!isWalkable || isWalkable(px, pz)) break;
      }
    }
    out.push([px, pz]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Enemy groups and combat levels (COMBAT.md §3, §14.1)
// ---------------------------------------------------------------------------------------------

/**
 * World start positions of an `enemy` group, exactly as the game, the editor previews and the
 * generators choose them — the `critterStartPoints` algorithm, copied: `count` enemies (0–8; a
 * golem group is a single boss: 0–1), the first ones on the exact relative `spotOffsets`, the
 * others scattered over the relative `area` (else the home-radius square) with the group's seeded
 * RNG (`seed`, default a hash of 'enemy:' + id) and up to 6 tries onto ground `isWalkable` accepts.
 * @param {LevelObjectOf<'enemy'>} g enemy level object
 * @param {((x:number, z:number) => boolean)|null} [isWalkable] (game: standable ground; fliers:
 *   callers pass a test that also accepts water)
 * @returns {XZ[]}
 */
export function enemyStartPoints(g, isWalkable = null) {
  const kind = ENEMY_KINDS.includes(g.kind) ? g.kind : 'slime';
  const x = Number(g.x) || 0;
  const z = Number(g.z) || 0;
  const R = Math.max(0.3, Number(g.radius) || 3);
  const max = kind === 'golem' ? 1 : 8;
  let spots = null;
  if (Array.isArray(g.spotOffsets)) spots = g.spotOffsets.filter(isFinitePoint).map(([dx, dz]) => [x + dx, z + dz]);
  spots = spots?.slice(0, max) ?? null;
  const count = Number.isFinite(Number(g.count)) && g.count !== null && g.count !== ''
    ? Math.max(0, Math.min(max, Math.round(Number(g.count))))
    : (spots?.length ?? 0);
  let bounds = { minX: x - R, maxX: x + R, minZ: z - R, maxZ: z + R };
  if (isFiniteRect(g.area)) bounds = { minX: x + g.area.minX, maxX: x + g.area.maxX, minZ: z + g.area.minZ, maxZ: z + g.area.maxZ };
  const hash = hashString('enemy:' + String(g.id ?? kind));
  const rng = new RNG((Number.isFinite(g.seed) ? g.seed : hash) >>> 0);
  const out = [];
  for (let i = 0; i < count; i++) {
    let px = x;
    let pz = z;
    if (spots && i < spots.length) [px, pz] = spots[i];
    else if (count > 1) {
      for (let k = 0; k < 6; k++) {
        px = rng.range(bounds.minX + 0.3, bounds.maxX - 0.3);
        pz = rng.range(bounds.minZ + 0.2, bounds.maxZ - 0.2);
        if (!isWalkable || isWalkable(px, pz)) break;
      }
    }
    out.push([px, pz]);
  }
  return out;
}

/**
 * Is `type` one of the combat-only object types (`combat: true`: enemy, chest, waystone)?
 * @param {string} type any string (unknown types are not combat types)
 * @returns {boolean}
 */
export function isCombatType(type) {
  return !!OBJECT_TYPES[type]?.combat;
}

/**
 * Does the level play with combat? `environment.combat === true` forces it on, `false` forces it
 * off; absent (auto) = on iff the level has an `enemy` object (COMBAT.md §3, D1).
 * @param {Level} level
 * @returns {boolean}
 */
export function levelHasCombat(level) {
  const env = /** @type {Partial<LevelEnvironment>} */ (level?.environment ?? {});
  if (env.combat === true) return true;
  if (env.combat === false) return false;
  return Array.isArray(level?.objects) && level.objects.some((o) => o?.type === 'enemy');
}
