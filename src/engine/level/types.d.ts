// Types of the Lumina level document (`lumina-level` v1) for the type check (tsconfig.json).
// Types only: nothing here reaches a bundle. The format is specified in docs/specs/LEVEL_FORMAT.md
// and the object types in docs/specs/OBJECT_CATALOG.md (binding contract:
// docs/contracts/LEVEL_EDITOR.md §1–§2); where they and the code differ, these types follow the
// code (LevelFormat.js normalizeLevel / serializeLevel, ObjectCatalog.js normalizeObject).
//
// The object types are derived from `OBJECT_TYPES` in ObjectCatalog.js (checked against
// `ObjectTypeDef` there with `@satisfies`): a new type, placement or default is picked up without
// editing this file. Only what the catalog cannot say is written here — `ObjectExtras`: the
// optional fields without a default, and defaults whose value alone types too loosely (`text: []`,
// `deckY: null`). `LevelObject` is a union discriminated on `type`: narrow on it for a type's
// exact fields; without narrowing, every field of every type reads with its own type (see
// `LevelObjectOf`), which is how most code handles objects.
//
// Usage from JavaScript (path relative to the file), in the file's one @import block:
// `/** @import { Level, LevelObject } from '../engine/level/types.js' */`.

import type { OBJECT_TYPES } from './ObjectCatalog.js';
import type { DEFAULT_ENVIRONMENT, DEFAULT_WATER } from './LevelFormat.js';

// ---------------------------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------------------------

/** An axis-aligned rectangle { minX, maxX, minZ, maxZ } (world units unless the field says tiles). */
export interface Rect {
  /** West edge (smallest x). */
  minX: number;
  /** East edge. */
  maxX: number;
  /** North edge (smallest z). */
  minZ: number;
  /** South edge. */
  maxZ: number;
}

/** An inclusive rectangle of tile indices (tile (i, j); see Rect for world units). */
export interface TileRect {
  minI: number;
  maxI: number;
  minJ: number;
  maxJ: number;
}

/** A point [x, z] (or an offset [dx, dz] relative to an object's x / z). */
export type XZ = [number, number];

/** Literal default values widened to the type of the field (`'oak'` → string), deep, mutable. */
type Widen<T> =
  unknown extends T ? T // any (a `null` default in this non-strict check) stays any
    : T extends string ? string
      : T extends number ? number
        : T extends boolean ? boolean
          : T extends readonly (infer E)[] ? Widen<E>[]
            : T extends object ? { -readonly [K in keyof T]: Widen<T[K]> }
              : T;

/** `D` with the keys of `E` replaced by `E`'s; an `opts` in both is intersected (merged). */
type Override<D, E> = Omit<D, keyof E> & {
  [K in keyof E]: K extends 'opts' ? (K extends keyof D ? D[K] & E[K] : E[K]) : E[K];
};

/** Every key of any member of the union `U`. */
type KeysOfUnion<U> = U extends unknown ? keyof U : never;
/** The type of key `K` in the members of `U` that have it. */
type FieldOfUnion<U, K extends PropertyKey> =
  U extends unknown ? (K extends keyof U ? U[K] : never) : never;
/** One object type with every key of the union `U`, optional, typed by the members having it. */
type FlattenUnion<U> = { [K in KeysOfUnion<U>]?: FieldOfUnion<U, K> };

/** Every key optional, recursively (arrays are kept whole: an override replaces an array). */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// ---------------------------------------------------------------------------------------------
// The level document (docs/specs/LEVEL_FORMAT.md §3)
// ---------------------------------------------------------------------------------------------

/**
 * A normalised level (`normalizeLevel` output, what the game, the editor and `serializeLevel`
 * work on): every field below is present. A file may omit any of them (the normaliser fills them
 * in); top-level fields this engine does not know are kept and written back after `objects`
 * (LEVEL_FORMAT.md §15) — read them with `level[key]`.
 */
export interface Level {
  /** Always 'lumina-level' (`LEVEL_FORMAT`); a file with another value throws on load. */
  format: 'lumina-level';
  /** Written as 1 (`LEVEL_VERSION`); a file with a newer version loads with a warning. */
  version: number;
  /**
   * Display name (title screen, arrival banner, HUD fallback); 'Untitled' when missing. Seeds the
   * terrain noise: never rename a shipped level.
   */
  name: string;
  /** Title-screen / banner sub-line and the HUD sub-line outside any region. */
  subtitle: string;
  /** Informational only. */
  author: string;
  /** Informational only (the editor's Level settings shows it). */
  description: string;
  /** Columns (8–128, `MIN_SIZE`…`MAX_SIZE`); each `tiles` / `heights` row has this many. */
  width: number;
  /** Rows (8–128); `tiles` and `heights` have this many rows. Rows run toward +Z. */
  depth: number;
  /** Global water surface height (world units, §8.1); 0.35 when missing, 0.4 in new levels. */
  waterLevel: number;
  /** Level-wide water look (§8.2). */
  water: LevelWater;
  /** Time, weather, camera, scenery and presentation options (§9). */
  environment: LevelEnvironment;
  /** Player start (§10). */
  spawn: LevelSpawn;
  /** Map char → tile definition: `defaultLegend()` with the file's entries merged over it. */
  legend: Record<string, TileDef>;
  /** One string per row, one legend character per tile (tile (i, j) = `tiles[j][i]`). */
  tiles: string[];
  /** One string per row, a height char per tile ('0'–'9', 'a'–'z' = level 0–35; y = level × 0.5) */
  heights: string[];
  /** Every placed object, in file order (ranks equal-priority lights and overlapping regions). */
  objects: LevelObject[];
}

/**
 * A legend entry: how TileMap and Water build a tile character (LEVEL_FORMAT.md §4.2). Unknown keys
 * are kept.
 */
export interface TileDef {
  /** Texture of the top face (a TextureLibrary name); required for visible tiles. */
  top?: string;
  /** Texture of vertical faces (default: `lip`, else `top`). */
  side?: string;
  /** Texture of the top 1-unit band of vertical faces (e.g. grassy cliff edges). */
  lip?: string;
  /** Texture of stair risers (default `top`). */
  riser?: string;
  /** Can characters stand here? Default `!water`. */
  walkable?: boolean;
  /** Water tile: gets a water surface (§8). */
  water?: boolean;
  /** Water flow: a number multiplies `water.flow`, [x, z] sets it in units per second, 0 = still. */
  flow?: number | XZ;
  /** Water tiles: absolute surface height (overrides everything else). */
  waterLevel?: number;
  /** Water tiles: surface = bed height + `waterDepth`. */
  waterDepth?: number;
  /** Stairs tile rising toward that side (§7); other values are ignored. */
  stairs?: 'N' | 'S' | 'E' | 'W';
  /** Empty tile: no geometry, not walkable. */
  void?: boolean;
  /** false: no random quarter-turn / mirror of organic top textures. */
  uvVariation?: boolean;
  /** false: no grass fringes spilled onto / received from neighbours. */
  fringe?: boolean;
  /** false: no grassy brim / hanging skirt along the top of cliff faces. */
  overhang?: boolean;
}

/** `level.water` (LEVEL_FORMAT.md §8.2); defaults from `DEFAULT_WATER`. Unknown keys are kept. */
export interface LevelWater extends Omit<Widen<typeof DEFAULT_WATER>, 'flow'> {
  /**
   * Default ripple drift [x, z] in units per second ([0, 0.45] flows toward +Z); reset when not a
   * 2-element array.
   */
  flow: XZ;
  /** Strength of the sky / fog colour reflection (0.2). */
  reflect: number;
  /** How much of the light's hue is neutralised on the water (0.2). */
  neutral: number;
  /** Sun / moon sparkle density (default 1, not written unless set; `ObjectBuilder.waterGlint`). */
  glint?: number;
}

/** `level.spawn`: the player start (LEVEL_FORMAT.md §10). Extra keys a tool wrote are kept. */
export interface LevelSpawn {
  /** World x (default width / 2). */
  x: number;
  /** World z (default depth / 2). */
  z: number;
  /** Initial facing; `normalizeLevel` turns any other value into 'down'. */
  facing: 'down' | 'up' | 'left' | 'right';
}

/**
 * `level.environment` (LEVEL_FORMAT.md §9). The ten keys of `DEFAULT_ENVIRONMENT` are always
 * present after normalisation; the optional ones are absent = the game's automatic choice and are
 * never written by default. Values are not type-checked on load: the game ignores invalid values
 * field by field. Unknown keys are kept.
 */
export interface LevelEnvironment
  extends Omit<Widen<typeof DEFAULT_ENVIRONMENT>, 'camera' | 'highGround'> {
  /** Starting hour, wrapped into 0…24 (17.2 = golden hour). */
  timeOfDay: number;
  /** Does time advance while playing? Only `false` freezes the hour. */
  clock: boolean;
  /** Starting weather: 'clear' | 'rain' | 'snow' (unknown names play as clear). */
  weather: string;
  /** 'forest' scatters border trees on `T` tiles; anything else ('none') = no border trees. */
  border: string;
  /** Fogged outer ground, tree clusters and hills around the map; only `false` turns them off. */
  outerScenery: boolean;
  /** Light shafts (see `godRayAreas`); only `false` turns them off. */
  godRays: boolean;
  /** Camera-following dust motes; only `false` turns them off. */
  dust: boolean;
  /** Start the music when the game leaves the title screen; only `false` keeps it silent. */
  music: boolean;
  /** Camera framing; null = automatic (§9.3). */
  camera: LevelCamera | null;
  /** Steeper camera while the player stands above `minY`; null = none. */
  highGround: HighGround | null;
  /** Title-screen texts (§9.2). */
  title?: TitleTexts;
  /** The drifting camera behind the title screen. */
  titleCamera?: TitleCamera;
  /** World rects for the god-ray shafts; absent or [] = one automatic area over walkable ground. */
  godRayAreas?: GodRayArea[];
  /** Ground-foliage seed and zones, in **tile** coordinates. */
  foliage?: FoliageSettings;
  /** Open ground south of the map before the outer forest. */
  scenery?: ScenerySettings;
  /** Tree kinds of the scattered forest by area, in world units (`Scenery.forestKindAreas`). */
  forest?: ForestSettings;
  /** Multiplier on the fog density (> 0; default 1). */
  fogScale?: number;
  /** `false` hides the HUD minimap (default: shown). */
  minimap?: boolean;
  /** Combat: absent = auto (on iff an `enemy` exists), true / false force it (`levelHasCombat`). */
  combat?: boolean;
}

/** `environment.camera` (LEVEL_FORMAT.md §9.3). */
export interface LevelCamera {
  /** Gameplay camera distance (default 30, clamped 8–80); widens the zoom range to include it. */
  distance?: number;
  /** Pitch in degrees (default 32, clamped 10–80). */
  pitch?: number;
  /**
   * Where the camera focus may go: one rect for every zoom, or per zoom (`near` / `mid` / `far`);
   * absent = automatic.
   */
  bounds?: Rect | CameraZoomBounds;
}

/** Camera focus bounds per zoom: the game interpolates near → mid → far as the camera zooms out. */
export interface CameraZoomBounds {
  /** At the closest zoom. */
  near?: Rect;
  /** At the default distance (used for all three when `near` / `far` are missing). */
  mid?: Rect;
  /** At the farthest zoom. */
  far?: Rect;
}

/** `environment.highGround`: tilt the camera while the player stands above `minY`. */
export interface HighGround {
  /** World height the player must stand above; the setting is ignored unless it is a finite number. */
  minY: number;
  /** Pitch in degrees there (clamped 10–80; default: the camera pitch). */
  pitch?: number;
}

/** `environment.title`: title-screen texts (empty `title` / `prompt` fall back to the defaults). */
export interface TitleTexts {
  /** Default: the level name in capitals. */
  title?: string;
  /** Default: `subtitle` or "A Lumina HD-2D Level". */
  subtitle?: string;
  /** Default: "Press any key". */
  prompt?: string;
  /** Default: "Lumina HD-2D Engine · three.js". */
  credit?: string;
}

/** `environment.titleCamera`: centre, height, drift amplitudes and distance of the title camera. */
export interface TitleCamera {
  /** Drift centre x (default: the centre of the mid camera bounds). */
  x?: number;
  /** Drift centre z. */
  z?: number;
  /** Focus height (default: the most common walkable ground height + 0.5). */
  y?: number;
  /** Drift amplitude along x (default min(7, ¼ of the bounds width)). */
  driftX?: number;
  /** Drift amplitude along z (default min(5, ¼ of the bounds depth)). */
  driftZ?: number;
  /** Camera distance (default from the map size, 22–35). */
  distance?: number;
}

/** One `environment.godRayAreas` entry (world units). */
export interface GodRayArea extends Rect {
  /** Base height of the shafts (default 0). */
  y?: number;
  /** Shafts in the area (rounded, 0–12; default 3; 0 skips the area). */
  count?: number;
  /** Placement seed (default 7). */
  seed?: number;
}

/** `environment.foliage` (zones in tile coordinates; first match wins; malformed zones are dropped). */
export interface FoliageSettings {
  /** Ground-foliage seed (default 2024). */
  seed?: number;
  /** Flower colours per zone: `palette` lists flower frames (0 red, 1 yellow, 2 white, 3 blue). */
  flowerAreas?: (Rect & { palette: number[] })[];
  /** Bush / fern chance per grass tile per zone (default 0.05). */
  shrubAreas?: (Rect & { chance: number })[];
}

/** `environment.scenery`. */
export interface ScenerySettings {
  /** Open ground in world units south of the map before the outer forest (default 5). */
  southGap?: number;
}

/** `environment.forest`: tree kinds of the scattered forest by area (world units; first match wins). */
export interface ForestSettings {
  /** Areas with relative kind weights; an area without a positive weight is dropped. */
  areas?: (Rect & { kinds: { oak?: number; pine?: number; birch?: number; autumn?: number } })[];
}

// ---------------------------------------------------------------------------------------------
// The object catalog (docs/specs/OBJECT_CATALOG.md §1–§2)
// ---------------------------------------------------------------------------------------------

/** One `OBJECT_TYPES` entry: defaults, placement, editor metadata and the inspector's field schema. */
export interface ObjectTypeDef {
  /** Editor label (palette, outliner, inspector). */
  label: string;
  /** Palette category, one of `OBJECT_CATEGORIES`. */
  category: string;
  /** Position fields: point { x, z }, line { x0, z0, x1, z1 }, rect { minX, maxX, minZ, maxZ }. */
  placement: Placement;
  /**
   * Who builds it: 'prop' = LevelObjectBuilder / PropFactory geometry, 'actor' = the game's
   * character code, 'marker' = read directly.
   */
  kind: 'prop' | 'actor' | 'marker';
  /** Palette / 2D-map glyph. */
  glyph: string;
  /** Palette / 2D-map colour. */
  color: string;
  /** Picking radius of a point object in world units. */
  radius: number;
  /** Has a `rotation` the editor can turn (radians about +Y). */
  rotatable?: boolean;
  /** Placement snap step (default 0.5). */
  snap?: number;
  /** Inspector help text. */
  help?: string;
  /** Default field values, written in this key order after id, type and the position (`createObject`). */
  defaults: Record<string, any>;
  /** Inspector schema, in display order. */
  fields: FieldDef[];
  /**
   * Combat-only type (enemy, chest, waystone — COMBAT.md §14): Cinderwatch Pass's generator covers
   * it, Starfall Vale's coverage skips it.
   */
  combat?: boolean;
}

/** Placement styles of `ObjectTypeDef.placement`. */
export type Placement = 'point' | 'line' | 'rect';

/** An inspector field (`ObjectTypeDef.fields`). */
export interface FieldDef {
  /** Dotted path into the object ('opts.width', 'size.0'; `getField` / `setField`). */
  key: string;
  /** Inspector label. */
  label: string;
  /** Editor widget and stored value type. */
  type: FieldType;
  /** Number / int / angle: lowest value the inspector offers. */
  min?: number;
  /** Highest value the inspector offers. */
  max?: number;
  /** Step of the spinner / slider (degrees for 'angle'). */
  step?: number;
  /** Numbers: may be left blank (stored as null). */
  nullable?: boolean;
  /** Select options: stored values, or { value, label } pairs. */
  options?: (string | SelectOption)[];
  /** Inspector help text. */
  help?: string;
}

/**
 * Inspector widget types: 'angle' stores radians and shows degrees; 'lines' is string[] (one
 * entry per paragraph); 'dialogue' is `DialoguePage[]` edited as text (OBJECT_CATALOG.md §13).
 */
export type FieldType =
  'number' | 'int' | 'angle' | 'bool' | 'select' | 'text' | 'textarea' | 'lines' | 'dialogue' | 'color';

/** A select option with a label different from its stored value. */
export interface SelectOption {
  /** The value stored in the object. */
  value: string;
  /** What the inspector shows. */
  label: string;
}

/** The catalog as ObjectCatalog.js declares it (literal placements, per-type defaults). */
type Catalog = typeof OBJECT_TYPES;

/** An object type name: a key of `OBJECT_TYPES`. */
export type ObjectType = keyof Catalog & string;

/** The object types whose catalog kind is not 'prop' (actors, markers, areas). */
export type NonPropObjectType = { [T in ObjectType]: Catalog[T]['kind'] extends 'prop' ? never : T }[ObjectType];

/**
 * `null`, for the `default` of a switch over `obj.type` that only non-prop types may reach
 * (ObjectBuilder.build): a catalog prop type without a `case` there fails the constraint (PROP-10).
 */
export type NullForNonProp<T extends NonPropObjectType> = null;

/** The placement of type `T` ('point' | 'line' | 'rect'). */
export type PlacementOf<T extends ObjectType> = Catalog[T]['placement'];

/** Position fields per placement (LEVEL_FORMAT.md §11). */
export interface PlacementFields {
  /**
   * A point object: world position (a tile centre is i + 0.5); `rotation` in radians about +Y
   * (0 = front faces +Z), required for rotatable types.
   */
  point: { x: number; z: number; rotation?: number };
  /** A line object (fence, bridge): the run from (x0, z0) to (x1, z1). */
  line: { x0: number; z0: number; x1: number; z1: number };
  /** A rect object (region). */
  rect: Rect;
}

/**
 * A dialogue page: plain text, or a choice page (the first choice is the non-committal one;
 * OBJECT_CATALOG.md §13).
 */
export type DialoguePage = string | DialogueChoicePage;

/** A dialogue page that ends with a choice. */
export interface DialogueChoicePage {
  /** The question (may be empty). */
  text: string;
  /** The answers; blank ones are dropped (a page left with none shows as plain text). */
  choices: string[];
}

/**
 * Per type, the fields the catalog `defaults` cannot type: optional fields the game reads that
 * are never written by default (LEVEL_EDITOR.md §2 "Optional object fields", OBJECT_CATALOG.md),
 * the legacy absolute forms `normalizeObject` converts on load, builder options without an
 * inspector field (an `opts` entry here is merged into the catalog's `opts` and handed to the
 * PropFactory method unchanged), and defaults whose value alone types too loosely (`text: []`,
 * `deckY: null`). A type missing here is just its catalog defaults.
 */
export interface ObjectExtras {
  house: {
    /** "Text when knocking": one dialog page per entry; empty = the door is not interactive. */
    text: string[];
    /**
     * The options `buildHouse` reads beyond the inspector fields. These follow the builder
     * (props/House.js; docs/architecture/modules/world.md §4.2), which reads more than
     * OBJECT_CATALOG.md lists (`gable`, `ridge`, `door`, `upperHeight`, `jetty`, `roofThickness`).
     * Mirrors HouseOptions (props/House.js; not imported: the tools program stays free of
     * three.js): change both.
     */
    opts: {
      /** Roof pitch in degrees (random 38–45). */
      pitch?: number;
      /** Roof overhang (0.35). */
      overhang?: number;
      /** Roof slab thickness (0.22). */
      roofThickness?: number;
      /** Gable-end texture (default: the upper wall, or 'wood_planks' when that is brick / stone). */
      gable?: string;
      /** Ridge-cap texture (default: the roof). */
      ridge?: string;
      /** Door side ('front'); 'none' or false = no door. */
      door?: 'front' | 'back' | 'left' | 'right' | 'none' | false;
      /** Flower boxes under the windows (true). */
      flowerboxes?: boolean;
      /** Door lantern (true). */
      lantern?: boolean;
      /** Door position along the front wall. */
      doorOffset?: number;
      /** Adds a second, dim night light at the door. */
      windowLights?: boolean;
      /** Plinth texture ('stone_brick'). */
      plinth?: string;
      /** Plinth height (0.5). */
      plinthHeight?: number;
      /** Storey height (3.0). */
      storyHeight?: number;
      /** Second-storey height (2.0; two-storey houses only). */
      upperHeight?: number;
      /** Second-storey overhang past the front and back walls (0.25; two-storey houses only). */
      jetty?: number;
      /** Which side the chimney stands on (1 or -1; random when absent). */
      chimneySide?: number;
    };
  };
  windmill: {
    opts: {
      /** Variation seed (inspector field, no default). */
      seed?: number;
      /** Upper wall texture ('plaster'). */
      wall?: string;
      /** Sail length (3.7). */
      sailLength?: number;
      /** Sail turning speed (0.55). */
      speed?: number;
    };
  };
  well: {
    /** Pages shown when examined; empty = not interactive. */
    text: string[];
    /** Sound played when examined (default 'splash'). */
    sfx?: string;
  };
  marketStall: {
    opts: {
      /** Variation seed (inspector field, no default). */
      seed?: number;
      /** Stall depth (1.6). */
      depth?: number;
      /** Produce display in front (on unless false). */
      display?: boolean;
    };
  };
  tree: {
    /** Mirrors TreeOptions (props/Trees.js; not imported, see house.opts): change both. */
    opts: {
      /** Yaw (random when absent; trees are not rotatable in the editor). */
      rotation?: number;
      /** Autumn trees: leaves around the foot (on unless false). */
      fallenLeaves?: boolean;
    };
  };
  rock: {
    opts: {
      /** Flatter top (`buildRock` flatTop 0.3 instead of 0.12; world.md §4.2). */
      flat?: boolean;
    };
  };
  haystack: {
    opts: {
      /** Variation seed (inspector field, no default). */
      seed?: number;
    };
  };
  lamppost: {
    opts: {
      /** Post height (2.9). */
      height?: number;
      /** Light intensity (12). */
      intensity?: number;
      /** Light range (9). */
      distance?: number;
    };
  };
  wallTorch: {
    opts: {
      /** Light intensity (7). */
      intensity?: number;
      /** Light range (7). */
      distance?: number;
      /** Variation seed. */
      seed?: number;
    };
  };
  campfire: {
    opts: {
      /** Variation seed. */
      seed?: number;
      /** Ring stones (10). */
      stones?: number;
      /** Logs (4). */
      logs?: number;
      /** Light intensity (14). */
      intensity?: number;
      /** Light range (10). */
      distance?: number;
    };
  };
  barrel: {
    opts: {
      /** Barrel radius (0.4). */
      radius?: number;
    };
  };
  crateStack: {
    opts: {
      /** Variation seed (inspector field, no default). */
      seed?: number;
      /** Adds a barrel (random 60 % when absent). */
      barrel?: boolean;
    };
  };
  flowerbox: {
    opts: {
      /** Wall-mounted: no legs, no collider. */
      wall?: boolean;
    };
  };
  signpost: {
    /** Sign text, one page per entry; empty = not interactive. */
    text: string[];
  };
  fence: {
    opts: {
      /** Fence height (0.95). */
      height?: number;
      /** Post spacing (1.0). */
      spacing?: number;
      /** Rails (2; 1 = one rail). */
      rails?: number;
    };
  };
  bridge: {
    /** Deck height; null = automatic (`bridgeDeckHeight`). */
    deckY: number | null;
    opts: {
      /** Post depth (1.4). */
      postDepth?: number;
      /** Rails (on unless false). */
      rails?: boolean;
    };
  };
  waterfall: {
    /** Spray emitter tuning (count max(4, round(8 × width)), alpha 0.07). */
    mist?: { count?: number; alpha?: number };
    /** false: no splash bursts or glints, not an audio anchor. */
    splash?: boolean;
  };
  npc: {
    /** Pages (strings or choice pages); ignored when `script` names a known script. */
    dialogue: DialoguePage[];
    /** Where the player talks to the NPC, relative to x / z (e.g. across a counter). */
    talkOffset?: XZ;
    /** Talk distance (default 1.6, floor 0.5). */
    talkRadius?: number;
    /** The rect a `chase` NPC roams, relative to x / z. */
    area?: Rect;
    /** Legacy absolute `talkOffset` (converted on load; the game still reads it). */
    talkPoint?: XZ;
    /** Legacy absolute `area` (converted on load; the game still reads it). */
    bounds?: Rect;
  };
  critters: {
    /** Animals (the game accepts 0–16); null or '' = the number of spots (`critterStartPoints`). */
    count: number | null | '';
    /** Chicken yard relative to x / z (default: the square of `radius`). */
    area?: Rect;
    /** Exact start spots relative to x / z (at most 16); the first animals take them. */
    spotOffsets?: XZ[];
    /** Placement RNG seed (default: a hash of the id). */
    seed?: number;
    /** Behaviour seed of animal i is `seedBase + i` (default: a hash of the id mod 10000). */
    seedBase?: number;
    /** Walk speed override (minimum 0.1; default per kind). */
    speed?: number;
    /** Legacy absolute `area` (converted on load; the game still reads it). */
    bounds?: Rect;
    /** Legacy absolute `spotOffsets` (converted on load; the game still reads it). */
    spots?: XZ[];
  };
  emitter: {
    /** Box size [x, y, z]. */
    size: [number, number, number];
    /**
     * Extra `Particles.createEmitter` config merged under the object's own values (a `rate` does
     * change the count).
     */
    params?: Record<string, any>;
  };
  region: {
    /** Only counts while the player stands above this world height; null = any. */
    minY: number | null;
  };
  enemy: {
    /** Creatures (0–8, a golem group 0–1); null or '' = one per spot (`enemyStartPoints`). */
    count: number | null | '';
    /** Exact start spots relative to x / z; the first creatures take them. */
    spotOffsets?: XZ[];
    /** Scatter rect relative to x / z instead of the home-radius square. */
    area?: Rect;
    /** Scatter seed (default `hashString('enemy:' + id)`). */
    seed?: number;
    /** The boss arena relative to x / z — required for a golem. */
    arena?: Rect;
    /** The arena's gate segment [dx0, dz0, dx1, dz1] relative to x / z — required for a golem. */
    gate?: [number, number, number, number];
  };
  chest: {
    opts?: {
      /** Variation seed. */
      seed?: number;
    };
  };
  waystone: {
    opts?: {
      /** Variation seed. */
      seed?: number;
    };
  };
}

/** Guard: every `ObjectExtras` key must be a catalog type (a renamed type fails here). */
type AssertNever<T extends never> = T;
type _ObjectExtrasKeysAreTypes = AssertNever<Exclude<keyof ObjectExtras, ObjectType>>;

/** The `ObjectExtras` entry of type `T` (none: {}). */
type ExtrasOf<T extends ObjectType> = T extends keyof ObjectExtras ? ObjectExtras[T] : {};

/** The fields of a normalised `T` object, exactly: id, type, position, catalog defaults, extras. */
export type ObjectShapeOf<T extends ObjectType> =
  { id: string; type: T }
  & PlacementFields[PlacementOf<T>]
  & Override<Widen<Catalog[T]['defaults']>, ExtrasOf<T>>;

type AnyObjectShape = { [T in ObjectType]: ObjectShapeOf<T> }[ObjectType];
type AnyOpts = FlattenUnion<FieldOfUnion<AnyObjectShape, 'opts'>>;
/** Every field any object type can carry (optional), `opts` flattened too. */
type AnyFields = Omit<FlattenUnion<AnyObjectShape>, 'id' | 'type' | 'opts'> & { opts?: AnyOpts };

/**
 * A level object of type `T`: its own fields (`ObjectShapeOf<T>`: id, type, the placement's
 * position, the catalog defaults — all present after `normalizeObject` — and the optional
 * `ObjectExtras`) plus, optionally, the fields of every other type. Objects keep unknown keys on
 * load, and most code reads fields across types (`OBJECT_TYPES[o.type].placement === 'line'`,
 * `o.opts?.width`, `o.x != null`) without narrowing, so a field of another type reads with that
 * type instead of failing; narrow on `type` (`if (o.type === 'npc')`) for the exact shape.
 */
export type LevelObjectOf<T extends ObjectType> =
  unknown extends T ? LevelObject // an untyped type name (any): some level object
    : T extends ObjectType ? ObjectOf<T> : never; // a union of names: the union of their objects

type ObjectOf<T extends ObjectType> =
  WithOtherOpts<ObjectShapeOf<T>>
  & ('opts' extends keyof ObjectShapeOf<T> ? {} : { opts?: AnyOpts })
  & Omit<AnyFields, keyof ObjectShapeOf<T> | 'opts'>;

/** `S` with the builder options of every other type added (optional) to its own `opts`. */
type WithOtherOpts<S> = { [K in keyof S]: K extends 'opts' ? S[K] & Omit<AnyOpts, keyof S[K]> : S[K] };

/** Any level object: a union discriminated on `type` (`LevelObjectOf<T>` for each catalog type). */
export type LevelObject = { [T in ObjectType]: ObjectOf<T> }[ObjectType];

/** `createObject` / `addObject` overrides: any fields, deep-merged (arrays replace). */
export type ObjectOverrides<T extends ObjectType> = DeepPartial<LevelObjectOf<T>>;
