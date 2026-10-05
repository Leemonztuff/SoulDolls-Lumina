# Task playbooks

> **Purpose.** Step-by-step recipes for the changes that come up again and again in Lumina: which
> files and symbols to touch, in which order, what breaks if you forget a step, and how to prove
> the change works. Each recipe was derived from how the code is wired today (read the files it
> names before editing — line numbers are deliberately not given).
>
> **Audience.** AI agents and developers making changes; read
> [AGENT_ONBOARDING.md](AGENT_ONBOARDING.md) first (golden rules, verification loop).
>
> **Source of truth.** [`src/engine/`](../../src/engine/), [`src/demo/`](../../src/demo/),
> [`src/editor/`](../../src/editor/), [`tools/`](../../tools/), [`sandbox/`](../../sandbox/).
> Binding contracts: [`ARCHITECTURE.md`](../../ARCHITECTURE.md),
> [`docs/contracts/LEVEL_EDITOR.md`](../contracts/LEVEL_EDITOR.md).
>
> **Related.** [KNOWN_ISSUES.md](KNOWN_ISSUES.md) ·
> [development/TESTING_AND_VERIFICATION.md](../development/TESTING_AND_VERIFICATION.md) ·
> [specs/OBJECT_CATALOG.md](../specs/OBJECT_CATALOG.md) · [specs/LEVEL_FORMAT.md](../specs/LEVEL_FORMAT.md) ·
> [specs/AUTOMATION_API.md](../specs/AUTOMATION_API.md) · [architecture/modules/](../architecture/modules/README.md)

## Contents

0. [Before any recipe](#0-before-any-recipe)
1. [Add a placeable object type](#1-add-a-placeable-object-type)
2. [Add a tile type](#2-add-a-tile-type)
3. [Add a particle preset](#3-add-a-particle-preset)
4. [Add a post-processing effect or tune the grade](#4-add-a-post-processing-effect-or-tune-the-grade)
5. [Add a texture](#5-add-a-texture)
6. [Add a character preset or a creature](#6-add-a-character-preset-or-a-creature)
7. [Add an NPC action or behaviour](#7-add-an-npc-action-or-behaviour)
8. [Add an input action (game key)](#8-add-an-input-action-game-key)
9. [Add a UI component](#9-add-a-ui-component)
10. [Add an editor tool](#10-add-an-editor-tool)
11. [Add a level field](#11-add-a-level-field)
12. [Create a new level with a generator script](#12-create-a-new-level-with-a-generator-script)
13. [Change an existing level](#13-change-an-existing-level)
14. [Profile and fix a performance problem](#14-profile-and-fix-a-performance-problem)
15. [Investigate a visual bug with the harness](#15-investigate-a-visual-bug-with-the-harness)
16. [Regression check before you finish](#16-regression-check-before-you-finish)
17. [Add a sound effect](#17-add-a-sound-effect)
18. [Upgrade three.js or another dependency](#18-upgrade-threejs-or-another-dependency)
19. [Add an enemy kind](#19-add-an-enemy-kind)
20. [Tune combat (balance, feel, look)](#20-tune-combat-balance-feel-look)
21. [Fix a failing type check](#21-fix-a-failing-type-check)
- [Appendix: tested harness snippets](#appendix-tested-harness-snippets)

---

## 0. Before any recipe

- **Catalog-wide lists are coupled to Starfall Vale** (and the combat lists to Cinderwatch Pass).
  `coverage()` in
  [`tools/make-starfall-vale.mjs`](../../tools/make-starfall-vale.mjs) fails (and the generator
  writes nothing) unless the level uses **every** `TILE_TYPES` char, every `OBJECT_TYPES` type,
  every `NPC_ACTIONS` value, every `NPC_BEHAVIOURS` value, every `CRITTER_KINDS` kind and every
  `EMITTER_PRESETS` preset except `rain` / `snow` (it also checks, among others, 24–30 villagers
  with 2–5 dialogue pages each and only valid `CHARACTER_PRESET_NAMES` / `EMITTER_PRESETS`).
  Adding to any of these lists means adding a placement to the generator (usually in the area
  function that fits — `hearthwick()`, `meadowlands()`, …) and re-running it. Placements feed the
  seeded scatter, so a new object can reshuffle every tree / rock placed after it: re-read the
  generator's report and look at the level again. Dry-run first with
  `node tools/make-starfall-vale.mjs --out=<scratch>/sv.json`; the report's `coverage:` block
  names what is missing. Object types flagged `combat: true` are skipped there; they, every
  `ENEMY_KINDS` kind and every `CHEST_UPGRADES` value must instead be placed by
  [`tools/make-cinderwatch-pass.mjs`](../../tools/make-cinderwatch-pass.mjs) (dry run:
  `node tools/make-cinderwatch-pass.mjs --out=<scratch>/cw.json`).
- **New defaults change saved files.** A key added to an object type's `defaults`, to
  `DEFAULT_ENVIRONMENT` or `DEFAULT_WATER`, or a new built-in tile char, is materialised by
  `normalizeLevel` into every level on its next save (golden rule 5). Prefer optional fields that
  are absent by default; otherwise re-save / regenerate all shipped levels in the same change
  ([§13](#13-change-an-existing-level)).
- **Small levels must not change** unless that is the task; gate big-level work on
  `World.isBigLevel` / `this.batching` (golden rule 8).
- **Anything that can appear mid-game must be compiled at load** (golden rule 2).
- **Code that reads a name from a level** (a new field, kind, preset or table) looks it up with
  `isOwnKey` / `ownValue` (`src/engine/utils/own.js`), never `TABLE[name]` (golden rule 16); the
  `hostile` case of `sandbox/game_levels.html` (`game_levels.hostile.json`) is the check to extend.
- **Document** additive contract changes in the same change: `ARCHITECTURE.md` or
  `docs/contracts/LEVEL_EDITOR.md`, `docs/contracts/MODULE_NOTES.md` (engine modules), the
  relevant `docs/` pages, `README.md` if users see it.
- **Type it, and run `npm run typecheck`** (0 errors in both programs; Vite never type-checks).
  Most catalog-wide additions are typed automatically — object types and defaults (from
  `OBJECT_TYPES`), sound names, input actions, particle presets — and the check then points at
  every place that must follow, such as a missing builder `case` or brain. What each recipe
  needs is in its own steps and in [§21](#21-fix-a-failing-type-check);
  the rules are in [CONVENTIONS.md §3.1](../development/CONVENTIONS.md#31-the-type-check).

---

## 1. Add a placeable object type

A new prop the editor can place and the game builds (e.g. a stool, a statue, a lantern arch).
Actors (`npc`, `critters`) and markers (`emitter`, `region`) are special-cased — this recipe is for
`kind: 'prop'`.

| # | File | Symbol | What to do |
| --- | --- | --- | --- |
| 1 | [`src/engine/world/props/*.js`](../../src/engine/world/props/) (e.g. `SmallProps.js`) | new `buildX(f, x, y, z, opts)` | Build the mesh with the factory helpers and return `f.result(group, { colliders, lights, emissives, emitters, interact, update })`. Seed from `f.rng('<kind>', x, z, opts.seed)`. Builders in `SmallProps.js` keep `f` untyped (the Node tools import that file and must not pull in `Props.js`); elsewhere type `f` and `opts` in JSDoc. |
| 2 | [`src/engine/world/Props.js`](../../src/engine/world/Props.js) | `PropFactory` method | `x(x, y, z, opts = {}) { return buildX(this, x, y, z, opts); }` (import the builder). Additive contract extension — note it in `MODULE_NOTES.md`. Give it a JSDoc `@param` for `opts` listing every key the builder reads (like `house` / `rock`): the type check then rejects a catalog `defaults.opts` key the method does not declare. A prop type without a `PropFactory` method of its name fails the check ([`world/types.d.ts`](../../src/engine/world/types.d.ts)). |
| 3 | [`src/engine/level/ObjectCatalog.js`](../../src/engine/level/ObjectCatalog.js) | `OBJECT_TYPES.x` | `{ label, category (one of OBJECT_CATEGORIES), placement: 'point', kind: 'prop', glyph, color, radius, rotatable?, snap?, help?, defaults, fields }`. `defaults` is what a new object gets (key order = file order); `fields` drives the inspector (`number` · `int` · `angle` · `bool` · `select` · `text` · `textarea` · `lines` · `dialogue` · `color`; `key` is a dotted path such as `opts.height`). The level types are derived from this entry (`@satisfies {Record<string, ObjectTypeDef>}`): the type, its placement and defaults are typed with no other edit. Fields the game or builder reads that have **no** default go into `ObjectExtras` in [`level/types.d.ts`](../../src/engine/level/types.d.ts), or reads of them fail the check. |
| 4 | [`src/engine/level/ObjectBuilder.js`](../../src/engine/level/ObjectBuilder.js) | `LevelObjectBuilder.build` switch | Add `case 'x':` to the list of point props calling `f[obj.type](obj.x, h(obj.x, obj.z), obj.z, opts)`. **Without a case the default branch returns `null` — the object silently builds nothing** at run time; `npm run typecheck` fails on it (the default branch's `NullForNonProp` cast, KNOWN_ISSUES PROP-10). If it has lights, add it to `LIGHT_PRIORITY` (otherwise priority 3, like house lanterns). |
| 5 | [`src/engine/level/ObjectCatalog.js`](../../src/engine/level/ObjectCatalog.js) | `objectBounds` | Optional: a footprint special case (default: a square of `radius`) — used for picking, selection outlines and the 2D map. |
| 6 | [`src/demo/World.js`](../../src/demo/World.js) | `_buildProps` switch | Only if it is interactive (door / sign / well style texts: `this._interact(...)`) or the game needs its position (like `fires`). Colliders, walk rects, lights, emissives and `update` are wired generically by `World._build`, the prop's particle emitters by the loop in `_buildProps` (`_createEmitter`). Trees and waterfalls are built in later passes (`LATE_TYPES`). |
| 7 | [`src/editor/map2d/Map2DView.js`](../../src/editor/map2d/Map2DView.js), [`src/engine/level/LevelMap.js`](../../src/engine/level/LevelMap.js) | object drawing | Optional: a nicer 2D symbol (the editor's default draws a rotated footprint box in the catalog colour) and a minimap / world-map mark (`renderLevelMap` draws only the types it knows — nothing for a new type unless added). |
| 8 | [`tools/make-starfall-vale.mjs`](../../tools/make-starfall-vale.mjs) | an area function | Place at least one (coverage check, §0), re-run `node tools/make-starfall-vale.mjs`. A type flagged `combat: true` goes into [`tools/make-cinderwatch-pass.mjs`](../../tools/make-cinderwatch-pass.mjs) instead. |

Comes for free: the editor's object palette (`ToolOptions._objectPaletteSection` iterates
`OBJECT_CATEGORIES` × `OBJECT_TYPES`), the inspector (`fields`), the 3D preview and the Place
ghost (both call `LevelObjectBuilder.build`), undo/redo, copy/paste, serialisation, static
batching (`PropFactory.mergeStatic` merges everything static; mark animated children
`userData.dynamic = true`), shadows, and the smoke tests below (they iterate `OBJECT_TYPES`).

Example builder (verified in the browser: 2 meshes, one collider, merges cleanly):

```js
// src/engine/world/props/SmallProps.js
export function buildStool(f, x, y, z, opts = {}) {
  const rng = f.rng('stool', x, z, opts.seed);      // deterministic: kind + position + seed
  const b = f.builder();                             // MeshBuilder on the TextureLibrary (UVs at 16 px/unit)
  const h = opts.height ?? 0.5;
  b.box('wood_planks', [0.5, 0.08, 0.5], { at: [0, h, 0] });
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    b.box('wood_planks_dark', [0.07, h, 0.07], { at: [sx * 0.18, h / 2, sz * 0.18], off: [rng.range(0, 1), 0] });
  }
  const group = f.finish(b, 'stool', x, y, z, opts.rotation ?? 0);
  return f.result(group, { colliders: [{ type: 'circle', x, z, r: 0.3 }] });
}
```

**Gotchas.** `LevelObjectBuilder.build` passes `opts.rotation` only when the catalog entry has
`rotatable: true` (and `opts.id` always). Colliders, lights and emitter positions are world space
(compute them after `f.finish`, e.g. with `f.world(group, localPoint)` / `f.boxCollider(group, …)`). Props must stay at
the scene root (no transformed parents). Every light a prop returns becomes a descriptor for the
12-light pool. Night-glowing parts (like the factory's `windowMaterial()` / `glassMaterial()`,
which start at `emissiveIntensity` 0) glow only once registered through the result's
`emissives: [{ material, day, night }]`, which the game hands to `LightingSystem.registerEmissive`.

**Verify.**

```bash
npm run typecheck                                                                         # the case, the factory method, the opts keys
npm run check -- --page=sandbox/level_builder.html --query= --out=lb --wait=3000 --fps=0   # every type on a small level; window.__smoke
npm run check -- --page=sandbox/game_levels.html --query=case=everything --out=everything --wait=8000
npm run check -- --page=sandbox/props.html --query=mode=gallery --out=props_gallery          # if you extended the gallery
npm run check -- --page=editor.html --query=new --out=ed_place --fps=0 --script=<your script placing it>
```

Then the regression check ([§16](#16-regression-check-before-you-finish)) and docs:
[specs/OBJECT_CATALOG.md](../specs/OBJECT_CATALOG.md), `LEVEL_EDITOR.md` §2 table,
[architecture/modules/world.md](../architecture/modules/world.md) / `level.md`, `MODULE_NOTES.md`.

---

## 2. Add a tile type

| # | File | Symbol | What to do |
| --- | --- | --- | --- |
| 1 | [`src/engine/level/LevelFormat.js`](../../src/engine/level/LevelFormat.js) | `TILE_TYPES` | Append `{ char, name, category, color, def }` — `category` is one of `ground`, `path`, `water`, `stairs`, `special` (palette group); `color` is the 2D map colour. `char` must be one unused character; avoid `e` and `:` (Starfall Vale's custom legend chars). |
| 2 | same | `def` (TileMap legend entry) | `top`, `side`, `lip` (texture names), `walkable`; water: `water: true`, `flow` ([x, z] or a multiplier; 0 = still), `waterLevel` / `waterDepth`; stairs: `stairs` = `'N'`, `'S'`, `'E'` or `'W'` (the side it rises toward), `riser`; `uvVariation: false`, `fringe: false`, `overhang: false`; `void: true` for no geometry. |
| 3 | [`src/engine/world/TileMap.js`](../../src/engine/world/TileMap.js) | `ORGANIC_TOPS`, `GRASS_TOPS`, `FRINGE_RECEIVERS`, `FRINGE_PRIORITY` | Only if the top texture should get the organic rotation / grass fringes. |
| 4 | [`src/engine/pixel/Textures.js`](../../src/engine/pixel/Textures.js) | `DEFS`, `TEXTURE_NAMES` | Only for a new texture ([§5](#5-add-a-texture)). |
| 5 | all shipped levels | legend | `normalizeLevel` merges `defaultLegend()` (built-in chars first, in `TILE_TYPES` order, then the file's custom chars) into every level, so each file gains the new legend entry on its next save: regenerate Starfall and Willowmere, re-save Emberfall and Brightwater ([§13](#13-change-an-existing-level)). The legend diff must be the new entry only (plus the comma added to the line before it when the new entry becomes the legend's last line — in every file without custom chars). |
| 6 | [`tools/make-starfall-vale.mjs`](../../tools/make-starfall-vale.mjs) | terrain passes | Use the char somewhere (coverage: "every TILE_TYPES char"). |

Comes for free: the editor's tile palette (it lists `TILE_TYPES` present in the level's legend,
with texture swatches), the 2D map colours, the minimap (`LevelMap` uses `TILE_TYPES` colours),
`computeCameraBounds`, walkability rules.

**Verify.** `npm run check -- --page=sandbox/terrain.html --out=terrain` (terrain in isolation),
a small test level through `window.__lumina.playLocal(level)` or `sandbox/game_levels.html`,
the editor (paint it, `Level › Check for problems`), the round trip and generator diffs, docs:
[specs/LEVEL_FORMAT.md](../specs/LEVEL_FORMAT.md) tile table, `LEVEL_EDITOR.md` §1.

---

## 3. Add a particle preset

| # | File | Symbol | What to do |
| --- | --- | --- | --- |
| 1 | [`src/engine/fx/Particles.js`](../../src/engine/fx/Particles.js) | `PARTICLE_PRESETS` | Add an entry. Parameters are documented above the table (`mode` area/point/burst, `motion` drift/emit/fall/precip, `texture` glow/square/leaf/petal/smoke/star/snow/streak, `blending` additive/normal/cutout, counts, life, size, velocity, colours, `hdr`, fades, `nightVisibility`, `lit`, `bounds`…). A new texture needs a generator in `Particles.js` or a `map` override. The type check reads the preset names from this table (`createEmitter` takes `preset: keyof typeof PARTICLE_PRESETS`), so a new name needs no other edit; a new **parameter** must also get a default in `DEFAULTS` (same file), or passing it to `createEmitter` fails the check. |
| 2 | [`src/engine/level/ObjectCatalog.js`](../../src/engine/level/ObjectCatalog.js) | `EMITTER_PRESETS` | Only if levels may use it as a particle area (`emitter` objects); the inspector's *Effect* select follows. |
| 3 | [`src/demo/WeatherLook.js`](../../src/demo/WeatherLook.js) | `areaEmitterIntensity` (switch over the preset) | Optional: how rain / snow / night change its `intensity` (default: unaffected). The game's `Weather.update` and the editor preview both call it. |
| 4 | [`src/editor/viewport3d/Gizmos.js`](../../src/editor/viewport3d/Gizmos.js) | `EMITTER_COLORS` | Optional: the particle-area box colour in the 3D view (default: the catalog colour). |
| 5 | [`src/demo/Game.js`](../../src/demo/Game.js) | `init` (the far-away `particles.burst(...)` calls before `_compileScene`) | **Bursts only:** prime a burst preset the game fires mid-play, like `footstep`, so its pool compiles at load. |
| 6 | [`tools/make-starfall-vale.mjs`](../../tools/make-starfall-vale.mjs) | an area function | If added to `EMITTER_PRESETS` (and not a weather preset): place one particle area (coverage check). |

Example (verified at runtime in Emberfall at night: blue motes around the player; the program
count stayed 57, because it reuses the glow / additive / drift variant — a new texture, blending
or motion model can add a program):

```js
// PARTICLE_PRESETS entry
glowmotes: {
  mode: 'area', motion: 'drift', texture: 'glow', blending: 'additive',
  count: 40, life: [4, 8], size: [0.08, 0.14], sizeEnd: 1,
  velocity: [0, 0.08, 0], velocityVariance: [0.05, 0.04, 0.05], windInfluence: 0.05,
  turbulence: [0.4, 0.3], color: '#9fe8ff', hdr: 2.2, alpha: 0.9, fade: [0.2, 0.3],
  twinkle: 1, nightVisibility: 1, bounds: [8, 2.5, 8],
},
// use: particles.createEmitter({ preset: 'glowmotes', position, count: 60 })
```

**Gotchas.** Additive glows must not write depth and bloom through HDR colour (`hdr` > 1; the
game's bloom threshold is 1.05). The `Particles` group must keep an identity transform. `burst()`
defaults to 12 particles — pass a count. Particles take the DOF blur of what is behind them.
Continuous emitters are one draw call each; on big levels `World._cullParticles` switches area
emitters off beyond 34 units.

**Verify.** `npm run check -- --page=sandbox/sprite_runtime.html --out=sprites` (module),
`sandbox/game_levels.html?case=everything` (iterates `EMITTER_PRESETS`), a night screenshot and
`renderer.info.programs.length` before/after entering the area. Docs:
[architecture/modules/fx.md](../architecture/modules/fx.md), [specs/OBJECT_CATALOG.md](../specs/OBJECT_CATALOG.md).

---

## 4. Add a post-processing effect or tune the grade

**Tune the game's look (most common).**

1. Explore live: start the game, press **`` ` ``** or **F1** → *Post FX* folder (depth of field,
   bloom, grade, split toning) and *Lighting*.
2. Copy the values into `Game._tunePost` in [`src/demo/Game.js`](../../src/demo/Game.js) (the
   game's DOF / bloom / grade baseline). Day-palette changes go into `KEYFRAME_OVERRIDES` in
   [`src/demo/config.js`](../../src/demo/config.js) (on top of `DEFAULT_KEYFRAMES`).
3. Remember that `Weather.update` rewrites `grade.temperature` and `grade.saturation` every frame
   from `weather.tuning.gradeTemperature` / `gradeSaturation` (captured from `_tunePost`'s values
   when `Weather` is constructed) plus weather offsets and a night desaturation; and
   `lighting.settings.sunMul / ambientMul / fogMul / exposureMul / pointLightMul` from
   `weather.tuning`. Setting those live values directly is overwritten on the next frame. The
   per-weather offsets themselves are `WEATHER_PARAMS` in
   [`src/demo/WeatherLook.js`](../../src/demo/WeatherLook.js); the editor's 3D preview adds the
   same offsets to its own grade base (`EDIT_GRADE` in `Viewport3D.js`), so a change there shows in
   both.
4. Check dawn (6.5), midday (12.5), golden hour (17.2), dusk (18.9), night (22.5) and rain / snow
   in Emberfall **and** Starfall Vale; the look is the reference ([design/VISUAL_DESIGN.md](../design/VISUAL_DESIGN.md)).

**Add a grade parameter.** [`shaders/GradeShader.js`](../../src/engine/render/shaders/GradeShader.js)
(uniform + GLSL; the grade runs on tone-mapped sRGB values) → a default in `PostFX.settings.grade`
(an "extra", additive) → write it in `PostFX._updateGrade` → a slider in
[`src/demo/DebugControls.js`](../../src/demo/DebugControls.js) → `sandbox/postfx.html?gui`.

**Add a pass.** A shader module in `src/engine/render/shaders/` → a material via `makePostMaterial`
in [`PostFX.js`](../../src/engine/render/PostFX.js) → its render target in `_allocate` (sized from
the drawing buffer) → draw it in `render()` between the right stages inside
`timer.begin('<label>') … timer.end()` → add it to `warmup()` **drawing into the kind of target
it uses at runtime** (screen = `null` target, sRGB variant; render target = linear variant) →
free it in `dispose()` → every toggle must work live and `settings.enabled = false` must still
render → export the shader from [`src/engine/index.js`](../../src/engine/index.js) ("Advanced
building blocks") if others may reuse it.

**Gotchas.** Tone mapping happens once, in `OutputPass`; do not tone-map in your pass. Non-finite
values are scrubbed to black by the pipeline — a NaN in your shader shows as black pixels.
`renderer.info` resets per pass: read scene draw calls from `postfx.sceneInfo` / `state()`.

**Verify.** `npm run check -- --page=sandbox/postfx.html --out=postfx` plus the scripted checks
`sandbox/postfx.{actions,robust,flicker,nan,perf}.json`; the game at the five times of day;
`postfx.timingsMin` before/after (budget reference: DOF 1.2–1.5 ms, bloom 0.3 ms, output + grade
0.25 ms at 1600 × 900). Docs: [architecture/RENDER_PIPELINE.md](../architecture/RENDER_PIPELINE.md),
[modules/render.md](../architecture/modules/render.md), `MODULE_NOTES.md`.

---

## 5. Add a texture

| # | File | Symbol | What to do |
| --- | --- | --- | --- |
| 1 | [`src/engine/pixel/Textures.js`](../../src/engine/pixel/Textures.js) | a `genX(s, ctx)` painter | Paint colour with `s.set(x, y, color)`, height with `s.hf[i]` / `s.setH(x, y, h)`; use `ctx.seed` / `ctx.rng` and `hash2` for variation (never `Math.random`); return `{ normal: strength }`. Look at a similar texture first (e.g. `genBarrel`, `genCrate`). |
| 2 | same | `DEFS.x` | `{ px: [w, h], gen, normalScale?, emissive?, alpha?, wrap? }`. World size of one repeat = `px / 16` units (terrain tops use 64 × 64 px = 4 × 4 units so large fields don't repeat visibly). |
| 3 | same | `TEXTURE_NAMES` | Append the name (the contract list; additive). |
| 4 | consumers | legend `top` / `side` / `lip`, `b.box('x', …)` in a prop builder, `ROOF_TEXTURES` / `WALL_TEXTURES` in `ObjectCatalog.js` | UVs are world-space `pos / meta(name).units` — `MeshBuilder` and `TileMap` already do this. |

Prop-only textures that do not belong in the shared library go into `PropTextureSet`
([`world/props/PropTextures.js`](../../src/engine/world/props/PropTextures.js)), like birch bark
and the market produce.

**Gotchas.** Colour textures are sRGB, normal maps `NoColorSpace` (the library handles it).
Painting is lazy but `World.build` calls `textures.preload()` — all 46 textures take about
150–200 ms, so keep painters cheap. A new roof texture must be named `roof_*` to receive snow
(`World.build` matches merged materials named `lumina:roof*`), must be added to
`ROOF_TEXTURES` to be selectable, and needs a colour in **both** `ROOF_COLORS` tables — in
[`LevelMap.js`](../../src/engine/level/LevelMap.js) (minimap / world map) and in
[`Map2DView.js`](../../src/editor/map2d/Map2DView.js) (editor 2D map) — or both draw it in the
red-roof colour. Changing an existing painter changes every level that uses it (regression
check).

**Verify.** `npm run check -- --page=sandbox/textures.html --query=view=atlas --out=tex_atlas`
(and `window.__tex.check()` via an `eval` step), a diorama view
(`--query=view=diorama`, `view=diorama&night=1`), then the game. Docs:
[architecture/modules/pixel.md](../architecture/modules/pixel.md), `ARCHITECTURE.md` §4.3 name list.

---

## 6. Add a character preset or a creature

**Character preset (a new villager look).**

1. [`src/engine/pixel/CharacterSprites.js`](../../src/engine/pixel/CharacterSprites.js) →
   `CHARACTER_PRESETS.<name>`: a spec object (`skin`, `hair`, `hairStyle`, `outfit { top, bottom,
   accent, style, shirt }`, `cape`, `hat`, `hatColor`, `weapon`, `beard`, `gear { … }`, `eyes`,
   `build`, `female`, `blush`). Colours are `PALETTE` ramp names or hex.
2. [`src/engine/level/ObjectCatalog.js`](../../src/engine/level/ObjectCatalog.js) →
   `CHARACTER_PRESET_NAMES`: add the name. **The game only accepts names in this list**
   (`npcDef` in `Game.js` falls back to `villager`); the inspector's *Look* select follows.
3. Verify: `npm run check -- --page=sandbox/sprite_art.html --query="mode=focus&names=<name>,traveler&z=6" --out=art_focus`
   (read the PNG at 6× zoom: outline, 2–3 shades per material, readable silhouette in all four
   rows), then an NPC with the preset in the game at golden hour and at night.

**Creature (a new critter kind).** (A hostile creature for combat levels is an *enemy kind* with its
own sheet painter in `MonsterSprites.js` — [§19](#19-add-an-enemy-kind).)

1. `CREATURE_DEFS.<kind>` in `CharacterSprites.js`: `{ fw, fh, ox?, draw, idleFps, walkFps,
   runFps, colors }` and a `drawX(p, c, view, pose)` painter (`view` is `down` / `up` / `side`;
   the right-facing row is mirrored). Unknown kinds fall back to `cat` there.
2. `CRITTER_KINDS` in `ObjectCatalog.js` (the inspector *Kind* select; `critterStartPoints` falls
   back to `chicken` for unknown kinds).
3. `KINDS` in [`src/demo/Critters.js`](../../src/demo/Critters.js): `{ cls: Chicken | Cat | Bird |
   your class, speed, radius, sheet?, opts? }` (a new behaviour = a new `Critter` subclass).
   Unknown kinds become chickens in the game.
4. The editor preview's blob size per kind in `ActorPreview._createCritters`
   ([`viewport3d/ActorPreview.js`](../../src/editor/viewport3d/ActorPreview.js)).
5. Starfall coverage ("critter kinds") → place a group in the generator.
6. Verify: `sandbox/sprite_art.html?mode=creatures&z=6`, `sandbox/game_levels.html?case=everything`
   (iterates `CRITTER_KINDS`).

**Gotchas.** Sheets are painted on the CPU (3–5 ms each) and need a DOM; the game caches one
sheet per spec (`sheetCache` in `Game.init`). Frames are 32 × 32 px with the feet on row 30 — keep
the character inside the frame. Docs: [architecture/modules/pixel.md](../architecture/modules/pixel.md),
[specs/OBJECT_CATALOG.md](../specs/OBJECT_CATALOG.md).

---

## 7. Add an NPC action or behaviour

**Action** (what happens after talking — today `none`, `rest`, `shop`, `music`):

1. `NPC_ACTIONS` in [`ObjectCatalog.js`](../../src/engine/level/ObjectCatalog.js): `{ value, label }`
   (the inspector select shows the labels); extend the field's `help` text.
2. `levelConversation` in [`src/demo/dialogue.js`](../../src/demo/dialogue.js): an
   `ACTION_PROMPTS` entry (non-committal answer **first** — mashing confirm must never trigger
   the action) and the branch that runs it (`yes` = `choice >= firstYes`: any answer but the
   first, or the only answer of a designer's one-choice closing page). Put game-side
   effects in a `Game` method (like `restUntilMorning`) and reach it through `ctx.game`.
3. Any new object field the action needs (like `item` for `shop`): add to the `npc` `defaults` /
   `fields` — mind §0 on defaults.
4. Starfall coverage ("NPC actions") → give one villager the action in `people()`.

**Behaviour** (how an NPC moves — today `wander`, `post`, `perform`, `chase`):

1. `NPC_BEHAVIOURS` in `ObjectCatalog.js`.
2. `Npc.update` switch and a `_updateX(dt, …)` method in [`src/demo/Npc.js`](../../src/demo/Npc.js).
   Move with `this._walkTowards(…)` (TileMap collisions), keep the collider (`dynamic: true`) in
   sync (done at the end of `update`), use `this.rng` (seeded by the id). If it interacts with
   critters, see how `chase` gets `ctx.chickens` and how `Game.init` builds `_threats`.
3. Starfall coverage ("NPC behaviours") → one villager in `people()`.

**Hand-written conversations** (Emberfall's style): add an async function to `CONVERSATIONS` in
`dialogue.js` and its id to `NPC_SCRIPTS` in `ObjectCatalog.js`; a level NPC then sets
`script: '<id>'` (it overrides `dialogue`).

**Verify.** `sandbox/game_levels.html?case=stormnight` (rest / shop / music / script NPCs) or a
test level; drive the dialogue with `__game.talkTo(id)` (it places the player beside the NPC)
and `Space` / `ArrowDown` presses; check `state().inventory`, `state().music`. After a
conversation, `dialogOpen` stays true through the ~0.3 s close animation and a new talk by
`Space` is ignored for `TALK_COOLDOWN` (0.8 s) — wait before the next step.
Docs: [architecture/GAME.md](../architecture/GAME.md), [specs/OBJECT_CATALOG.md](../specs/OBJECT_CATALOG.md),
[user/LEVEL_EDITOR_GUIDE.md](../user/LEVEL_EDITOR_GUIDE.md).

---

## 8. Add an input action (game key)

1. `DEFAULT_BINDINGS` in [`src/engine/core/Input.js`](../../src/engine/core/Input.js):
   `myAction: ['KeyJ']` (`KeyboardEvent.code` values). The action names are typed from these
   tables (`ActionName`), so `input.actionPressed('myAction')` type-checks once the key exists and
   a misspelt name fails the check. Gamepad: `DEFAULT_PAD_BINDINGS` with a
   virtual code from `GAMEPAD_BUTTON_CODES` (free today: `GamepadLT`, `GamepadLS`, `GamepadHome`).
2. Handle it in `Game.update` ([`src/demo/Game.js`](../../src/demo/Game.js)), inside the
   shortcut block, with the same gating as its neighbours: only `playing`, not while the world map
   is open, usually not while `talking` (dialog open or busy) or in photo mode.
   `input.actionPressed('myAction')` is an edge that lasts until the end of the frame.
3. The HUD legend: `CONTROLS` in `Game.js`.
4. Docs: `ARCHITECTURE.md` §4.1 default-binding list (additive), `README.md` controls table,
   [specs/INPUT_AND_CONTROLS.md](../specs/INPUT_AND_CONTROLS.md),
   [user/PLAYING_THE_GAME.md](../user/PLAYING_THE_GAME.md), [user/shortcuts.html](../user/shortcuts.html).

**Combat actions** are different: they are **not** in `DEFAULT_BINDINGS`. `CombatSystem.load()`
registers them at runtime with `input.addBindings(…)` from
[`src/demo/combat/bindings.js`](../../src/demo/combat/bindings.js) (plus `enableMouseButtons`), so
peaceful levels never bind J / K / L / U / I / O / C / 1–4 or the mouse buttons (KNOWN_ISSUES
COMBAT-01); `CombatInput` buffers their edges for 10 frames. The pad legend and keycaps are
`COMBAT_CONTROLS` / `COMBAT_PAD_CONTROLS` (COMBAT.md §5). Actions added at runtime are typed by
augmenting `ExtraActions` ([`core/types.d.ts`](../../src/engine/core/types.d.ts)) from the module
that adds them — [`combat/types.d.ts`](../../src/demo/combat/types.d.ts) declares the combat
bindings' keys that way, so a new combat binding is typed with no other edit.

**Gotchas.** Taken keys: W A S D, arrows, Shift, Space, Enter, F, Esc, Backspace, Q, E, Z, X, `=`,
`-`, `` ` ``, F1, T, P, H, R, M, N, Tab (on combat levels also J, K, L, U, I, O, C, 1–4 and the
mouse buttons). `Input` calls `preventDefault` for bound keys (never with
Ctrl / Meta / Alt held, never while a text field has focus) — do not bind keys the browser needs.
The `CameraRig` reads `camLeft` / `camRight` / `zoomIn` / `zoomOut`; the `DialogBox` reads
`confirm`, `cancel`, `up`, `down`. The editor's 3D view has its own `Engine` whose input does not
listen to the page, so game bindings never reach the editor. Two harness `press` steps in the
same frame count as one press.

**Verify.** A harness script: `{ "press": "KeyJ" }`, then `{ "eval": "JSON.stringify(window.__game.state())" }`
and a screenshot.

---

## 9. Add a UI component

1. A class in `src/engine/ui/X.js` with `constructor(parent)` that builds its DOM under
   `parent` (the `#lumina-ui` root) and has `dispose()`; optional `update(dt, …)`.
2. Styles in [`src/engine/ui/ui.css`](../../src/engine/ui/ui.css): class prefix `lu-` (BEM-like:
   `.lu-x`, `.lu-x__part`, `.lu-x--state`), the design tokens on `.lu-root` (`--lu-gold`
   `#c9a45c`, `--lu-panel-*` navy gradients, `--lu-serif` Crimson Pro, `--lu-display` Cinzel,
   `--lu-pixel` Pixelify Sans, `--lu-fs*` clamp() sizes), a z-index slot from the layering comment
   at the top of the file (prompt 1 · hud 2 · banner 3 · dialog 4 · toasts 5 · title 6 · world map
   7 · fader 8 · debug 9), `prefers-reduced-motion` for animations. The root ignores the pointer;
   enable `pointer-events` only on interactive children.
3. [`src/engine/ui/UI.js`](../../src/engine/ui/UI.js): construct it in `UI`, call its `update` from
   `UI.update` if needed, dispose it in `UI.dispose`, add it to the re-export line; add it to
   [`src/engine/index.js`](../../src/engine/index.js).
4. Game wiring in `Game.js` (the UI binds **no keys**; the game maps actions to `ui.*` calls).
   Photo mode hides the root (`lu-root--hidden`); `lu-root--dialog` / `lu-root--title` hide or tuck
   HUD parts while talking / on the title screen — decide how your component behaves.

**Verify.** [`sandbox/ui.html`](../../sandbox/ui.html) (+ `sandbox/ui.actions.json`), then the game
at `--width=1280 --height=720`, the default 1600 × 900 and `--width=2560 --height=1440`; zero
console errors. Docs: [architecture/modules/ui.md](../architecture/modules/ui.md),
[design/VISUAL_DESIGN.md](../design/VISUAL_DESIGN.md).

---

## 10. Add an editor tool

| # | File | Symbol | What to do |
| --- | --- | --- | --- |
| 1 | `src/editor/tools/XTool.js` | `export const XTool = { … }` | Implement the Tool interface documented in [`tools/index.js`](../../src/editor/tools/index.js): `id`, `label`, `shortcut` (one key), `icon`, `help` (status bar; `"Name — text"`), `cursor`, `pointerDown/Move/Up(ev, state)`, `preview(state)`, optional `activate`, `deactivate`, `keyDown(e, state) → handled`, `cursorFor`. Type it: `/** @import { Tool, ToolPreview } from './index.js' */` and `/** @type {Tool} */` above the object (a tool with extra members other code calls declares its own type, like the Place tool's `RotatableTool`); then every member's parameters are typed and a misspelt member or `PointerEv` field fails the check. |
| 2 | [`src/editor/tools/index.js`](../../src/editor/tools/index.js) | `TOOLS` | Register it. This alone enables its keyboard shortcut (`EditorApp._onKeyDown` matches `tool.shortcut`) and its row in *Help › Keyboard shortcuts*. |
| 3 | [`src/editor/ui/Toolbar.js`](../../src/editor/ui/Toolbar.js) | `GROUPS` | Add the id — **tools missing from `GROUPS` get no toolbar button.** |
| 4 | [`src/editor/icons.js`](../../src/editor/icons.js) | `ICONS` | A 20 × 20 inline-SVG icon in the same stroke style. |
| 5 | [`src/editor/ui/ToolOptions.js`](../../src/editor/ui/ToolOptions.js) | switch over the tool id | The options panel (tile palette, brush size, object palette… reuse the existing sections). |

Rules: views are dumb — they build a `PointerEv` (`i, j, x, z, y, button, shift, ctrl, alt, view,
hitObjectId, hitSpawn, pickRadius?`, on `pointerUp` `cancelled?`; `button` is −1 on moves), forward
**left-button** strokes and hover moves to the tool and draw its `ToolPreview` (`cells`,
`cellColor`, `ghost`, `line`, `rect`, `label`, `highlight`, `spawn`; LEVEL_EDITOR.md §7). All edits
go through `EditorState`: wrap a stroke in `state.begin(label)` … `state.commit()` so one stroke is
one undo step; on a `pointerUp` with `ev.cancelled` (the stroke was interrupted, not released)
still commit what `pointerDown` / `pointerMove` applied, but make no change on release (as
Rectangle and Place do; [EDITOR.md §5.3](../architecture/EDITOR.md#53-a-strokes-lifecycle), checked
by `sandbox/editor_shell.cancel.json`); call `state.emit('preview')` when the preview changes.
`EditorState`'s events are typed by name: a new event needs an entry in `EditorEvents`
([`src/editor/types.d.ts`](../../src/editor/types.d.ts)), or `emit` / `on` with it fails the check.
The app cancels a stroke on Esc (`state.cancel()`, then `deactivate` + `activate`), so keep stroke
state resettable. `shortcut` is compared with `KeyboardEvent.key` (case-insensitive), after app
commands and the active tool's `keyDown` had their chance. Taken single keys: the tool keys V B G U
H T O P I X; the app's F, 1 / 2 / 3, Home, Delete, `[` `]`, `?`, Escape; R / Shift+R (rotate ±15°,
handled by the Select, Place and Spawn tools' `keyDown`); arrows (nudge); Space (pan while held); in
the 3D view Q / E (rotate the game camera) and W A S D while the right button is held (fly).

**Verify.** A scripted check in the style of `sandbox/editor_shell.tools.json`:

```json
[
  { "eval": "import('/sandbox/editor_shell.helpers.js').then((m) => m.install())" },
  { "eval": "(() => { T.E.state.setView({ layout: '2d' }); T.E.state.setTool('x'); return T.E.state.toolId; })()" },
  { "eval": "T.drag([[6, 6], [10, 6], [10, 9]]).then((n) => JSON.stringify({ objects: n, undo: T.E.state.canUndo }))" },
  { "shot": "after_stroke" }
]
```

`npm run check -- --page=editor.html --query=new --out=ed_tool --fps=0 --script=<that file>`.
`T.drag` dispatches synthetic pointer events in world coordinates; for real mouse input use the
harness `drag` step with screen points from `T.E.view2d.worldToScreen(x, z)`. Then run
`sandbox/editor_perf.json` if the tool touches terrain or many objects (strokes must stay at
display rate and end exact). Docs: [architecture/EDITOR.md](../architecture/EDITOR.md),
[user/LEVEL_EDITOR_GUIDE.md](../user/LEVEL_EDITOR_GUIDE.md), `LEVEL_EDITOR.md` §7.

---

## 11. Add a level field

The pattern of every optional field added so far (`environment.minimap`, `fogScale`, `forest`,
`water.glint`, …):

1. **Format.** Make it optional — **absent means "the automatic choice"**. Type it as an optional
   member where the level types declare its parent: `LevelEnvironment` (or the interface of its
   sub-object) / `LevelWater` in [`level/types.d.ts`](../../src/engine/level/types.d.ts), and an
   object field without a catalog default in `ObjectExtras` there — readers of an undeclared
   field fail the type check. Do not add it to
   `DEFAULT_ENVIRONMENT` / `DEFAULT_WATER` / an object's `defaults` unless every shipped level is
   re-saved in the same change (§0). Unknown top-level keys, `environment` and `water` keys and
   extra `spawn` keys already survive load → save, so older engines keep newer files intact.
2. **Positions.** If it stores absolute world coordinates, extend `shiftLevelContent` in
   [`LevelFormat.js`](../../src/engine/level/LevelFormat.js) (used by resize) — or, for object
   fields, store offsets relative to the object (like `talkOffset`, `area`, `spotOffsets`) so they
   follow moves.
3. **Consumer.** Read it with sanitising where it is used — `World` (build), `Game` (camera,
   titles, regions), `Weather` (fog), `ObjectBuilder` (props) — e.g. with the local
   `finite(v, default)` / `isRect(r)` helpers; a hand-edited file must never produce NaN.
4. **Editor.** A control in `levelSettingsDialog` ([`src/editor/ui/dialogs.js`](../../src/editor/ui/dialogs.js))
   that writes the key only when the user sets it (see how `minimap` and `glint` avoid writing the
   default into files that never had it); if it changes what the 3D preview shows, make the
   preview rebuild on it (e.g. `SceneryPreview.envKey`).
5. **Validation.** Starfall's `validate()` if the generator uses it; `validateLevel` only for hard
   errors that make a level unplayable.
6. **Docs.** `LEVEL_EDITOR.md` §1 "Optional environment fields" or §2 "Optional object fields"
   (binding), [specs/LEVEL_FORMAT.md](../specs/LEVEL_FORMAT.md).

**Verify.** Round trip of every shipped level (unchanged bytes), a level **with** the field
(`window.__lumina.playLocal(level)` from an eval, or a generator), the editor: Level settings ›
Apply with no changes must leave the file byte-identical.

---

## 12. Create a new level with a generator script

Model: [`tools/make-sample-hamlet.mjs`](../../tools/make-sample-hamlet.mjs) (small, readable);
for a big level [`tools/make-starfall-vale.mjs`](../../tools/make-starfall-vale.mjs) (terrain
passes, placements through a collision-aware `add()`, scatter with exclusion zones, validation).

1. `createEmptyLevel({ name, width, depth, fill, level, border })` (sizes 8–128; `border` = width
   of the blocked `T` forest ring).
2. Terrain with `setTile(level, i, j, ch)` / `setHeightLevel(level, i, j, lvl)`; objects with
   `addObject(level, type, x, z, overrides)` (point objects at tile centres `i + 0.5`); readable
   ids for villagers (`level.objects.find(...).id = 'mira'`) so `__game.talkTo('mira')` works;
   `level.spawn = { x, z, facing }`; `level.environment = { ...level.environment, timeOfDay: … }`.
3. Randomness only from `RNG` / `hash2` / `fbm2` of [`src/engine/utils/math.js`](../../src/engine/utils/math.js).
   Generators are type-checked too (the tools program of `npm run typecheck`): import the level
   types (`/** @import { Level, LevelObject } from '../src/engine/level/types.js' */`) and type
   a raw level literal and your option bags, so a wrongly shaped spawn, environment key or
   object field fails the check instead of producing a broken file.
4. `normalizeLevel` → require **zero warnings**, `validateLevel` → zero errors, then
   `fs.writeFileSync('public/levels/<name>.json', serializeLevel(level))`; exit non-zero otherwise.
   For anything bigger than a hamlet add real checks (reachability from the spawn with the game's
   movement rules, bridges walkable end to end — the first arched plank is
   `0.5 + arch · sin(π / 2n)` above a bank one level down, which on longer arched bridges exceeds
   the 0.55 step (0.558 at one Starfall bridge) — stairs rising
   toward the higher side, nothing hidden behind roofs from the north-looking camera): call
   `checkLevel` of [`tools/lib/levelcheck.mjs`](../../tools/lib/levelcheck.mjs) with your routes and
   `strict: true`, as [`tools/make-gildhaven.mjs`](../../tools/make-gildhaven.mjs) does. Starfall's
   own `validate()` is the older reference.
5. Run `node tools/make-<name>.mjs` (a level made in the editor instead: `npm run level:check -- <name>`); play `index.html?level=<name>`; open
   `editor.html?open=<name>` and save unchanged → no diff; run it twice → identical output.
6. Levels wider or deeper than 64 tiles take the big-level path automatically; measure draw calls
   at the busiest spots (budget ~300 incl. shadows) and load time (`window.__lumina.loadMs`).
7. Docs: a page in [design/levels/](../design/levels/), the "Where levels live" paragraph of
   `README.md` (Level editor section) and the level table in
   [AGENT_ONBOARDING.md](AGENT_ONBOARDING.md) §1.

Minimal skeleton (the API calls are the ones `make-sample-hamlet.mjs` uses):

```js
import fs from 'node:fs';
import { createEmptyLevel, setTile, addObject, normalizeLevel, validateLevel, serializeLevel } from '../src/engine/level/LevelFormat.js';

const level = createEmptyLevel({ name: 'Mossbrook', width: 24, depth: 18, fill: 'g', level: 2, border: 2 });
for (let i = 2; i < 22; i++) setTile(level, i, 9, '.');                    // a dirt road
addObject(level, 'house', 8, 6, { rotation: 0, text: ['Nobody is home.'] });
addObject(level, 'lamppost', 11.5, 8.5);
addObject(level, 'npc', 14.5, 10.5, { name: 'Ada', dialogue: ['Welcome to Mossbrook!'] });
level.spawn = { x: 12.5, z: 12.5, facing: 'up' };

const { level: out, warnings } = normalizeLevel(level);
const errors = validateLevel(out);
if (warnings.length || errors.length) { console.error([...warnings, ...errors].join('\n')); process.exit(1); }
fs.writeFileSync('public/levels/mossbrook.json', serializeLevel(out));
```

---

## 13. Change an existing level

| Level | How to change it | Never |
| --- | --- | --- |
| `emberfall.json` | Edit the JSON (one object per line) or open `editor.html?open=emberfall` and save. It is the single source of truth; the reference look — compare before/after. | Re-run `tools/convert-emberfall.mjs`: with the default `--rev=HEAD` it aborts (the legacy constants are gone); with `--rev=8e36884` it rebuilds the same data but in a different object key order — history only. |
| `starfall-vale.json` | Edit `tools/make-starfall-vale.mjs`, run `node tools/make-starfall-vale.mjs` (`--ascii` prints the tile map, `--quiet` silences the report, `--out=` writes elsewhere, `--force` writes a failing level for inspection and still exits 1). It reproduces the committed file byte for byte today. | Hand-edit the JSON. |
| `sample-hamlet.json` | Edit `tools/make-sample-hamlet.mjs`, run `node tools/make-sample-hamlet.mjs` (writes `public/levels/sample-hamlet.json`; `--out=<path>` writes elsewhere, relative to the repository root; `--check` writes nothing and exits 1 unless the file matches byte for byte). It is deterministic and pins each object's key order itself, so an unchanged script reproduces the committed file exactly. | Hand-edit the JSON. |
| `brightwater-crossing.json` | The editor (`editor.html?open=brightwater-crossing`) or careful JSON edits. | — |
| `gildhaven.json` | Edit `tools/make-gildhaven.mjs` (helpers in `tools/lib/levelgen.mjs`), run `node tools/make-gildhaven.mjs` (`--check`, `--out=`, `--force`, `--ascii`, `--quiet` as for Cinderwatch). Its `validate()` refuses to write a level with a hidden villager, door or sign, a blocked street, a long detour on one of its 16 routes or more than 3 % of the path tiles behind roofs; then run `sandbox/gildhaven.tour.json` (draw calls ≤ 300 at 26 views, no program compiled after load). New row houses: depth ≤ 3.5, one storey ([its page](../design/levels/gildhaven.md#why-the-streets-are-where-they-are)). | Hand-edit the JSON. |
| `cinderwatch-pass.json` | Edit `tools/make-cinderwatch-pass.mjs` (helpers in `tools/lib/levelgen.mjs`), run `node tools/make-cinderwatch-pass.mjs` (`--check` compares without writing, `--out=`, `--force`, `--ascii`, `--quiet`). It validates 20 rules (the 18 of COMBAT.md §15.5 plus rule 19, zone separation, and rule 20, chase and group-wake margins; rule 13 fails a path tile where a roof hides a walker above the knee) and refuses to write a failing level; it reproduces the committed file byte for byte. Then run the combat scripts on it (`combat.fight.cw.json`, `combat.boss.cw.json`, `combat.programs.json`, `combat.perf.json`, `cinderwatch.tour.json`, `combat.play.json`). | Hand-edit the JSON. |

For every shipped level: keep its `name` — the terrain tint and grass variation are seeded from it
(`TileMap` default seed `hashString(level.name)`), so a rename changes the look.

To re-save hand-made levels through the current format (after a new default / tile type), the
equivalent of "open in the editor, Ctrl+S":

```bash
node --input-type=module -e "
import fs from 'node:fs';
import { parseLevel, serializeLevel } from './src/engine/level/LevelFormat.js';
for (const f of ['emberfall', 'brightwater-crossing']) {
  const p = 'public/levels/' + f + '.json';
  fs.writeFileSync(p, serializeLevel(parseLevel(fs.readFileSync(p, 'utf8')).level));
}"
git diff --stat public/levels
```

---

## 14. Profile and fix a performance problem

1. **Reproduce at the reference setup:** 1600 × 900 (harness default), render scale locked —
   `__game.game.resolution.enabled = false; __game.engine.renderScale = 1` (the governor would
   otherwise lower the scale under load and hide or cause the problem).
2. **Measure the right things** (the headless fps is capped at ~57–60 and says nothing):

   | Metric | How |
   | --- | --- |
   | GPU per stage | `__game.postfx.enableTimings(true)` (resets the minima), wait ≥ 2 s, read `__game.postfx.timingsMin` → `{ scene, dof, bloom, output }` ms; `timings` = smoothed averages |
   | Scene draw calls / triangles | `__game.state().drawCalls`, `.triangles` (scene + shadow pass; the debug overlay also counts ~20 post passes) |
   | Shader programs | `__game.engine.renderer.info.programs.length` — must not grow during play |
   | CPU render submission | time between `engine.events` `'beforeRender'` and `'afterRender'` (snippet in the appendix) |
   | Loading | `window.__lumina.loadMs` (navigation → first gameplay frame), `__game.game.loadStats`, `__game.world.stats.phases` |
   | Hitches | an rAF gap recorder (frames > 45 ms) around the action; teleport with `__game.teleport(x, z)` |
   | Editor | `__editor.view3d.stats` (`drawCalls`, `triangles`, `cpuMs`, `pendingChunks`…), `sandbox/editor_perf.json` / `editor_perf.stress.json` (p95 frame times, exactness check) |
3. **Compare with the budgets and known numbers** ([architecture/PERFORMANCE.md](../architecture/PERFORMANCE.md)):
   Emberfall (start spot) ≈ 230 draw calls, 0.34 M triangles, 57 programs, best-case GPU scene
   ≈ 3.7–4.1 ms, DOF ≈ 1.2–1.3 ms, bloom ≈ 0.3 ms, output + grade ≈ 0.25 ms; Starfall 135–283
   draw calls over 26 measured spots (≤ 283 at the default zoom; ~300 only fully zoomed out and
   turned over Hearthwick Square), 59 programs.
4. **Levers that exist** (use them before inventing new ones): `PropFactory.mergeStatic` and
   `Scenery.mergeTrees` (batching; `maxTriangles` / `maxExtent` split on big levels),
   `SpatialSplit.cullByBox` (static batches only — the box is cached),
   `ShadowCasters.buildShadowCasters` / `makeShadowOnly` (shadow-only proxies),
   `LightingSystem.setShadowDepthRange`, `BlobBatch`, `BIG_LEVEL_BATCHING.particleCull`, the far-actor
   throttle in `Game.update`, `LightPool`, the load-time warm-up, the editor's job queue and
   batching (`ObjectPreview`, `TerrainPreview`).
5. **Keep small levels identical:** put big-level optimisations behind `World.isBigLevel`, then
   prove Emberfall's fingerprint unchanged ([§16](#16-regression-check-before-you-finish)).
6. Record before → after numbers (same machine state, interleaved runs; the GPU is shared) in
   [architecture/PERFORMANCE.md](../architecture/PERFORMANCE.md) and `README.md` if they change.

---

## 15. Investigate a visual bug with the harness

1. **Make it deterministic.** Freeze the clock and set everything explicitly in one `eval`:

   ```js
   (async () => {
     const g = window.__game;
     g.lighting.timeSpeed = 0;                              // stop the clock
     g.setTime(21.5);                                       // instant (T glides; setTime does not)
     g.weather.setWeather('rain', { instant: true });       // __game.setWeather blends over seconds
     g.teleport(20, 20.3);                                  // snaps to the nearest standable spot
     g.rig.setAngles(-20); g.rig.snap();                    // yaw in degrees (pitch is set by the game)
     g.photo(true);                                         // hide the UI
     await new Promise((r) => setTimeout(r, 1500));
     return JSON.stringify(g.state().camera);
   })()
   ```

   then `{ "shot": "bug_before" }`. Villagers, critters, particles and wind still move — compare
   regions, not pixels.
2. **Isolate the stage** by toggling live settings between shots:
   `postfx.settings.enabled = false` (raw scene, ACES by the renderer), `postfx.settings.dof.debug = true`
   (circle-of-confusion view: amber near, blue far, green in focus, magenta near spill),
   `dof.enabled`, `bloom.enabled`, `grade.enabled`, `lighting.settings.shadows = false`,
   `world.lightPool.activeCount`, and for god rays / dust / fireflies / smoke the weather tuning
   (`weather.tuning.godRays = 0`, `.dust`, `.fireflies`, `.smoke` — `Weather.update` rewrites
   `godRays.intensity` and the emitter intensities every frame).
3. **Isolate the module** in its sandbox (`sandbox/terrain.html?view=cliffs`, `props.html?night=1`,
   `lighting.html?t=22.5`, `postfx.html?gui`, `sprite_art.html?mode=focus…`). If the sandbox is
   right and the game is wrong, the problem is integration (wiring, tuning, frame order, warm-up).
4. **Common causes:** a colour texture without `SRGBColorSpace` or a data texture with it; tone
   mapping twice; a custom shader without fog chunks (unfogged in the distance) or not referencing
   `globalUniforms` (frozen wind / time); an opaque material that writes no depth (the sky's
   early-Z draws over it); a sprite under a rotated parent; a new material compiled mid-game
   (first-frame hitch, see rule 2); a transparent effect taking the DOF blur of what is behind it.
5. **Compare** with the reference screenshots in [`docs/assets/screenshots/`](../assets/screenshots/)
   and fix the cause, then re-shoot the same view.

---

## 16. Regression check before you finish

For any change that can affect building or rendering, fingerprint the small shipped levels
before and after (run once on the old code — e.g. `git stash`, or record it before editing — and
once on the new):

```json
[
  { "eval": "(() => { const g = window.__game, W = g.world, s = g.state(); return JSON.stringify({ drawCalls: s.drawCalls, triangles: s.triangles, lights: s.pointLights, programs: g.engine.renderer.info.programs.length, stats: { ...W.stats, buildMs: undefined, phases: undefined }, colliders: W.tileMap.colliders.length }); })()" },
  { "eval": "(async () => { const g = window.__game; g.lighting.timeSpeed = 0; g.setTime(17.2); g.rig.setAngles(0); g.rig.snap(); g.photo(true); await new Promise((r) => setTimeout(r, 1500)); return 'ok'; })()" },
  { "shot": "golden" }
]
```

```bash
npm run check -- --page=index.html --query=autostart=1 --out=reg_emberfall --wait=6000 --fps=0 --script=<file>
npm run check -- --page=index.html --query="level=sample-hamlet&autostart=1" --out=reg_hamlet --wait=6000 --fps=0 --script=<file>
npm run check -- --page=index.html --query="level=brightwater-crossing&autostart=1" --out=reg_bw --wait=6000 --fps=0 --script=<file>
npm run check -- --page=index.html --query="level=starfall-vale&autostart=1" --out=reg_sv --wait=9000 --fps=0 --script=<file>
```

Expected today (Emberfall): `drawCalls` ≈ 229–231, `triangles` ≈ 336 600, `lights` 12,
`programs` 57, `stats.lightDescriptors` 12, `lightsPooled` false, `batching` false. Draw calls can
wobble by a few with villager positions; everything else should match exactly. The other levels
(measured the same way): Willowmere ≈ 165 calls, 6 lights, 54 programs; Brightwater ≈ 210 calls,
10 lights, 57 programs; Starfall ≈ 176 calls at the spawn, 12 pooled lights for 95 descriptors,
59 programs, `batching` true; Gildhaven ≈ 167 calls / 0.67 M triangles at the spawn, 12 pooled
lights for 86 descriptors, 59 programs at load and after its tour, `batching` true. Cinderwatch Pass (the combat level, recorded, not frozen): ≈ 163–166
calls at the spawn (≈ 164 / 611 890 triangles after the known-issues pass of 2026-09-28; foliage
counts wobble between runs), 12 static lights for 12 descriptors, 63 programs at load and after a
full fight, `batching` true (96 × 120), 277 objects. If the change
touches combat or shared engine code, also run `sandbox/combat.peaceful.json` (Emberfall and
Starfall stay combat-free) and the combat scripts of
[TESTING_AND_VERIFICATION §8.2](../development/TESTING_AND_VERIFICATION.md#82-scripted-suites). Then the level
round trip and generator diffs ([AGENT_ONBOARDING.md §5](AGENT_ONBOARDING.md#5-the-standard-verification-loop)),
`npm run typecheck`, `npm run build`, and the editor if you touched shared code
(`npm run check -- --page=editor.html --query=open=emberfall --out=reg_ed --fps=0`).

---

## 17. Add a sound effect

1. [`src/engine/audio/AudioSystem.js`](../../src/engine/audio/AudioSystem.js): add the name to
   `SFX_NAMES`, a minimum re-trigger interval to `SFX_MIN_INTERVAL`, a `case` in `playSfx` and a
   `_sfxX(t, vol, pitch, pan)` synthesiser (WebAudio nodes scheduled at `t`; no audio files).
   Unknown names warn once and return `false` at run time; the type check rejects them before
   that (`playSfx`, `ctx.sfx` and `sfxAt` take an `SfxName`, the union of both lists). A **combat**
   sound goes into `COMBAT_SFX_NAMES` instead (played only on combat levels; `SFX_NAMES` must stay
   unchanged, COMBAT.md §2).
2. Call it: `audio.playSfx('x', { volume, pitch })` from the game, or set a well's `sfx` field.
3. Verify with `sandbox/core.html` (sfx buttons; `window.__core.analyzeAudio` renders offline and
   draws a spectrogram) — headless Chrome has no audible output, so check levels and NaNs, and ask
   a human to listen. Docs: [architecture/modules/audio.md](../architecture/modules/audio.md).
4. A **combat** sound also goes into the `GAME_VOL` (its in-game call volume) and `ROLE` (its
   loudness window: feedback, action, big moment, loot …) tables of
   [`sandbox/combat_audio.js`](../../sandbox/combat_audio.js); then run the QA page — it measures
   true peak, loudness, truncation clicks, gain steps, leaks, harshness (2–6 kHz) and sub-bass
   against the other sounds, and its `identity()` proves the peaceful audio unchanged:

   ```bash
   npm run check -- --page=sandbox/combat_audio.html --query= --out=caudio --fps=0 --wait=1000 --script=sandbox/combat_audio.actions.json
   ```

   (`__caudio.results.allOk`, 12 checks, 35–80 s of analysis.) Listen to it on the page (▶).

---

## 18. Upgrade three.js or another dependency

Lumina is written against **three r186** (`"three": "^0.186.1"` in [`package.json`](../../package.json);
a caret on a 0.x version only accepts 0.186.x patches, so moving to r187+ means editing the range).
Most of the engine talks to three's public API, but a few places depend on its internals — and
several of them **fail silently** when three changes: the effect just disappears, nothing throws.

1. **Read three's migration notes** for every release you skip, looking for: removed or renamed
   shader chunks, shadow-map types, colour-management defaults, `WebGLRenderTarget` / MSAA
   options, `renderer.compileAsync`, `renderer.info` semantics, and the addons below.
2. **Shader patches.** Lumina patches built-in materials in `onBeforeCompile` by replacing
   `#include <chunk>` lines (table in [RENDER_PIPELINE.md §4](../architecture/RENDER_PIPELINE.md#4-materials-and-shader-patches)):
   `Sprite3D`, `Foliage`, `props/Wind.js`, `TileMap._patchMaterial`, `demo/SnowCover.js`,
   `demo/Player.js`, `BlobBatch`. The patched chunks include `common`, `begin_vertex`,
   `beginnormal_vertex`, `project_vertex`, `worldpos_vertex`, `shadowmap_vertex`,
   `shadowmap_pars_vertex`, `alphatest_fragment`, `emissivemap_fragment`, `normal_fragment_maps`,
   `lights_lambert_pars_fragment` and `lights_fragment_maps`. A `String.replace` whose search text
   no longer exists is a **silent no-op**, and so are the two chunk-text rewrites in
   [`props/Wind.js`](../../src/engine/world/props/Wind.js) (`FOLIAGE_NORMAL_BEGIN`,
   `FOLIAGE_LAMBERT`) and the global `THREE.ShaderChunk.fog_vertex` replacement in
   [`demo/AtmosphereFog.js`](../../src/demo/AtmosphereFog.js). For each patch, check that the
   chunk still exists and still contains the text being replaced (`grep -rn "#include <" src` lists
   them; print `THREE.ShaderChunk.<name>` in a sandbox).
3. **Addons** imported from `three/addons/`: `postprocessing/Pass.js` (`FullScreenQuad`),
   `postprocessing/OutputPass.js`, `postprocessing/UnrealBloomPass.js` (all in `PostFX`),
   `utils/BufferGeometryUtils.js` (prop merging, batching), and `lines/LineSegments2.js`,
   `LineMaterial.js`, `LineSegmentsGeometry.js` (the editor's gizmos). Check their constructor
   signatures and uniforms.
4. **Renderer settings with a history of change:** the shadow-map type (`PCFSoftShadowMap` was
   removed for WebGL; `Engine` and `LightingSystem` map it to `PCFShadowMap`), tone mapping
   (`renderer.toneMapping` is ACES, but three applies it only when drawing to the canvas: the HDR
   scene target stays linear and `OutputPass` tone-maps once — if a release changes that rule the
   image is tone-mapped twice), `outputColorSpace`, and `renderer.info` (`DebugStats` turns
   `autoReset` off).
5. **Program caching.** Patched materials share programs through a constant
   `customProgramCacheKey`; the warm-up relies on `renderer.compileAsync(scene, camera)` with
   `postfx.sceneTarget` bound (`Game._compileScene`). If three changes how programs are keyed
   (render target, colour space, defines), shaders start compiling during play again.
6. **Verify** — a dependency upgrade is a change to every module:
   - every sandbox page and its action scripts (`sandbox/*.actions.json`), screenshots reviewed;
   - the Emberfall fingerprint and the **program count** (57 after load, unchanged after T and R)
     — [§16](#16-regression-check-before-you-finish);
   - look at dawn, midday, golden hour, dusk, night, rain and snow; compare with the reference
     shots in [`docs/assets/screenshots/`](../assets/screenshots/): look for sprites that went
     black when backlit (sprite patch lost), trees that stopped swaying (wind), terrain without
     wall bounce or with tiled grass (TileMap), fog that starts at the camera (fog-start patch);
   - Starfall Vale draw calls and load time, the editor suites (`editor_shell.*`,
     `editor3d.*`, `editor_perf.json`) and `npm run build`.
7. The same approach applies to **Vite** (the level API plugin uses `configureServer` /
   `configResolved` and moves its origin guard to the front of `server.middlewares.stack` — after
   an upgrade, check that it still runs first, that a cross-origin request still gets 403 and that
   `server.cors: false` / `preview.cors: false` in `vite.config.js` still keep
   `Access-Control-Allow-Origin` off every response (e.g. `GET /src/main.js` with
   `Origin: http://localhost:5999`), see [LEVEL_STORAGE_API §5.3](../specs/LEVEL_STORAGE_API.md#53-origin-check);
   the harness uses `createServer`), **puppeteer-core** (the harness's
   `launch`, `mouse`, `keyboard` and `targetcreated` usage in [`tools/check.mjs`](../../tools/check.mjs)),
   **lil-gui** (the debug panel's theme overrides in `ui.css`) and the **@fontsource** packages
   (imported as CSS files by the UI and the editor).
8. **Types.** Move `@types/three` together with `three` (both 0.186 today; a mismatch reports
   errors that are not the code's fault, or hides real ones), `@types/node` with the Node major
   version, and run `npm run typecheck`: renamed or removed API members show up as errors at
   every use (puppeteer 25's `clickCount` → `count` would have). Re-read the local casts over
   three.js internals and `@types/three` gaps — `OutputPass3` and `highPassUniforms` in
   `PostFX.js`, `ShaderQuad` (`FullScreenQuad._mesh`) in `viewport3d/Outline.js`,
   `MaterialProperties` (`renderer.properties`) in the editor's viewport types — and the
   `@ts-expect-error` in `tools/check.mjs` (`headless: 'new'`); the check cannot see whether
   they still hold (KNOWN_ISSUES TC-05).
9. Record the new version and anything that had to change in
   [DECISIONS.md](../history/DECISIONS.md) and [KNOWN_ISSUES.md](KNOWN_ISSUES.md), and update the
   version everywhere the docs name it (`grep -rn "r186" docs README.md CLAUDE.md ARCHITECTURE.md`).

---

## 19. Add an enemy kind

A new hostile creature for combat levels (e.g. a spider). The binding rules are
[COMBAT.md](../contracts/COMBAT.md) §7 (roster, telegraph grammar, state machine, tokens, height
model), §9.3 (the `Enemy` interface), §10.3 (enemy sheets) and §15.6 (coverage). Read the brain
of the closest existing kind first — `slime.js` (hopper), `goblin.js` (melee flanker),
`archer.js` (ranged), `bat.js` (flier), `boar.js` (charger).

| # | File | Symbol | What to do |
| --- | --- | --- | --- |
| 1 | [`src/engine/level/ObjectCatalog.js`](../../src/engine/level/ObjectCatalog.js) | `ENEMY_KINDS`, `ENEMY_INFO` | **Append** the kind (never reorder — the inspector lists them in this order) and its node-safe traits `{ label, flier, boss, passive, humanoid }`. The `enemy` type's *Kind* select, the editor and both generators read these. `ENEMY_KINDS` is a plain list: the type check works from the `EnemyKind` union (step 2), so keep the two in step. |
| 2 | [`src/demo/combat/defs.js`](../../src/demo/combat/defs.js) | `ENEMY_DEFS[kind]` | Every field the other kinds have: `name, hp, atk, def, poise, mass, speed, aggro, leash, radius` (hurt), `moveRadius, body [y0, y1]` (the projectile height band, §7.1), `xp, gold [min, max], drops { heart, mana, draught }, token { type, cost }, flier, hover, passive, boss, labelY` (where bars and numbers sit). `scaledDef` scales it per level and elite — do not scale elsewhere. First add the kind to the `EnemyKind` union at the top of `defs.js`: the type check then requires its `ENEMY_DEFS` entry (`Record<EnemyKind, EnemyDef>`) and its brain in `BRAINS` (step 4). A new field goes into the `EnemyDef` typedef there (JSDoc, so the generator's Node program stays free of the combat code). |
| 3 | [`src/engine/pixel/MonsterSprites.js`](../../src/engine/pixel/MonsterSprites.js) | `ENEMY_SHEET_KINDS`, `KINDS[kind]` | A monster: frame size `fw × fh`, `columns` (at least `COMMON`: `idle0, idle1, move0–3, windup, attack, hurt, dead`, plus the kind's own poses), `aliases`, `spriteOptions`, `ramps()` and a `draw(p, view, key)` painter with a 1 px transparent margin. A humanoid: a character `HUMANOID_SPECS` entry and aliases onto the combat poses (`windup`, `attack`, `dead` …). Glowing texels (eyes, gems) use `glowTexel` (alpha 204, §10.1). Check the value contrast against grass (≥ 1.6, §10.3). Add the kind to the `ENEMY_SHEET_KINDS` type and to `createEnemySheet`'s `kind` union. |
| 4 | `src/demo/combat/ai/<kind>.js` (new) and [`ai/index.js`](../../src/demo/combat/ai/index.js) | the brain, `BRAINS` | A plain object with `init`, `engage`, `attack` and the optional members listed in `ai/index.js`. Timings in frames at the top of the file (`const F = (n) => n / 60`). **Telegraph grammar:** every attack — follow-ups too — has a wind-up ≥ 18 f, starts only while `e.canWindup(ctx)` (on screen), requests a token (`ctx.requestToken(e)`), and an area of r ≥ 1.5 or any ranged attack shows a draped ground marker whose progress reaches 1 when it resolves. Use `e.rng`, never `Math.random`; no imports of `Enemy.js` (pure helpers such as `aimVy` are fine). Type it like `goblin.js`: `/** @satisfies {Brain} */` on the object, `/** @type {Brain['engage']} */` (and so on) on each method, so parameters and arity come from the contract ([`combat/types.d.ts`](../../src/demo/combat/types.d.ts)); module helpers get `@param {Enemy} e`, `{number} h`, `{CombatContext} ctx`; the brain state is a closed typedef (`XAI = Required<ReturnType<typeof x.init>>`) cast at each `e.ai` read — a field created later on `e.ai` must be added to it, as `GolemAI.weights` is. |
| 5 | [`src/demo/combat/Enemy.js`](../../src/demo/combat/Enemy.js) | `die` | Only if the death look differs: slimes burst `gooPoof`, every other kind `deathPoof` when the fade ends. Kind-specific branches elsewhere in `Enemy.js` / `CombatSystem.js` are few (`dummy` refill, `boar` stagger length, `golem` arena) — grep `kind ===` before adding one. |
| 6 | [`src/engine/audio/AudioSystem.js`](../../src/engine/audio/AudioSystem.js) | `COMBAT_SFX_NAMES` | Optional: the kind's own cue (like `slimeHop`, `batScreech`, `boarSnort`) — append to `COMBAT_SFX_NAMES`, **never** to `SFX_NAMES` (that list is part of the peaceful contract, COMBAT.md §2). |
| 7 | [`sandbox/enemy_ai.js`](../../sandbox/enemy_ai.js) | the check list | Checks for the brain against the scripted fake player (wind-up length and on-screen rule, token use, marker progress at resolve, a determinism dump run twice). |
| 8 | [`tools/make-cinderwatch-pass.mjs`](../../tools/make-cinderwatch-pass.mjs) | the combat objects of a zone | `coverage()` fails (and writes nothing) until a group of the new kind is placed. A new group id is an additive change to COMBAT.md §15.3 — record it there. Re-run the generator and read its rule report (rules 4–6, 14, 15, 17, 19 and 20 care about enemy homes). |

Comes for free: the editor (palette, inspector, 3D preview sprites through `createEnemySheet`, 2D
glyphs and start dots, soft warnings), spawning, separation, hit resolution, loot, XP, bars and
numbers, minimap dots, the warm-up (the level's sheets are painted and uploaded at load), the
`lumina-sprite3d-lit-fx-v1` program (no new program unless you add a material).

**Verify.**

```bash
npm run typecheck                                                                                                     # defs, brain, sheet kind
npm run check -- --page=sandbox/enemy_ai.html --query= --out=eai --fps=0 --script=sandbox/enemy_ai.actions.json      # all brains, your checks
npm run check -- --page=sandbox/sprite_art.html --query=mode=combat --out=sa --fps=0 --script=sandbox/sprite_art.combat.json   # sheets, contrast, the 86 unchanged hashes
node tools/make-cinderwatch-pass.mjs && node tools/make-cinderwatch-pass.mjs --check
npm run check -- --page=index.html --query="level=cinderwatch-pass&autostart=1" --out=cw_prog --wait=5000 --fps=0 --script=sandbox/combat.programs.json   # alone on the GPU (its frame-gap check, KNOWN_ISSUES TOOL-18)
```

Look at the sheet in `sprite_art.html?mode=combat` (every pose × direction) and at the kind in
the level (teleport there, `__game.combat.wake('<group>#0')`, read the screenshots — is the wind-up
pose readable under the highlight?). Then §16, `combat.play.json` (the fixed-step bot must still
finish; compare its `summary` line with the previous run), and the docs: COMBAT.md §7 (additive rows), [specs/OBJECT_CATALOG.md](../specs/OBJECT_CATALOG.md),
[architecture/modules/pixel.md](../architecture/modules/pixel.md),
[design/levels/cinderwatch-pass.md](../design/levels/cinderwatch-pass.md),
[user/PLAYING_THE_GAME.md](../user/PLAYING_THE_GAME.md) (the bestiary).

---

## 20. Tune combat (balance, feel, look)

Numbers live in a few pure-data places; change them there, never in scattered literals.

| What | Where |
| --- | --- |
| Enemy stats, XP, gold, drop chances, token costs, per-level and elite scaling | [`src/demo/combat/defs.js`](../../src/demo/combat/defs.js) (`ENEMY_DEFS`, `scaledDef`) |
| Enemy timings (wind-ups, cooldowns, ranges, speeds of moves) | the constants at the top of each [`src/demo/combat/ai/*.js`](../../src/demo/combat/ai/) brain (wind-ups ≥ 18 f, COMBAT.md §7.3) |
| Boss HP and phase thresholds · boss moves | `ENEMY_DEFS.golem` (`hp`, `phases`) · [`ai/golem.js`](../../src/demo/combat/ai/golem.js) (weights, cooldowns, gaps, `STALL_*`) |
| Player curves (HP / MP / ATK / DEF per level, XP to next), skills, SP / MP costs, combo motion values, crits, roll / backstep, perfect dodge, draughts and price, the shop's wares (`SHOP_WARES`: price, one-time, upgrade and amount), lock-on, engagement, waystones | [`src/demo/combat/rules.js`](../../src/demo/combat/rules.js) |
| Hit-stop, shake, flash times, the look offsets (engaged DOF, hurt vignette, low-HP pulse) | [`src/demo/combat/Feel.js`](../../src/demo/combat/Feel.js) (`HIT_STOP`, `SHAKE`, `CombatLook`) |
| Effect colours and sizes · marker colours · the ember wall | [`CombatFx.js`](../../src/demo/combat/CombatFx.js) · [`GroundMarkers.js`](../../src/engine/fx/GroundMarkers.js) · [`BossArena.js`](../../src/demo/combat/BossArena.js) |
| Wind-up, elite and boss-hit tints | `WINDUP_HL`, `ELITE_HL` and `_writeFlash` in [`Enemy.js`](../../src/demo/combat/Enemy.js) (Sprite3D highlight, KNOWN_ISSUES COMBAT-03) |
| Battle music thresholds · combat SFX | [`CombatMusic.js`](../../src/demo/combat/CombatMusic.js) · [`AudioSystem.js`](../../src/engine/audio/AudioSystem.js) |
| Chase, return and zone rules (path search, replanning, leash, zone margin) | the constants at the top of [`Enemy.js`](../../src/demo/combat/Enemy.js) (`NAV_EVERY`, `REPLAN_*`, `CHASE_COST`, `HOME_COST`, `ZONE_MARGIN`, `ZONE_LEAVE_S`) and [`Nav.js`](../../src/demo/combat/Nav.js) (`CELL`, `CLEAR`, `STEP`, costs); `NAV_SEARCHES` in `CombatSystem.js` |
| Where the fights are (packs, levels, elites, chests, waystones, shopkeepers) | [`tools/make-cinderwatch-pass.mjs`](../../tools/make-cinderwatch-pass.mjs), then regenerate |

Rules of thumb:

- **HDR colours:** bloom starts at luminance 1.05 (`0.2126 R + 0.7152 G + 0.0722 B`). Keep marker
  and wind-up colours under it, or the phase-3 haze comes back (KNOWN_ISSUES COMBAT-15); use the
  highlight, not `uFlash`, for any tint longer than a few frames (COMBAT-03).
- **Telegraphs stay fair:** never below 18 f of wind-up, lanes lock 12–15 f before they fire, and
  the phase-3 × 0.75 still has to stay ≥ 18 f.
- **Pacing:** COMBAT.md §15.3 pins the XP pacing (the glade → Lv 2, a branch → Lv 3, the quarry →
  Lv 5 before Cinderheart). Changing XP, enemy counts or `xpToNext` changes the level the player
  meets the boss at — recompute that table.
- **The boss's length has a floor:** the greedy run (god mode, always attacking) must stay ≥ 30 s
  for the fight and ≥ 7 s for phase 3 (`combat.boss.json` asserts it; today 39.9 s at Lv 5, and
  34.7 s in `combat.boss.cw.json`'s equipped greedy run with every chest and shop ware). Raise
  `ENEMY_DEFS.golem.hp` if it drops below; the thresholds are fractions.
- **Measure, don't guess** (the 2026-09-28 balance pass, KNOWN_ISSUES COMBAT-12): the play-through
  bot ([`sandbox/combat_play.js`](../../sandbox/combat_play.js)) is deterministic in fixed step and
  has balance settings — `start({ route, skill, shop, … })`:
  - `route`: `'ruins'` (default), `'mire'`, `'full'` (a thorough player: the whole glade and both
    branches) or `'boss'` (a boss-only probe: `at` the Quarry Waystone, `kill` the groups to clear
    first, `player` = `setPlayer` values incl. `upgrades`, `delay` idle frames for another sample);
  - `skill`: `'expert'` (default; reads every telegraph) or `'human'` (the seeded human model:
    reacts 0.25 s late, misses 20 % of telegraphs, attacks in bursts at ≈ 30 % damage uptime,
    uses skills late, drinks below 30 % HP even mid-combo; an object of `{ reaction, miss, burst,
    pause, healAt, skillDelay, drinkBusy, seed }` overrides the preset);
  - `shop: false` skips the shops.

  `report()` / `verify()` add per-zone figures (`zones`: time, fight time, damage taken in shares
  of max HP, deaths, draughts, uptime, level / gold / stats at the end), `bossAttempts`, `damageBy`
  (per enemy kind and boss move), `bought` / `goldSpent`, `draughtsDrunk`, `bossUptime` and
  `segments`. Design targets: the glade teaches (≈ 0 damage), each branch is a step up, the quarry
  is the hardest normal zone, the boss takes 90–120 s at 30–35 % uptime, deaths are possible but not
  the norm, gold has something to buy. Run several `human` seeds (a boss probe per seed) — one
  run proves little.

**Verify.** The stepped scripts pin exact behaviour, so a balance change moves their numbers:

- `combat.fight.json` / `combat.fight.cw.json` — the combo's damage bands use `COMBO` motion values
  (hard-coded as `[1.0, 1.1, 1.8]` in `tests.combo()` of `sandbox/combat_fixture.js`) and the golden
  total at `seed(1)` (21 · 13 · 23 = 57 today, recorded in COMBAT.md §27.1 I12) changes with ATK,
  DEF, motion values or the crit rolls — update the recorded values in the same change and say why.
  `tests.costs()` asserts the SP / MP costs (A1 = 5 SP).
- `combat.boss.json` / `combat.boss.cw.json` — the greedy floor and the kneel cap (8 % of max HP).
- `combat.iframes.json` — the perfect-dodge window; `combat.death.json` — the gold loss (10 %).
- `enemy_ai.actions.json` — timings the brains assert (wind-up lengths, lane lock, paths, zones).
- `combat.play.json` / `combat.play.fast.json` — the fixed-step bot must still clear the level.
  Any gameplay change shows as a different `digest` in its `summary` line (compare the whole line
  with the previous run: time, level, gold, kills, deaths, the boss's phase times); its `trace`
  (the digest every 10 s of game time) tells where two runs part. Same tree → same digest on any
  GPU load, so it need not run alone. `combat.play.human.json` runs the human model;
  `combat.play.realtime.json` is the real-time feel check — that one alone on the GPU
  (KNOWN_ISSUES TOOL-17).

```bash
npm run check -- --page=sandbox/index.html --query= --out=play --wait=0 --fps=0 --script=sandbox/combat.play.json        # fixed step, ≈ 2.5–8 min
npm run check -- --page=sandbox/index.html --query= --out=playf --wait=0 --fps=0 --script=sandbox/combat.play.fast.json  # same digest, every 4th frame drawn
```

Record a tuning pass in COMBAT.md §27 (the section and the old → new value) and in
KNOWN_ISSUES COMBAT-12 if the balance picture changes.

---

## 21. Fix a failing type check

`npm run typecheck` ([`tools/typecheck.mjs`](../../tools/typecheck.mjs)) runs `tsc` on both
programs, prints every error and ends with one line per program (`typecheck tsconfig.json: ok
(1.2 s)` or `FAILED`). Extra arguments go to `tsc` (`npm run typecheck -- --pretty false` prints
one `file(line,col): error TSnnnn: …` line per error); one program alone:
`npx tsc -p tsconfig.json` or `npx tsc -p tools/tsconfig.json`. The rules are in
[CONVENTIONS.md §3.1](../development/CONVENTIONS.md#31-the-type-check).

1. **Start with the first error of each cluster** — one wrong declaration often produces dozens.
2. **Decide which side is wrong.** Usually the code you just changed. If a type is wrong (it says
   less or other than the code does), fix the type at its declaration: the contract types follow
   the code, and a JSDoc type that disagrees with the code is a stale comment.
3. **Fix the cause, never silence it**: no `@ts-ignore`, no `@ts-nocheck`, no `/** @type {any} */`
   cast. A narrow cast `/** @type {X} */ (expr)` is for correct code the checker cannot follow; an
   `@ts-expect-error` (with its reason on the line) for correct code that cannot be typed.

| Error | Usual cause | Fix |
| --- | --- | --- |
| TS2339 / TS2551 *Property 'x' does not exist on type 'Y'* (*Did you mean …?*) | a misspelt or renamed member; a field created lazily or by another module | fix the name at the use — after renaming a contract member, update every use (the contracts are additive: a rename needs a decision); declare a lazily created field by module augmentation in the folder's `types.d.ts` |
| TS2353 / TS2561 *Object literal may only specify known properties* | a misspelt key in a literal checked against a type (a hook object, a `HitSpec`, an option bag), or a new member missing from its typedef | fix the key, or add the member to the typedef |
| TS2345 / TS2322 *… is not assignable to …* | a literal widened to `string` or `number[]` (`stairs: 'S'` against `'N'\|'S'\|'E'\|'W'`, an anchor against a tuple); a value outside a union | type the declaration the literal is written in (`/** @type {TileDef} */`, a `@returns`), or fix the value |
| TS2554 *Expected n arguments, but got m* | a missing or extra argument; a parameter the code defaults but the JSDoc does not mark optional (`[name]`) | fix the call, or the JSDoc |
| TS8024 / TS8030 *JSDoc … does not match* | a `@param` name that is not a parameter; a method typed `@type {Brain['x']}` with another arity | fix the tag or the signature |
| TS2578 *Unused '@ts-expect-error' directive* | its cause went away | delete it (and the line in CONVENTIONS §3.1's list) |
| TS2344 *… does not satisfy the constraint 'never'* (in `ObjectBuilder.js`, `level/types.d.ts`, `world/types.d.ts`) | a catalog prop type without a `LevelObjectBuilder.build` case or `PropFactory` method; a `defaults.opts` key the method's JSDoc does not declare; an `ObjectExtras` key that is no catalog type | add the case, method or option ([§1](#1-add-a-placeable-object-type)) |
| errors only in `tools/…`, about `window`, the DOM or three.js | a module the generators import now reaches browser code, perhaps only through a type import | keep the type as JSDoc in a Node-safe module (like `combat/defs.js`) or in a `.d.ts` that imports no browser module |

**What the check asks for when you add …**

| You add | The check wants | Recipe |
| --- | --- | --- |
| an object type | the catalog entry (the level types derive from it); for a prop a `case` in `LevelObjectBuilder.build` and a `PropFactory` method whose `opts` JSDoc declares the catalog's default `opts`; default-less optional fields in `ObjectExtras` | [§1](#1-add-a-placeable-object-type) |
| a level or environment field | an optional member of `LevelEnvironment` / `LevelWater` (or `ObjectExtras` for an object field) in `level/types.d.ts` | [§11](#11-add-a-level-field) |
| an enemy kind | `EnemyKind` in `defs.js` → its `ENEMY_DEFS` entry and its `BRAINS` brain; the `ENEMY_SHEET_KINDS` / `createEnemySheet` kind unions | [§19](#19-add-an-enemy-kind) |
| a sound | its name in `SFX_NAMES` or `COMBAT_SFX_NAMES` | [§17](#17-add-a-sound-effect) |
| an input action | its key in `DEFAULT_BINDINGS` / `DEFAULT_PAD_BINDINGS`; a runtime action through an `ExtraActions` augmentation | [§8](#8-add-an-input-action-game-key) |
| a particle preset / parameter | nothing for a preset; a `DEFAULTS` entry for a new parameter | [§3](#3-add-a-particle-preset) |
| an editor tool / event | `/** @type {Tool} */` on the tool; an `EditorEvents` entry for an event | [§10](#10-add-an-editor-tool) |
| an automation hook (`window.__game`, `__editor`, `__lumina`, `__game.combat`) | the member in its typedef — `GameHooks` above `Game._exposeGlobal`, `EditorHooks` in `EditorApp.js`, `LuminaHooks` in `main.js`, `CombatHooks` in `combat/types.d.ts`. The objects are checked against them: a member added without its typedef line is an excess-property error, a typedef member never set a missing-property error. Then its row in [AUTOMATION_API.md](../specs/AUTOMATION_API.md) | — |
| a sandbox handle (`window.__x`) | a typedef next to its assignment in the sandbox file and a `Window` member in `src/globals.d.ts` | — |
| a `CombatContext` member | the member in `combat/types.d.ts`, its implementation in `CombatSystem._makeContext` and in the mock context of `sandbox/enemy_ai.js` (both are checked against it); COMBAT.md §9.2 | — |
| a field set lazily (`this._x ??= …`) | a module augmentation in the folder's `types.d.ts` | — |

**Verify.** Both programs report 0 errors. After a change of comments and types only, the build is
byte-identical — the proof the type-check pass used: build before and after into two folders
(`npx vite build --outDir <scratch>/a --emptyOutDir`, the same into `b`) and compare them
(`diff -r`).

---

## Appendix: tested harness snippets

All of these ran without errors against the current code (Emberfall, `--query=autostart=1`).
Use them as `eval` steps in an action script (`page.evaluate` awaits returned promises).

| Purpose | `eval` |
| --- | --- |
| Summary state | `JSON.stringify(window.__game.state())` |
| Fingerprint | see [§16](#16-regression-check-before-you-finish) |
| GPU stage minima | `(() => { window.__game.postfx.enableTimings(true); return 'reset'; })()` → `{ "wait": 2000 }` → `JSON.stringify(window.__game.postfx.timingsMin)` |
| Lock render scale | `(() => { const g = window.__game; g.game.resolution.enabled = false; g.engine.renderScale = 1; return 'locked'; })()` |
| CoC debug view | `(() => { window.__game.postfx.settings.dof.debug = true; return 'coc'; })()` |
| CPU render submission | `(() => { const e = window.__game.engine.events; let t0 = 0; const out = []; e.on('beforeRender', () => { t0 = performance.now(); }); e.on('afterRender', () => { out.push(performance.now() - t0); }); window.__cpu = out; return 'hooked'; })()` → wait → `(() => { const o = window.__cpu.slice().sort((a, b) => a - b); return JSON.stringify({ n: o.length, p50: +o[o.length >> 1].toFixed(2) }); })()` |
| Try a particle preset live | `(async () => { const { PARTICLE_PRESETS } = await import('/src/engine/fx/Particles.js'); PARTICLE_PRESETS.test = { ...PARTICLE_PRESETS.fireflies, color: '#9fe8ff' }; const g = window.__game; g.particles.createEmitter({ preset: 'test', position: g.player.position.clone(), count: 60 }); return 'ok'; })()` |
| Load timing | `JSON.stringify({ loadMs: window.__lumina.loadMs, stats: window.__game.game.loadStats, phases: window.__game.world.stats.phases })` |
| What the prompt would pick here | `(() => { const t = window.__game.game._findInteractable(); return t ? (t.npc ? t.npc.id : t.it.id) : null; })()` (the returned object is reused — read it at once) |
| Walk with real key events | `(async () => { const o = { code: 'KeyW', key: 'w', bubbles: true }; document.body.dispatchEvent(new KeyboardEvent('keydown', o)); await new Promise((r) => setTimeout(r, 800)); document.body.dispatchEvent(new KeyboardEvent('keyup', o)); return window.__game.state().nearest; })()` — goes through `TileMap.move` and the wall stop, unlike `teleport` |

Notes: bare module specifiers (`import('three')`) do not resolve inside `eval` — import project
files by absolute path (`/src/...`) or reuse objects from the page (`g.player.position.clone()`
for a `THREE.Vector3`). Keep one fresh `--out` per run.
