# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Lumina** — an HD-2D (Octopath Traveler II-style) engine on three.js r186: pixel-art sprites in a
lit, shadowed, depth-of-field-blurred 3D diorama. Everything the game shows or plays (textures,
sprites, sounds, music) is generated procedurally at runtime; the engine and game ship no image or
audio files (UI fonts come from `@fontsource/*`; the only images in the repo are the documentation
screenshots in `docs/assets/screenshots/`). Three front ends share the engine:
the game (`index.html` → `src/main.js` → `src/demo/`), the level editor (`editor.html` →
`src/editor/`) and standalone module test pages (`sandbox/`). Plain JavaScript ES modules,
type-checked through their JSDoc by `tsc` (`checkJs`, `npm run typecheck`; no `.ts` files, no
emit), no framework, no test runner or linter. Levels with `enemy` objects (the shipped one:
Cinderwatch Pass) get real-time ARPG combat (`src/demo/combat/`, contract
`docs/contracts/COMBAT.md`); every other level stays peaceful and creates nothing combat-related.

## Commands

```bash
npm run dev        # Vite dev server on 127.0.0.1:5173 (also serves the level-save API, see below)
npm run build      # multi-page build (index.html + editor.html) into dist/; public/levels/ is copied
npm run preview    # serve dist/ (rebuild first; no level-save API there)
npm run check -- --page=<page.html> --query=<query> --out=<name> [--wait=ms] [--script=actions.json] [--width= --height=] [--fps=0]
npm run typecheck  # tsc over the JSDoc: tsconfig.json (src/, sandbox/) + tools/tsconfig.json (tools/); exit 1 on error
npm run docs:check # validate every relative link, image and anchor in docs/, README.md, CLAUDE.md
npm run level:check -- <name|file.json> [--strict] [--routes=<file>]   # the generators' level checks on any level file (e.g. one made in the editor); read-only
```

`npm run typecheck` (`tools/typecheck.mjs`) only checks — nothing is emitted, and Vite never
type-checks, so dev and build succeed with type errors. It runs with `strict: false` (no
`noImplicitAny` / `strictNullChecks`): it catches renamed or misspelled members, wrong shapes,
literal unions and call arities wherever the code is typed. Both programs report 0 errors; keep it
so. Rules (JSDoc on new public APIs, `/** @type {X} */ (expr)` casts only where the checker cannot
follow, `@ts-expect-error` only with a reason, lazily created fields declared by module
augmentation in the folder's `types.d.ts`, never a `Foo.d.ts` beside `Foo.js`):
`docs/development/CONVENTIONS.md` §3.1; why JSDoc and not `.ts`: ADR-044 in
`docs/history/DECISIONS.md`.

`npm run check` (`tools/check.mjs`) is the verification tool — the equivalent of running a test. It
starts its own Vite server, drives headless Chrome on the real GPU, reports page errors / console
errors / warnings / failed requests / fps, and writes screenshots + `report.json` to
`.check/<out>/` (gitignored; read the PNGs to judge visuals). Exit code 1 only on page errors (2 if
no Chrome/Edge is found) — console errors, warnings, failed requests and throwing `eval` steps do not
fail the run, so read the summary and aim for zero of each. `--wait` defaults to 4000 ms and
`--query` to `autostart=1` (`--query=` for none). Use a fresh `--out` per run (the harness clears
that folder first); `.check/` exists only on this machine, so never link to it from docs. The action
script format (wait, key, press, eval, shot, fps, click, dblclick, move, mouse, drag, wheel, type,
combo, goto, tab) is documented in the file header (the `tab` step does not wait for a new tab —
test play-tests with `goto index.html?level=local:__playtest__&autostart=1`). Typical runs:

```bash
npm run check -- --page=index.html --query=autostart=1 --out=game          # Emberfall, skip title
npm run check -- --page=index.html --query="level=starfall-vale&autostart=1" --out=sv --wait=9000
npm run check -- --page=editor.html --query=open=emberfall --out=ed --fps=0
npm run check -- --page=sandbox/terrain.html --out=terrain                  # one module in isolation
npm run check -- --page=editor.html --query=new --out=perf --fps=0 --script=sandbox/editor_perf.json
npm run check -- --page=sandbox/index.html --query= --out=fight --fps=0 --script=sandbox/combat.fight.json   # combat fixture
npm run check -- --page=sandbox/index.html --query= --out=play --wait=0 --fps=0 --script=sandbox/combat.play.json   # fixed-step bot (it loads the level itself)
```

Scripted checks live next to the sandboxes as `sandbox/*.json` (`<module>.actions.json`, variants
such as `terrain.perf.json` / `postfx.nan.json`, `editor_shell.*.json`, `editor_perf*.json`; the
combat set `combat.*.json` — stepped checks on the in-page fixture level of `sandbox/combat_fixture.js`
and on Cinderwatch Pass — and `combat.play.json`, a bot that plays the whole level with real key
events, `sandbox/combat_play.js`: deterministic in fixed step (`&fixedstep=1` with `autostart`;
compare its `summary` line / `digest` between runs; `combat.play.fast.json` draws every 4th frame,
same digest; `combat.play.realtime.json` is the real-time feel check — run that one, and
`combat.programs.json`, alone on the GPU). Page hooks for scripts: `window.__game` (`teleport(x,z)`,
`setTime(h)`, `setWeather(name)`, `talkTo(id)`, `map(open)`, `state()` …; on combat levels also
`__game.combat`: `seed, reset, step, stepUntil, press, move, aim, wake, kill, setPlayer, god,
boss.force/info, path, stats` …) and
`window.__editor` (`app, state, tools, view3d, view2d, textures, ready3d`); the full list (incl.
`window.__lumina.loadMs`) is in `docs/specs/AUTOMATION_API.md`.
Headless fps is capped by the compositor (~57–60); use `postfx.enableTimings(true)` GPU timings,
CPU timings and `state().drawCalls` for performance work (`renderer.info` reads 0 in the game — the
debug stats reset it every frame).

Level generators (deterministic; re-run after editing, never hand-edit their output):

```bash
node tools/make-starfall-vale.mjs      # → public/levels/starfall-vale.json (128×128); refuses to write if validation fails (--force to inspect; --out=<scratch>.json for a dry run)
node tools/make-sample-hamlet.mjs      # → public/levels/sample-hamlet.json (--out=<scratch>.json to write elsewhere; --check: write nothing, exit 1 unless the file matches byte for byte)
node tools/make-cinderwatch-pass.mjs   # → public/levels/cinderwatch-pass.json (96×120, combat); validate() (20 rules) + coverage(); --check / --out= / --force / --ascii
node tools/make-gildhaven.mjs          # → public/levels/gildhaven.json (128×128 town, 68 villagers); validate() (routes, roofs ≤ 3 % of path tiles); --check / --out= / --force / --ascii
```

All four generators reproduce their committed files byte for byte (sample-hamlet pins each
object's key order itself, so a change to `createObject`'s key order does not touch its file).
Gildhaven's checks live in `tools/lib/levelcheck.mjs` (`checkLevel`), shared with
`tools/check-level.mjs` (`npm run level:check`): reachability, stairs, bridges, waterfalls,
overlaps, what the north-looking camera cannot see past roofs and crowns — errors for a broken
level, warnings for the composition rules (`--strict`: errors too). Run it after editing a level
in the editor; today it reports one error on the shipped levels (KNOWN_ISSUES LVL-20).

## Contracts and docs (read before changing a module)

- **`docs/ai/AGENT_ONBOARDING.md` — read first in a fresh session** (golden rules, verification
  loop, where to find things); `docs/ai/TASK_PLAYBOOKS.md` has step-by-step recipes and
  `docs/ai/KNOWN_ISSUES.md` the known traps. `docs/README.md` indexes all documentation and says
  which document is the source of truth for what.
- `ARCHITECTURE.md` — engine conventions, the visual target (§1) and the binding module contracts.
- `docs/contracts/LEVEL_EDITOR.md` — the `lumina-level` JSON format, object catalog, optional level fields,
  editor architecture, tool interface, storage and performance design.
- `docs/contracts/COMBAT.md` — the combat contract: enabling, controls, rules, enemies, boss, the
  core ↔ enemy interfaces, combat sprites / VFX / audio / UI, Cinderwatch Pass, budgets, tests;
  its last section (§27) lists the deviations kept at integration and after the review.
- `docs/architecture/modules/*.md` — what each engine module actually implements today (verified
  against the code). `docs/contracts/MODULE_NOTES.md` holds the historical builder/auditor notes (not
  binding, lags the code — errata at the top). The code is the truth where either differs from
  ARCHITECTURE.md.
- `README.md` — features, controls, editor workflow and shortcuts, performance numbers.
- **Contract types** (the type-checked copies of the contracts' interfaces; where the contract text
  and the code differ they follow the code): `src/engine/level/types.d.ts` (`Level`,
  `LevelEnvironment`, `LevelSpawn`, `TileDef`, `ObjectType`, `LevelObject` — a union derived from
  `OBJECT_TYPES` through `@satisfies`, so a new catalog type or default is typed automatically;
  optional fields without a default go into `ObjectExtras`), `PropResult` (`src/engine/world/Props.js`),
  `src/demo/combat/types.d.ts` (`CombatContext`, `Brain`, `HitSpec`, `ProjectileSpec`,
  `MarkerSpec`, `CombatHooks` …; `EnemyKind` / `EnemyDef` in `combat/defs.js`), `Tool` /
  `PointerEv` / `ToolPreview` (`src/editor/tools/index.js`), `GameHooks` (`src/demo/Game.js`),
  `EditorHooks` (`src/editor/EditorApp.js`), `LuminaHooks` (`src/main.js`) and the `window.__*`
  members (`src/globals.d.ts`). The full list: `docs/development/CONVENTIONS.md` §3.1.

Changes to contracts must be additive (never rename or change the meaning of a contract member);
update the docs — and the contract's typed copy — when adding behaviour.

## Architecture

**Engine (`src/engine/`, public API re-exported by `src/engine/index.js`)** — `constants.js` (PPU,
LEVEL_HEIGHT …) and `utils/math.js` (seeded RNG, hash2, fbm2), `core/` (Engine loop with ordered
systems, Input actions incl. gamepad, CameraRig, EventEmitter), `audio/` (AudioSystem: procedural
SFX, ambience, music), `render/` (GlobalUniforms; PostFX: MSAA HDR scene target → DOF → bloom →
OutputPass tone map → grade), `pixel/` (PixelCanvas drawing primitives, Palette, TextureLibrary,
character/prop sprite generators), `sprite/` (Sprite3D billboards, SpriteManager, BlobBatch contact
shadows, instanced Foliage), `fx/` (Particles, GodRays),
`lighting/` (LightingSystem 24 h palette, LightPool, Sky), `world/` (TileMap, Water, PropFactory +
`props/*`, SpatialSplit, ShadowCasters), `level/` (format, catalog, builder, storage, LevelMap),
`ui/` (DOM overlay: dialog, banner, title, HUD, minimap/world map, debug panel; combat HUD, boss
bar, world labels, announcer, death screen). Combat additions are opt-in: `fx/FxQuads` (one
instanced atlas-quad batch), `fx/GroundMarkers` (terrain-draped telegraph decals),
`pixel/MonsterSprites` + `pixel/FxSprites`, the `Sprite3D` option `combatFx`, `Input.addBindings`
/ `enableMouseButtons`, `CameraRig.stickZoom`, combat SFX and music tracks. Combat code imports
these from their own files and `vite.config.js` marks them side-effect free, so peaceful levels
fetch no combat chunk (the combat UI reaches `UI` through `UI.useCombatUI(classes)`; its CSS is
`ui/combat.css`). `Engine#manualStep` (`?fixedstep`) is an opt-in manual-stepping mode for bots.

**Combat (`src/demo/combat/`)** — `CombatSystem` (imported and created by `Game` only when `levelHasCombat(level)`)
owns a sub-stepped combat clock with a combat-local hit-stop (`engine.time.timeScale` is never
touched), the player kit (`PlayerCombat`), enemies (`Enemy` + `ai/*` brains, which see only the
`CombatContext`; they chase and walk home on the `Nav` walk grid and stay in their `region`
zone), hits, projectiles, pickups, waystones / chests, the shop wares, the boss arena, feedback
and `window.__game.combat`. Game frame order: `combat.update` → `player.update` → `combat.afterPlayer`
… `weather.update` → `combat.applyLook`.

Modules don't talk to each other for per-frame sync; they share `render/GlobalUniforms.js`
(`uTime`, `uNight`, wind, camera yaw/position, sun direction/colour, fog colour). Custom shaders
reference those uniform objects directly.

**Level pipeline** — a level is plain data (`src/engine/level/LevelFormat.js`: legend + one string
per row for `tiles` and `heights`, `environment`, `spawn`, `objects`). `serializeLevel` output must
round-trip byte-identically (opening a level in the editor and saving it unchanged leaves `git diff`
empty). `normalizeLevel` writes defaults into files, so a new default (catalog `defaults`,
`DEFAULT_ENVIRONMENT`, a default-legend tile) changes every level on its next save — prefer optional
fields that are absent by default, or re-save/regenerate all shipped levels in the same change. The game (`src/demo/World.js`) builds a level by `buildLevelTerrain` + `LevelObjectBuilder`
(one PropFactory call per object), then wires each result: lights → `LightPool`, emissives →
`LightingSystem.registerEmissive`, emitters → `Particles`, colliders / walk rects → `TileMap`.
Levels wider or deeper than 64 tiles take the `BIG_LEVEL_BATCHING` path (k-d split merges, box
culling, shadow-only proxy casters); small levels keep the original single-merge path and must
render identically. `src/main.js` resolves `?level=<name>` (`public/levels/<name>.json`) or
`?level=local:<slot>` (browser storage); the default is `emberfall`.

**Levels on disk** — `public/levels/*.json`. `emberfall.json` is the single source of truth for the
demo village (converted once by `tools/convert-emberfall.mjs`, which is historical — never re-run
it; edit the JSON or use the editor);
`starfall-vale.json` is generated — change it only through `tools/make-starfall-vale.mjs`;
`cinderwatch-pass.json` is generated — change it only through `tools/make-cinderwatch-pass.mjs`
(helpers in `tools/lib/levelgen.mjs`); `gildhaven.json` (a 128 × 128 town) is generated — change it
only through `tools/make-gildhaven.mjs` (same helpers; tour: `sandbox/gildhaven.tour.json`); `brightwater-crossing.json` was built by hand in the editor. NPC `script` ids refer to hand-written
conversations in `src/demo/dialogue.js`; otherwise NPCs use their data `dialogue` + built-in
`action` (rest / shop / music).

**Editor (`src/editor/`)** — `EditorState` is the single source of truth: every mutation runs in a
transaction (`begin/commit`, auto-wrapped otherwise) so one stroke = one undo step; `change` events
carry dirty object ids and tile rects. Tools (`tools/*`, registry in `tools/index.js`) are
view-agnostic; `map2d/Map2DView` and `viewport3d/Viewport3D` only translate pointer input into
`PointerEv` map coordinates, forward left-button strokes to the active tool and render the level +
tool preview. The 3D view uses the real engine with incremental work: `TileMap.updateTiles` /
`rebuildChunkSteps`, a one-job-per-frame queue during strokes, per-chunk prop batching, a shore bake
in a worker. `tools/vite-level-api.js` (dev server only) implements `GET/PUT/DELETE /api/levels`,
writing `public/levels/<name>.json`; play-test stores the level in the `__playtest__` browser slot.

## Invariants that are easy to break

- **The point-light count is fixed after the first frame — at most 12** (one per light descriptor
  up to 12, else 12 shared; the editor preview always has 12 — the engine `LightPool` with
  `fixed: true`). Adding/removing lights or toggling `light.visible` recompiles every
  shader. Fade intensities instead; big levels share the 12 through `LightPool` (retarget +
  crossfade). Likewise switch shadows with `lighting.settings.shadows` (sets `shadow.intensity` to
  0), never by flipping `castShadow`.
- **Shader warm-up compiles against `postfx.sceneTarget`** (the linear HDR target), not the canvas;
  new materials/effects that appear mid-game must be warmed at load or they hitch.
- **Determinism:** procedural content uses the seeded `RNG` / `hash2` / `fbm2` from
  `src/engine/utils/math.js`, never `Math.random()`.
- **Level data is untrusted:** look a name read from a level up with `isOwnKey` / `ownValue`
  (`src/engine/utils/own.js`), never `TABLE[name]`, which lets `"constructor"` / `"__proto__"`
  pass (KNOWN_ISSUES LVL-17); check with `sandbox/game_levels.html?case=hostile` and its script
  `sandbox/game_levels.hostile.json`.
- **Conventions:** Y up; tile `(i, j)` covers `x∈[i,i+1], z∈[j,j+1]`; rows run toward +Z; world height
  = level × 0.5 (`LEVEL_HEIGHT`); 16 texels per world unit (`PPU`); camera yaw 0 sits on +Z looking
  −Z (screen-down = +Z). Pixel textures go through `makePixelTexture` / `PixelCanvas#toTexture`
  (NEAREST mag). Tone mapping happens once in PostFX's OutputPass; `LightingSystem` owns
  `renderer.toneMappingExposure`.
- **Live look settings are rewritten every frame:** `Weather.update` sets `postfx.settings.grade`
  temperature/saturation and `lighting.settings.*Mul` (the editor preview does too). Tune
  `weather.tuning`, `Game._tunePost` or `KEYFRAME_OVERRIDES` (`src/demo/config.js`) instead; the
  per-weather look itself lives in `src/demo/WeatherLook.js`, shared by the game and the editor.
- **Catalog coupling:** a new `TILE_TYPES` char, `OBJECT_TYPES` type, NPC action/behaviour, critter
  kind or emitter preset makes `make-starfall-vale.mjs` fail its `coverage()` check (writing
  nothing) until the generator places it; a new object type also needs a `case` in
  `LevelObjectBuilder.build` or it silently builds nothing at run time (`npm run typecheck` fails on
  a prop type without one, and on a prop type without a `PropFactory` method;
  `docs/ai/TASK_PLAYBOOKS.md` §0–1). Types flagged `combat: true` (`enemy`, `chest`, `waystone`),
  every `ENEMY_KINDS` kind and every `CHEST_UPGRADES` value are covered by
  `make-cinderwatch-pass.mjs` instead (Starfall skips them and stays peaceful; recipes:
  TASK_PLAYBOOKS §19 add an enemy kind, §20 tune combat).
- **Peaceful levels must not notice combat:** on a level without enemies no combat module, sheet,
  material, pool, DOM node or binding is created (`game.combat === null`); Emberfall keeps 57
  programs. Combat-only bindings (J/K/L/U/I/O/C/1–4, mouse buttons, pad X/Y/B/RS/LS) are registered
  at runtime by `CombatSystem`. The combat program count after warm-up must equal the count after a
  full fight (`sandbox/combat.programs.json`); existing sprite sheets stay pixel-identical
  (`sandbox/sprite_art.hashes.json`, checked by `sprite_art.combat.json`). A new combat-only engine
  module is imported from its file (not the barrel) and listed in `COMBAT_PURE` (`vite.config.js`),
  or it lands in the chunk every peaceful level downloads.
- **User levels:** a `public/levels/*.json` that is not in git belongs to the user — never edit,
  regenerate, delete or commit it. `npm run dev` and every `npm run check` server expose the level
  API, so scripted editor saves really write `public/levels/<name>.json`: use your own temporary
  names, delete them afterwards, and never save as "Untitled" (that writes `untitled.json`).
- **Budgets** (GTX 1060, 1600×900, 60 fps): ≤ ~300 scene draw calls incl. the shadow pass, one
  2048² sun shadow map, DOF at half resolution.
- **Types:** `npm run typecheck` stays at 0 errors in both programs. A typed contract member
  renamed in one place fails everywhere it is used; that is the point — fix the uses, never cast
  the error away. Modules the Node generators import (`LevelFormat`, `ObjectCatalog`, `math`,
  `props/SmallProps`, `combat/defs`) must not pull browser modules in through their types.
  Action-script `eval` strings in `sandbox/*.json` are not type-checked (only a harness run sees
  them).
- **Before finishing:** run `npm run typecheck`; run the harness on the pages you touched and read
  the PNGs; if rendering or level building can be affected, fingerprint Emberfall and the other
  small levels before/after (`docs/ai/TASK_PLAYBOOKS.md` §16) and check the level round trip; then
  `npm run build` and `npm run docs:check`, and update the docs you made stale. Don't rename a
  shipped level — its `name` seeds the terrain noise.

## Environment notes

Developed on Windows; the Bash tool is Git Bash (POSIX syntax). `.gitattributes` normalises line
endings to LF. `.claude/launch.json` defines the `emberfall` preview server (`npm run dev`, port 5173).
Git: one `master` branch, no remote. Commit finished, verified changes without waiting to be asked
(new commits, no amends, never skip hooks). Never commit `.check/`, `dist/`, untracked user levels or temporary test levels —
check `git status public/levels` first.
