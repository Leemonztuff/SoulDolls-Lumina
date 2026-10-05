# Glossary

> **Purpose.** One place that defines the words Lumina's code, docs and build history use — the
> HD-2D rendering vocabulary, level-format terms, game and editor concepts, and the names of the
> tools and of the multi-agent process. Several words mean two things in this project (a *level*
> is a file **and** a height step; an *emitter* is a particle system **and** a level object);
> those are called out. Each entry links to the canonical document for the details.
>
> **Audience.** Everyone new to the project — players and level designers meeting a term in the
> editor, developers and AI agents meeting it in the code or a report.
>
> **Source of truth.** The code named in each entry; the values quoted here were read from
> [`src/engine/constants.js`](../src/engine/constants.js),
> [`src/engine/level/LevelFormat.js`](../src/engine/level/LevelFormat.js),
> [`src/engine/level/ObjectCatalog.js`](../src/engine/level/ObjectCatalog.js),
> [`src/engine/level/ObjectBuilder.js`](../src/engine/level/ObjectBuilder.js),
> [`src/demo/World.js`](../src/demo/World.js), [`src/demo/config.js`](../src/demo/config.js) and
> [`src/demo/Weather.js`](../src/demo/Weather.js).
>
> **Related.** [README.md](README.md) (documentation index) ·
> [features/FEATURES.md](features/FEATURES.md) · [specs/LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md) ·
> [architecture/OVERVIEW.md](architecture/OVERVIEW.md) · [ai/AGENT_ONBOARDING.md](ai/AGENT_ONBOARDING.md)

---

## Contents

- [Words with two meanings](#words-with-two-meanings)
- [The HD-2D look and rendering](#the-hd-2d-look-and-rendering)
- [Levels and the world](#levels-and-the-world)
- [Lights](#lights)
- [The game](#the-game)
- [Combat](#combat)
- [The editor](#the-editor)
- [Tools, verification and process](#tools-verification-and-process)

---

## Words with two meanings

| Word | Meaning 1 | Meaning 2 |
| --- | --- | --- |
| **level** | A level **file**: one `lumina-level` JSON document (terrain, environment, spawn, objects) in `public/levels/` or browser storage ([LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md)). | A terrain **height step**: an integer 0–35 (`MAX_LEVEL`) stored per tile in `heights`; world height = level × 0.5 (`LEVEL_HEIGHT`). The editor's height tools work in levels, while positions, `minY` and `waterLevel` are in **world units**. |
| **emitter** | A particle system instance created by `Particles.createEmitter` (one draw call) — [fx.md](architecture/modules/fx.md). | The level object type `emitter`, shown in the editor as a **particle area**: a box plus a preset (fireflies, leaves, petals, dust, embers, smoke, mist, sparkle, rain, snow) — [OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md). |
| **region** | A level object type (`region`, *Region name* in the editor): a rectangle that names an area, shows its name on the HUD location plate and optionally an arrival **banner**. | Informally, an area of a level ("the market region"); level design docs use the object's name. |
| **map** | The **tile map** — `TileMap`, the terrain built from `tiles` + `heights` ([world.md](architecture/modules/world.md)). | The **minimap** / **world map** UI (N / Tab), painted by `LevelMap` ([ui.md](architecture/modules/ui.md)). |
| **light** | A real three.js **point light** — at most 12 exist, all created at load. | A **light descriptor** — a light *source* in the level (lamppost, torch, campfire, `light` object, lit window); any number may exist and a `LightPool` assigns the real lights to them. |
| **level (combat)** | The player's **character level** — *Lv* 1–10 on the vitals, raised by XP ([PLAYING_THE_GAME.md](user/PLAYING_THE_GAME.md)). | An enemy group's `level` field (1–10), which scales its HP, damage, XP and gold ([OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md)). Neither is a level file or a height step. |
| **marker** | A **ground marker**: a combat telegraph decal (circle, ring, sector, lane, rect) draped over the terrain by `GroundMarkers` ([fx.md](architecture/modules/fx.md)). | A **map marker**: a symbol on the minimap / world map (door, sign, well, campfire, waystone, chest, boss). |
| **sandbox** | A standalone test page per engine module under [`sandbox/`](../sandbox/index.html) (`/sandbox/` on the dev server). | — (the word is not used for anything else, but note that sandboxes are *not* part of the build). |

---

## The HD-2D look and rendering

| Term | Definition | Details |
| --- | --- | --- |
| **HD-2D** | The art style Lumina targets (*Octopath Traveler II*): pixel-art sprites and textures in a lit, shadowed 3D diorama, with tilt-shift depth of field, bloom and a colour grade. | [VISUAL_DESIGN.md](design/VISUAL_DESIGN.md), [`ARCHITECTURE.md`](../ARCHITECTURE.md) §1 |
| **Diorama** | The playable map seen from a high, narrow-FOV camera, ringed by a fogged **outer world** (forest border, heightfield, distant ridges) so it never looks like a floating island. | [GAME.md](architecture/GAME.md) |
| **Diorama camera** (`CameraRig`) | The follow camera: FOV 28°, pitch 32°, distance 30 (18–42 in the game), Q / E orbit up to ±60°, look-ahead, focus bounds. Engine defaults differ; the game sets `CAMERA` in `demo/config.js`. | [core.md](architecture/modules/core.md) |
| **PPU** | Pixels (texels) per world unit: **16**, for textures and sprites alike. One tile = 1 world unit = 16 texels. | `constants.js` |
| **NEAREST** | The texture magnification filter that keeps pixel art crisp; all pixel textures go through `makePixelTexture` / `PixelCanvas#toTexture`. | [pixel.md](architecture/modules/pixel.md) |
| **Tilt-shift / DOF** | Depth of field with a sharp band around the focus (the player) and blurred foreground and background — the miniature look. Computed per pixel as a **CoC**. | [render.md](architecture/modules/render.md) |
| **CoC** (circle of confusion) | The per-pixel blur radius derived from depth relative to the focus distance. Effects that do not write depth take the CoC of the surface behind them. | [RENDER_PIPELINE.md](architecture/RENDER_PIPELINE.md) |
| **Bokeh / highlight scatter** | Bright specks turned into soft discs by the DOF's scatter pass (half-resolution gather + scattered sprites). | [render.md](architecture/modules/render.md) |
| **Scene target** (`postfx.sceneTarget`) | The MSAA, linear, HDR render target the scene is drawn into before post-processing. Shaders must be compiled against it (not the canvas) or they recompile at first use. | [RENDER_PIPELINE.md](architecture/RENDER_PIPELINE.md) |
| **Warm-up** | Compiling every shader program during loading (`renderer.compileAsync` against the scene target, then a few frames with rain and snow on behind the loader) so nothing compiles — and hitches — during play. | [RENDER_PIPELINE.md](architecture/RENDER_PIPELINE.md) |
| **Program** (shader program) | A compiled WebGL program; three.js caches one per material configuration and render target. The count after loading is a regression signal (Emberfall 57, Starfall Vale 59). | [PERFORMANCE.md](architecture/PERFORMANCE.md) |
| **Tone mapping / grade** | ACES tone mapping happens once, in PostFX's `OutputPass`; the **grade** (contrast, saturation, temperature, vignette, grain, chromatic aberration, sharpen) runs after it in display space. `LightingSystem` owns `renderer.toneMappingExposure`. | [render.md](architecture/modules/render.md) |
| **Global uniforms** | The shared uniform objects in `render/GlobalUniforms.js` (`uTime`, `uNight`, wind, camera yaw, sun direction and colour, fog colour) through which modules stay in sync without calling each other. | [OVERVIEW.md](architecture/OVERVIEW.md) |
| **Night factor** (`uNight`) | 0 by day … 1 at night, written by `LightingSystem` each frame; drives lamp and window glow, fireflies, crickets. | [lighting.md](architecture/modules/lighting.md) |
| **Keyframes / palette** | The 13 time-of-day keyframes of `DEFAULT_KEYFRAMES` (sun, sky, fog, ambient, exposure), interpolated over 24 h; the game overrides some (`KEYFRAME_OVERRIDES`). | [lighting.md](architecture/modules/lighting.md) |
| **Emissive** | A material that glows (windows, lantern glass, flames), faded between a day and a night level by `LightingSystem.registerEmissive`. | [lighting.md](architecture/modules/lighting.md) |
| **God rays** | Soft additive light shafts that follow the sun, placed in `godRayAreas` (or automatically). One draw call per shaft in view. | [fx.md](architecture/modules/fx.md) |
| **Texel snapping** | Moving the sun's shadow frustum only in whole shadow-map texels so shadows do not shimmer when the camera moves. | [lighting.md](architecture/modules/lighting.md) |
| **Sprite shadow proxy** | A sun-facing silhouette quad (colour writes off) that casts a sprite's full shadow; on big levels it is shadow-pass only. | [sprite.md](architecture/modules/sprite.md) |
| **Blob shadow** / `BlobBatch` | The soft contact shadow under a character; `BlobBatch` draws all of them in one instanced call on big levels. | [sprite.md](architecture/modules/sprite.md) |
| **Wrap lighting / bent normals** | Sprite lighting tricks that keep backlit characters warm instead of black. | [sprite.md](architecture/modules/sprite.md) |
| **X-ray silhouette** | The pale outline of the player drawn when a roof or canopy hides them. | [GAME.md](architecture/GAME.md) |
| **Resolution governor** | `ResolutionGovernor` (game only): lowers the render scale (down to 0.7) when the median GPU time stays high, raises it again when it is low. | [PERFORMANCE.md](architecture/PERFORMANCE.md) |

---

## Levels and the world

| Term | Definition | Details |
| --- | --- | --- |
| **`lumina-level`** | The level file format (`format: "lumina-level"`, `version: 1`), plain JSON, written byte-stably by `serializeLevel`. | [LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md) |
| **Width × depth** | A level's size in tiles along x and z, 8–128 each (`MIN_SIZE`, `MAX_SIZE`). Rows of `tiles` / `heights` run toward +z. | [LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md) |
| **Tile (i, j)** | The square `x ∈ [i, i+1], z ∈ [j, j+1]`; its centre is `(i + 0.5, j + 0.5)`. Y is up. | [OVERVIEW.md](architecture/OVERVIEW.md) |
| **Tile char / legend** | Each tile is one character; the level's **legend** maps characters to tile definitions (top texture, walkable, water…). 22 built-in types (`TILE_TYPES`) are always present; a level may add custom characters. | [LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md) |
| **Step vs cliff** | Characters can climb a height difference up to 0.55 (`maxStep`): one level (0.5) is a walkable step, two or more levels form a cliff that only stairs or a bridge cross. | [LEVEL_DESIGN_GUIDE.md](design/LEVEL_DESIGN_GUIDE.md) |
| **Stairs** | Four tile types (`^` north, `v` south, `>` east, `<` west) whose legend `stairs` direction makes the tile rise one level that way, built as four steps; the editor's Stairs tool picks the direction of the higher neighbour. | [LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md) |
| **Water level / water surface** | `waterLevel` is the default surface height (world units) of water tiles; legends can set a per-tile `waterLevel` or `waterDepth`. | [LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md) |
| **Environment** | Level-wide settings: time and clock, weather, fog, camera, title camera, scenery, foliage, forest, god-ray areas, minimap, water look. | [LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md) |
| **Spawn** | The player start (`spawn: { x, z, facing }`); the editor treats it as a pseudo-object with id `spawn`. | [LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md) |
| **Object / object type** | An entry of `objects` (`id`, `type`, position, fields). The **object catalog** (`OBJECT_TYPES`) defines 24 types in 8 categories, each with defaults, inspector fields and a placement style. | [OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md) |
| **Placement** | How a type is positioned: `point` (`x`, `z`), `line` (`x0, z0 → x1, z1`: fences, bridges) or `rect` (regions). | [OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md) |
| **Kind** (`prop` / `actor` / `marker`) | The catalog's split between things `LevelObjectBuilder` builds as props, characters the game spawns (NPCs, critters) and invisible markers (particle areas, regions). | [level.md](architecture/modules/level.md) |
| **Normalisation** | `normalizeLevel` / `normalizeObject` fill every missing default and repair invalid values on load; that is why adding a default changes every saved file on its next save. | [LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md) |
| **Byte-stable round trip** | `serializeLevel(parseLevel(text)) === text` for every shipped level: opening and saving a level unchanged must leave `git diff` empty. | [TESTING_AND_VERIFICATION.md](development/TESTING_AND_VERIFICATION.md) |
| **`BuiltObject`** | What `LevelObjectBuilder.build` returns for a prop object: the positioned `object`, `colliders`, `walkRects`, light descriptors, `emissives`, particle `emitters`, an optional `interact` point and `update`. The game and the editor wire these lists to their owners. | [level.md](architecture/modules/level.md) |
| **`PropResult`** | What a `PropFactory` method returns (meshes plus the same kinds of lists); `mergeStatic` batches many of them. | [world.md](architecture/modules/world.md) |
| **Collider / walk rect** | Collision shapes registered with the `TileMap` (props, villagers) and walkable surfaces that override the terrain (bridge decks). Dynamic colliders move (villagers). | [world.md](architecture/modules/world.md) |
| **Interactable** | A point the player can use with the confirm key: villagers (*Talk*), doors (*Knock*), signposts (*Read*), wells (*Look*). A door also has a `lookSpan` (its leaf), which counts when the player faces it. | [PLAYING_THE_GAME.md](user/PLAYING_THE_GAME.md) |
| **Villager / NPC** | An `npc` object: preset, dialogue pages, an **action** (`none`, `rest`, `shop`, `music`), a **behaviour** (`wander`, `post`, `perform`, `chase`) or one of Emberfall's eight hand-written **scripts**. | [OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md) |
| **Relative offsets** | `talkOffset`, `area` (NPCs) and `spotOffsets`, `area` (critters) are stored relative to the object so they move with it. | [OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md) |
| **Critters** | A group of animals of one kind — `chicken`, `cat`, `bird` or `dog` — that roam, scatter or take flight. | [OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md) |
| **Particle area** | The editor name of the `emitter` object (see [two meanings](#words-with-two-meanings)). | [OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md) |
| **Banner** | The large arrival title shown when play starts and the first time the player enters a region that has a `banner` line. | [ui.md](architecture/modules/ui.md) |
| **Camera bounds / focus bounds** | The rectangle the camera's focus may move in (from `environment.camera.bounds` or computed automatically); it widens as you zoom in. | [GAME.md](architecture/GAME.md) |
| **High ground** | An optional camera tilt applied while the player stands above a given height (Emberfall's Windmill Hill). | [LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md) |
| **Title camera** | The slow drifting view behind the title screen (`environment.titleCamera`, automatic when absent). | [LEVEL_FORMAT.md](specs/LEVEL_FORMAT.md) |
| **Big level** | A level wider or deeper than 64 tiles. The game (and the editor preview) switch to the `BIG_LEVEL_BATCHING` path: spatially split batches with box culling, shadow-only proxy casters, far-actor throttling. Small levels keep the original path and must render identically. | [PERFORMANCE.md](architecture/PERFORMANCE.md) |
| **`SpatialSplit`** (k-d batching) | Cuts merged batches into spatially compact pieces the camera and the shadow pass can cull by bounding box. | [world.md](architecture/modules/world.md) |
| **`ShadowCasters`** | A few merged, shadow-pass-only proxy meshes that draw the shadows of opaque props and cliffs on big levels. | [world.md](architecture/modules/world.md) |
| **Shore bake** | The water's shore-foam texture, computed from the terrain and the static colliders in water (in a worker: `WaterShore` / `shoreWorker`). | [world.md](architecture/modules/world.md) |
| **Generator** | A deterministic Node script that writes a level file: `tools/make-starfall-vale.mjs` (self-validating) and `tools/make-sample-hamlet.mjs`. Generated levels are changed only through their generator. | [LEVEL_DESIGN_GUIDE.md](design/LEVEL_DESIGN_GUIDE.md) |

---

## Lights

| Term | Definition | Details |
| --- | --- | --- |
| **Light descriptor** | `{ position, color, intensity, distance, flicker, nightOnly, tag }` — one per light source a built object reports. | [OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md) |
| **`LightPool`** | Owns the real point lights. **Static** mode (≤ 12 descriptors): one permanent light each. **Pooled** mode (> 12): 12 lights re-assigned every 0.2 s to the best-ranked descriptors in view, crossfading on hand-over. | [lighting.md](architecture/modules/lighting.md) |
| **`LIGHT_PRIORITY`** | Importance when lights are ranked — **lower is more important**: campfire 0, wall torch and `light` 1, lamppost 2, house window 3. | [OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md) |
| **Point-light budget** | At most 12 point lights, created before the first frame; the count never changes afterwards (a change recompiles every lit shader). The editor preview uses the same `LightPool` with `fixed: true`, so it always has 12. | [RENDER_PIPELINE.md](architecture/RENDER_PIPELINE.md) |

---

## The game

| Term | Definition | Details |
| --- | --- | --- |
| **Title mode / play mode** | The game boots into the title screen over a drifting camera and enters gameplay from it (the key press also unlocks WebAudio); `?autostart=1` skips the title. | [GAME.md](architecture/GAME.md) |
| **Game hour** | 90 real seconds (`TIME_SPEED` = 1/90 h per second); a level can stop the clock (`environment.clock: false`). | [PLAYING_THE_GAME.md](user/PLAYING_THE_GAME.md) |
| **Time presets** | What **T** cycles through: Dawn 6.5 h, Midday 12.5 h, Golden Hour 17.2 h, Dusk 18.9 h, Night 22.5 h (a 2-second glide). | [PLAYING_THE_GAME.md](user/PLAYING_THE_GAME.md) |
| **Weather** | `clear`, `rain` or `snow` (**R** cycles). `Weather` blends sun, fog, wind, grade and particles and rewrites those live settings every frame; the look itself (`WEATHER_PARAMS` and the functions that apply it) is `WeatherLook.js`, which the editor preview uses too. | [GAME.md](architecture/GAME.md) |
| **Photo mode** | **P**: hides the whole UI for screenshots; you can still walk, turn and zoom, and the game stops re-applying its camera pitch and edge-of-map yaw limit. | [PLAYING_THE_GAME.md](user/PLAYING_THE_GAME.md) |
| **Minimap / world map** | The small north-up map under the clock and the full-screen map (N / Tab) with region names; both painted once at load by `LevelMap`. | [ui.md](architecture/modules/ui.md) |
| **`window.__game`** | The automation hook of the game page: engine handles plus `teleport`, `setTime`, `setWeather`, `talkTo`, `map`, `state()` … | [AUTOMATION_API.md](specs/AUTOMATION_API.md) |

---

## Combat

Only on levels with enemies (or `environment.combat: true`). The binding design is
[COMBAT.md](contracts/COMBAT.md); how to play is in [PLAYING_THE_GAME.md](user/PLAYING_THE_GAME.md).

| Term | Definition | Details |
| --- | --- | --- |
| **Combat level / peaceful level** | A level on which `levelHasCombat(level)` is true — it has an `enemy` object and no `environment.combat: false`, or `environment.combat: true` — gets the combat system; every other level is **peaceful** and creates nothing combat-related (`game.combat === null`). | [COMBAT.md §3](contracts/COMBAT.md#3-enabling-combat-per-level) |
| **Cinderwatch Pass** | The combat demo level (`cinderwatch-pass`, 96 × 120), generated by `tools/make-cinderwatch-pass.mjs`. | [cinderwatch-pass.md](design/levels/cinderwatch-pass.md) |
| **Enemy group / pack** | One `enemy` level object: a *kind*, a *count* (1–8), a home radius, a level, *elite*; its members start scattered over the home radius and return there. | [OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md) |
| **Kind** | An enemy type from `ENEMY_KINDS`: slime, goblin, archer, shaman, bat, boar, dummy, golem (the boss). | [COMBAT.md §7.1](contracts/COMBAT.md#71-roster-base-stats-at-enemy-level-1-srcdemocombatdefsjs--enemy_defs) |
| **Elite** | An enemy with more HP and damage, a guaranteed heart and a gold-framed health bar with a name plate (Old Ironhide). | [COMBAT.md §7.2](contracts/COMBAT.md#72-level-scaling-and-elites) |
| **Boss / Cinderheart / adds** | The three-phase stone golem of the caldera; *adds* are the bats it summons in phase 2. | [COMBAT.md §8](contracts/COMBAT.md#8-boss-cinderheart-aigolemjs-arena-from-bossarenajs) |
| **Arena / gate / ember wall** | The boss group's relative `arena` rectangle and `gate` segment: entering the arena starts the fight, an **ember wall** closes the gate and nobody else may enter until the fight ends. | [COMBAT.md §8.1](contracts/COMBAT.md#81-arena-and-intro) |
| **Waystone** | A checkpoint prop: walking close **attunes** it (the respawn point); Space **rests** (full heal, draughts topped up to 3, enemies return). | [COMBAT.md §6.12](contracts/COMBAT.md#612-waystones-chests-shop-engagement) |
| **Chest / upgrade** | A treasure prop opened with Space on a combat level; it can hold gold, draughts and a permanent upgrade (Max HP +20, Max MP +10, Attack +3). | [OBJECT_CATALOG.md](specs/OBJECT_CATALOG.md) |
| **HP / MP / SP** | Health, mana (for skills) and stamina (for dodges; attacks cost a little). At 0 SP the player is **winded** — slower recovery, never refused. | [COMBAT.md §6.2](contracts/COMBAT.md#62-resources) |
| **Healing Draught** | The consumable heal (40 % HP; carry up to 5; Bram and Odo sell them for 25 gold). | [COMBAT.md §6.7](contracts/COMBAT.md#67-healing-draught) |
| **Shop / wares / shopkeeper** | The combat gold sink: an NPC with the `shopkeeper` script sells draughts and three one-time **wares** (`SHOP_WARES`: Whetstone ATK +2, Ironbark Tonic max HP +15, Warding Charm DEF +3) from a dialogue menu. | [COMBAT.md §6.12](contracts/COMBAT.md#612-waystones-chests-shop-engagement) |
| **Combo (A1–A3)** | The 3-hit sword string: press attack again as the blade returns; A3 is the heavy finisher. | [COMBAT.md §6.4](contracts/COMBAT.md#64-melee-combo) |
| **Motion value (mv) / knockback (kb)** | The damage multiplier of a hit, and the distance it pushes the victim (divided by its mass). | [COMBAT.md](contracts/COMBAT.md) (conventions) |
| **Hit-stop** | A few frames in which combat freezes when a hit lands (4 f, more for finishers, crits and kills), while the camera shake, particles and UI keep running. Combat-local — `engine.time.timeScale` is never touched. | [ADR-029](history/DECISIONS.md#adr-029--hit-stop-and-slow-motion-are-combat-local-d4) |
| **i-frames / dodge roll / backstep** | Invulnerable frames: the roll (with a direction) and the backstep (without one) give the player a short window in which enemy hits miss. | [COMBAT.md §6.5](contracts/COMBAT.md#65-dodge-roll-backstep-perfect-dodge) |
| **Perfect dodge** | A roll that starts just before an enemy hit would land: *Perfect!*, enemies slow down for 0.6 s, SP and MP back. | [COMBAT.md §6.5](contracts/COMBAT.md#65-dodge-roll-backstep-perfect-dodge) |
| **Telegraph / wind-up** | How every enemy attack announces itself: a **wind-up** of at least 18 frames in which the enemy glows (the highlight pulse) and, for areas and ranged attacks, a red **ground marker** that fills up and resolves when it is full. | [COMBAT.md §7.3](contracts/COMBAT.md#73-telegraph-grammar-binding-for-every-enemy-attack) |
| **Lane / lock** | A long marker for arrows and charges; it follows the player, then **locks** (a white flash on its rim) 12–15 frames before it fires — the cue to move or roll. | [COMBAT.md §7.3](contracts/COMBAT.md#73-telegraph-grammar-binding-for-every-enemy-attack) |
| **Highlight** | The `Sprite3D` tint (`setHighlight`) that brightens a sprite's own shading — used for wind-ups, the elite shimmer and the boss's hit flash; short silhouette flashes use `setFlash`. | [ADR-040](history/DECISIONS.md#adr-040--long-tints-are-a-highlight-not-a-flash-mix) |
| **Attack token** | A slot an enemy must hold to attack (3 melee, 2 ranged at a time), so a pack takes turns instead of all striking at once. | [COMBAT.md §7.5](contracts/COMBAT.md#75-attack-tokens-activation-engagement) |
| **Aggro / notice / leash / return** | An enemy **aggroes** when it sees the player (range and line of sight, or within 3 u), shows a `!` (**notice**) and wakes its pack; beyond its **leash** it walks home (**return**), guarded and healing. | [COMBAT.md §7.4](contracts/COMBAT.md#74-shared-state-machine-enemyjs) |
| **Dormant** | An enemy more than 32 u from the player that is not aggroed: it is not updated at all. | [COMBAT.md §7.4](contracts/COMBAT.md#74-shared-state-machine-enemyjs) |
| **Walk grid / path (`Nav`)** | The enemies' 0.5 u navigation grid (heights and open cells, built at load) and its bounded A*: chasers follow a path when the straight way is blocked (stairs, ledges, rocks) and walk home along one; no path within reach makes an enemy give up (**unreachable**). | [ADR-041](history/DECISIONS.md#adr-041--enemies-path-on-a-walk-grid-and-zones-bound-a-pack) |
| **Zone** | A pack's part of the level: the first `region` containing its centre, grown to hold its home disc. A pack wakes only packs of its zone, does not see a player outside zone + 3 u and turns back when it leaves that margin. | [ADR-041](history/DECISIONS.md#adr-041--enemies-path-on-a-walk-grid-and-zones-bound-a-pack) |
| **Poise / stagger / Broken / stun** | Hits drain **poise**; at 0 the enemy **staggers** (the boss is **Broken** for 3 s). A boar or the boss charging into a wall or brazier is **stunned**. | [COMBAT.md §7.4](contracts/COMBAT.md#74-shared-state-machine-enemyjs), [§8.3](contracts/COMBAT.md#83-phases) |
| **Kneel** | The boss's collapse at 35 % HP: its core is exposed for 90 frames (every hit a crit, damage capped at 8 % of its HP). | [COMBAT.md §8.3](contracts/COMBAT.md#83-phases) |
| **Lock-on / soft target / boss framing** | **L** locks the camera focus and attacks onto one enemy; without a lock, attacks turn toward the nearest enemy in front (**soft target**); during the boss fight the camera keeps the boss in frame. | [COMBAT.md §6.9](contracts/COMBAT.md#69-targeting-and-lock-on-targetingjs) |
| **Engaged** | True while aggroed enemies are near: battle music, a tighter depth of field, no photo mode, no resting. | [COMBAT.md §6.12](contracts/COMBAT.md#612-waystones-chests-shop-engagement) |
| **Sub-step / combat clock / stepped mode** | Each frame's time is split into equal steps of at most 1/60 s; the hooks' `step(n)` advances exact frames, so a scripted fight repeats bit for bit. | [ADR-028](history/DECISIONS.md#adr-028--a-sub-stepped-combat-clock-d3), [AUTOMATION_API.md §3.4](specs/AUTOMATION_API.md#34-window__gamecombat-combat-levels-only) |
| **Height model / body band** | One rule for line of sight, arrows, bolts and the level validator: a shot runs from ground + 0.9 to the target's body middle and is blocked by terrain above it; a hit needs the projectile to overlap the target's body band. | [COMBAT.md §7.6](contracts/COMBAT.md#76-movement-separation-line-of-sight-projectiles) |
| **Hurt radius / move radius / separation** | Hits test the **hurt** radius, movement the **move** radius; overlapping actors are pushed apart in inverse proportion to their mass (enemies have no TileMap colliders). | [ADR-030](history/DECISIONS.md#adr-030--enemies-have-no-tilemap-colliders-combat-separates-actors-d5) |
| **Pickups / magnet** | Coins, hearts, mana motes, draughts, upgrades and the boss's core pop out of defeated enemies and chests and fly to a player within about 2 u. | [COMBAT.md §7.8](contracts/COMBAT.md#78-loot) |
| **Results card** | The summary shown after the boss falls: time, foes defeated, falls, perfect dodges, level. | [COMBAT.md §6.12](contracts/COMBAT.md#612-waystones-chests-shop-engagement) |
| **Combat fixture / greedy run / play-through bot** | The small in-page test level of `sandbox/combat_fixture.js`; the god-mode, always-attacking boss run that sets a lower bound on the fight's length (≈ 40 s); `combat.play.json`, a bot that plays Cinderwatch Pass with real key presses. | [TESTING_AND_VERIFICATION.md](development/TESTING_AND_VERIFICATION.md) |
| **Fixed step / digest** | The bot's deterministic mode: the page is loaded with `&fixedstep=1` (`Engine#manualStep`, no animation loop), the bot steps the engine at exactly 1/60 s and a virtual page clock replaces the timers; the run's `digest` (a hash of every actor's state, every frame) is the same for the same code on any machine load. | [ADR-043](history/DECISIONS.md#adr-043--a-fixed-step-mode-for-the-play-through-bot) |

---

## The editor

| Term | Definition | Details |
| --- | --- | --- |
| **`EditorState`** | The single source of truth of the editor: the level document, selection, active tool, undo / redo. Views and tools never keep their own copy. | [EDITOR.md](architecture/EDITOR.md) |
| **Transaction** | `begin()` … `commit()` around a set of mutations; one transaction = one undo step (a whole stroke or drag). Mutations outside one are auto-wrapped. | [EDITOR.md](architecture/EDITOR.md) |
| **Stroke** | One pointer-down → move → up gesture of a tool (a paint stroke, a drag). | [EDITOR.md](architecture/EDITOR.md) |
| **`PointerEv`** | The view-agnostic pointer event a view sends to a tool: the tile (`i`, `j`), the world point (`x`, `y`, `z`), the button, the Shift / Ctrl / Alt modifiers, the view (`2d` / `3d`), the object or spawn under the pointer, and `cancelled` when a gesture was interrupted. | [EDITOR.md](architecture/EDITOR.md) |
| **Tool preview** | What a tool asks the views to draw while hovering or dragging (brush outline, ghost object, box). | [EDITOR.md](architecture/EDITOR.md) |
| **`change` event** | Emitted by `EditorState` after each mutation with the dirty object ids and tile rectangles, so views update incrementally. | [EDITOR.md](architecture/EDITOR.md) |
| **Job queue** | The 3D viewport's one-job-per-frame queue of incremental rebuilds (terrain chunks, water, prop batches) that keeps strokes at the display rate. | [EDITOR.md](architecture/EDITOR.md) |
| **Ghost** | The translucent preview of the object the Place tool will put down. | [LEVEL_EDITOR_GUIDE.md](user/LEVEL_EDITOR_GUIDE.md) |
| **Project folder** | `public/levels/<name>.json`, written through the dev server's level API (only under `npm run dev`). | [LEVEL_STORAGE_API.md](specs/LEVEL_STORAGE_API.md) |
| **Browser slot** | A level kept in `localStorage` under `lumina.level.<slot>`; the game opens one with `?level=local:<slot>`, the editor with `?local=<slot>`. | [LEVEL_STORAGE_API.md](specs/LEVEL_STORAGE_API.md) |
| **Play-test slot** | The browser slot `__playtest__` the editor writes before opening the game on it (F5 / Play ▶). | [LEVEL_STORAGE_API.md](specs/LEVEL_STORAGE_API.md) |
| **Autosave / recovered work** | The working copy saved every ~20 s to the `__autosave__` slot; copies the editor could not offer are kept as *Recovered unsaved work*. | [LEVEL_EDITOR_GUIDE.md](user/LEVEL_EDITOR_GUIDE.md) |
| **Slug** | The file-safe name a display name becomes (`slugify`: lowercase, `a-z 0-9 -`); "Untitled" becomes `untitled`. | [LEVEL_STORAGE_API.md](specs/LEVEL_STORAGE_API.md) |
| **`window.__editor`** | The automation hook of the editor page: `app, state, tools, view3d, view2d, textures, ready3d`. | [AUTOMATION_API.md](specs/AUTOMATION_API.md) |

---

## Tools, verification and process

| Term | Definition | Details |
| --- | --- | --- |
| **Harness** | `npm run check` ([`tools/check.mjs`](../tools/check.mjs)): starts its own Vite server, drives headless Chrome on the real GPU, writes screenshots and `report.json` to `.check/<out>/`. The project's equivalent of a test run. | [TESTING_AND_VERIFICATION.md](development/TESTING_AND_VERIFICATION.md) |
| **Action script** | A JSON list of harness steps (`wait`, `key`, `press`, `eval`, `shot`, `fps`, `click`, `dblclick`, `move`, `mouse`, `drag`, `wheel`, `type`, `combo`, `goto`, `tab`). | [AUTOMATION_API.md](specs/AUTOMATION_API.md) |
| **`.check/`** | The gitignored folder of harness outputs; disposable (the build history that used to live in `.check/history/` is archived in [history/reports/](history/reports/README.md)). | [DEVELOPMENT_WORKFLOW.md](development/DEVELOPMENT_WORKFLOW.md) |
| **Fingerprint** | Hashes of Emberfall's lights, colliders and meshes (plus interactables and the program count) used to prove a change did not alter the reference level. | [TESTING_AND_VERIFICATION.md](development/TESTING_AND_VERIFICATION.md) |
| **Binding contract** | `ARCHITECTURE.md` (engine) and `docs/contracts/LEVEL_EDITOR.md` (level format, editor): names and meanings that may only change additively. | [contracts/README.md](contracts/README.md) |
| **Module notes** | `docs/contracts/MODULE_NOTES.md`: the builders' and auditors' descriptive notes per module — not binding, partly stale. | [contracts/README.md](contracts/README.md) |
| **Workflow** | One multi-agent run (seven recorded ones, then the documentation, fix and combat runs): **builders** write code against a contract, **auditors** / **reviewers** check it independently, a **fixer** applies the findings and a **verifier** re-checks. Each left a JSON report, archived in [history/reports/](history/reports/README.md). | [PROJECT_HISTORY.md](history/PROJECT_HISTORY.md) |
| **ADR** | Architecture decision record — the numbered entries of [DECISIONS.md](history/DECISIONS.md). | [DECISIONS.md](history/DECISIONS.md) |
| **Type check** | `npm run typecheck` ([`tools/typecheck.mjs`](../tools/typecheck.mjs)): `tsc` with `checkJs` over the plain JavaScript and its JSDoc in two programs (`src/` + `sandbox/`; the Node `tools/`). Emits nothing; Vite never type-checks. | [CONVENTIONS.md §3.1](development/CONVENTIONS.md#31-the-type-check) |
| **Contract types (typed copy)** | The types a contract's interfaces are declared as and the code is checked against: `src/engine/level/types.d.ts` (level format), `src/demo/combat/types.d.ts` (combat §9), `Tool` / `PointerEv` (editor tools), `GameHooks` / `EditorHooks` / `LuminaHooks` (automation). Written from the code; where the contract text differs they follow the code. | [CONVENTIONS.md §3.1](development/CONVENTIONS.md#31-the-type-check) |
| **Module augmentation** | Declaring extra members of a class from a folder's `types.d.ts` (`declare module './Foo.js' { interface Foo { … } }`) — how fields created lazily (`this._x ??= …`) are typed without a code change. Never a `Foo.d.ts` beside `Foo.js`. | [CONVENTIONS.md §3.1](development/CONVENTIONS.md#31-the-type-check) |
| **Mutation test** | Breaking the code on purpose (renames, typos, wrong shapes), one change at a time in a copy of the tree, to measure what a check catches — the type check caught 87 of 88. | [TESTING_AND_VERIFICATION.md §8.4](development/TESTING_AND_VERIFICATION.md#84-the-type-check) |
| **`level:check`** | `npm run level:check -- <level>` ([`tools/check-level.mjs`](../tools/check-level.mjs)): the generators' level checks (`checkLevel` of [`tools/lib/levelcheck.mjs`](../tools/lib/levelcheck.mjs)) on any level file — reachability, stairs, bridges, waterfalls, overlaps, what the camera cannot see; `--strict` for the generators' bar. | [LEVEL_DESIGN_GUIDE §14](design/LEVEL_DESIGN_GUIDE.md#14-validation) |
| **`docs:check`** | `npm run docs:check` ([`tools/check-docs-links.mjs`](../tools/check-docs-links.mjs)): validates every relative link, image and anchor in the docs, `README.md` and `CLAUDE.md`. | [DEVELOPMENT_WORKFLOW.md](development/DEVELOPMENT_WORKFLOW.md) |
