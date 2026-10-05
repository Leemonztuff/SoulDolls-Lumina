# Lumina — an HD-2D engine for three.js (This is a demo project starts from a one-shot build by Opus 5.5 and is intended for reference only.)

**Lumina** is a small engine for *HD-2D* games in the style of *Octopath Traveler II*: hand-drawn
pixel-art sprites standing in a lit, shadowed, tilt-shift-blurred 3D diorama. It is built on
three.js r186 with plain JavaScript ES modules (type-checked through their JSDoc), and **every
asset is generated procedurally at runtime** —
textures, character sheets, particles, sound effects and music. The engine and the game ship no
image or audio files (the only images in the repository are the documentation screenshots in
`docs/assets/`).

**Emberfall — Riverside Village** is the playable demo: a small, dense village at golden hour, with
a windmill on the hill, a waterfall, a river and bridge, a farm, an autumn grove with a pond and a
campfire meadow. Eight villagers have something to say.

**Starfall Vale — Where the Stars Come Home** is the flagship 128 × 128 showcase level
(`index.html?level=starfall-vale`): the night of the Starfall Festival in a whole vale — the
market town of Hearthwick on the Silverrun, Mount Lumen with its observatory and the three
waterfalls of the Three Sisters, Goldenfield Farms, Lake Mirrormere and its fishing hamlet, the
Meadowlands with a travelling troupe, the autumn Emberwood with a hidden glade, and the Old
Quarry. 29 villagers, 27 buildings, ~870 objects; every tile type, object type, NPC action and
behaviour, critter kind and particle-area preset of the level format (all but the two weather
presets, rain and snow, which follow the camera). After dusk the sleeping stars glimmer up
through the lake off the end of the Long Pier. It is generated and validated by
`tools/make-starfall-vale.mjs` (`node tools/make-starfall-vale.mjs`).

**Cinderwatch Pass — Where the Old Fires Wake** is the combat demo (`index.html?level=cinderwatch-pass`,
96 × 120): real-time action combat in the same diorama — a sword combo with hit-stop, a dodge roll,
skills, telegraphed enemy attacks drawn on the ground, loot, levels, waystones and a three-phase boss,
Cinderheart, in the caldera at the top of the pass. Combat exists only on levels with enemies; the
other levels stay peaceful. It is generated and validated by `tools/make-cinderwatch-pass.mjs`.

**Gildhaven — Market Day on the River Gild** is a bustling 128 × 128 walled town on fair day
(`index.html?level=gildhaven`): High Town and Sunspire Abbey on a terrace, the Gildfall dropping off
its edge into the river, a Market Square on the water with eight stalls round the Gild Well, quays,
three bridges and a harbour with piers, two rows of homes and shops, the town wall and the South
Gate, and outside it Fairfield with the players' stage and a windmill. 68 villagers, 53 buildings,
13 shops. It is generated and validated by `tools/make-gildhaven.mjs`.

```bash
npm install          # once
npm run dev          # http://127.0.0.1:5173/  (demo)  ·  /editor.html  (level editor)  ·  /sandbox/
npm run build        # production build → dist/ (the game and the editor)
npm run preview      # serve dist/
npm run check -- --page=index.html --query=autostart=1 --out=demo --wait=6000   # headless check
npm run typecheck    # tsc over the JavaScript and its JSDoc (no .ts files, nothing emitted)
```

`?autostart=1` skips the title screen and starts in gameplay (used by the headless harness). Audio
unlocks on the first key press or click. The game plays any level file: `?level=<name>` loads
`public/levels/<name>.json`, `?level=local:<slot>` a level kept in the browser (the editor's
play-test uses `local:__playtest__`); no query plays Emberfall (`public/levels/emberfall.json`).
Levels are made with the [visual level editor](#level-editor).

## Documentation

The complete documentation is in [`docs/`](docs/README.md):

- **[docs/README.md](docs/README.md)** — the index: every document with a one-line summary,
  reading paths for players, level designers, engine developers and AI agents, and which document
  is the source of truth for what.
- **[docs/index.html](docs/index.html)** — a visual landing page with screenshots and feature
  tiles (open the file directly, or `/docs/index.html` on the dev server).
- **[docs/ai/AGENT_ONBOARDING.md](docs/ai/AGENT_ONBOARDING.md)** — start here in a fresh AI coding
  session (golden rules, verification loop, where to find things).

Most used: [getting started](docs/user/GETTING_STARTED.md) ·
[playing the game](docs/user/PLAYING_THE_GAME.md) ·
[level editor guide](docs/user/LEVEL_EDITOR_GUIDE.md) ·
[level format](docs/specs/LEVEL_FORMAT.md) ·
[architecture overview](docs/architecture/OVERVIEW.md) ·
[known issues](docs/ai/KNOWN_ISSUES.md). `npm run docs:check` validates every link in the docs.

---

## Features

**Rendering — the HD-2D look**
- Pixel art everywhere at a constant 16 px per world unit, NEAREST-magnified, with normal maps so
  the pixels react to light: 46 procedural world textures, 14 character presets, 4 creatures and
  23 prop and particle sprites.
- Diorama camera: narrow FOV (28°), 32° pitch, smooth follow with look-ahead, Q/E orbit, zoom,
  focus bounds, screen shake.
- Post-processing: tilt-shift depth of field with a half-resolution bokeh gather and highlight
  scatter (bright specks turn into bokeh discs), soft-knee bloom, ACES tone mapping and a display
  grade (contrast, saturation, warm or cool balance, teal-lifted shadows, vignette, grain,
  chromatic aberration, sharpen). Everything is live-tunable.
- Lighting: a 24-hour keyframed palette (pink dawn → noon → golden hour → purple dusk → blue
  night) drives the sun and moon (soft, texel-snapped shadows), hemisphere fill, FogExp2, exposure
  and the sky. Lantern point lights flicker with smooth noise, windows glow at night, and god
  rays fall through the canopy. A level may have any number of lights: a `LightPool` shares the
  12 real point lights among the lanterns around the camera, crossfading as you walk.
- Sprites: lit, shadow-casting billboards with bent normals and wrap lighting, so backlit
  characters stay warm. Shadows come from sun-facing silhouette proxies, plus blob contact
  shadows. The player shows as a pale x-ray silhouette when a house or canopy hides them; it
  writes its own depth, so the depth of field keeps it sharp instead of blurring it with the roof.
- Instanced foliage (one draw call per field) sways with the wind. Tree canopies are
  camera-facing leaf clumps that cast dappled, swaying shadows.
- GPU particles, one draw call per emitter: dust motes, fireflies, embers, chimney and campfire
  smoke, falling leaves and petals, waterfall mist, rain, snow, splashes and sparkles.
- Water: flow-mapped pixel ripples, shore foam, depth tint, sun and moon glints, and waterfalls
  with churning pools.

**World building**
- `TileMap`: blocky multi-level terrain from an ASCII legend. It supports cliffs with hanging grass
  lips, four-step stairs, baked ambient occlusion, organic grass fringes, walk surfaces for bridges,
  and circle-vs-grid movement with sliding.
- `PropFactory`: houses (timber, plaster, brick, log, stone; one or two storeys; hanging sign,
  flower boxes, chimney), trees (oak, autumn, birch, pine), lampposts, torches, a campfire, well,
  market stall, bridge, windmill, fences, benches, barrels, crates, haystacks and rocks.
  `mergeStatic()` batches a whole village into a few dozen draw calls.
- Big levels (up to 128 × 128): batches are cut into spatially compact pieces the camera and the
  shadow pass can cull (`SpatialSplit`), shadows of opaque props and cliffs are drawn by a few
  merged shadow-only proxies (`ShadowCasters`), collision queries use a spatial grid, and the
  water's shore texture bakes in a worker while the rest of the world loads.

**Game layer**
- A procedural WebAudio `AudioSystem`: a harp, pad and flute folk loop, eight sound effects, and
  wind, birds, crickets, fire and water ambience with crossfades (combat levels add 35 combat
  sounds, a battle and a boss track and two stingers).
- A DOM `UI`: title screen, Octopath-style gold-bordered dialog with typewriter text and choices,
  area banners, clock HUD, interaction prompt, toasts, fades, and a themed lil-gui debug panel
  with a stats overlay.
- Maps: a gold-framed HUD minimap under the clock (north up; the player arrow, the camera's view,
  villagers, signs, doors, wells and campfires) and a full-screen world map (N / Tab) with the
  level's region names and a legend. Both draw a painted map of the level (`LevelMap`: tile
  colours shaded by height, cliffs, water, roads, roofs, bridges, trees) rendered once at load.

**Combat — Cinderwatch Pass** (only on levels with enemies; [COMBAT.md](docs/contracts/COMBAT.md))
- Real-time action combat in the HD-2D look: a 3-hit sword combo with hit-stop, a dodge roll with
  invulnerability and a perfect-dodge slow motion, three skills (Whirl Slash, Ember Bolt, Radiant
  Nova), stamina, healing draughts, soft targeting and lock-on.
- Eight enemy kinds — slime, goblin, archer, shaman, bat, boar, a training dummy and the
  three-phase boss **Cinderheart** — with telegraphed attacks (a wind-up flash and red ground
  markers draped over the terrain), attack tokens, leashes and a height model for arrows and bolts
  across ledges; enemies find their way up stairs and onto ledges on a walk grid, walk home by
  path, and each pack stays in its own part of the level (its region).
- XP and levels, loot (coins, hearts, mana motes, draughts, upgrades), chests, waystones
  (checkpoint and rest), death and respawn at the last waystone, a boss arena with an ember wall,
  battle and boss music, a combat HUD (vitals, skill bar, loot feed, boss bar, damage numbers,
  enemy bars, off-screen arrows — all kept clear of the HUD panels) and a results card; two
  shopkeepers sell draughts and three one-time upgrades for the gold you collect.
- **Cinderwatch Pass** (`?level=cinderwatch-pass`, 96 × 120, generated by
  `tools/make-cinderwatch-pass.mjs`): a camp with training dummies and a drillmaster, a glade, two
  branches (the Bramble Ruins or the Hollow Mire), the Cinder Quarry and Cinderheart's caldera.
  Every other level stays peaceful and unchanged.

**The Emberfall demo**
- A 48 × 40 tile level plus a fogged outer world, so no view looks like a floating island. The
  map is ringed by a non-walkable forest border and continues into a heightfield. Tree clusters,
  northern hills and mountain ridges fade into atmospheric fog, which starts a few units in front
  of the player so the diorama itself stays crisp.
- A diorama camera pulled back to 30 units (fov 28°, pitch 32°) so the player stands inside a
  readable slice of the village. Its focus bounds widen as you zoom in, so the player stays in
  frame (and in the depth-of-field band, which follows the player) right up to the map edges; on
  Windmill Hill it tilts down a little, and near the east / west edges it won't swing out over
  the border forest. At golden hour the sun sits about 25° up, behind and to the left, so shadows
  rake long toward the lower right without swallowing the plaza; the moon keys the night from the
  front-right. Characters share a sprite look (an upward-leaning shading normal, wrap lighting and
  a small warm fill that fades at night), so they read clearly against the light.
- The clock runs (one game hour ≈ 90 s): the day drifts from golden hour into dusk and night on
  its own; T jumps to the next preset.
- The traveler walks and runs with camera-relative movement. Facing uses 4 directions. Height
  follows stairs and bridges smoothly. Footsteps play on the contact frames, and running kicks up
  dust.
- Eight villagers, each with their own dialogue:
  - The elder shares the village's lore.
  - The innkeeper lets you rest until morning, with a fade-out and the time set to 8:00.
  - The merchant hands out apples.
  - The guard watches the bridge.
  - The farmer tends his fields.
  - A child chases the chickens.
  - The bard tells you about his song, and plays on or rests at your request.
  - A scholar on Windmill Hill explains the controls in character.

  Villagers wander, turn to face you and then carry on. A cat, chickens that scatter and plaza
  birds that take flight bring the place to life. Signposts, the well and house doors can be read.
- T cycles the time of day through dawn, midday, golden hour, dusk and night, with a 2-second
  glide. R cycles the weather clear → rain → snow. Weather changes blend the sun, fog, wind,
  grade and particles. Rain and snow also grey the light, fog and sky tint toward overcast; on
  grey days the lanterns and windows glow, and snow settles on the ground, grass and roofs.
- Ambience follows the world: birds by day, crickets at night, a fire that crackles louder near
  the campfire, and water that grows louder near the river and the falls.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows · left stick / D-pad | Move (camera-relative) |
| Shift · RT | Run |
| Space / Enter / F · A | Talk / examine / advance dialog |
| ↑ ↓ | Choose a dialog option |
| Q / E · LB / RB | Rotate the camera |
| Z / X or = / − · mouse wheel · Y / X (gamepad) | Zoom in / out |
| N / Tab · View (Back) | World map (N, Tab, Esc or Backspace closes it; you stand still while it is open — the clock and the villagers carry on) |
| T | Next time of day (dawn → midday → golden hour → dusk → night) |
| R | Weather (clear → rain → snow) |
| P (Esc / Backspace to leave) · right stick click | Photo mode (hides the UI) |
| M | Music on / off |
| H · Start | Controls legend |
| Esc / Backspace · B | Cancel: finish the typing line, close the world map, leave photo mode |
| ` (backquote) / F1 | Debug panel (Time & Weather, Post FX, Lighting, Camera, Atmosphere, Render) |

**Combat controls** (Cinderwatch Pass and other levels with enemies only — on every other level
these keys do nothing):

| Key · mouse | Gamepad | Action |
| --- | --- | --- |
| J · left button | X | Attack (press again as the blade returns: a 3-hit combo) |
| K · right button | B | Dodge roll (with a direction; a backstep without one) |
| U / I / O or 1 / 2 / 3 | hold LT + X / Y / B | Skills: Whirl Slash (Lv 1), Ember Bolt (Lv 2), Radiant Nova (Lv 4) |
| C or 4 | Y | Healing Draught |
| L · middle button | right stick click | Lock on / next target (hold to release) |
| Space / Enter / F | A | Talk, open a chest, rest at a waystone |
| Z / X, wheel | right stick up / down | Zoom (the pad's X / Y attack instead) |
| P | left stick click | Photo mode (refused while foes are near) |

**Pad layout on combat levels:** left stick move · RT run · **X** attack · **B** roll (and cancel,
as everywhere) · **hold LT + X / Y / B** skills 1–3 · **Y** draught · **RS click** lock on · **A**
talk / open / rest · LB / RB camera · **right stick up / down** zoom · Back world map · **LS click**
photo (ignored while running). The HUD legend and the skill keycaps switch to the pad as soon as a
pad is used, and a one-time hint lists the layout. The full reference is
[INPUT_AND_CONTROLS.md](docs/specs/INPUT_AND_CONTROLS.md).

## Level editor

`npm run dev`, then open **http://127.0.0.1:5173/editor.html** — a visual editor for Lumina level
files with a live HD-2D 3D preview (the real engine: terrain, water, props, lights, sprites, sky)
next to a textured top-down 2D map. `editor.html?open=<name>` opens `public/levels/<name>.json`
(e.g. `?open=emberfall`), `?local=<slot>` opens a level kept in the browser, `?new` starts an
empty level; otherwise the last layout is restored and an autosaved working copy is offered.

**Workflow**
1. **Terrain** — pick a tile in the palette and **paint** (B) with a square or round brush
   (`[` / `]` sizes it), **fill** (G) or drag a **rectangle** (U). Sculpt with **Height** (H: raise,
   lower, set, flatten, smooth; Shift inverts raise / lower) and add **stairs** (T; they face the
   higher neighbour). Water tiles (river, pond, fast stream, plunge pool) fill to the level's
   water level.
2. **Objects** — **Place** (O) buildings, trees, lights, props, fences and bridges (click the two
   ends or drag), waterfalls, villagers, critter groups, particle areas (a click places a default
   8 × 2.4 × 8 box; resize it with its handles) and regions (drag a rectangle). The ghost shows
   exactly what a click places (R / Shift+R rotate it). Set the **player start** with P.
   The **Combat** section places enemy groups (a kind, a count, a home radius, a level, elite),
   treasure chests and waystones; one enemy group turns the level into a combat level (*Level
   settings › Environment › Combat*: Auto / On / Off). A boss group gets its arena and gate from
   the inspector's *Boss arena* section, with handles to drag.
3. **Select & inspect** — **Select / Move** (V): click, Shift+click, Ctrl+click, drag a box over
   empty ground; drag to move (snaps to 0.5; Alt = free); drag the handles of fences, bridges,
   regions and particle areas. The **inspector** edits every field of the selection (dialogue,
   shop items, behaviours, texts, lights…), the whole level when nothing is selected; the
   **outliner** lists, filters and hides object types. **Eyedropper** (I) picks tiles, **Erase**
   (X) removes objects.
4. **Save** — Ctrl+S saves where the level came from; **Save as** (Ctrl+Shift+S) chooses the
   **project folder** (`public/levels/<name>.json`, only under `npm run dev` — the game then loads
   it with `?level=<name>`, also in production builds), the **browser** (localStorage) or a
   **download**. Ctrl+O opens from any of them or from a file (drag a `.json` onto the window). The
   working copy is autosaved every ~20 s; an autosave the editor could not offer (another tab, a
   dismissed restore prompt, a start through `?open=` / `?new`) is kept under File › Open › This
   browser › Recovered unsaved work. Save as asks for the level's display name while it is still
   "Untitled".
5. **Play-test** — **Play ▶** / F5 validates the level, stores it in the browser slot
   `__playtest__` and opens `index.html?level=local:__playtest__&autostart=1` in a new tab.

**Views** — layouts 3D + 2D (1), 3D only (2), 2D only (3). 3D: right-drag orbits, middle-drag or
Shift+right-drag pans, the wheel zooms toward the cursor, F / double-click focuses, WASD / QE fly
while the right button is held; the View menu switches the gameplay camera (Q / E rotate it), the
HD-2D post effects and the atmosphere (particles, god rays, ground foliage, rain / snow and snow
cover) on; the level's weather always shows its grey light, wind and glowing lanterns. 2D:
the wheel zooms, right-drag or Space+drag pans, double-click focuses. Space+drag pans in the 3D
view too, and the 3D bar's sun slider previews the time of day (linked to the level's start time
until you drag it; the ? button lists the camera controls). Right-click opens a context menu in
both.

**Shortcuts**

| Keys | Action |
| --- | --- |
| V · B · G · U · H · T · O · P · I · X | Tools: select / move, paint, fill, rectangle, height, stairs, place object, player start, eyedropper, erase |
| Ctrl+N (Alt+N) · Ctrl+O · Ctrl+S · Ctrl+Shift+S · Ctrl+E | New · open · save · save as · download .json |
| F5 | Play-test |
| Ctrl+Z · Ctrl+Y / Ctrl+Shift+Z | Undo · redo (one stroke or drag = one step) |
| Ctrl+C · Ctrl+X · Ctrl+V · Ctrl+D | Copy · cut · paste at the pointer · duplicate |
| Delete / Backspace · Ctrl+A · Esc | Delete selection · select all objects · deselect / cancel the current gesture |
| R / Shift+R · Ctrl+R / Ctrl+Shift+R | Rotate the selection (or the Place ghost) ±15° · ±90° |
| Arrows (Shift ×4; Alt ×0.2 with the Select tool) | Nudge the selection 0.5 |
| Alt (while placing / moving) · Alt+click (terrain tools) | No snapping · pick the tile / height under the pointer |
| Shift+click (paint) · Shift (height) | Straight line from the last stroke · invert raise / lower |
| [ / ] | Brush size |
| 1 / 2 / 3 · F · Home · Ctrl+G | Layout split / 3D / 2D · frame selection · frame level · grid |
| ? | Keyboard shortcut list |

Keys are never taken while a text field has focus. Chrome reserves Ctrl+N in normal tabs — use
Alt+N or File ▸ New.

**Where levels live** — `public/levels/*.json` (the project: `emberfall.json` is the demo,
`sample-hamlet.json` a small example, `brightwater-crossing.json` a 36 × 28 hamlet built entirely
in the editor — play it with `index.html?level=brightwater-crossing`; `starfall-vale.json` the
128 × 128 showcase, generated by `tools/make-starfall-vale.mjs`; `cinderwatch-pass.json` the
96 × 120 combat level, generated by `tools/make-cinderwatch-pass.mjs`; `gildhaven.json` the 128 × 128
town, generated by `tools/make-gildhaven.mjs`; all editable), browser storage (`lumina.level.<slot>`), or
any file. To check a level made in the editor with the generators' rules (reachability, stairs,
bridges, overlaps, what the camera cannot see past roofs and trees), run
`npm run level:check -- <name>` after saving it. The format is plain JSON (`"format": "lumina-level"`) described in
[`docs/contracts/LEVEL_EDITOR.md`](docs/contracts/LEVEL_EDITOR.md) with the object catalog, the editor's architecture
and its contracts.

## Architecture

```
index.html ─ src/main.js ─ src/demo/Game.js ──────────────────────────────────────────────────────
                               │  frame: Input → LightingSystem.update → Game.update (player, NPCs,
                               │  critters, CameraRig, SpriteManager, weather, world, particles, HUD,
                               │  audio director) → AudioSystem.update → LightingSystem.lateUpdate
                               │  (shadow frustum) → UI.update → PostFX.render → DebugStats
                               ▼
src/engine/index.js  (public API barrel)
├─ core/       Engine (loop, systems, resize) · Input (keys, pointer, gamepad, actions)
│              CameraRig (diorama follow camera) · EventEmitter
├─ audio/      AudioSystem (procedural sfx, ambience layers, music)
├─ render/     PostFX (MSAA HDR → DOF → bloom → output → grade) · GlobalUniforms · shaders/
├─ pixel/      PixelCanvas · Palette · TextureLibrary · CharacterSprites · PropSprites
│              · MonsterSprites (enemy sheets) · FxSprites (the combat FX atlas)
├─ sprite/     Sprite3D (lit billboard) · SpriteManager · BlobBatch (instanced contact shadows) · Foliage (instanced)
├─ fx/         Particles (GPU emitters + bursts) · GodRays · FxQuads (instanced atlas quads)
│              · GroundMarkers (terrain-draped telegraphs) — the last two on combat levels only
├─ lighting/   LightingSystem (24 h palette, sun/moon, fog, point lights) · LightPool · Sky
├─ world/      TileMap · Water + createWaterfall · WaterShore (shore bake) + shoreWorker · Props
│              (PropFactory) + props/* · SpatialSplit (k-d batching, box culling) · ShadowCasters
├─ level/      LevelFormat (lumina-level JSON) · ObjectCatalog · ObjectBuilder · LevelStorage · LevelMap
└─ ui/         UI · DialogBox · Banner · TitleScreen · HUD · Minimap + WorldMap · InteractPrompt · Fader
               · DebugPanel · combat: CombatHUD · BossBar · WorldLabels · Announcer · DeathScreen

src/demo/combat/  (combat levels only; CombatSystem is loaded on demand)
               CombatSystem (sub-stepped combat clock, hits, loot, boss arena, shop, hooks) · PlayerCombat
               · Enemy + ai/* (eight brains) · Nav (the enemies' walk grid) · defs (enemy stats)
               · rules (player numbers, shop wares) · Feel

editor.html ─ src/editor/main.js ─ EditorApp (menus, dialogs, shortcuts, save / play-test)
               ├─ EditorState (level document, selection, tools, undo / redo) · tools/*
               ├─ map2d/Map2DView (textured top-down map) · viewport3d/Viewport3D (live HD-2D preview)
               └─ ui/* (toolbar, tool options, inspector, outliner, status bar)
```

The barrel also re-exports the lower-level building blocks for games that extend the engine:
`MeshBuilder`, the wind and flame shaders and `PropTextureSet` for custom props, and the
full-screen shaders PostFX is assembled from.

Modules share a small set of global uniforms: time, night factor, wind, camera yaw and position,
and sun direction and colour. That is how billboards, foliage, water, particles and flames stay in
sync without talking to each other. [`ARCHITECTURE.md`](ARCHITECTURE.md) is the contract for every
module. [`docs/contracts/MODULE_NOTES.md`](docs/contracts/MODULE_NOTES.md) records what each module actually implements.

The code is plain JavaScript with JSDoc, checked by the TypeScript compiler without a build step:
`npm run typecheck` runs `tsc` (`checkJs`, `noEmit`) over `src/` and `sandbox/` and, under Node
types, over `tools/`, and fails on any error. The contracts have typed copies — the level document
([`src/engine/level/types.d.ts`](src/engine/level/types.d.ts)), the combat interfaces
([`src/demo/combat/types.d.ts`](src/demo/combat/types.d.ts)), the editor's tool interface and
the automation hooks ([`src/globals.d.ts`](src/globals.d.ts)) — so renaming a member fails
everywhere it is used. Conventions: [docs/development/CONVENTIONS.md §3.1](docs/development/CONVENTIONS.md#31-the-type-check);
why JSDoc instead of TypeScript files: [ADR-044](docs/history/DECISIONS.md#adr-044--jsdoc-types-checked-by-tsc-instead-of-a-typescript-conversion).

### Demo code (`src/demo/`)

| File | Role |
| --- | --- |
| `Game.js` | Boots the engine and wires every module. It runs the title → gameplay flow, input shortcuts, interactions and dialogs, and exposes `window.__game`. |
| `World.js` | Builds the diorama from a level object: terrain via `buildLevelTerrain`, every object via `LevelObjectBuilder`, then lights → a `LightPool` of 12 (≤ 12 descriptors: one permanent light each, by `LIGHT_PRIORITY`; more: shared around the camera), emissives → `registerEmissive`, emitters → `createEmitter`, colliders and walk rects → `TileMap`. Static props and trees are merged; levels bigger than 64 tiles get the spatial batching of `BIG_LEVEL_BATCHING`. `stats.phases` holds the build time per step. |
| `public/levels/emberfall.json` | The Emberfall level (tiles, heights, every house, prop, tree, light, villager, critter group, particle area, region and camera tuning) — the single source of truth, editable in the level editor. `tools/convert-emberfall.mjs` generated it from the original hand-written map; `tools/make-sample-hamlet.mjs` builds `sample-hamlet.json`. |
| `Scenery.js` | Continues the world past the map: `mergeTrees` batches wind-swayed trees into one mesh per material, a fogged outer heightfield, and deterministic forest scatter. |
| `GroundDetail.js` | Foliage fields: grass, tall grass, flowers, reeds, bushes, ferns, mushrooms and pebbles, packed into sprite strips. |
| `Player.js` / `Npc.js` / `Critters.js` | Traveler controller · villager AI (wander, post, perform, chase) · cat, chickens, birds. |
| `dialogue.js` | Villager definitions and their conversations; signpost and object text. |
| `Weather.js` | Time-of-day glides, weather blending and the debug "tuning" base values. |
| `WeatherLook.js` | The weather look shared with the editor preview: the per-weather table (`WEATHER_PARAMS`), the rain / snow emitter configs and the functions that apply a weather state (lighting, overcast tint, grade, wind, lamps and windows by day, particle areas). |
| `SnowCover.js` | The settled-snow patch for terrain, roofs and foliage (one shared uniform; the editor preview installs it too). |
| `AudioDirector.js` | Ambience mix from time of day, weather and distance to the fire and water. |
| `DebugControls.js` | The debug panel's folders. |
| `AtmosphereFog.js` | Fog start offset (keeps the diorama centre crisp). |
| `config.js` | Shared tunables: gameplay camera framing, the sun's arc and the character sprite look. |
| `levels.js` | The shipped levels offered by the title screen's destination row. |
| `combat/` | The combat system, created only on levels with enemies ([COMBAT.md](docs/contracts/COMBAT.md)): `CombatSystem` (orchestration, sub-stepped clock, hit resolution, loot, the boss arena, `window.__game.combat`), `PlayerCombat` (combo, roll, skills, draught), `Enemy` and `ai/*` (the state machine and the eight brains), `defs.js` / `rules.js` / `Feel.js` (every number), `bindings.js` (the combat keys, registered at runtime). |

### Automation hooks

`window.__game` exposes (typed by `GameHooks` in `src/demo/Game.js`):

- Engine handles: `engine, rig, postfx, lighting, ui, audio, tileMap, textures, particles, godRays, player, npcs, world, weather`.
- Actions: `setTime(h)`, `teleport(x, z)`, `talkTo(id)` (returns false while another conversation is running), `setWeather(name)`, `cycleTime()`, `cycleWeather()`, `photo(on)`, `map(open)` (the world map).
- `game.loadStats` (loading milliseconds by phase), `world.stats` (with `phases`), `window.__lumina.loadMs` (navigation start → first gameplay frame).
- NPC ids: `elder`, `innkeeper`, `merchant`, `guard`, `farmer`, `child`, `bard`, `scholar`.
- `state()`: a JSON-able summary with the player's position, tile, facing and animation, the time and phase, weather, dialog / world-map state, nearest interactable, draw calls, triangles, point lights (and how many are lit) and fps.
- On combat levels `__game.combat` (seed, reset, step, stepUntil, press, hold, move, aim, place, wake, kill, damage, setPlayer, god, freezeAI, bossPhase, setBossHp, boss.force / info / hazards, path, checkpoint, rest, respawn, showcase, enemies, stats) and `state().combat` (see [AUTOMATION_API.md](docs/specs/AUTOMATION_API.md)).

## Sandboxes

`/sandbox/` (dev server) is a gallery of standalone pages. Each one tests a single module against
raw three.js:

| Page | Modules |
| --- | --- |
| `sandbox/core.html` | Engine, Input, CameraRig, AudioSystem |
| `sandbox/textures.html` | TextureLibrary (`?view=atlas`, `gallery0..3`, `diorama`, `&night=1`) |
| `sandbox/sprite_art.html` | CharacterSprites, PropSprites (`?mode=gallery`, `focus`, `creatures`, `props`); combat sheets and the FX atlas (`?mode=combat`), the sheet-hash baseline (`?mode=hashes`) |
| `sandbox/sprite_runtime.html` | Sprite3D, SpriteManager, Foliage, Particles |
| `sandbox/terrain.html` | TileMap, Water, createWaterfall (`?view=overview`, `hd2d`, `cliffs`, `waterfall`, `pond`; `&time=`) |
| `sandbox/props.html` | PropFactory (`?night=1`, `?merge=1`, `?mode=gallery`) |
| `sandbox/lighting.html` | LightingSystem, Sky, GodRays (`?t=`, `?speed=`) |
| `sandbox/lighting_engine.html` | Lighting through the real Engine + PostFX pipeline |
| `sandbox/postfx.html` | PostFX (`?gui`, `?label`, `?freeze`) |
| `sandbox/ui.html` | UI components (`?combat=1`: the combat UI) |
| `sandbox/combat_fx.html` | FxQuads, GroundMarkers, the combat bursts, combat SFX and music, mouse buttons, stick zoom (`?view=gallery`, `stepped`, `probe`, `bursts`; `&t=21.5`) |
| `sandbox/combat_audio.html` | Combat audio QA and listening page: every combat sound, stinger, music section and dense mix rendered offline and measured (loudness, true peak, clicks, spectrum), with waveforms, spectrograms and live playback |
| `sandbox/enemy_ai.html` | Enemy and all eight AI brains against a scripted player, with the real walk grid (143 checks) |
| `sandbox/level_builder.html` | LevelFormat, ObjectCatalog, ObjectBuilder (every object type on a small level) |
| `sandbox/game_levels.html` | Game level loading edge cases (`?case=tiny`, `bare`, `wetspawn`, `stormnight`, `everything`, `hamlet`, `moved`, `hostile` — `Object.prototype` names in the level data, checked by `game_levels.hostile.json`) |
| `sandbox/editor3d.html` | The editor's Viewport3D on a generated 64 × 64 test valley (`?level=emberfall`, `&realtools`, `?postfx`, `?atmosphere`) |
| `sandbox/smoke.html` | three.js / WebGL2 smoke test |

Scripted checks for the editor live next to them: `sandbox/editor_shell.*.json` (menus, tools,
io, inspector, 2D map…), `sandbox/editor3d.*.actions.json` (3D viewport) and
`sandbox/editor_perf*.json` (stroke frame times with real mouse drags + an exactness check), e.g.
`npm run check -- --page=editor.html --query=new --out=perf --fps=0 --script=sandbox/editor_perf.json`.
Combat is checked by `sandbox/combat.*.json` (stepped checks on the in-page fixture level of
`sandbox/combat_fixture.js` and on Cinderwatch Pass) and `sandbox/combat.play.json`, a bot that plays
the whole level with real key events — in fixed step, so the same code gives the same run (and the
same digest) every time: `npm run check -- --page=sandbox/index.html --query= --out=play --wait=0 --fps=0 --script=sandbox/combat.play.json`.

## Performance

Measured on a GTX 1060 3 GB at 1600 × 900 (pixel ratio 1):

- **Frame rate:** 60 fps (vsync-capped). The headless harness runs at the host compositor's
  cadence (about 57 Hz here, the same as a blank page), at every location, time and weather.
- **GPU time:** about 8–9 ms per frame on average with other apps sharing the GPU; best-case
  minimums about 3.6–4.6 ms for the scene (shadow pass included), 1.3–1.5 ms for DOF (64 taps),
  0.3 ms for bloom and 0.25 ms for output and grade.
- **Draw calls:** about 170–245 per frame for the scene, including the shadow pass. The budget is
  300. The debug overlay shows more, because it also counts the ~20 post-processing passes.
- **Triangles:** about 0.34 M. The outer forest is merged into a handful of meshes.
- **Loading:** every shader program (57) is compiled against the real HDR render target during
  loading, and a few frames with every effect on (rain, snow) are drawn behind the loading screen,
  so nothing compiles during play: no hitch on the first rain or snow.
- **Point lights:** at most 12 (one per light descriptor up to 12; Emberfall has exactly 12), all
  created before the first frame. A level with more light descriptors shares 12 through a
  `LightPool` (re-ranked every 0.2 s around the camera focus: nearest first, weighted by priority,
  only lights whose range touches the view; a light that changes lantern fades out, moves and
  fades in).

**Big levels (128 × 128)** — an earlier build of Starfall Vale (892 objects, 84 light descriptors,
29 villagers) at seven spots, golden hour and night (before → after the scalability work):

- **Draw calls** (scene pass incl. shadows): 182–353 → 159–283. The shadow pass draws opaque
  props and cliffs through a few merged shadow-only proxies, so the finer culling costs no calls.
- **Triangles:** 1.08–1.53 M → 0.81–1.17 M (a clustered 128 × 128 stress level: 0.88–1.35 M →
  0.59–0.89 M). Terrain, props, trees and foliage are batched into compact pieces culled by their
  bounding boxes, in the camera and in the shadow pass.
- **Loading** to the first gameplay frame (dev server, interleaved runs on a busy machine):
  9.6–10.3 s → 7.1–8.5 s (6.1–7.0 s on a quiet machine); `World.build` 4.4–5.2 s → 3.1–3.6 s.
  Collision queries go through a spatial grid (the foliage scatter used to test every collider
  for every tuft), the shore texture is baked once, in a worker, testing only the colliders of
  each wet tile, and the world's shader programs start compiling while the villagers and the UI
  are set up.
- **CPU per frame:** update ≈ 0.5 ms, render submission ≈ 3.5–5 ms. Villagers and critters more
  than 42 units from the camera focus (more when zoomed out: 1.15 × the camera distance + 4) update
  every 4th frame (with the accumulated time).
- **Lights:** at night all 12 point lights sit on the lanterns, torches and campfires around you
  (before: on the first 12 campfires and torches of the file; every other lamp was dark).
- **The shipped level** (874 objects, 95 light descriptors; god-ray shafts culled by a sphere
  round their base), render scale 1, 26 spots incl. the square at night, in rain and snow and
  zoomed out, the hamlet, the falls and the Emberwood: **135–283 draw calls** (the busiest: the
  square fully zoomed out; at the default camera distance every view in town, turned −60…60° and
  in rain, stays ≤ 283 — the budget of 300 is kept there; fully zoomed out the busiest views reach
  ~300); 0.73–1.21 M triangles; best-case GPU 5.0–7.2 ms per frame; CPU update 0.3–0.4 ms, render
  submission 1.9–2.7 ms. The blob contact shadows of all villagers and critters draw in one
  instanced call (`BlobBatch`). Loading to the first gameplay frame 2.7–2.8 s on a warm dev
  server (the final verification measured 2.40–2.46 s; 4.0–4.4 s with a cold shader cache;
  World.build ≈ 1.7 s, shader compile ≈ 0.3 s warm): the shore
  texture baked in the worker is final — villagers, whose colliders move, never shape it — so no
  bake runs in the first frame, and the waterfall-spray bursts compile at load (58–59 programs, none
  compiled on the way into town). Measured on a quieter machine than the rows above.

**Combat (Cinderwatch Pass, 96 × 120, 53 enemies):** 63 shader programs at load and exactly 63
after a scripted tour of every zone with woken enemies, every skill, both boss phases, the kill, a
level-up, death and respawn; 121–231 draw calls in the busiest zones at zoom 30 / 42 and yaw
−60 / 0 / +60 (budget 300); the combat update ≈ 0.2 ms p50 / 0.3 ms p95 per frame; no frame over
45 ms after warm-up (max 18 ms); load to the first gameplay frame 3.6–3.7 s from a production
build (≈ 4.5 s cold on the dev server). Peaceful levels keep their numbers (Emberfall 57 programs,
2.7–2.8 s production load, as before combat) and fetch no combat code chunk (the combat rules, FX
and UI load with Cinderwatch only; ≈ 24 kB gzip of combat code still sits in shared modules).

**Big screens:** the drawing buffer is capped at about 2.1 MP (a 2560 × 1440 window renders at
~1930 × 1086 and is scaled up), MSAA drops to 2× on large buffers, and a dynamic-resolution
governor lowers the render scale (down to 0.7) if the GPU frame time stays above 13.5 ms. A step
reallocates the drawing buffer and the post-processing targets — a one-off hitch of a few ms, up to
~0.2 s when other apps load the GPU — so it judges the median GPU time of the last few seconds and
steps rarely: down after 2 s above 13.5 ms, up after 10 s below 8.5 ms, never twice within 3 s. The
Render folder in the debug panel can switch it off and set the render scale by hand.

Chimney smoke, particles and god rays each cost one draw call per emitter or shaft in view. On big
levels particle areas, waterfall mist and chimney smoke more than 34 units from the camera focus are
switched off (only a zoomed-out view reaches them, where they are specks in the tilt-shift blur).

**Level editor:** on a 64 × 64 level with ~200 objects in the split layout, paint, height, water
and move strokes and 60-object drags run at the display rate (frame p95 ≈ 18 ms at the headless
compositor's ~56 Hz, worst frame ≤ 36 ms): edits update the level data at once and the 3D meshes
follow in time slices (terrain chunks, water in place with the shore bake in a worker, props
translated during a drag and rebuilt after it). The preview batches props per 16 × 16-tile chunk
(~720 draw calls instead of ~1370) and ends every stroke identical to a fresh build. On levels
bigger than 64 tiles it batches props per 32 × 32 tiles, merges the terrain chunks per 48-tile cell
and draws the opaque casters into the shadow map through a few proxies once editing pauses:
Starfall Vale (128 × 128, 874 objects) opens with ~915 draw calls instead of ~2870, idles at the
display rate (render ≈ 13 ms of CPU instead of 24) and strokes run at frame p95 18–36 ms, worst frame
36–54 ms (were p95 33–50 ms, worst 50–117 ms). Details in
[`docs/contracts/LEVEL_EDITOR.md`](docs/contracts/LEVEL_EDITOR.md) §9.
