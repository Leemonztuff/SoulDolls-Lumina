# Architecture decision records

> **Purpose.** The key technical choices behind Lumina, written as decision records (context →
> decision → consequences) so a new contributor or AI agent can tell a deliberate trade-off from
> an accident before changing it. The reasoning is reconstructed from code comments, the binding
> contracts and the multi-agent build reports archived in [`reports/`](reports/README.md). Where no
> written reasoning exists, the record says so.
>
> **Audience:** engine, game and editor developers; AI agents about to change a subsystem.
>
> **Source of truth:** the code paths named in each record, [`ARCHITECTURE.md`](../../ARCHITECTURE.md),
> [`docs/contracts/LEVEL_EDITOR.md`](../contracts/LEVEL_EDITOR.md),
> [`docs/contracts/MODULE_NOTES.md`](../contracts/MODULE_NOTES.md) and the build reports summarised
> in [PROJECT_HISTORY.md](PROJECT_HISTORY.md).
>
> **Related:** [PROJECT_HISTORY.md](PROJECT_HISTORY.md) · [contracts/README.md](../contracts/README.md) ·
> [CONVENTIONS.md](../development/CONVENTIONS.md) · [architecture/OVERVIEW.md](../architecture/OVERVIEW.md) ·
> [architecture/RENDER_PIPELINE.md](../architecture/RENDER_PIPELINE.md) ·
> [architecture/PERFORMANCE.md](../architecture/PERFORMANCE.md)

**Status values:** *Accepted* (in force), *Amended* (in force, changed later — the amendment is
described), *Superseded* (replaced by a later record). "Introduced in" names the commit where the
decision first landed.

## Index

| # | Decision | Status |
| --- | --- | --- |
| [ADR-001](#adr-001--every-asset-is-procedural) | Every asset is procedural | Accepted |
| [ADR-002](#adr-002--threejs-r186-with-the-webgl-renderer) | three.js r186 with the WebGL renderer | Accepted |
| [ADR-003](#adr-003--lambert-materials-patched-with-onbeforecompile) | Lambert materials patched with `onBeforeCompile` | Accepted |
| [ADR-004](#adr-004--pcfshadowmap-instead-of-pcfsoftshadowmap) | `PCFShadowMap` instead of `PCFSoftShadowMap` | Accepted |
| [ADR-005](#adr-005--half-resolution-dof-with-a-coc-aware-full-resolution-composite) | Half-resolution DOF with a CoC-aware full-resolution composite | Accepted |
| [ADR-006](#adr-006--tone-map-once-in-outputpass-then-grade-in-display-space) | Tone map once in `OutputPass`, then grade in display space | Accepted |
| [ADR-007](#adr-007--a-fixed-set-of-12-point-lights-then-a-lightpool) | A fixed set of 12 point lights, then a `LightPool` | Amended |
| [ADR-008](#adr-008--compile-every-shader-at-load-against-the-hdr-target) | Compile every shader at load, against the HDR target | Accepted |
| [ADR-009](#adr-009--contract-first-multi-agent-development) | Contract-first multi-agent development | Accepted |
| [ADR-010](#adr-010--a-headless-real-gpu-browser-harness-instead-of-unit-tests) | A headless real-GPU browser harness instead of unit tests | Accepted |
| [ADR-011](#adr-011--levels-are-json-with-one-string-per-row) | Levels are JSON with one string per row | Accepted |
| [ADR-012](#adr-012--emberfall-becomes-a-level-file-the-single-source-of-truth) | Emberfall becomes a level file, the single source of truth | Accepted |
| [ADR-013](#adr-013--object-behaviour-fields-are-relative-to-the-object) | Object behaviour fields are relative to the object | Accepted |
| [ADR-014](#adr-014--big-levels-come-from-deterministic-validating-generators) | Big levels come from deterministic, validating generators | Accepted |
| [ADR-015](#adr-015--editorstate-transactions-with-whole-level-snapshot-undo) | `EditorState` transactions with whole-level snapshot undo | Amended |
| [ADR-016](#adr-016--view-agnostic-editor-tools) | View-agnostic editor tools | Accepted |
| [ADR-017](#adr-017--a-dev-server-api-saves-levels-into-the-project) | A dev-server API saves levels into the project | Accepted |
| [ADR-018](#adr-018--the-editor-previews-with-the-real-engine-incrementally-and-exactly) | The editor previews with the real engine, incrementally and exactly | Accepted |
| [ADR-019](#adr-019--big-levels-k-d-batching-box-culling-and-shadow-proxies-gated-at-64-tiles) | Big levels: k-d batching, box culling and shadow proxies, gated at 64 tiles | Amended |
| [ADR-020](#adr-020--the-shore-bake-is-a-pure-function-that-can-run-in-a-worker) | The shore bake is a pure function that can run in a worker | Amended |
| [ADR-021](#adr-021--minimap-and-world-map-from-one-cached-level-render) | Minimap and world map from one cached level render | Accepted |
| [ADR-022](#adr-022--a-resolution-governor-with-a-pixel-budget-and-median-decisions) | A resolution governor with a pixel budget and median decisions | Amended |
| [ADR-023](#adr-023--byte-stable-level-serialisation) | Byte-stable level serialisation | Accepted |
| [ADR-024](#adr-024--the-game-ui-is-a-dom-overlay-styled-with-css) | The game UI is a DOM overlay styled with CSS | Accepted |
| [ADR-025](#adr-025--the-weather-look-is-shared-game-tuning-in-srcdemo) | The weather look is shared game tuning in `src/demo/` | Accepted |
| [ADR-026](#adr-026--combat-is-enabled-per-level-and-peaceful-levels-create-nothing-d1) | Combat is enabled per level, and peaceful levels create nothing (D1) | Amended |
| [ADR-027](#adr-027--generic-pieces-in-the-engine-rules-in-srcdemocombat-d2) | Generic pieces in the engine, rules in `src/demo/combat/` (D2) | Accepted |
| [ADR-028](#adr-028--a-sub-stepped-combat-clock-d3) | A sub-stepped combat clock (D3) | Accepted |
| [ADR-029](#adr-029--hit-stop-and-slow-motion-are-combat-local-d4) | Hit-stop and slow motion are combat-local (D4) | Accepted |
| [ADR-030](#adr-030--enemies-have-no-tilemap-colliders-combat-separates-actors-d5) | Enemies have no TileMap colliders; combat separates actors (D5) | Accepted |
| [ADR-031](#adr-031--combat-poses-are-frames-driven-by-the-state-machine-d6) | Combat poses are frames driven by the state machine (D6) | Accepted |
| [ADR-032](#adr-032--one-opt-in-sprite3d-variant-for-flash-and-glow-d7) | One opt-in Sprite3D variant for flash and glow (D7) | Amended |
| [ADR-033](#adr-033--two-instanced-batches-for-vfx-and-telegraphs-no-runtime-lights-d8) | Two instanced batches for VFX and telegraphs, no runtime lights (D8) | Accepted |
| [ADR-034](#adr-034--world-anchored-combat-ui-in-dom-pools-d9) | World-anchored combat UI in DOM pools (D9) | Accepted |
| [ADR-035](#adr-035--space--pad-a-stay-confirm-only-d10) | Space / pad A stay confirm-only (D10) | Accepted |
| [ADR-036](#adr-036--stamina-never-refuses-an-attack-d11) | Stamina never refuses an attack (D11) | Accepted |
| [ADR-037](#adr-037--three-combat-catalog-types-the-boss-carries-its-arena-d12) | Three combat catalog types; the boss carries its arena (D12) | Accepted |
| [ADR-038](#adr-038--starfall-stays-peaceful-cinderwatch-covers-the-combat-lists-d13) | Starfall stays peaceful; Cinderwatch covers the combat lists (D13) | Accepted |
| [ADR-039](#adr-039--a-generated-validated-demo-level-cinderwatch-pass-d14) | A generated, validated demo level: Cinderwatch Pass (D14) | Accepted |
| [ADR-040](#adr-040--long-tints-are-a-highlight-not-a-flash-mix) | Long tints are a highlight, not a flash mix | Accepted |
| [ADR-041](#adr-041--enemies-path-on-a-walk-grid-and-zones-bound-a-pack) | Enemies path on a walk grid, and zones bound a pack | Accepted |
| [ADR-042](#adr-042--combat-only-engine-modules-stay-out-of-peaceful-chunks) | Combat-only engine modules stay out of peaceful chunks | Accepted |
| [ADR-043](#adr-043--a-fixed-step-mode-for-the-play-through-bot) | A fixed-step mode for the play-through bot | Accepted |
| [ADR-044](#adr-044--jsdoc-types-checked-by-tsc-instead-of-a-typescript-conversion) | JSDoc types checked by `tsc` instead of a TypeScript conversion | Accepted |

---

## ADR-001 — Every asset is procedural

- **Status:** Accepted · **Introduced in:** `f778242` (scaffold), `807bfe4` (modules)
- **Code:** [`src/engine/pixel/`](../../src/engine/pixel/) (`PixelCanvas`, `Palette`, `TextureLibrary`,
  `CharacterSprites`, `PropSprites`), [`src/engine/world/props/PropTextures.js`](../../src/engine/world/props/PropTextures.js),
  [`src/engine/audio/AudioSystem.js`](../../src/engine/audio/AudioSystem.js)

**Context.** The brief was an HD-2D engine "like Octopath Traveler II" built with three.js, with a
demo scene, and no art pipeline or asset budget. `ARCHITECTURE.md` opens with the rule: *everything
(textures, sprites, sounds) is procedurally generated at runtime — there are no binary assets.*

**Decision.** Generate every texture, normal map, character sheet, prop sprite, sound effect,
ambience layer and the music at runtime from seeded code. Pixel art is drawn with `PixelCanvas`
primitives and the shared `PALETTE` ramps at 16 texels per world unit. The only binary inputs are
the three web fonts, which come from `@fontsource/*` npm packages.

**Consequences.**
- The repository is text only and diffs are reviewable; the look is tunable in code.
- Determinism becomes a hard rule (seeded `RNG` / `hash2` / `fbm2`), otherwise screenshots and
  regression fingerprints drift between loads ([CONVENTIONS.md](../development/CONVENTIONS.md#6-determinism)).
- Asset generation costs load time on the CPU (a character sheet is ~3–5 ms; on Starfall Vale the
  texture phase of `World.build` measured 203–280 ms). Sheets are drawn into DOM canvases, so they
  cannot be generated in a Worker.
- Audio can only be judged by numbers in headless runs (offline renders, RMS, spectrograms); the
  builder asked for a human listening pass, and none is recorded in the reports.

## ADR-002 — three.js r186 with the WebGL renderer

- **Status:** Accepted · **Introduced in:** `f778242`
- **Code:** [`src/engine/core/Engine.js`](../../src/engine/core/Engine.js) (`THREE.WebGLRenderer`),
  [`src/engine/render/PostFX.js`](../../src/engine/render/PostFX.js)

**Context.** The user asked for three.js. r186 ships both `WebGLRenderer` and the node-material
`WebGPURenderer`. There is **no written record** of why WebGL was chosen; the reasoning below is
reconstructed from what the code relies on.

**Decision.** Use `WebGLRenderer` (WebGL2) with classic materials and `three/addons` post passes.

**Consequences / what depends on it.**
- Material patching through `onBeforeCompile` and shader-chunk names ([ADR-003](#adr-003--lambert-materials-patched-with-onbeforecompile)) —
  the WebGPU renderer uses node materials instead.
- GPU stage timings through `EXT_disjoint_timer_query_webgl2` (`PostFX.enableTimings`), which the
  resolution governor and all performance work use.
- `UnrealBloomPass`, `OutputPass` and `FullScreenQuad` from `three/addons`.
- Load-time program warm-up with `renderer.compileAsync` against a specific render target
  ([ADR-008](#adr-008--compile-every-shader-at-load-against-the-hdr-target)).
- It runs on the development machine's headless Chrome through ANGLE / Direct3D 11 on a GTX 1060,
  which is what the check harness verifies.
- r186-specific behaviour has to be tracked: `PCFSoftShadowMap` is gone ([ADR-004](#adr-004--pcfshadowmap-instead-of-pcfsoftshadowmap)),
  and every lit program depends on the number of point lights ([ADR-007](#adr-007--a-fixed-set-of-12-point-lights-then-a-lightpool)).
  Upgrading three.js means re-checking every chunk name used in patches.

## ADR-003 — Lambert materials patched with `onBeforeCompile`

- **Status:** Accepted · **Introduced in:** `f778242` (convention), `807bfe4` (patches)
- **Code:** `TileMap._patchMaterial` ([`TileMap.js`](../../src/engine/world/TileMap.js)),
  `patchSpriteLighting` ([`Sprite3D.js`](../../src/engine/sprite/Sprite3D.js)),
  [`Foliage.js`](../../src/engine/sprite/Foliage.js), [`props/Wind.js`](../../src/engine/world/props/Wind.js),
  [`BlobBatch.js`](../../src/engine/sprite/BlobBatch.js), `addSnowCover` ([`src/demo/SnowCover.js`](../../src/demo/SnowCover.js)),
  the x-ray silhouette in [`src/demo/Player.js`](../../src/demo/Player.js)

**Context.** Pixel-art surfaces need crisp albedo, normal maps that react to light, point lights,
fog and shadows — not physically based specular. `ARCHITECTURE.md` §2 notes that `MeshLambertMaterial`
is per-fragment in r186 and supports `map`, `normalMap` and `emissiveMap`.

**Decision.** World geometry uses `MeshLambertMaterial` (cached by `TextureLibrary.material`).
Lumina-specific shading is injected with `onBeforeCompile`: shared uniform objects are attached,
anchor chunks (`#include <common>`, `<map_fragment>`, `<lights_fragment_maps>`, `<emissivemap_fragment>`,
`<begin_vertex>` …) are replaced, and every variant gets its own `customProgramCacheKey`
(`lumina-tilemap-var-decal`, `…|lumina-snow-ground`, …). Examples: the sun-driven ground bounce on
cliff faces (fixed nearly black cliffs in the terrain audit), organic UV variation of terrain tops,
the sprite lighting (bent normal `normalUp`, `wrap`, emissive fill so backlit characters stay
readable), wind sway, and snow cover chained after each material's own patch.

**Consequences.**
- Cheap per-fragment lighting with the full three.js light, shadow and fog system.
- One shader program per patch combination; programs are counted in every check (57 for Emberfall).
- Patches depend on r186 chunk names ([CONVENTIONS.md §11](../development/CONVENTIONS.md#11-shader-patching-with-onbeforecompile)).
- Custom `ShaderMaterial`s (water, flames, particles, god rays) must include the fog chunks
  themselves; the particle shader once bypassed the demo's fog-start offset by writing `vFogDepth`
  itself (found and fixed by the Emberfall verifier).

## ADR-004 — `PCFShadowMap` instead of `PCFSoftShadowMap`

- **Status:** Accepted · **Introduced in:** `807bfe4`
- **Code:** `Engine` constructor ([`Engine.js`](../../src/engine/core/Engine.js)),
  [`LightingSystem.js`](../../src/engine/lighting/LightingSystem.js)

**Context.** The contract (`ARCHITECTURE.md` §4.1) asked for `PCFSoftShadowMap`. In r186 that
type was removed for WebGL: setting it logs a warning on every page and falls back to
`PCFShadowMap`, which is itself soft and honours `shadow.radius`. Five of the nine module reports
of workflow 01 (core, postfx, sprite runtime, lighting, props) flagged the same warning
independently.

**Decision.** `Engine` defaults to `THREE.PCFShadowMap` and silently maps an explicit
`PCFSoftShadowMap` to it; `LightingSystem` does the same when it enables shadows.

**Consequences.** Zero console warnings (the harness counts them); soft shadows come from
`shadow.radius`. The contract text is stale ([contracts/README.md §4](../contracts/README.md#4-known-differences-between-the-contracts-and-the-code)).

## ADR-005 — Half-resolution DOF with a CoC-aware full-resolution composite

- **Status:** Accepted · **Introduced in:** `807bfe4`; tuned in `8e36884`
- **Code:** [`PostFX.js`](../../src/engine/render/PostFX.js), [`shaders/DofShaders.js`](../../src/engine/render/shaders/DofShaders.js)

**Context.** Depth of field with a tilt-shift band is *the* signature of the HD-2D look, and the
budget allowed "DOF at half resolution". A naive half-resolution blur would soften the in-focus
band and the pixel art in it.

**Decision.** The scene renders into a multisampled HalfFloat target with a depth texture. DOF
runs at half resolution: a prefilter (MRT), a golden-angle bokeh gather (48 / 64 / 96 taps chosen
by blur radius, bounded by `maxTaps`), a CoC-aware tent filter and point-sprite "highlight
scatter" for crisp bokeh discs; then a full-resolution composite chooses per pixel by circle of
confusion, so the in-focus band stays pixel-exact. Small CoCs (0.3–4 px) get a 12-tap
full-resolution blur so the focus falloff is gradual. `bokehBoost` is a gain on the highlight
sprites rather than a weight in the gather (weighting the gather gave stippled, flickering discs).

**Consequences.**
- DOF cost ~1.3 ms at 1600×900 on the GTX 1060; the game caps the gather at 64 taps
  (`maxTaps: 64`) after the performance review flagged the 96-tap gather at 1080p (1.94–2.14 ms;
  1.88 ms with 64 taps, 1.3–1.5 ms at 900p) as cost without visible gain.
- The audit fixed temporal flicker of boosted bokeh and "cut-out" silhouettes of blurred sprites
  (taps weighted by 1 / max(CoC, 2)²).
- Known limits: `dofScale` 0.25 aliases; transparent effects that do not write depth take the CoC
  of the surface behind them.
- The game focuses DOF on the player's actual view depth, not the clamped camera focus point
  (an art-review finding: the player blurred near map edges).

## ADR-006 — Tone map once in `OutputPass`, then grade in display space

- **Status:** Accepted · **Introduced in:** `f778242` (contract), `807bfe4`
- **Code:** `PostFX.render` ([`PostFX.js`](../../src/engine/render/PostFX.js)),
  [`shaders/GradeShader.js`](../../src/engine/render/shaders/GradeShader.js),
  [`LightingSystem.js`](../../src/engine/lighting/LightingSystem.js) (owns `renderer.toneMappingExposure`)

**Context.** Lighting, bloom and DOF need linear HDR values; vignette, grain, dithering, split
toning and contrast are perceptual operations. Two owners of exposure would fight.

**Decision.** Chain: HDR scene → DOF → bloom (soft-knee bright pass, so `bloom.threshold` means
"HDR energy above it") → `OutputPass` (ACES Filmic + sRGB, from the renderer's settings) → the
Lumina grade on tone-mapped sRGB values (exposure multiply, white balance, contrast, saturation,
split toning, vignette, chromatic aberration, sharpen, grain, ordered dither). `LightingSystem` is
the only writer of `renderer.toneMappingExposure`.

**Consequences.**
- Tone mapping happens exactly once; the grade's `exposure` is a post-tone-map multiply.
- `settings.enabled = false` renders straight to the canvas with the renderer's own tone mapping,
  so effects that draw straight to the canvas must look right there too — god rays switch to
  screen blending in that case (the lighting audit found them 3–10× too bright otherwise).
- The dither step removes banding in the dark vignette gradient.

## ADR-007 — A fixed set of 12 point lights, then a `LightPool`

- **Status:** Amended · **Introduced in:** `807bfe4` (`LightingSystem.addPointLight`, the 12-light
  budget), `9dadcf8` (the demo's `MAX_POINT_LIGHTS = 12`); pool added in `ef71917`,
  `priorityWeight` retuned in `db41c62`
- **Code:** [`src/engine/lighting/LightPool.js`](../../src/engine/lighting/LightPool.js),
  `World` light wiring and `MAX_POINT_LIGHTS = 12` ([`src/demo/World.js`](../../src/demo/World.js)),
  `LightingSystem.addPointLight` / `retargetPointLight`

**Context.** three.js compiles the number of point lights into every lit shader program. Adding
or removing a light — or toggling `light.visible` — recompiles every lit material, a visible
hitch. The budget allows 12 point lights; the Emberfall performance review measured the 12 lights
as the largest single scene cost (≈ 1.25 ms). Emberfall needs ≤ 12; the first synthetic 128 × 128
test had ~150 light sources and only the first 12 in file order ever lit.

**Decision.**
1. The set of point lights (at most 12) is fixed after the first frame. Lights are dimmed by intensity
   (`fade`, night factor, flicker), never removed or hidden.
2. `LightPool` owns them. With ≤ 12 descriptors it is *static*: one permanent light per descriptor
   with the exact parameters it had before (small levels are bit-identical). With more it is
   *pooled*: every 0.2 s it ranks the descriptors whose light sphere touches the view (distance to
   the camera focus, plus `priority × priorityWeight`, a hysteresis bonus and a penalty for lanterns
   that are dark by day) and hands lights over with a 0.35 s fade-out → move → fade-in.
3. **Amendment (`db41c62`):** `priorityWeight` 4 → 1.5. At 4 a house lantern counted as 8 units
   farther than a torch, so lamps 5–7 units from the player stayed dark at night while torches
   9–10 units away were lit. The art reviewer's 272-spot night sweep counted 114 unlit lamps
   within 9 units of the player at weight 4 and 5 after the change, with no inversions.
   `snap()` (teleport, `talkTo`) re-lights moved lights in the same frame.

**Consequences.** No shader recompiles ever; any number of lamps per level. Where a view holds
more lamps than lights, some lamps stay unlit (the integrator measured ~3.4 unlit lamps within
12 units in the busy square before the retune; the final verification found all 61 lamps within
9 units lit at 10 night spots) — their glass still glows through `registerEmissive`. The editor
preview keeps a fixed pool of 12 for the same reason: at first a simpler class of its own, since
2026-09-27 the engine `LightPool` itself (`fixed: true`, fed through `setDescriptors`), so it lights
the same lamps as the game.

## ADR-008 — Compile every shader at load, against the HDR target

- **Status:** Accepted · **Introduced in:** `8e36884`; extended in `1643b2c`, `db41c62`
- **Code:** `Game.init` / `Game.start` ([`src/demo/Game.js`](../../src/demo/Game.js)),
  `PostFX.warmup`, `Viewport3D` background compiles ([`src/editor/viewport3d/Viewport3D.js`](../../src/editor/viewport3d/Viewport3D.js))

**Context.** The Emberfall reviews measured a 3.1–3.3 s freeze on the first frame and 217–300 ms
on the first rain: the warm-up compiled programs for the canvas, but at runtime materials render
into PostFX's linear HalfFloat target, which is a different program variant.

**Decision.** `Game.init` binds `postfx.sceneTarget` and calls `renderer.compileAsync(scene,
camera)`; `PostFX.warmup` draws the grade and debug passes where they run at runtime; `Game.start`
draws a few real frames with rain and snow switched on behind the loading screen, and the game
awaits `game.warmedUp` before lifting it. Effects that appear later are primed at load (the
waterfall splash / sparkle and running-dust burst pools since `db41c62`). The editor compiles
scene, overlay and outline-mask programs in the background and hides a Place-tool ghost until its
programs are compiled.

**Consequences.** Shader-program counts are a regression metric: 57 on Emberfall after load and
unchanged through time-of-day, weather, dialogs and the world map. Any new material that can
appear mid-game must be warmed at load. This is listed as an invariant in `CLAUDE.md`.

## ADR-009 — Contract-first multi-agent development

- **Status:** Accepted · **Introduced in:** `f778242` (first contract); every workflow since
- **Code / docs:** [`ARCHITECTURE.md`](../../ARCHITECTURE.md), [`docs/contracts/`](../contracts/README.md),
  [DEVELOPMENT_WORKFLOW.md §11](../development/DEVELOPMENT_WORKFLOW.md#11-how-the-multi-agent-work-was-organised)

**Context.** One session had to deliver an engine of ~28 k lines, a demo, an editor and a 128 × 128
level. Many agents working in parallel on shared files would collide, and a single agent would be
slow and unreviewed.

**Decision.** The orchestrating session writes the shared foundation files, the check harness and
a binding contract first. Builders then work in parallel, each owning a directory and building
against the contract with its own sandbox page; each is followed by an independent auditor.
Integration is reviewed through several lenses (runtime, art, performance, gameplay / UX, data),
findings go to one fixer, and a verifier replays everything end to end. Contract changes are
additive only, and every agent reports deviations in a structured result.

**Consequences.** 49 agents over seven workflows produced the project: about 20 hours of
workflow time within 31 hours of wall-clock time, idle gaps included (see
[PROJECT_HISTORY.md](PROJECT_HISTORY.md)). Deviations were visible early (the `PCFSoftShadowMap`
issue was reported by five module reports). The builder reports survive as
`MODULE_NOTES.md`. The process depends on good checks, which is why the harness came first.

## ADR-010 — A headless real-GPU browser harness instead of unit tests

- **Status:** Accepted · **Introduced in:** `f778242`; extended in `8e36884`, `4a32326`, `1643b2c`
- **Code:** [`tools/check.mjs`](../../tools/check.mjs)

**Context.** Almost every requirement is visual or performance-related (the look, DOF, lighting
by hour, frame time, draw calls). Agents cannot watch a screen, but they can read screenshots.

**Decision.** `npm run check` starts its own Vite server, opens a page in headless Chrome on the
real GPU (ANGLE / D3D11), records page errors, console errors, warnings and failed requests, runs a
JSON action script (keys, real mouse drags, evals, screenshots, fps windows, tab switches) and
writes screenshots plus `report.json`. Modules expose `window.__*` hooks for scripts. There is no
unit-test runner or linter.

**Consequences.** Every change is verified in the real renderer, and agents judge the look by
reading PNGs. Only page errors fail a run (exit code 1); everything else must be read. Headless
frame rate is capped by the compositor (~57–60 Hz), so budgets are judged with GPU timer minima,
CPU timings and draw calls. Each run uses its own Vite dependency cache so checks can run in
parallel (the cache folder held 953 caches, 4.8 GB, by the end of the documentation fact-check).
Details:
[TESTING_AND_VERIFICATION.md](../development/TESTING_AND_VERIFICATION.md). Since 2026-09-30 a
JSDoc type check (`npm run typecheck`) runs beside the harness; it checks names and shapes, not
behaviour ([ADR-044](#adr-044--jsdoc-types-checked-by-tsc-instead-of-a-typescript-conversion)).

## ADR-011 — Levels are JSON with one string per row

- **Status:** Accepted · **Introduced in:** `8ec4849`
- **Code:** [`src/engine/level/LevelFormat.js`](../../src/engine/level/LevelFormat.js) (`serializeLevel`,
  `normalizeLevel`, `TILE_TYPES`, `charToLevel`)

**Context.** The editor needed a file format that humans can read and diff, the game can load in
dev and production builds, and generators can write.

**Decision.** `"format": "lumina-level"`, `version` 1. A `legend` maps one character to a tile
definition (built-in `TILE_TYPES` or custom characters); `tiles` and `heights` are arrays of
strings, one string per row along +Z and one character per tile; heights use `0`–`9`, `a`–`z` for
levels 0–35 (world y = level × 0.5). Environment, water, spawn and an `objects` array complete it.
`serializeLevel` writes one line per row and one line per object. Sizes are 8–128 tiles per side.

**Consequences.** A painted tile is a one-character diff; a moved object is a one-line diff. Custom
legend characters let a level add tiles without changing the engine (Starfall Vale's
east-flowing river `e` and the unwalkable road continuation `:`). Unknown fields survive a load and
save. See [specs/LEVEL_FORMAT.md](../specs/LEVEL_FORMAT.md).

## ADR-012 — Emberfall becomes a level file, the single source of truth

- **Status:** Accepted · **Introduced in:** `dadfcd6`
- **Code:** [`public/levels/emberfall.json`](../../public/levels/emberfall.json),
  [`tools/convert-emberfall.mjs`](../../tools/convert-emberfall.mjs), [`src/demo/World.js`](../../src/demo/World.js)

**Context.** The first demo hard-coded the village in `src/demo/maps/emberfall.js` plus constants in
`dialogue.js` and `config.js`. The editor had to be able to open the demo, and the game had to
play editor-made levels through one code path.

**Decision.** A one-off, deterministic converter wrote `emberfall.json` (136 objects); the game
builds *only* from level data, and the old map module was deleted. Options that the prop factory
randomises when absent are written as `null` ("seeded random"), and random prop rotations were
computed with the factory's own RNG, so every prop comes out identical. Hand-written conversations
stay in code: an NPC's `script` id refers to `CONVERSATIONS` in [`src/demo/dialogue.js`](../../src/demo/dialogue.js);
other NPCs use their plain `dialogue` pages plus a built-in `action` (`rest`, `shop`, `music`).

**Consequences.** A world fingerprint proved the conversion exact: 12 point lights (same order and
seeds), 11 interactables, every collider except the wandering villagers' current positions, 20 walk
surfaces, 19 emitters and all 100 world meshes by geometry checksum. Re-running the converter now needs `--rev=<a revision before dadfcd6>`, for
example `--rev=8ec4849`. Edit Emberfall in the editor or in the JSON.

## ADR-013 — Object behaviour fields are relative to the object

- **Status:** Accepted · **Introduced in:** `dadfcd6` (audit: the relative fields), completed in
  `30290d0` (legacy conversion in `normalizeObject`, the shared `critterStartPoints` /
  `critterYard` helpers)
- **Code:** `normalizeObject`, `critterStartPoints`, `critterYard` ([`ObjectCatalog.js`](../../src/engine/level/ObjectCatalog.js))

**Context.** The converted Emberfall stored an NPC's talk point and chase area and the critters'
yard and bird spots as absolute world coordinates. The editor's move, duplicate and resize only
change an object's `x` / `z`, so moving Bertram left his talk spot at the old stall.

**Decision.** These fields are stored relative to their object: npc `talkOffset` and `area`,
critters `area` and `spotOffsets`. `normalizeObject` converts the legacy absolute fields
(`talkPoint`, `bounds`, `spots`) of npc and critters objects into their relative forms on load and
drops them, so a hand-written old-style file is upgraded on its first save.

**Consequences.** Objects keep their behaviour when moved, copied or resized. The editor preview
and the game share the same start-point helpers, so critters appear where the game puts them.

## ADR-014 — Big levels come from deterministic, validating generators

- **Status:** Accepted · **Introduced in:** `ef71917`; validator extended in `db41c62`
- **Code:** [`tools/make-starfall-vale.mjs`](../../tools/make-starfall-vale.mjs),
  [`tools/make-sample-hamlet.mjs`](../../tools/make-sample-hamlet.mjs)

**Context.** A 128 × 128 showcase with ~870 objects, 29 villagers, 13 stair flights and 10 bridges
cannot be kept correct by hand: one misplaced fence blocks a road, one bank a level too low makes
a bridge unenterable.

**Decision.** The level is written by a seeded generator (terrain passes, hand-placed areas,
rule-based scatter, sightline rules) that validates before writing: a quarter-unit walk search
from the spawn with the game's movement rules, reachability of every NPC / door / sign / well /
region, bridges and stairs walkable end to end, named route checks (≤ 1.5 × the straight line + 3
units), roads over water only on bridge decks, crown and roof sightline checks, feature coverage,
zero `normalizeLevel` warnings and a byte-stable save round trip. Any failure exits with code 1 and
writes nothing (`--force` writes anyway and still exits 1).

**Consequences.** `starfall-vale.json` must never be hand-edited — change the generator. Output is
byte-identical on every run (md5 `bfeb767fc9c4a6c61c125eeca4a42a35` for the shipped file, verified
again for this documentation), and saving it unchanged from the editor is byte-identical too. A
change to a scatter rule reshuffles every tree placed after it. A reviewer's mutation test made the
validator stronger: it now refuses 43 of 44 deliberate breakages.

## ADR-015 — `EditorState` transactions with whole-level snapshot undo

- **Status:** Amended · **Introduced in:** `8ec4849`; amended in `30290d0` (change `ids` from the
  workflow-04 polish agent; shared snapshots and the revision-based dirty state from the
  interrupted fixer, whose work that commit also holds; `1643b2c` did not touch `EditorState.js`)
- **Code:** [`src/editor/EditorState.js`](../../src/editor/EditorState.js)

**Context.** The editor has two live views, an inspector, an outliner and ten tools that all edit
one level. Undo must be exact, and one mouse stroke must be one undo step.

**Decision.** `EditorState` is the single source of truth. Every mutation runs inside a
transaction (`begin(label)` / `commit()` / `cancel()`, auto-wrapped when called outside one).
`begin` stores `JSON.stringify(level)`; `commit` stores the "after" string if anything changed.
Undo and redo restore by parsing a snapshot. `change` events carry `terrain`, a tile `rect`,
`objects`, the changed `ids` and `meta`, so views update incrementally.

**Consequences.** Undo is trivially exact and covers every field, including ones added later.
Memory grows with level size: consecutive steps share their snapshot string (one copy per step
instead of two) and history is capped at `maxHistory` = 200. Undoing back to the saved revision
clears the dirty flag. Views must never mutate `state.level` directly.

## ADR-016 — View-agnostic editor tools

- **Status:** Accepted · **Introduced in:** `8ec4849` (interface), `dadfcd6` (tools)
- **Code:** [`src/editor/tools/index.js`](../../src/editor/tools/index.js), `LEVEL_EDITOR.md` §7

**Context.** The same edits must work in the textured 2D map and the 3D preview.

**Decision.** Tools are singletons that receive `PointerEv` objects in map coordinates (tile
`i, j`, world `x, z`, button, modifiers, `pickRadius`) and return a preview description. Views only
translate pointer input into `PointerEv`, forward left-button strokes to the active tool, and draw
the level plus the tool preview.

**Consequences.** A tool is written once. Strokes are bound to the tool that received
`pointerDown`; a press on the sky in 3D starts no stroke (the 3D audit found sky clicks placing
objects ~600 tiles off the map). Tests can drive tools through either view.

## ADR-017 — A dev-server API saves levels into the project

- **Status:** Accepted · **Introduced in:** `8ec4849`; hardened in `1643b2c`
- **Code:** [`tools/vite-level-api.js`](../../tools/vite-level-api.js), [`vite.config.js`](../../vite.config.js),
  [`src/engine/level/LevelStorage.js`](../../src/engine/level/LevelStorage.js)

**Context.** A browser page cannot write into the repository, but levels made in the editor should
land in `public/levels/` so that `?level=<name>` plays them in dev and in production builds.

**Decision.** A Vite plugin (`apply: 'serve'`) adds `GET /api/levels`, `GET/PUT/DELETE
/api/levels/<name>`. Names match `^[a-z0-9][a-z0-9-]{0,59}$`, Windows device names are refused,
bodies are limited to 4 MB and must be a `lumina-level`, and writes go to `<name>.json.tmp` then a
rename (never leaving the `.tmp` behind, which `npm run build` would copy). The editor also saves to
browser storage and to downloads. **Hardening (2026-09-27):** writes only through `PUT` with
`content-type: application/json` (`POST` → 405, other types → 415), and every request from a page
of another origin — other localhost ports included — is refused with 403 without any CORS grant,
so no web page open in the same browser can write, delete or list levels
([LEVEL_STORAGE_API §5.3](../specs/LEVEL_STORAGE_API.md#53-origin-check)). Later the same day
Vite's own CORS was switched off too (`server.cors: false`, `preview.cors: false` in
`vite.config.js`): its default had still let pages on other localhost ports *read* any served file
(source files, `/levels/*.json`). The API's guard keeps running first regardless.

**Consequences.** Project saves work only under `npm run dev`; the editor disables the destination
otherwise. The check harness runs through `vite.config.js`, so scripted editor tests *can* write
level files — every agent had to delete its temporary levels, and untracked user levels must
never be touched. `npm run build` copies whatever is in
`public/levels/`, so stray files end up in `dist/` too.

## ADR-018 — The editor previews with the real engine, incrementally and exactly

- **Status:** Accepted · **Introduced in:** `dadfcd6`; stroke performance in `30290d0`
- **Code:** [`src/editor/viewport3d/`](../../src/editor/viewport3d/) (`Viewport3D._runJobs`,
  `TerrainPreview`, `ObjectPreview` / `PropBatcher`), `TileMap.updateTiles` / `rebuildChunkSteps`

**Context.** The preview has to look like the game (same terrain, props, lights, sky, post
effects) yet stay interactive on a 64 × 64 level with ~200 objects. The first version stuttered in
the split layout (paint p95 68 ms, height p95 168 ms, drags up to 380 ms).

**Decision.** Edits update level *data* at once; *meshes* follow through a one-job-per-frame queue
during a transaction (≈ 3.5 ms terrain-chunk slices, in-place water, a worker shore bake, props
translated during drags and rebuilt after). Props are batched per 16-tile chunk (32 on big
levels). Once `Viewport3D.busy` is false the scene must equal a fresh full build, byte for byte for
the shore texture — `sandbox/editor_perf*.json` checks this after every stroke series.

**Consequences.** Strokes run at the display rate (p95 ≈ 18 ms at the headless ~56 Hz cadence).
The exactness rule makes incremental bugs detectable. The preview imports `src/demo/config.js`,
`Scenery.js` and `GroundDetail.js` for look parity — since 2026-09-27 also `WeatherLook.js` and
`SnowCover.js` ([ADR-025](#adr-025--the-weather-look-is-shared-game-tuning-in-srcdemo)) — so those
demo modules are editor dependencies.

## ADR-019 — Big levels: k-d batching, box culling and shadow proxies, gated at 64 tiles

- **Status:** Amended · **Introduced in:** `ef71917`; amended in `db41c62` (particle cull,
  `BlobBatch`, editor terrain cells)
- **Code:** `BIG_LEVEL_BATCHING`, `World.isBigLevel` ([`src/demo/World.js`](../../src/demo/World.js)),
  [`SpatialSplit.js`](../../src/engine/world/SpatialSplit.js), [`ShadowCasters.js`](../../src/engine/world/ShadowCasters.js),
  `TileMap.consolidateChunks`, `PropFactory.mergeStatic`, `Scenery.mergeTrees`, [`BlobBatch.js`](../../src/engine/sprite/BlobBatch.js)

**Context.** The orchestrator's baseline on a synthetic 128 × 128 level drew 1.29 M triangles at
all times (one merged batch per material cannot be culled). A first attempt with naive 32-tile
chunks produced 459–818 draw calls against a budget of 300.

**Decision.** For levels wider or deeper than 64 tiles only: cut every batch into spatially compact
pieces with a k-d split by triangle / extent budgets; cull every batch by its world *box* (bounding
spheres of flat, wide batches stayed "visible" long after leaving the view); draw the shadows of
opaque props and cliff faces through a few position-only, shadow-only proxies merged across
materials; limit the shadow frustum's depth around the view; draw sprite shadow quads only in the
shadow pass; throttle far actors. Later amendments switch off particle areas more than 34 units from
the focus and draw all blob shadows in one instanced call.

**Consequences.** Starfall Vale: 135–283 draw calls over 26 measured spots (every town view at
the default camera distance stays ≤ 283; the busiest view, the square fully zoomed out and turned,
reaches about 300), 0.73–1.21 M triangles (figures of the shipped level as recorded in
`README.md` by the workflow-07 fixer). Small levels build exactly the same meshes and lights as
before, with identical draw calls and triangles for the gated work; the one visible change is
the integrator's ungated god-ray culling, which took a shaft off Emberfall (203 → 202 calls,
335,250 → 335,238 triangles). `cullByBox` caches the box, so batches must be static; proxies
rely on r186 routing frustum culling through `Object3D.intersectsFrustum`.

## ADR-020 — The shore bake is a pure function that can run in a worker

- **Status:** Amended · **Introduced in:** `30290d0` (pure function, editor worker); game worker
  in `ef71917`; amended in `db41c62` (dynamic colliders excluded)
- **Code:** [`WaterShore.js`](../../src/engine/world/WaterShore.js) (`bakeShore`), [`Water.js`](../../src/engine/world/Water.js),
  [`src/engine/world/shoreWorker.js`](../../src/engine/world/shoreWorker.js), [`src/editor/viewport3d/shoreWorker.js`](../../src/editor/viewport3d/shoreWorker.js)

**Context.** The water's shore texture (foam and depth near banks and colliders) took 75–110 ms
synchronously on a 64 × 64 map — a stall on every water edit in the editor and on big-level loads.

**Decision.** The bake moved verbatim into a pure function without three.js
(`bakeShore(input, a0, b0, W, H)`), testing only the colliders that touch each wet tile. The editor
re-bakes changed 12 × 12-tile blocks (`SHORE_BLOCK`) in a worker; on a big level the game bakes
in a worker (`Water.refreshAsync`) while the forest and foliage build, while small levels keep
the synchronous `Water.refresh()` on the main thread. **Amendment:** walking villagers (`dynamic`
colliders) are excluded from the bake and
its signature — they used to trigger a 420–450 ms re-bake on Starfall's first frame and carve posts
into the shore.

**Consequences.** Byte-identical results in all paths (verified 0 of 491,520 bytes different), no
load or edit stall, and a main-thread fallback when workers are unavailable.

## ADR-021 — Minimap and world map from one cached level render

- **Status:** Accepted · **Introduced in:** `ef71917`
- **Code:** `renderLevelMap` ([`src/engine/level/LevelMap.js`](../../src/engine/level/LevelMap.js)),
  `Minimap` / `WorldMap` ([`src/engine/ui/Minimap.js`](../../src/engine/ui/Minimap.js))

**Context.** A 128 × 128 vale needs navigation aids, and the HUD must stay cheap.

**Decision.** At load, paint the whole level once into a canvas (tile colours shaded by height,
cliffs, water, roads, roofs, bridges, trees, landmarks; 4–12 px per tile). The HUD minimap draws a
cropped part of that image each frame plus live markers (player arrow, view wedge, villagers,
points of interest); the world map draws the whole image with region labels placed to avoid
collisions. `environment.minimap: false` hides the HUD minimap only.

**Consequences.** The minimap costs ~0.12–0.13 ms per frame (Starfall soak test). The painted map
reflects the level as loaded — fine, because levels do not change at runtime. Custom legend
characters are coloured from their tile definition.

## ADR-022 — A resolution governor with a pixel budget and median decisions

- **Status:** Amended · **Introduced in:** `8e36884`; amended in `db41c62` (median of samples,
  rarer steps)
- **Code:** [`src/demo/ResolutionGovernor.js`](../../src/demo/ResolutionGovernor.js)

**Context.** The Emberfall performance review measured 29–59 fps at 2560 × 1440; nothing lowered
the resolution. Later, the Starfall review found each render-scale step costs a 26–236 ms hitch
(render targets are reallocated) and the governor stepped three times in 1.3 s.

**Decision.** Cap the drawing buffer at ~2.1 MP (`pixelBudget`) by lowering `maxPixelRatio` (a
2560 × 1440 window renders ~1932 × 1086; the game starts from `maxPixelRatio: 1.25`). Sample the
summed PostFX GPU stage timings twice a second and decide on the median of the last 5 samples:
lower `engine.renderScale` by 0.1 (not below `minScale` 0.7) after 4 consecutive slow medians
(> `slowMs` 13.5 ms, i.e. 2 s), raise it after 20 consecutive fast ones (< `fastMs` 8.5 ms, 10 s),
never twice within 3 s. The game also chooses 2× MSAA for the scene target when the buffer exceeds
1.8 MP (4× below).

**Consequences.** Large screens hold the frame rate; steps are rare. The governor enables PostFX
GPU timings for the whole session. For measurements, switch it off
(`__game.game.resolution.enabled = false`) so the render scale stays fixed.

## ADR-023 — Byte-stable level serialisation

- **Status:** Accepted · **Introduced in:** `8ec4849` (one line per row and per object); made
  byte-stable in `30290d0` (key-order-preserving `normalizeObject`, unknown top-level keys kept),
  verified in `1643b2c`
- **Code:** `serializeLevel`, `normalizeObject` ([`LevelFormat.js`](../../src/engine/level/LevelFormat.js),
  [`ObjectCatalog.js`](../../src/engine/level/ObjectCatalog.js))

**Context.** The data review found that opening `emberfall.json` in the editor and saving it
unchanged rewrote all 136 object lines, because normalisation reordered keys. Every save would
have produced noisy diffs and hidden real changes.

**Decision.** `parseLevel` → `serializeLevel` must reproduce the input bytes for any normalised
level: `serializeLevel` writes the known top-level keys in one fixed order (unknown top-level keys
follow the objects), `normalizeObject` keeps each object's own key order and only appends catalog
defaults it lacks, unknown fields are kept, and optional fields without a catalog default
(`environment.minimap`, `water.glint`) are written only when set.

**Consequences.** "Open, save, `git diff` is empty" is a standing regression check, and generator
output equals an editor re-save. The one-line check in
[DEVELOPMENT_WORKFLOW.md §8.3](../development/DEVELOPMENT_WORKFLOW.md#83-byte-stable-level-round-trip)
passes for all four shipped levels.

## ADR-024 — The game UI is a DOM overlay styled with CSS

- **Status:** Accepted · **Introduced in:** `f778242` (contract, `ARCHITECTURE.md` §4.8), `807bfe4`
- **Code:** [`src/engine/ui/`](../../src/engine/ui/) (`UI`, `DialogBox`, `Banner`, `TitleScreen`,
  `HUD`, `InteractPrompt`, `Fader`, `DebugPanel`, `Minimap` / `WorldMap`),
  [`ui.css`](../../src/engine/ui/ui.css)

**Context.** The Octopath-style interface is mostly text — dialogue with a typewriter, name plates,
area banners, choices, a clock — framed by thin gold borders and ornaments. It has to stay crisp
at every window size while the 3D frame is rendered at a reduced resolution, blurred by the
tilt-shift DOF and bloomed. The contract fixes the choice (*"DOM overlay, imports `ui.css` +
@fontsource fonts"*) but gives **no written reason**; the reasoning below is reconstructed from
the code and the reports.

**Decision.** `UI` mounts one `#lumina-ui` overlay `div` above the canvas (`pointer-events: none`
except on interactive children). Every component is plain DOM plus CSS: design tokens on `.lu-root`
(golds, cream, navy panels, `--lu-serif` Crimson Pro, `--lu-display` Cinzel, `--lu-pixel` Pixelify
Sans from `@fontsource`), sizes in `clamp()` + `vw` so text reads from 1280 to 2560 px wide, CSS
transitions for fades, and a fixed z-order inside `#lumina-ui` (prompt 1 · HUD 2 · banner 3 · dialog 4 · toasts 5 ·
title 6 · world map 7 · fader 8 · debug 9). Ornaments are inline SVG data URIs. The minimap and the
world map are 2D canvases inside that overlay ([ADR-021](#adr-021--minimap-and-world-map-from-one-cached-level-render)).
Components expose methods; the game maps input actions onto them.

**Consequences.**
- Text is always sharp and never affected by `renderScale`, the resolution governor, DOF, bloom
  or the grade; photo mode simply hides the overlay (`UI.setVisible(false)`).
- No font atlas or text shader to build; the only binary inputs of the project are these fonts.
- DOM and CSS costs appear in frame time instead of GPU time and must be watched: the UI audit
  found 27 CSS animations still running after the title screen (fixed with an `is-gone` state and
  paused hidden animations), and the Emberfall review measured a 215–264 ms stall on the first
  banner fade-out (fixed by baking the flourish's shadow into the SVG instead of a CSS filter).
  Styles are written only when a value changes ([CONVENTIONS.md §8](../development/CONVENTIONS.md#8-no-per-frame-allocations)).
- The harness's page screenshots include the overlay; the engine's render targets never do.
- Layout has to be checked at several window sizes (the reviews used 640 × 360 up to 2560 × 1440).
- The UI binds no keys of its own (only the title screen listens for "any key" while shown), so a
  key cannot trigger both the game and a UI handler.

## ADR-025 — The weather look is shared game tuning in `src/demo/`

- **Status:** Accepted · **Introduced in:** the 2026-09-27 fix of KNOWN_ISSUES ED-18 (after `a9f02a8`)
- **Code:** [`src/demo/WeatherLook.js`](../../src/demo/WeatherLook.js), [`Weather.js`](../../src/demo/Weather.js),
  [`src/editor/viewport3d/Viewport3D.js`](../../src/editor/viewport3d/Viewport3D.js) (`_syncWeather`,
  `_updateWeatherAtmosphere`, `_warmWeatherFx`), [`SnowCover.js`](../../src/demo/SnowCover.js)

**Context.** The editor's 3D preview showed a level's rain or snow only as particles: no overcast
light, no snow cover, no god rays, and its light pool kept the clear-weather day intensity, so on
rain / snow levels with more than 12 lights it lit different lamps than the game. The weather table
and the precipitation configs lived inside `Weather.js` (and were copied by hand into the editor).

**Decision.** Everything that turns a weather *state* into a look — `WEATHER_PARAMS`, `WEATHERS`,
the precipitation emitter configs and the functions that apply a state (lighting multipliers,
overcast colours, grade offsets, wind, lamp and window day glow, the lantern-glass level,
particle-area intensities) — moved into one module, `src/demo/WeatherLook.js`. The game's `Weather`
keeps the blending, the debug `tuning` and its time-of-day effects and calls those functions (its
numbers stayed bit-identical); the editor applies the same functions to the level's settled
weather every frame. The module lives in `src/demo/`, not the engine: the weather table is game
tuning like `KEYFRAME_OVERRIDES` in `config.js`, the engine has no concept of weather, and the editor
already imports demo modules for parity ([ADR-018](#adr-018--the-editor-previews-with-the-real-engine-incrementally-and-exactly)).
The editor installs the game's snow patch as its materials are created and warms the rain / snow
and god-ray programs when the atmosphere preview turns on, so switching the weather compiles
nothing ([ADR-008](#adr-008--compile-every-shader-at-load-against-the-hdr-target)); a weather change
re-ranks the preview's light pool afresh — the lamps a level *starting* in that weather gets.

**Consequences.** A change to the weather look shows in the game and the preview at once; a new
weather still needs its emitters created in both and its name in the editor's two hand-written
Weather lists. The editor compiles 2 more programs in its default view and 4 more with PostFX and
the atmosphere (snow-patched variants, pre-warmed rain / snow); draw calls are unchanged. The
editor keeps its own time-of-day handling (no golden-hour god-ray curve, no night desaturation) —
listed in [EDITOR.md §10](../architecture/EDITOR.md#10-how-the-editor-stays-in-sync-with-the-game).

## Combat (ADR-026 – ADR-040)

The ARPG combat system and its demo level were designed contract-first (COMBAT.md, revision 2
after two design reviews), built by seven packages in parallel, integrated, reviewed and fixed on
2026-09-28 ([PROJECT_HISTORY.md](PROJECT_HISTORY.md)). The fourteen design decisions of
[COMBAT.md §1](../contracts/COMBAT.md#1-summary-and-decisions) (D1–D14) are recorded below with
the reasons the contract gives; §26 of the contract lists every review finding and how it was
resolved. "Introduced in" is the foundation commit `65e76a3` (the contract and the placeholders);
the implementation landed with the combat integration commit that followed it.

## ADR-026 — Combat is enabled per level, and peaceful levels create nothing (D1)

- **Status:** Amended (2026-09-28: the chunk split, ADR-042) · **Introduced in:** `65e76a3`
- **Code:** `levelHasCombat` / `isCombatType` in [`ObjectCatalog.js`](../../src/engine/level/ObjectCatalog.js),
  `Game` constructor and `init` ([`Game.js`](../../src/demo/Game.js)),
  [`src/demo/combat/CombatSystem.js`](../../src/demo/combat/CombatSystem.js)

**Context.** Four shipped levels are peaceful villages with frozen fingerprints (Emberfall 57
programs, pixel-identical screenshots). An always-on combat layer would change every one of them:
a sword on the traveler's sheet, a combat HUD, new programs, pad X / Y rebound from zoom.

**Decision.** `levelHasCombat(level)` is true when `environment.combat === true`, or when the key is
not `false` and the level has an `enemy` object. `Game` evaluates it once; only then does it create
a `CombatSystem` (imported dynamically since revision 4), which creates every sheet, material,
pool, DOM node and binding in `load()`. Otherwise `game.combat === null`.

**Consequences.** Placing one enemy in the editor turns a level into a combat level (play-test
works with no extra step); `environment.combat: false` keeps enemies as scenery. The rule "peaceful
levels must not notice combat" is checked by `sandbox/combat.peaceful.json` and by the §16
fingerprints (KNOWN_ISSUES COMBAT-01). At first the engine barrel's exports of the combat UI and
FX modules put them into the shared chunk (≈ 44 kB gzip more for everyone, COMBAT-17); since
2026-09-28 peaceful levels fetch no combat chunk at all ([ADR-042](#adr-042--combat-only-engine-modules-stay-out-of-peaceful-chunks)).

## ADR-027 — Generic pieces in the engine, rules in `src/demo/combat/` (D2)

- **Status:** Accepted · **Introduced in:** `65e76a3`
- **Code:** [`src/engine/fx/FxQuads.js`](../../src/engine/fx/FxQuads.js),
  [`GroundMarkers.js`](../../src/engine/fx/GroundMarkers.js),
  [`MonsterSprites.js`](../../src/engine/pixel/MonsterSprites.js),
  [`FxSprites.js`](../../src/engine/pixel/FxSprites.js), the combat UI components in
  [`src/engine/ui/`](../../src/engine/ui/); [`src/demo/combat/`](../../src/demo/combat/)

**Context.** Everything in `src/demo` would have been quickest, but then nothing could be tested
in a sandbox, and the engine's rule that modules are testable alone (ARCHITECTURE §6) would break.

**Decision.** Rendering, input, audio and UI pieces that know nothing about the rules go into the
engine as opt-in, additive modules and options (a new option defaults to the old behaviour). The
rules — player kit, enemies, brains, hits, loot, the boss — live in `src/demo/combat/`.

**Consequences.** `combat_fx.html`, `ui.html?combat=1` and `sprite_art.html?mode=combat` test the
engine pieces alone; `enemy_ai.html` tests the brains against a mock `CombatContext`. Engine
contracts grew only additively (ARCHITECTURE §4.1 / §4.3 / §4.8).

## ADR-028 — A sub-stepped combat clock (D3)

- **Status:** Accepted · **Introduced in:** `65e76a3`
- **Code:** `CombatSystem.update` ([`CombatSystem.js`](../../src/demo/combat/CombatSystem.js)),
  [`rules.js`](../../src/demo/combat/rules.js) (`F`, `EPS`, `frameOf`)

**Context.** Attack windows, i-frames and wind-ups are designed in 60 Hz frames, but the game runs
at the display rate. A fixed 60 Hz accumulator would judder on 120 / 144 Hz displays, because the
player's position *is* the sprite's position and cannot be render-interpolated.

**Decision.** Each frame's `dt` is split into `n = ceil(dt · 60 − EPS)` equal sub-steps of at most
1/60 s; every window is specified in frames and stored in seconds (`f / 60`, compared with `EPS`).
Player locomotion is not sub-stepped.

**Consequences.** Driven by `engine.step(1/60)` the simulation is bit-exact, which makes the
stepped test scripts (`seed(n); reset(); press(…); step(…)`) reproducible — the combo goldens are
recorded values. A hit-stop freezes whole sub-steps, so an action takes more engine frames than its
table says: scripts wait for a state with `stepUntil` (KNOWN_ISSUES COMBAT-04, resolved
2026-09-28). The same property lets the play-through bot run deterministically in fixed step
([ADR-043](#adr-043--a-fixed-step-mode-for-the-play-through-bot)).

## ADR-029 — Hit-stop and slow motion are combat-local (D4)

- **Status:** Accepted · **Introduced in:** `65e76a3`
- **Code:** `CombatSystem` (`stop`, `playerScale`, `enemyScale`), [`Feel.js`](../../src/demo/combat/Feel.js)

**Context.** The obvious way to freeze a hit is `engine.time.timeScale`, but measured, it also froze
camera-shake decay, `uTime`, particles, the clock and the dialog typewriter.

**Decision.** One combat-wide `stop` timer freezes combat sub-steps; per-side time scales
(`playerScale`, `enemyScale`) give the perfect-dodge, death and boss-death slow motion.
`engine.time.timeScale` is never touched. Enemy sprite animations get `sprite.speed` written every
frame so they freeze with the combat clock.

**Consequences.** Shake, particles, water and the UI keep moving through a hit-stop — the freeze
reads as impact, not as a stalled game. Effect timers count real combat seconds, gameplay windows
scaled time.

## ADR-030 — Enemies have no TileMap colliders; combat separates actors (D5)

- **Status:** Accepted · **Introduced in:** `65e76a3`
- **Code:** `CombatSystem` separation in `afterPlayer`, `ctx.moveGround` / `moveFly`,
  [`Enemy.js`](../../src/demo/combat/Enemy.js)

**Context.** Dynamic colliders would block the dodge roll, make every collision query test up to
53 moving circles and, with a changing count, re-sign the water shore bake.

**Decision.** Enemies move with `tileMap.move` against the static world only; combat pushes
overlapping actors apart by their move radii, split in inverse proportion to mass (the player
counts 4, the dummy and the boss ∞, a charging `armored` enemy ∞ against the player).

**Consequences.** The collider count never changes at runtime (the budget of COMBAT.md §18);
rolling passes through enemies by design. The player–boss pair separates by the boss's hurt radius
(revision 4), so the player cannot stand inside the 4 u sprite.

## ADR-031 — Combat poses are frames driven by the state machine (D6)

- **Status:** Accepted · **Introduced in:** `65e76a3`
- **Code:** `Enemy.pose`, `PlayerCombat`, `Sprite3D.setFrame`

**Context.** fps-driven `play()` animations drift against hitboxes and cannot honour a hit-stop
exactly.

**Decision.** During an action the frame is set with `sprite.setFrame(col, row)` from the combat
state (the frame shown is the hitbox frame); locomotion keeps `play('idle' | 'walk' | 'run')`.
`Player.update` returns before any `play` / `faceVector` / `speed` write while `player.action` is
set.

**Consequences.** What the player sees is what hits; a hit-stop freezes the pose exactly. Sheets
need named poses (`windup`, `attack`, `hurt`, `dead` …) — COMBAT.md §10.

## ADR-032 — One opt-in Sprite3D variant for flash and glow (D7)

- **Status:** Amended (revision 4: the highlight, [ADR-040](#adr-040--long-tints-are-a-highlight-not-a-flash-mix)) · **Introduced in:** `65e76a3`
- **Code:** [`Sprite3D.js`](../../src/engine/sprite/Sprite3D.js) (`combatFx`, `setFlash`, `setGlow`, `setHighlight`)

**Context.** Hit flashes and glowing eyes need per-sprite uniforms. Per-enemy materials or emissive
writes would multiply materials, and `LightingSystem` rewrites emissives every frame.

**Decision.** The option `combatFx: true` selects one program variant, `lumina-sprite3d-lit-fx-v1`,
with per-sprite `uFlash` (a mix after `opaque_fragment`) and `uGlow` (additive emissive on glow
texels painted with alpha 204). Only combat levels create it; the plain program keys are untouched.

**Consequences.** One extra program for every combat sprite; peaceful levels keep their programs.
Glow texels are an alpha convention (204) sheets must follow.

## ADR-033 — Two instanced batches for VFX and telegraphs, no runtime lights (D8)

- **Status:** Accepted · **Introduced in:** `65e76a3`
- **Code:** [`FxQuads.js`](../../src/engine/fx/FxQuads.js), [`GroundMarkers.js`](../../src/engine/fx/GroundMarkers.js),
  [`Particles.js`](../../src/engine/fx/Particles.js) (six burst presets)

**Context.** A Sprite3D per effect costs 1–4 draw calls each; runtime point lights are impossible
(the count is frozen after the first frame, ARCHITECTURE §4.5); flat telegraph decals float or sink
on stepped terrain.

**Decision.** All slashes, stars, pickups, projectiles and the ember wall are instances of one
atlas-quad batch (`FxQuads`, 1 draw call); every telegraph is an instance of one ground-marker
batch whose 24 × 24 grid is **draped** over a baked height texture in the vertex shader (1 draw
call); six new burst presets add exactly one particle pool. No new lights.

**Consequences.** The worst Cinderwatch view stays at ≈ 230 of 300 draw calls. Markers follow
steps, stairs and ledges; a fragment spanning a cliff is dropped (revision 4). HDR colours sit near
the bloom threshold and need care (KNOWN_ISSUES COMBAT-15).

## ADR-034 — World-anchored combat UI in DOM pools (D9)

- **Status:** Accepted · **Introduced in:** `65e76a3`
- **Code:** [`WorldLabels.js`](../../src/engine/ui/WorldLabels.js), [`CombatHUD.js`](../../src/engine/ui/CombatHUD.js),
  [`BossBar.js`](../../src/engine/ui/BossBar.js)

**Context.** Damage numbers, enemy bars, aggro pips and edge arrows could be WebGL quads, but those
would cost draw calls, be blurred by the DOF and tone-mapped.

**Decision.** Pooled DOM elements under `#lumina-ui` (numbers 40, bars 32, alerts 8, edge arrows 8),
positioned with `translate3d` only when the rounded pixel changes — 0 draw calls, crisp at any
render scale ([ADR-024](#adr-024--the-game-ui-is-a-dom-overlay-styled-with-css)).

**Consequences.** Labels are not depth-occluded (accepted: the pips double as the occlusion cue for
enemies behind roofs, KNOWN_ISSUES COMBAT-07).

## ADR-035 — Space / pad A stay confirm-only (D10)

- **Status:** Accepted · **Introduced in:** `65e76a3`
- **Code:** [`src/demo/combat/bindings.js`](../../src/demo/combat/bindings.js)

**Context.** Many action games dodge on Space. Here Space / Enter / F and pad A confirm (talk,
read, open, rest); a context-sensitive Space would roll when the player meant to talk and fight the
dialog box over the key.

**Decision.** Confirm keeps its meaning everywhere; dodge has its own keys (K, right mouse, pad B).
Combat bindings are registered only on combat levels.

**Consequences.** One more key to learn; no accidental rolls into a conversation. The pad's X / Y
attack instead of zooming on combat levels (zoom moves to the right stick, photo to LS), shown by a
device-aware legend and a one-time pad hint.

## ADR-036 — Stamina never refuses an attack (D11)

- **Status:** Accepted · **Introduced in:** `65e76a3`
- **Code:** [`rules.js`](../../src/demo/combat/rules.js) (`SP_COST`, `WINDED_*`), `PlayerCombat`

**Context.** Refusing an attack at 0 stamina is the least fun failure an action game can have.

**Decision.** A dodge costs 25 SP and needs ≥ 12; attacks cost a little SP but are never refused —
at 0 SP the player is *winded* (slower recovery). Sprinting stays free.

**Consequences.** Stamina paces rolls, not swings; the SP bar flashes when winded.

## ADR-037 — Three combat catalog types; the boss carries its arena (D12)

- **Status:** Accepted · **Introduced in:** `65e76a3`
- **Code:** `OBJECT_TYPES.enemy / chest / waystone` in [`ObjectCatalog.js`](../../src/engine/level/ObjectCatalog.js)

**Context.** Content needs enemies, rewards and checkpoints; every new type must be covered by the
editor, both generators and the docs.

**Decision.** Three types, all flagged `combat: true`, category *Combat*: `enemy` (one object is a
whole pack), `chest`, `waystone`. No gate or trigger type — the boss object carries relative
`arena` and `gate` fields.

**Consequences.** A boss needs no second object; the editor's Boss arena section and handles edit
the fields. Optional enemy fields (`spotOffsets`, `area`, `seed`, `arena`, `gate`) are absent by
default, so no shipped level changed.

## ADR-038 — Starfall stays peaceful; Cinderwatch covers the combat lists (D13)

- **Status:** Accepted · **Introduced in:** `65e76a3`
- **Code:** `coverage()` in [`make-starfall-vale.mjs`](../../tools/make-starfall-vale.mjs) and
  [`make-cinderwatch-pass.mjs`](../../tools/make-cinderwatch-pass.mjs)

**Context.** Starfall's generator requires every object type ([ADR-014](#adr-014--big-levels-come-from-deterministic-validating-generators)).
Revision 1 appended a goblin camp to Starfall — but one enemy auto-enables combat, which would have
turned the festival village into a combat level (sword sheet, HUD, rebound pad) for five goblins at
a stargazing picnic spot.

**Decision.** Starfall's coverage line checks only the types without `combat: true`;
`starfall-vale.json` stays byte-identical. Cinderwatch's coverage requires every `combat: true`
type, every `ENEMY_KINDS` kind and every `CHEST_UPGRADES` value.

**Consequences.** Two generators to keep green; the coupling rule is in CLAUDE.md and
TASK_PLAYBOOKS §0 / §19. A later opt-in camp for Starfall is sketched in COMBAT.md §16.2.

## ADR-039 — A generated, validated demo level: Cinderwatch Pass (D14)

- **Status:** Accepted · **Introduced in:** `65e76a3` (design), the combat integration (level)
- **Code:** [`tools/make-cinderwatch-pass.mjs`](../../tools/make-cinderwatch-pass.mjs),
  [`tools/lib/levelgen.mjs`](../../tools/lib/levelgen.mjs),
  [`public/levels/cinderwatch-pass.json`](../../public/levels/cinderwatch-pass.json)

**Context.** A combat level has more to prove than a village: pack sight lines, arena visibility at
three camera yaws, boar lanes, archer lines of fire, pacing, pack separation.

**Decision.** `cinderwatch-pass` (96 × 120, the big-level path) is generated deterministically and
validated by 19 rules (20 since 2026-09-28) plus a coverage check before it is written; 12 static light descriptors; the
clock stopped at golden hour (a 20-minute run would otherwise reach night); reachable from
`?level=`, the title-screen destination row and the editor.

**Consequences.** Never hand-edit the JSON ([design page](../design/levels/cinderwatch-pass.md));
positions are contract ids, moved only when a rule requires (≤ 3 u, printed). The review fix pass
added rule 19 (zone separation) after two zones' packs woke each other; the known-issues pass
added rule 20 (chase and group-wake margins) and made rule 13 fail on a roof-hidden path tile, and
moved the lodge and the keep for it — building moves are the lead's call, recorded in COMBAT.md
§27.15.

## ADR-040 — Long tints are a highlight, not a flash mix

- **Status:** Accepted · **Introduced in:** the review fix pass of 2026-09-28 (COMBAT.md §27.10 P1 / P2)
- **Code:** `Sprite3D.setHighlight` ([`Sprite3D.js`](../../src/engine/sprite/Sprite3D.js)),
  `WINDUP_HL`, `ELITE_HL`, `_writeFlash` in [`Enemy.js`](../../src/demo/combat/Enemy.js)

**Context.** `uFlash` mixes toward a colour in linear HDR, where a sprite's own colours are small
(0.05–0.3). Any noticeable alpha of an HDR colour turned the sprite into a flat, pale silhouette:
wind-up poses — the tell — lost their detail, and every hit on the 4 u boss was a white bloom blob.
Lower alphas (integration) and per-kind scales (first fix pass) only traded readability for
visibility.

**Decision.** A third uniform in the **same** program, `uHighlight`, adds a tint proportional to the
texel's own shading (`c += (c · rgb · k + rgb · 0.035) · a`, with `k` fading out above luminance
0.45 so glow texels do not bloom). The wind-up pulse, the elite shimmer and the boss's hit flash use
it; `uFlash` stays for 2–4 frame silhouette flashes (a normal enemy's hit, the player's hurt, the
boss's death).

**Consequences.** Wind-up poses keep outlines, tusks, bows and eyes on every sheet; no new program
(63 on Cinderwatch). New tints longer than a few frames should use the highlight
(KNOWN_ISSUES COMBAT-03).

## Combat known-issues pass (ADR-041 – ADR-043)

The open combat rows of KNOWN_ISSUES were fixed on 2026-09-28 by seven builders (runtime, FX and
UI, art and level, editor, audio, tooling, balance), a code / play / visual review, three fix
passes and a final regression pass ([PROJECT_HISTORY.md §8.3](PROJECT_HISTORY.md#83-combat-known-issues-pass-2026-09-28),
[COMBAT.md §27.13–§27.20](../contracts/COMBAT.md#2713-runtime-revision-5)). Three of the changes are
decisions a later change should not undo by accident.

## ADR-041 — Enemies path on a walk grid, and zones bound a pack

- **Status:** Accepted · **Introduced in:** the combat known-issues pass (2026-09-28)
- **Code:** [`src/demo/combat/Nav.js`](../../src/demo/combat/Nav.js); `chasePoint`, `_followPath`,
  `_return`, `canMelee`, `_shouldAggro`, the leash in [`Enemy.js`](../../src/demo/combat/Enemy.js);
  `zoneAt`, `_wakeGroup`, `NAV_SEARCHES` in [`CombatSystem.js`](../../src/demo/combat/CombatSystem.js)

**Context.** Enemies moved straight at the player and followed the player's recorded footsteps
across level changes; a player already standing on a ledge made melee enemies give up, a blocked
walk home ended in a visible fade-and-snap, and nothing but the level layout (generator rules 5 and
19) kept one zone's fight from pulling in the next zone's pack.

**Decision.** A walk grid built once at load (0.5 u cells, a height per cell; open = walkable, not
open water, clear of static colliders and the map edge, outside the boss arenas; neighbours connect
within tileMap.move's 0.55 step) with a bounded, allocation-free, deterministic A* (≤ 6000 cells;
string-pulled; ≤ 2 searches per combat sub-step). A chaser still goes straight while the way is
clear on the same level (so flat fights are unchanged) and follows a path otherwise; the walk home
follows a path; no path within reach means *unreachable* — give up at once. Melee wind-ups need
melee height and a clear straight way. **Zones** come from the level's `region` objects (the
location plate's rule, first match), not from a new level field: a group wake, sight aggro and the
leash all stop at the zone + 3 u. Levels without regions keep the old behaviour. Rejected: dynamic
colliders or a navmesh (ADR-030's reasons; a grid matches `tileMap.move` exactly), and a new
`zone` field on enemy groups (the regions already describe the areas, and the editor has them).

**Consequences.** Region order is now part of a combat level's design (a group centred only in a
map-wide region has no zone limits). The grid costs ≈ 20 ms at load on Cinderwatch and at most
≈ 9 ms in a 3-sub-step hitch frame; the enemies sandbox and `combat.fight.cw.json` (`tests.nav()`)
guard the ledge, stair and return cases. The fade-and-snap stays as a last resort.

## ADR-042 — Combat-only engine modules stay out of peaceful chunks

- **Status:** Accepted · **Introduced in:** the combat known-issues pass (2026-09-28)
- **Code:** [`vite.config.js`](../../vite.config.js) (`COMBAT_PURE`, `treeshake.moduleSideEffects`),
  `UI.useCombatUI` in [`UI.js`](../../src/engine/ui/UI.js), [`combat.css`](../../src/engine/ui/combat.css),
  the imports of [`CombatSystem.js`](../../src/demo/combat/CombatSystem.js)

**Context.** `CombatSystem` was already its own chunk, but the engine barrel re-exports the combat
UI, FX batches and sheet painters (contract members, COMBAT.md §22.1), and `UI.js` imported the
combat UI statically — so every peaceful level downloaded ≈ 44 kB gzip of combat code, and the
editor linked the game's whole stylesheet.

**Decision.** Keep every export (the contract), but make them free to leave out: the 9 combat-only
engine modules are marked side-effect free for the production build, `CombatSystem` imports them
from their own files, `UI.enableCombat()` takes the combat UI classes from a registry filled by
`UI.useCombatUI()` (so `UI.js` has no combat imports; the no-argument call stays valid), the
combat CSS is its own file imported by those modules, and the demo modules the editor shares import
engine modules directly instead of the barrel. Rejected: removing the barrel exports (a contract
change) and a dynamic import inside `enableCombat()` (an async step in a synchronous API).

**Consequences.** Peaceful levels fetch `main`, `LevelStorage` and the shared chunk only; the
combat UI and CSS load with `CombatSystem`; the editor links only `editor.css`. A new combat-only
engine module must join `COMBAT_PURE` and be imported from its file, or it lands in the shared
chunk again. Combat code inside shared modules (combat SFX, combat poses, `CombatProps`) is still
downloaded by everyone (≈ 24 kB gzip, KNOWN_ISSUES COMBAT-23).

## ADR-043 — A fixed-step mode for the play-through bot

- **Status:** Accepted · **Introduced in:** the combat known-issues pass (2026-09-28)
- **Code:** `manualStep`, `step(dt, { render })`, `redraw()` in [`Engine.js`](../../src/engine/core/Engine.js);
  `FixedClock`, `start`, `until`, `verify` in [`sandbox/combat_play.js`](../../sandbox/combat_play.js)

**Context.** The play-through bot drove the real engine loop with real key events; frame pacing
changed its path and fights, so two runs of the same code disagreed, a shared GPU stretched it and
its checks could only be coarse — it had to run alone.

**Decision.** An opt-in engine mode that installs no animation loop (frames advance only through
`step()`), switched on by `?fixedstep` together with `autostart` / `debug` (a stray flag must not
freeze a normal page), plus `step(dt, { render: false })` and `redraw()`. The bot steps at exactly
1/60 s from the level's first frame and replaces the page's timers, frame callbacks and
`performance.now()` with a virtual clock, so the death screen, fades, dialogs and the results card
land on the same frame every run; `verify()` prints one summary line with a digest of every actor's
state. The real-time run stays as a separate script for feel checks.

**Consequences.** The same tree gives the same digest on any machine load, so a gameplay change is
visible as a different digest and `trace` shows where two runs part; drawing only every 4th frame
gives the same run twice as fast (rendering feeds nothing back into the game). In such a run
real-time measurements (tick timings, `loadMs`) are meaningless and CSS animations still run on the
wall clock (KNOWN_ISSUES TOOL-17). Without the flag the engine behaves exactly as before.

## Type-check pass (ADR-044)

On 2026-09-29 – 30 the user approved a type check of the existing JavaScript through its JSDoc
after an evaluation of what TypeScript would buy this code base; the pass brought it from 2 201
errors to 0 without changing a byte of the built game
([PROJECT_HISTORY.md §8.4](PROJECT_HISTORY.md#84-type-check-of-the-javascript-2026-09-29--30)).

## ADR-044 — JSDoc types checked by tsc instead of a TypeScript conversion

- **Status:** Accepted · **Introduced in:** the type-check pass (2026-09-29 – 30)
- **Code:** [`tsconfig.json`](../../tsconfig.json), [`tools/tsconfig.json`](../../tools/tsconfig.json),
  [`tools/typecheck.mjs`](../../tools/typecheck.mjs) (`npm run typecheck`); the type-only files
  [`src/engine/level/types.d.ts`](../../src/engine/level/types.d.ts),
  [`src/demo/combat/types.d.ts`](../../src/demo/combat/types.d.ts), the other folders'
  `types.d.ts` and [`src/globals.d.ts`](../../src/globals.d.ts); the rules in
  [CONVENTIONS.md §3.1](../development/CONVENTIONS.md#31-the-type-check)

**Context.** Lumina is plain JavaScript with JSDoc on its public APIs (ARCHITECTURE §2), written
against prose contracts ([ADR-009](#adr-009--contract-first-multi-agent-development)); nothing
checked the JSDoc, and much of it had drifted. The question was whether to adopt TypeScript. An
evaluation of the history answered what it would have bought: of 413 bug fixes in the commits and
reports, a type checker would have caught about 3 (the puppeteer `clickCount` option that puppeteer
25 renamed to `count`, the missing `CombatHUD.refuse` / `Announcer.clear` called through `?.()`, a
waterfall mist emitter spec with `bounds: null`), at most 12 counting generously. Types help with
**none** of the project's invariants — the fixed light count, shader warm-up, determinism, the
byte-stable round trip, peaceful levels staying combat-free; the harness, the fingerprints and the
generators' validators guard those
([ADR-010](#adr-010--a-headless-real-gpu-browser-harness-instead-of-unit-tests)). They help with
contract renames, dependency API drift and keeping the JSDoc honest. A conversion to `.ts` would
touch about 250 files, about 900 checked documentation links and about 4 000 path mentions in the
docs; break the `COMBAT_PURE` regex in `vite.config.js` (it matches `.js` paths), three
`import.meta.glob('*.js')` calls and the Node generators, which import `src/` modules directly; and
still need `tsc`, since Vite strips types without checking them.

**Decision.** Keep the `.js` files and check them as they are: `tsc` with `allowJs`, `checkJs` and
`noEmit`, `strict: false`, `skipLibCheck: false`, in two programs — the browser code
(`src/`, `sandbox/`) and the Node tools (`tools/`, with the `src/` modules the generators import,
under Node types) — run by `npm run typecheck`, which fails on any error. Types are JSDoc next to
the code; what JSDoc cannot express goes into type-only `.d.ts` files that no bundle includes: the
contract types (the level document derived from `OBJECT_TYPES`, the combat interfaces of
COMBAT.md §9), module augmentation for lazily created fields, and the `window.__*` hooks. Every
edit of the pass was a comment, a parenthesised JSDoc cast or a `.d.ts` file: the Vite bundles
were byte-identical before and after (the final gate), and every changed sandbox and tools file
minifies to the same code. Rejected: the `.ts` conversion (above); `strict: true` (6 484 errors
with `noImplicitAny`, ≈ 4 700 with `strictNullChecks` — a project of its own, while the non-strict
check already catches the classes of mistake that matter here); `@ts-nocheck` on hard files to
reach zero (none is used); a linter (no finding of the history called for one).

**Consequences.**

- 1 927 errors in `src/` + `sandbox/` and 274 in `tools/` at the start, 0 and 0 at the end.
  Fixing them found about a hundred stale JSDoc items (KNOWN_ISSUES CMT-05 … CMT-19, resolved), the
  contract text behind the code (DOC-15, [COMBAT.md §27.21](../contracts/COMBAT.md#2721-type-check-pass-revision-6)),
  and, in its review, two real bugs that are not type errors (COMBAT-24, LVL-17; not fixed — the
  pass changed no runtime code; both were fixed the next day, on 2026-10-01).
- A mutation test measured what the check catches: 88 deliberate breakages, each applied alone to
  a copy of the tree — renamed or removed members of typed classes and contracts (including the
  `?.()` calls), literal-union typos, call arities, hook renames on either side, Node and
  puppeteer API misuse, wrongly shaped spawns and environments, a catalog type without a builder
  case. Before the follow-up fixes it caught 55 (62.5 %); 20 comment-only fixes (typed helper
  parameters, closed brain-state typedefs, typed event, action, sound and particle-preset names, a
  closed `GlobalUniforms`, the builder `default` cast and the catalog ↔ `PropFactory` assertions) raised that to 87 (98.9 %) with both
  programs still at 0 errors. The one miss is an `eval` string in a JSON action script.
- The contract interfaces have checked copies: renaming a member fails at every use, the hook
  typedefs tie `window.__game` / `__editor` / `__lumina` to the sandbox code that reads them, and a
  catalog type without a builder case fails the check (KNOWN_ISSUES PROP-10).
- Costs: rules for writers (CONVENTIONS §3.1), 11 `@ts-expect-error` lines with reasons,
  `@types/three` moved together with `three`, the browser graph kept out of the Node program
  (`combat/defs.js` keeps its typedefs as JSDoc, the `SmallProps` builders an untyped factory).
  Vite still does not type-check, so the check is one more step of the verification loop, and it
  sees only what is typed: an `any` hides everything downstream (KNOWN_ISSUES TC-01 – TC-05).
