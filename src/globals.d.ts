// Globals for the type check (tsconfig.json). Types only: nothing here reaches a bundle.
//
// The automation hooks (docs/specs/AUTOMATION_API.md) are typed next to the code that builds each
// object (the typedefs named below); the assignments there are checked against these members, so
// a hook added to or removed from an object without its typedef fails the check.

interface Window {
  // --- game page (index.html) ------------------------------------------------------------------

  /**
   * Game automation hooks (AUTOMATION_API.md §3): `GameHooks` above `Game._exposeGlobal`
   * (src/demo/Game.js). Set at the end of `Game.init()`, deleted on dispose; `combat` on combat
   * levels only. Ready for play when `__game.state().mode === 'play'`.
   */
  __game?: import('./demo/Game.js').GameHooks;
  /**
   * Boot, load and readiness info (AUTOMATION_API.md §4): `LuminaHooks` above `exposeHook`
   * (src/main.js), merged at boot, after the level loaded and after warm-up — wait for `loadMs`.
   */
  __lumina?: import('./main.js').LuminaHooks;
  /**
   * The running Engine (AUTOMATION_API.md §5), on every page that creates one when the URL has
   * `debug` or `autostart` (the Engine option `exposeGlobal` forces / suppresses it); deleted on
   * dispose.
   */
  __engine?: import('./engine/core/Engine.js').Engine;

  // --- editor page (editor.html) ---------------------------------------------------------------

  /**
   * Editor automation hooks (AUTOMATION_API.md §6): `EditorHooks` above the `EditorApp` class
   * (src/editor/EditorApp.js), whose constructor sets it.
   */
  __editor?: import('./editor/EditorApp.js').EditorHooks;

  // --- sandbox pages (sandbox/*.html, AUTOMATION_API.md §7) ------------------------------------
  // Test handles read by action scripts (sandbox/*.json). Each is typed by a typedef next to its
  // assignment in the sandbox file (`…Handle`, `ShellHelpers`, `PerfHelpers` …) that documents
  // every member; the object literals assigned are checked against it, so a member added without
  // its @property is an excess-property error.

  /** sandbox/core.js: engine, rig, audio, input, tests, runAllTests(), analyzeAudio() … */
  __core?: import('../sandbox/core.js').CoreHandle;
  /** sandbox/terrain.js: renderer, scene, camera, map, tileMap, water … */
  __terrain?: import('../sandbox/terrain.js').TerrainHandle;
  /** sandbox/props.js: renderer, scene, camera, factory, textures, results, setNight() … */
  __props?: import('../sandbox/props.js').PropsHandle;
  /** sandbox/textures.js: lib, setView(name), setNight(on), check() … */
  __tex?: import('../sandbox/textures.js').TexHandle;
  /** sandbox/sprite_art.js: the gallery handles. */
  __sprites?: import('../sandbox/sprite_art.js').SpritesHandle;
  /** sandbox/sprite_art.js `?mode=hashes`: FNV-1a hash of every existing sprite sheet by name. */
  __spriteHashes?: Record<string, string>;
  /** sandbox/sprite_art.js `?mode=combat`: the combat-sheet analysis (hash diffs, contrast, timings). */
  __spriteCombat?: import('../sandbox/sprite_art.js').SpriteCombatReport;
  /** sandbox/sprite_runtime.js and sandbox/enemy_ai.js (two pages, two different handle sets). */
  __sb?: import('../sandbox/sprite_runtime.js').SpriteRuntimeHandle
    | import('../sandbox/enemy_ai.js').EnemyAiHandle;
  /** sandbox/lighting.js: lighting, godRays, setTime(h), setView(name), sweep(), info() … */
  __lighting?: import('../sandbox/lighting.js').LightingHandle;
  /** sandbox/lighting_engine.js: engine, lighting, postfx, rig, setTime(h), shadowLag() … */
  __lightEngine?: import('../sandbox/lighting_engine.js').LightEngineHandle;
  /** sandbox/postfx.js: set(path, v), reset(), probeDepth(), flickerTest(), nanTest() … */
  __postfx?: import('../sandbox/postfx.js').PostfxHandle;
  /** sandbox/ui.js: the UI instance. */
  __ui?: import('./engine/ui/UI.js').UI;
  /** sandbox/ui.js: the page's controls (`combat` hooks in combat mode, panelProbe() …). */
  __sandbox?: import('../sandbox/ui.js').UISandboxHandle;
  /** sandbox/combat_fx.js: quads, markers, audio, input, setView(name), runChecks(), renderTrack() … */
  __cfx?: import('../sandbox/combat_fx.js').CfxHandle;
  /** sandbox/combat_audio.js: the combat audio QA (results, identity(), compare(url) …). */
  __caudio?: import('../sandbox/combat_audio.js').CaudioHandle;
  /** sandbox/editor3d.js: vp, state, view(), frames(n), hoverWorld, clickWorld, strokeWorld … */
  __vp?: import('../sandbox/editor3d.js').VpHandle;
  /** sandbox/game_levels.js: CASES, runCase(name). */
  __levelCases?: import('../sandbox/game_levels.js').LevelCasesHandle;
  /** sandbox/combat_play.js, while a bot runs: bot, report(), summary(), until(). */
  __play?: import('../sandbox/combat_play.js').PlayHandle;
  /** sandbox/editor_shell.helpers.js `install()`: editor pointer / key helpers (T.drag, T.key …). */
  T?: import('../sandbox/editor_shell.helpers.js').ShellHelpers;
  /** sandbox/editor_perf.helpers.js `install()`: editor perf helpers (P.setup, P.s2d …). */
  P?: import('../sandbox/editor_perf.helpers.js').PerfHelpers;

  // --- platform --------------------------------------------------------------------------------

  /** Safari before 14.1. */
  webkitAudioContext?: typeof AudioContext;
}

/**
 * `window.P` read as a bare global: sandbox/editor_perf.helpers.js `capture` / `diff` reach their
 * own handle this way (it exists once `install()` ran).
 */
declare var P: import('../sandbox/editor_perf.helpers.js').PerfHelpers;
