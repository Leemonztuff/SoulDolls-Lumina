# Automation API

> **Purpose.** Everything a script, test or AI agent can use to drive Lumina without a human: the
> page globals (`window.__game`, `window.__lumina`, `window.__engine`, `window.__editor` and the
> sandbox hooks), the URL query parameters of every page, and the headless check harness
> (`npm run check`, [`tools/check.mjs`](../../tools/check.mjs)) with every action-script step. It
> ends with worked recipes: scripting a playthrough, driving the editor, play-testing a level,
> measuring performance.
>
> **Audience.** AI agents and developers who verify changes, write regression scripts or capture
> screenshots; anyone extending the hooks.
>
> **Source of truth.** [`src/demo/Game.js`](../../src/demo/Game.js) (`_exposeGlobal`, `state`),
> [`src/main.js`](../../src/main.js) (`exposeHook`, query parameters),
> [`src/engine/core/Engine.js`](../../src/engine/core/Engine.js) (`window.__engine`),
> [`src/editor/EditorApp.js`](../../src/editor/EditorApp.js) (`window.__editor`, editor query
> parameters), [`tools/check.mjs`](../../tools/check.mjs) (the harness), the sandbox pages in
> [`sandbox/`](../../sandbox/) and their helper modules; the hook types (`GameHooks`,
> `EditorHooks`, `LuminaHooks`, `CombatHooks`, [`src/globals.d.ts`](../../src/globals.d.ts)). The `__game` return values, the recipes
> and the `tab` behaviour on this page were checked with the harness against the current code.
>
> **Related.** [../development/TESTING_AND_VERIFICATION.md](../development/TESTING_AND_VERIFICATION.md)
> (when and what to verify) · [INPUT_AND_CONTROLS.md](INPUT_AND_CONTROLS.md) (key codes and
> actions) · [LEVEL_FORMAT.md](LEVEL_FORMAT.md) · [LEVEL_STORAGE_API.md](LEVEL_STORAGE_API.md) ·
> [../ai/AGENT_ONBOARDING.md](../ai/AGENT_ONBOARDING.md) ·
> [../architecture/GAME.md](../architecture/GAME.md) · [../architecture/EDITOR.md](../architecture/EDITOR.md)

---

## Contents

1. [Pages and globals at a glance](#1-pages-and-globals-at-a-glance)
2. [Query parameters](#2-query-parameters)
3. [`window.__game`](#3-window__game)
4. [`window.__lumina`](#4-window__lumina)
5. [`window.__engine`](#5-window__engine)
6. [`window.__editor`](#6-window__editor)
7. [Sandbox hooks](#7-sandbox-hooks)
8. [The check harness (`npm run check`)](#8-the-check-harness-npm-run-check)
9. [Action scripts](#9-action-scripts)
10. [Recipes](#10-recipes)
11. [Pitfalls](#11-pitfalls)

---

## 1. Pages and globals at a glance

| Page | Global | Set when | Wait for readiness with |
| --- | --- | --- | --- |
| `index.html` (game) | `window.__lumina` | at boot (storage helpers), updated after the level loads and after warm-up | `window.__lumina.loadMs` (set when the first gameplay-ready frames are drawn and the loading screen starts to fade) |
| `index.html` | `window.__game` | at the end of `Game.init()`, before the title / play starts | `window.__game.state().mode === 'play'` |
| `index.html` | `window.__engine` | only with `?debug` or `?autostart` in the URL | — |
| `editor.html` | `window.__editor` | in the `EditorApp` constructor | `await __editor.app.ready` (first level loaded, 3D view created), then `await __editor.ready3d` (first full 3D build) |
| `sandbox/*.html` | `window.__core`, `__terrain`, `__props`, … | per page | see [§7](#7-sandbox-hooks) |

All hooks are plain properties on `window`; `page.evaluate` / the harness `eval` step can use them
directly. They are for automation and debugging, not a stable public API for shipped games — but
agents and the sandbox scripts rely on them, so keep them backward compatible.

**Types.** Each hook object is typed next to the code that builds it — `GameHooks` (and
`GameState` for `state()`) above `Game._exposeGlobal` in [`Game.js`](../../src/demo/Game.js),
`CombatHooks` in [`combat/types.d.ts`](../../src/demo/combat/types.d.ts), `LuminaHooks` above
`exposeHook` in [`main.js`](../../src/main.js), `EditorHooks` above the `EditorApp` class in
[`EditorApp.js`](../../src/editor/EditorApp.js), and every sandbox handle by a typedef in its sandbox
file — and [`src/globals.d.ts`](../../src/globals.d.ts) gives `window` those members.
`npm run typecheck` checks the objects against their typedefs (a member added without its typedef
line, or listed but never set, is an error) and the JavaScript that reads them — the game, the
editor and the sandbox helpers (`combat_fixture.js`, `editor_shell.helpers.js`,
`editor_perf.helpers.js`, `combat_play.js`). The `eval` strings of the JSON action scripts are not
checked: a typo there shows only when the harness runs the script (KNOWN_ISSUES TC-01). A new hook
needs its typedef line, then a row here.

## 2. Query parameters

### Game (`index.html` → [`src/main.js`](../../src/main.js))

| Parameter | Effect |
| --- | --- |
| *(none)* | Plays Emberfall (`public/levels/emberfall.json`). |
| `level=<name>` | Plays `public/levels/<slugify(name)>.json` (served as `levels/<slug>.json`, also in production builds). |
| `level=local:<slot>` | Plays the level in browser storage slot `<slot>` (`localStorage["lumina.level.<slot>"]`). The editor's play-test uses `local:__playtest__`. |
| `autostart` | Skips the title screen and enters play at once. `autostart=0` counts as off (but still exposes `window.__engine`). Audio unlocks at the first key or click. |
| `debug` | Exposes `window.__engine` (also done by `autostart`). |
| `fixedstep` | Together with `autostart` or `debug` (alone it is ignored; `fixedstep=0` counts as off): the engine starts in **manual-step mode** (`Engine#manualStep`) — no animation loop, frames advance only through `engine.step()`. The fixed-step play-through bot loads the level this way ([§10.6](#106-the-fixed-step-play-through-bot)). A page in this mode stands still until a script steps it. |

A level that cannot be loaded shows the reason on the loading screen (e.g.
`Could not load level "nope-level": Level "nope-level" not found`, or `… the file is not valid level
JSON (…)`) with links "Play Emberfall", "Play Cinderwatch Pass" (each unless it is the level that
failed) and "Open the level editor"; no `window.__game` is created
(scripts can read `#loading .label`). Normalisation warnings and validation errors go to the console as
`[Lumina] <source>: <message>` warnings.

### Editor (`editor.html` → [`EditorApp._openFirst`](../../src/editor/EditorApp.js))

| Parameter | Effect |
| --- | --- |
| `open=<name>` | Opens `public/levels/<slugify(name)>.json`. If this browser holds an autosave of that same project level from another session, the restore prompt is offered. |
| `local=<slot>` | Opens browser slot `<slot>` (same restore rule for that slot). |
| `new` | Starts an empty "Untitled" 32 × 24 level; no restore prompt. |
| *(none)* | Offers to restore an unresolved autosave from an earlier session, otherwise starts empty. |

A start through `open` / `local` / `new` never destroys an earlier session's autosave: it moves to
File › Open › This browser › Recovered unsaved work once this session autosaves
([LEVEL_STORAGE_API.md §3](LEVEL_STORAGE_API.md#3-browser-storage-localstorage)).

### Sandbox pages

| Page | Parameters |
| --- | --- |
| `sandbox/game_levels.html` | `case=<tiny\|bare\|wetspawn\|stormnight\|everything\|hamlet\|moved\|hostile>` builds a test level, saves it to slot `test-<case>` and opens `index.html?level=local:test-<case>&autostart=1`; `autostart=0` shows the title. Without `case`: a list of buttons. |
| `sandbox/editor3d.html` | `level=<name>` (a project level; default, or when it cannot be loaded: a generated test valley of `size=<n>` × `<n>` tiles, default 64), `empty` (a blank 32 × 24 level), `time=<hour>` (default 14), `postfx`, `atmosphere`, `realtools` (use the editor's real tools). |
| `sandbox/terrain.html` | `time=<day\|golden\|night>` (default `day`), `view=<hd2d\|overview\|cliffs\|waterfall\|edge\|pond\|terrace\|fringe\|lip>` (default `hd2d`) |
| `sandbox/props.html` | `mode=<lot\|gallery>`, `night=1`, `merge=1`, `view=<name>` |
| `sandbox/textures.html` | `view=<gallery0…3\|atlas\|diorama>`, `night=1`, `only=`, `group=`, `scale=`, `aux=0`, `tiles=` |
| `sandbox/sprite_art.html` | `mode=<gallery\|focus\|frames\|walk\|creatures\|props>` (default `gallery`), `names=a,b`, `z=<zoom>`, `t=<time>`, `cols=`, `rows=`, `dir=` |
| `sandbox/lighting.html` | `t=<hour>`, `post=0`, `speed=<h/s>`, `view=<name>` |
| `sandbox/postfx.html` | `samples=`, `scale=`, `gui`, `freeze`, `label` |

[`sandbox/index.html`](../../sandbox/index.html) links every sandbox with its useful views.

## 3. `window.__game`

Created by `Game._exposeGlobal()` ([`Game.js`](../../src/demo/Game.js)) and removed when the game
is disposed. Typed by `GameHooks` (`state()` by `GameState`), the full member list.

### 3.1 Objects

| Member | What it is |
| --- | --- |
| `game` | the `Game` instance (everything below is also reachable from it) |
| `engine` | `Engine` (renderer, scene, camera, `input`, `time`, systems) |
| `rig` | `CameraRig` (`yaw`, `pitch`, `distance` in radians / units, `focusPoint`, `bounds`, `setAngles(yawDeg, pitchDeg)`, `snap()`) |
| `postfx` | `PostFX` (settings, `sceneInfo`, `enableTimings(true)` + `timings`) |
| `lighting` | `LightingSystem` (`timeOfDay`, `nightFactor`, `phaseName`, `timeSpeed`, `paused`) |
| `ui` | the DOM overlay (`dialog`, `hud`, `banner`, `title`, `prompt`, `minimap`, `worldMap`, `debug`) |
| `audio` | `AudioSystem` (`ready`, `musicPlaying`, `playSfx(name)`) |
| `tileMap` | `TileMap` (`getHeight(x, z)`, `isWalkable(x, z)`, `tileAt(i, j)`, colliders) |
| `textures`, `particles`, `godRays` | `TextureLibrary`, `Particles`, `GodRays` |
| `player` | `Player` (`position`, `facing`, `speed`, `sprite`) |
| `npcs` | `Npc[]` (each has `id`, `name`, `position`, `behaviour`, `talking`) |
| `world` | `World` (`built`, `interactables`, `lights`, `lightPool`, `stats`, `falls`, `fires`, `batching`). Each `interactables` entry is `{ id, position, radius, label, kind, prompt, lookSpan, text }`; `lookSpan` is `{ a, b }` (two `THREE.Vector3`, the door leaf's edges) for house doors and `null` otherwise ([GAME.md §3.5](../architecture/GAME.md#35-interactions-and-the-conversation-flow)) |
| `weather` | `Weather` (`weather`, `time`, `snowCover`, `tuning`) |
| `level` | the normalised level object being played |
| `levelSource` | where it came from: `levels/<slug>.json` or `local:<slot>` |
| `combat` | **combat levels only** (a level with `enemy` objects or `environment.combat: true`): the combat test hooks of [§3.4](#34-window__gamecombat-combat-levels-only); absent on peaceful levels |

### 3.2 Methods

| Method | Returns | Behaviour |
| --- | --- | --- |
| `state()` | object ([§3.3](#33-state-shape)) | Snapshot of the game for assertions. |
| `teleport(x, z)` | `{ x, y, z }` or `null` | Moves the player to `(x, z)`, or to the nearest standable spot within 3 units (water, walls, off-map points snap); `null` (and no move) when there is none. Snaps the camera, the point-light pool and the focus. |
| `talkTo(id)` | `boolean` | Walk-free talk: places the player beside the NPC (side by side, then in front, then behind), faces it and starts its conversation. `false` for an unknown id, or while busy, talking, in photo mode or not in play. Closes the world map first. |
| `setTime(h)` | current hour (number) | Jumps to hour `h` (wrapped to 0–24). Non-numbers are ignored. |
| `cycleTime()` | the preset's hour | Glides (2 s) to the next time preset (6.5, 12.5, 17.2, 18.9, 22.5) and toasts its name. |
| `setWeather(name)` | the current weather name | `"clear"`, `"rain"` or `"snow"` (blended over a few seconds); an unknown name changes nothing and returns the current weather. |
| `cycleWeather()` | the new weather name | clear → rain → snow → clear, with a toast. |
| `setMusic(on)` | `boolean` (music wanted / playing) | Starts or stops the procedural music (it starts sounding once audio is unlocked). |
| `photo(on = !photoMode)` | `boolean` (photo mode) | Enters / leaves photo mode with the UI hidden **at once** (no hint toast). Refused (returns `false`) while talking, with the map open or not in play — and on combat levels while engaged or dead (toast "Not while foes are near"). On combat levels photo mode also freezes the player and pauses combat. |
| `map(on = !mapOpen)` | `boolean` (map open) | Opens / closes the world map. Refused while talking, in photo mode or not in play (combat levels: also while dead or in the boss intro). The open map pauses combat and releases the lock-on. |

Talking is asynchronous: `talkTo` returns `true` as soon as the conversation starts. Advance it
with key presses (`confirm`: Space / Enter / F) and poll `state().dialogOpen`
([§10.1](#101-script-a-playthrough)).

### 3.3 `state()` shape

Captured on Emberfall at night in the rain:

```json
{
  "mode": "play",
  "level": "Emberfall",
  "player": { "x": 19.45, "y": 1, "z": 20.1, "tile": { "i": 19, "j": 20 }, "facing": "left", "animation": "idle_left", "speed": 0 },
  "region": "Village Square",
  "time": 21.556,
  "phase": "night",
  "night": 1,
  "weather": "rain",
  "dialogOpen": false,
  "busy": false,
  "photoMode": false,
  "mapOpen": false,
  "music": true,
  "audioReady": true,
  "nearest": "elder",
  "drawCalls": 218,
  "triangles": 341358,
  "fps": 60,
  "pointLights": 12,
  "activeLights": 12,
  "renderScale": 1,
  "pixelRatio": 1,
  "gpuMs": 7.21,
  "camera": { "yaw": 0, "pitch": 32, "distance": 30, "focus": [19.45, 2, 20.1] },
  "inventory": { "apples": 0 }
}
```

| Field | Meaning |
| --- | --- |
| `mode` | `"loading"`, `"title"` or `"play"` |
| `level` | `level.name` |
| `player` | position (3 decimals), tile indices, facing (`down`/`up`/`left`/`right`), sprite animation (`idle_*`, `walk_*`, `run_*`), measured speed (units/s) |
| `region` | name of the current `region` object ("" before the first one is entered) |
| `time`, `phase`, `night` | hour (0–24), nearest lighting keyframe name (`night`, `late night`, `pre-dawn`, `pink dawn`, `sunrise`, `morning`, `noon`, `afternoon`, `golden hour`, `sunset`, `purple dusk`, `blue hour`), night factor 0–1 |
| `weather` | `clear` / `rain` / `snow` |
| `dialogOpen`, `busy` | a dialog is open; the player is frozen by a conversation or a fade |
| `photoMode`, `mapOpen` | UI states |
| `music`, `audioReady` | music wanted / playing; AudioContext running |
| `nearest` | id of the interactable the prompt points at, or `null`: an NPC id, a signpost / well id, or `door:<house id>` (also while the player stands against the wall facing the door) |
| `drawCalls`, `triangles` | of the last scene render (shadow pass included) |
| `fps` | smoothed frame rate |
| `pointLights`, `activeLights` | pooled lights (≤ 12) and how many are lit now |
| `renderScale`, `pixelRatio`, `gpuMs` | resolution governor state and its GPU-time estimate |
| `camera` | yaw and pitch in degrees, distance, focus point |
| `inventory` | items received (`apples` from Emberfall's merchant; a `shop` NPC adds the lower-cased item name — any name, `constructor` or `__proto__` too, is an ordinary key: the game's inventory has no prototype) |
| `combat` | **combat levels only** (the key is absent otherwise): the combat state of [§3.5](#35-statecombat-combat-levels-only) |

### 3.4 `window.__game.combat` (combat levels only)

The combat test hooks ([`src/demo/combat/hooks.js`](../../src/demo/combat/hooks.js), contract:
[COMBAT.md §20.1](../contracts/COMBAT.md#201-window__gamecombat-combat-levels-only-hooks-of-91)).
They work in real time and in **stepped mode**: `step(n)` stops the engine loop, advances `n`
engine frames of `dt` (default 1/60 s) and restarts the loop if it was running, so a sequence of
`seed(n); reset(); press(…); step(…)` is exactly repeatable (identical `state()` JSON on every
run). Virtual presses obey the resume and respawn guards like real input.

| Hook | Effect |
| --- | --- |
| `state()` | the combat state ([§3.5](#35-statecombat-combat-levels-only)) |
| `seed(n)` | combat RNG = `new RNG(n >>> 0)`, every enemy's RNG = `new RNG((hashString(uid) ^ n) >>> 0)`, loot seed input `n` |
| `reset()` | full reset to a reproducible state: player Lv 1 at full HP / MP / SP, gold 0, 3 draughts, no action, combo 0, cooldowns 0, checkpoint = the spawn, lock released; every enemy home / full HP / idle / not aggro, `deathCount` 0, token budgets full; the boss reset (phase 1, dormant, adds hidden, arena open, not defeated); projectiles, markers, pickups, effects, edge arrows cleared; hit-stop, time scales, look offsets, input buffer, virtual queue, guards cleared; counters, tutorial flags, combat clock and frame 0; music back to the level track; every RNG re-created from the current seed. Chests stay as they are. `god`, `freezeAI`, `move` and `aim` are left as set. |
| `step(n = 1, dt = 1/60)` | stepped frames (see above); returns `state()` |
| `stepUntil(pred, maxFrames = 600, dt = 1/60)` | steps one engine frame at a time until `pred(hooks)` is true, at most `maxFrames` frames (stopping and restarting the loop like `step`); returns the frames stepped (0: already true) or −1 if it never held. Hit-stop freezes whole sub-steps, so wait for a state rather than a frame count (e.g. `stepUntil((c) => c.state().player.action === null, 120)`). |
| `press(action, frames = 1)` / `hold(action, frames = 30)` | a virtual edge, held for `frames` engine frames: `attack`, `dodge`, `skill1`–`skill3`, `draught`, `lock` (`lock`: released within 0.35 s = tap, held 0.35 s = release) |
| `move(x, z)` / `move(null)` | world-space move vector for the player (`player.moveOverride`); `null` = real input |
| `aim(x, z)` / `aim(null)` | aim-point override, like the mouse pointer for every action (attacks, skills, the roll without move input) |
| `place(uid, x, z)` | moves an enemy **and its home** to (x, z) (`uid` or `'all'`) |
| `wake(uid)`, `kill(uid)`, `damage(uid, n)` | force aggro / kill through the normal path (XP, loot, events) / deal `n` damage without RNG or boss floors (`uid` or `'all'`) |
| `damagePlayer(n)` | direct damage to the player (ignores i-frames and `god`); HP 0 starts the death sequence |
| `setPlayer({ hp, mp, sp, level, xp, gold, potions, upgrades })` | sets player values (a new `level` refills HP / MP / SP; `xp` is set as is, the next kill levels up); `upgrades` (`{ maxHp, maxMp, attack, def }`, each optional) replaces those upgrade totals and refills HP / MP — e.g. the equipped greedy run's every chest and shop ware |
| `god(on = true)` | the player ignores every enemy hit (no damage, no reaction) |
| `freezeAI(on = true)` | enemies stop updating (they still take hits, die and fade) |
| `bossPhase(n)` | jumps the boss to phase `n` (1–3) without its transition (the brain's `jumpPhase`, which signals `bossPhase`); HP drops to that phase's threshold if above it |
| `setBossHp(frac)` | sets the boss's HP fraction (no floors: the brain starts the transition itself, e.g. `0.69` → phase 2 with adds) |
| `boss.force(move \| null)` | only `move` (`'slam'`, `'sweep'`, `'toss'`, `'rain'`, `'charge'`) may be picked next, at once (every other move waits); `null`: no move at all. Returns false without a living boss. Scripts force moves through this instead of the golem brain's internals |
| `boss.info()` | `{ uid, state, t (frames in the state), phase, alive, hazards (count), move, pending, skid }` of the boss (or `null`) |
| `boss.hazards(type?)` | snapshots of the boss's live delayed hazards `[{ type, x, z, r (current), rInner, delay, t, dur, mv, kb }]` (`type`: `'circle'`, `'ring'`, `'magma'`, `'fade'`) |
| `path(x0, z0, x1, z1, maxU = 80)` | a path on the enemies' walk grid (`Nav`): waypoints `[[x, z], …]`, or `null` when there is none within `maxU` units |
| `checkpoint(id)` | attunes a waystone (`'spawn'` = the level start) silently |
| `rest(id?)` | rests at once (no fade, not refused while engaged) at `id` or the current checkpoint |
| `respawn()` | runs the death reset at once (no screen): enemies, boss, pickups, the player at the checkpoint. A death screen already up is dismissed and stops there (it does not reset or cut gold a second time) |
| `showcase()` | fires every named effect, marker shape / style, projectile kind, pickup kind, burst and combat SFX once near the player |
| `enemies()` | `[{ uid, kind, hp, hpMax, state, x, z, aggro, dormant, zone }]` (hidden boss adds excluded; `zone`: the id of the `region` the group belongs to, or `null`) |
| `stats()` | `{ programs, programsAtLoad, drawCalls, tickMsP50, tickMsP95, pools: { fx, markers, projectiles, pickups }, nav: { searches, found, failed, expanded, maxExpanded, open, tight, cells, buildMs } }` — `tickMs` is the CPU time of `combat.update + afterPlayer` (the last 240 frames in which combat was active: title, map, dialog and photo frames are not sampled; it reads 0 in a fixed-step run, whose `performance.now()` is virtual); `nav` counts the walk grid's path searches and its build |
| `system` | the `CombatSystem` itself (events: `system.events.on('hit' \| 'kill' \| 'playerHurt' \| 'purchase' \| …)`, enemies, the player kit `system.pc`, the shop: `buy(item)` → `{ ok, reason: 'gold' \| 'full' \| 'item' \| 'sold' }`, `priceOf(item)`, `shopOffers()` → `[{ id, name, price, gain, once, upgrade, sold, available, reason }]`). `hit` also fires for the player as the target: `('player', damage, false, 'melee' \| 'projectile' \| 'hazard')`, before `playerHurt`; `engaged(false)` also fires when a death reset, a rest or `reset()` ends an engagement |

Enemy uids are `<group id>#<index>` (index in `enemyStartPoints` order); boss adds are
`<boss uid>:add#<i>`.

### 3.5 `state().combat` (combat levels only)

Captured on the combat fixture after the stepped combo:

```json
{
  "player": { "hp": 100, "hpMax": 100, "mp": 40, "mpMax": 40, "sp": 88.75, "spMax": 100, "level": 1, "xp": 0,
    "xpNext": 30, "gold": 0, "potions": 3, "atk": 12, "def": 4, "action": null, "actionFrame": 0,
    "invulnerable": false, "combo": 0, "winded": false, "lock": null, "checkpoint": "spawn",
    "cooldowns": [0, 0, 0], "deaths": 0, "perfectDodges": 0 },
  "engaged": false, "time": 1.483, "frame": 89, "seed": 1, "kills": 0, "bossDefeated": false, "device": "keyboard",
  "enemies": { "total": 15, "alive": 15, "active": 15, "aggro": 0 },
  "boss": { "uid": "cinderheart#0", "hp": 1800, "hpMax": 1800, "phase": 1, "state": "dormant", "broken": false,
    "defeated": false, "fightTime": 0, "phaseTimes": [0, 0, 0] },
  "projectiles": 0, "markers": 0, "pickups": 0, "fx": 0, "edgeArrows": 0,
  "tokens": { "melee": 0, "ranged": 0 },
  "guards": { "resume": false, "respawn": false },
  "tutorial": { "combo": true, "dodge": false, "rewarded": false },
  "shop": { "purchased": [] }
}
```

| Field | Meaning |
| --- | --- |
| `player.action` | `null` (locomotion), `attack`, `roll`, `backstep`, `skill1`–`skill3`, `draught`, `hitstun`, `knockdown`, `dead`; `actionFrame` its frame (60 Hz) |
| `player.combo` | the current combo step (1–3; 0 = the next attack is A1) |
| `player.lock` | uid of the lock-on target or `null`; `checkpoint` the attuned waystone id or `spawn` |
| `time`, `frame` | combat clock (real combat seconds while active) and sub-step counter |
| `enemies` | counts (hidden boss adds excluded): alive, active (not dormant), aggroed |
| `boss` | the first golem (or `null`): `broken` = Broken (poise spent); `fightTime` since the intro; `phaseTimes` per phase (s) |
| `projectiles`, `markers`, `pickups`, `fx`, `edgeArrows` | live pool entries |
| `tokens` | attack-token budgets in use (melee ≤ 3, ranged ≤ 2) |
| `guards` | the resume guard ignores a held action / the 0.25 s respawn guard runs |
| `tutorial` | the drillmaster's tasks: a full combo on a dummy, a dodge; `rewarded` once |
| `shop` | `purchased`: the ids of the one-time wares bought this session (`whetstone`, `tonic`, `charm`; `reset()` restocks them) |

The combat fixture ([`sandbox/combat_fixture.js`](../../sandbox/combat_fixture.js)) builds a small
test level in-page (`makeCombatFixture()`, saved by `saveCombatFixture()` to the browser slot
`combat-fixture`) with named coordinates (`FIXTURE`), and holds the scripted checks the
`sandbox/combat.*.json` scripts call (`tests.combo()`, `tests.boss()` …; `use(cinderwatch)` runs
them on Cinderwatch Pass; `tests.nav()`, `tests.zones()`, `tests.shop()` … added on 2026-09-28).

## 4. `window.__lumina`

Set by [`src/main.js`](../../src/main.js) (`exposeHook`, typed by `LuminaHooks`), merged in three
steps:

| Member | Available | Meaning |
| --- | --- | --- |
| `storage` | at boot | `{ saveLocalLevel, loadLocalLevel, listLocalLevels, loadProjectLevel, PLAYTEST_SLOT }` from [`LevelStorage.js`](../../src/engine/level/LevelStorage.js) |
| `playLocal(level, slot = 'test', query = 'autostart=1')` | at boot | Normalises `level` (any, possibly partial, level object), saves it to browser slot `slot` (slugified) and, 50 ms later, navigates this tab to `?level=local:<slot>&<query>`. Returns the slot name. |
| `level`, `source`, `warnings` | after the level loaded | The normalised level, its source (`levels/emberfall.json`, `local:<slot>`) and its normalisation warnings. |
| `loadMs` | after warm-up | Milliseconds from navigation start to the first gameplay-ready frames. **The readiness signal for scripts.** (Meaningless in a fixed-step bot run, whose page clock is virtual.) |

`playLocal` is how a script plays a level it just built without the dev-server API: the harness
cannot reload a page with new storage otherwise.

## 5. `window.__engine`

The `Engine` instance, exposed when the URL contains `debug` or `autostart` (the rule is in the
`Engine` constructor, so it holds on every page that creates an `Engine`: `exposeGlobal: true`
forces it, `exposeGlobal: false` suppresses it); `Engine.dispose()` deletes it again (if it is
still this engine). The harness's default `--query=autostart=1` therefore exposes it on the
sandbox pages too. Useful members:
`renderer`, `scene`, `camera`, `input`, `time` (`fps`, `delta`, `frame`, `timeScale`),
`renderScale`, `pixelRatio`, `events`, `addSystem`. See
[../architecture/modules/core.md](../architecture/modules/core.md).

## 6. `window.__editor`

Set in the `EditorApp` constructor ([`EditorApp.js`](../../src/editor/EditorApp.js)), typed by
`EditorHooks`:

| Member | What it is |
| --- | --- |
| `app` | the `EditorApp`; `app.ready` resolves once the first level is loaded **and** the 3D view exists (or failed to start) |
| `state` | the `EditorState` — the document, selection, tool, view, undo history |
| `tools` | `{ select, paint, fill, rect, height, stairs, place, spawn, eyedropper, erase }` tool objects |
| `textures` | the shared `TextureLibrary` |
| `view2d` | the `Map2DView` (getter; `null` until mounted) |
| `view3d` | the `Viewport3D` (getter; `null` if the 3D preview could not start). `view3d.busy` is `true` while meshes are still being rebuilt; `view3d.stats` has `drawCalls`, `triangles`, `fps`, `lights` (= `lightPool.activeCount`), `lightDescriptors`… `view3d.props.lightPool` is the engine `LightPool` (`fixed`: `handles` always 12; `pooled`, `active`, `activeCount` / `used`, `descriptors`, `snap()`); `view3d.props.refreshLights(objects, { snap, reset })` / `updateLights(dt, view)` feed and run it (they replace the former `assignLights(focus)`). |
| `ready3d` | a Promise (getter) that resolves after `app.ready` and the 3D view's first full build |

Useful for scripts:

| Call | Effect |
| --- | --- |
| `app.run('<command id>')` | Runs any menu command (`file.save`, `edit.undo`, `view.3d`, `level.validate`, … — ids in [INPUT_AND_CONTROLS.md §7.1](INPUT_AND_CONTROLS.md#71-commands)). Commands that open dialogs wait for the user. |
| `app.openProject(name, { confirm })`, `app.openLocal(slot, { confirm })` | Open a level (resolve `true` / `false`; `confirm: false` skips the unsaved-changes question). |
| `app.playtest()` | Validates, saves slot `__playtest__`, opens `index.html?level=local:__playtest__&autostart=1` in the window named `lumina-playtest`; returns `true` (also when the pop-up was blocked — the status bar says so), `false` with a problems dialog when the level is not playable or storage is full. Following the pop-up from the harness: [§10.4](#104-play-test-from-the-editor). |
| `app.validate()` | Shows the "Check for problems" dialog. |
| `app.selectAll()`, `app.focusIds(ids)`, `app.paste(objs)` | Selection helpers. |
| `state.level` | The level document (read it; change it only through `state` methods). |
| `state.addObject(type, x, z, overrides?)`, `updateObject(id, patch)`, `moveObjects(ids, dx, dz)`, `removeObjects(ids)` | Object edits (each is one undo step unless inside `begin()`/`commit()`). |
| `state.setTile(i, j, ch)`, `setHeight(i, j, level)`, `editTiles(cells)` | Terrain edits; `cells = [{ i, j, tile?, height? }]`. |
| `state.setSpawn(x, z, facing?)`, `setLevelProps(patch)` | Player start, level settings. |
| `state.begin(label)` / `commit()` / `cancel()` | Group edits into one undo step (a stroke). |
| `state.undo()`, `redo()`, `canUndo`, `canRedo`, `dirty`, `revision`, `fileRef` | History and save state. |
| `state.select(ids)`, `selection`, `setTool(id)`, `setToolOption(key, value)`, `setView(patch)` | Selection, tools (`brushSize`, `tile`, `objectType`, `heightMode`…), layout (`{ layout: 'split' \| '3d' \| '2d' }`). |
| `state.snapshot()` | A deep copy of the level (what Save writes). |
| `state.on('change', fn)` | Events: `change`, `selection`, `tool`, `toolOptions`, `view`, `hover`, `dirty`, `history`, `status`. |

Helper modules for editor scripts (import them from an `eval` step):

- [`sandbox/editor_shell.helpers.js`](../../sandbox/editor_shell.helpers.js) —
  `import('/sandbox/editor_shell.helpers.js').then((m) => m.install())` defines `window.T`:
  `T.drag([[x, z], …], { shift, ctrl, alt })` (a synthetic pointer stroke on the 2D map in world
  coordinates; resolves to the object count), `T.click(x, z)`, `T.hover(x, z)`,
  `T.key(key, { ctrl, shift, alt, code })` (a synthetic `keydown` on the focused element; returns
  whether a handler called `preventDefault`), `T.clickText(selector, text)`,
  `T.setInput(elOrSelector, value)`, `T.field(label)` (an inspector control), `T.summary()`,
  `T.frame()`, `T.sleep(ms)`, `T.screen(x, z)`, `T.fire(type, x, z, opts)`, `T.E` (= `__editor`).
  The 2D map must be visible (layout split or 2D).
- [`sandbox/editor_perf.helpers.js`](../../sandbox/editor_perf.helpers.js) —
  `import('/sandbox/editor_perf.helpers.js').then((m) => m.install())` defines `window.P`:
  `setup(kind)` (`'vale'` default or `'ember'`: a 64 × 64 test level with ~200 objects),
  `s2d(x, z)` / `s3d(x, z)` (client coordinates of a world point in the 2D map /
  3D view, for real-mouse `drag` steps), `path(view, pts)`, `start()` / `stop(label)` (frame-time
  recorder), `fingerprint()`, `exactCheck()` (3D scene vs a fresh full rebuild).

## 7. Sandbox hooks

Each module sandbox exposes its internals for scripted checks ([`sandbox/`](../../sandbox/)). Each
handle's full member list is the typedef next to its assignment in the sandbox file
(`CoreHandle`, `TerrainHandle`, `SpriteCombatReport`, `VpHandle` …; `src/globals.d.ts` names them):

| Page | Global |
| --- | --- |
| `core.html` | `window.__core` (`engine`, `rig`, `runAllTests()`, `tests.*`, `analyzeAudio()`…); `window.__engine` only with `?debug` / `?autostart` (the harness default) |
| `terrain.html` | `window.__terrain` |
| `props.html` | `window.__props` |
| `textures.html` | `window.__tex` |
| `sprite_art.html` | `window.__sprites`; with `?mode=hashes` `window.__spriteHashes` (the FNV-1a hash of every existing sheet by name — the baseline of `sandbox/sprite_art.hashes.json`); with `?mode=combat` `window.__spriteCombat` (the combat-sheet report: hash diffs, contrast, timings; `sprite_art.combat.json`) |
| `sprite_runtime.html` | `window.__sb` |
| `lighting.html` / `lighting_engine.html` | `window.__lighting` / `window.__lightEngine` |
| `postfx.html` | `window.__postfx` |
| `ui.html` | `window.__ui`, `window.__sandbox` (with `?combat=1` also `panelProbe()` / `panelOverlaps()`: where the world labels land relative to the HUD panels) |
| `combat_fx.html` | `window.__cfx` (`renderTrack(track, seconds, mute)` …) |
| `combat_audio.html` | `window.__caudio` (`results`, `identity()`, `compare(url)` …: the combat audio QA, [audio.md §7](../architecture/modules/audio.md#7-testing-and-offline-rendering)) |
| `enemy_ai.html` | `window.__sb` (`assertAll()`, the brains against a mock `CombatContext` with a `Nav` grid) |
| `editor3d.html` | `window.__vp` (`vp`, `state`, `view()`, `frames(n)`, `hoverWorld`, `clickWorld`, `strokeWorld`, `fire`…) |
| `game_levels.html` | `window.__levelCases` (`CASES`, `runCase(name)`); the module also exports `HOSTILE_NAMES` (the `Object.prototype` names of the `hostile` case, imported by `game_levels.hostile.json`) |
| `level_builder.html` | `window.__smoke` |
| `combat_fixture.js` (a module, no page) | `makeCombatFixture()`, `saveCombatFixture()`, `FIXTURE`, `ready()`, `use(points)`, `cinderwatch()`, `tests.*` — see [§3.5](#35-statecombat-combat-levels-only) |

The ready-made scripts next to them (`sandbox/*.actions.json`, `sandbox/editor_shell.*.json`,
`sandbox/editor3d.*.actions.json`, `sandbox/editor_perf*.json`, `sandbox/combat.*.json`) are the
best examples of what each hook can do. The combat scripts on the fixture start from any dev-server
page (`--page=sandbox/index.html --query=`), save the fixture and `goto` the game:

```bash
npm run check -- --page=sandbox/index.html --query= --out=fight --fps=0 --script=sandbox/combat.fight.json
npm run check -- --page=sandbox/index.html --query= --out=iframes --fps=0 --script=sandbox/combat.iframes.json
npm run check -- --page=sandbox/index.html --query= --out=death --fps=0 --script=sandbox/combat.death.json
npm run check -- --page=sandbox/index.html --query= --out=boss --fps=0 --script=sandbox/combat.boss.json
npm run check -- --page=index.html --query="level=cinderwatch-pass&autostart=1" --out=fightcw --wait=3000 --fps=0 --script=sandbox/combat.fight.cw.json
npm run check -- --page=index.html --query="level=cinderwatch-pass&autostart=1" --out=bosscw --wait=3000 --fps=0 --script=sandbox/combat.boss.cw.json
npm run check -- --page=index.html --query="level=cinderwatch-pass&autostart=1" --out=programs --wait=3000 --fps=0 --script=sandbox/combat.programs.json
npm run check -- --page=index.html --query="level=cinderwatch-pass&autostart=1" --out=perf --wait=3000 --fps=0 --script=sandbox/combat.perf.json
npm run check -- --page=index.html --query=autostart=1 --out=peaceful --wait=2000 --fps=0 --script=sandbox/combat.peaceful.json
npm run check -- --page=sandbox/index.html --query= --out=play --wait=0 --fps=0 --script=sandbox/combat.play.json      # the fixed-step bot (§10.6)
npm run check -- --page=sandbox/combat_audio.html --query= --out=caudio --wait=1000 --fps=0 --script=sandbox/combat_audio.actions.json
```

`combat.programs.json` and `combat.perf.json` judge frame gaps and GPU timings: run them alone on
the GPU (KNOWN_ISSUES TOOL-18).

## 8. The check harness (`npm run check`)

[`tools/check.mjs`](../../tools/check.mjs) is the project's test runner: it starts its own Vite
dev server (with the level API), opens a page in headless Chrome on the real GPU, collects errors,
runs an optional action script, measures fps and writes screenshots and a JSON report.

```bash
npm run check -- --page=<path.html> --query=<query> --out=<name> [--wait=ms] [--script=file.json] \
                 [--width=px --height=px] [--fps=ms] [--headful] [--keep-cache]
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--page` | `index.html` | Page path relative to the repository root (`editor.html`, `sandbox/terrain.html`, `docs/index.html`…). |
| `--query` | `autostart=1` | Query string without `?`. **The default applies to every page**; pass `--query=` for none, quote values with `&` (`--query="level=starfall-vale&autostart=1"`). |
| `--out` | the page's base name | Output folder `.check/<out>/` (gitignored). Old `*.png` and `report.json` there are deleted first. |
| `--wait` | `4000` | Milliseconds to wait after the `load` event before the first screenshot and the script. |
| `--width`, `--height` | `1600`, `900` | Viewport size. |
| `--script` | none | Action script (JSON array, [§9](#9-action-scripts)), path relative to the repo root (or absolute). |
| `--fps` | `3000` | Length of the initial fps measurement (after `initial.png`); `0` skips it. |
| `--headful` | off | Show the browser window. |
| `--keep-cache` | off | Keep the Vite dependency cache, named after `--out`, for the next run with the same name (by default each run deletes its own). |

Environment: `CHROME_PATH` selects the browser; otherwise the first existing of Chrome
(x86 and x64 Program Files) or Edge is used. Chrome runs with `--use-angle=d3d11`,
`--ignore-gpu-blocklist`, `--enable-gpu`, `--enable-webgl` and
`--autoplay-policy=no-user-gesture-required`. Each run picks a random port (5200–5899) and its own
Vite dependency cache (`node_modules/.vite-check/<out>-<pid>`, deleted when the run ends unless
`--keep-cache`), so several checks can run at once. The
browser starts with a fresh temporary profile, so `localStorage` is empty at the start of every
run (levels saved with `playLocal` or the editor survive only within one run, across `goto` steps).

**What it does, in order:** start Vite (root = repo, `vite.config.js`, HMR off) → open
`http://127.0.0.1:<port>/<page>?<query>` → record the WebGL renderer string → wait `--wait` →
screenshot `initial.png` → measure fps for `--fps` ms (label `initial`) → run the script steps →
close the browser and the server → write `report.json` → print a summary.

**Report** (`.check/<out>/report.json`):

| Field | Content |
| --- | --- |
| `page`, `query` | what was opened |
| `gl` | the unmasked WebGL renderer (e.g. `ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 3GB …)`), or `NO WEBGL2` |
| `console` | every console message `{ type, text }` from every watched tab |
| `errors` | console errors, except favicon / `status of 404 (Not Found)` messages |
| `warnings` | console warnings |
| `pageErrors` | uncaught exceptions; harness failures appear here as `HARNESS: …` |
| `failedRequests` | failed requests and responses with HTTP status ≥ 400 (except `/favicon.ico`) |
| `evals` | `{ code, result }` or `{ code, error }` per `eval` step (and `tab` switches) |
| `fps` | `{ label, fps, p50ms, p95ms }` per measurement (requestAnimationFrame deltas) |
| `shots` | screenshot paths relative to the repo root |

**Exit codes:** `1` when `pageErrors` is not empty (an uncaught page exception or a harness
error), `2` when no Chrome / Edge was found, otherwise `0`. **Console errors and failed requests do
not fail the run** — read the summary (URL, GPU, FPS, the first 20 unique page and console errors,
10 warnings, 10 failed requests, every eval result truncated to 400 characters, screenshot list)
and look at the PNGs.

## 9. Action scripts

A script is a JSON array of steps executed in order. Each step is an object; the keys are tested
in this order and the **first one with a truthy value** decides what the step does: `wait`, `key`,
`press`, `eval`, `shot`, `fps`, `click`, `dblclick`, `move`, `mouse` (only `"down"` / `"up"`),
`drag`, `wheel`, `type` (any defined value, even `""`), `combo`, `goto`, `tab` (any defined value,
even `0`). So `{ "wait": 0 }` alone does nothing, `{ "wait": 0, "shot": "x" }` takes the shot, and a
step with two action keys only runs the first. A step with no recognised key is skipped silently.
Coordinates are viewport CSS pixels.

| Step | Example | Effect |
| --- | --- | --- |
| `wait` | `{ "wait": 1000 }` | Sleep (ms). |
| `key` | `{ "key": "KeyW", "hold": 800 }` | Hold a key for `hold` ms (default 300). Names are Puppeteer key names: `KeyW`, `Space`, `ShiftLeft`, `ArrowUp`, `Enter`, `Escape`, `Tab`, `Backquote`, `Digit1`, `F5`… |
| `press` | `{ "press": "Space" }` | Tap a key. Single characters also work (`"b"`, `"]"`, `"3"`). |
| `eval` | `{ "eval": "window.__game.setTime(21)" }` | Evaluate JavaScript in the page. Promises are awaited; the (JSON-serialisable) result or the error text is stored in `evals`. Wrap multi-statement code in an async IIFE and return a string (`JSON.stringify(…)`) for complex values. |
| `shot` | `{ "shot": "night" }` | Screenshot to `.check/<out>/night.png`. |
| `fps` | `{ "fps": 2000, "label": "night" }` | Measure fps / p50 / p95 frame time over `fps` ms. |
| `click` | `{ "click": [800, 450], "button": "right", "count": 2 }` | Mouse click; `button` `left` (default) / `right` / `middle`; `count` 2 sends a real double click. |
| `dblclick` | `{ "dblclick": [800, 450] }` | Double click. |
| `move` | `{ "move": [640, 300], "steps": 10 }` | Move the mouse (hover) in `steps` interpolated moves (default 1). |
| `mouse` | `{ "mouse": "down", "button": "left" }` | Press (`down`) or release (`up`) at the current mouse position. |
| `drag` | `{ "drag": [[400, 300], [600, 300], [600, 500]], "button": "left", "steps": 8, "pause": 30, "modifiers": ["Shift"] }` | A real mouse drag through the points: `steps` moves per segment (default 8), `pause` ms after each segment, `modifiers` held during the drag (`Shift`, `Control`, `Alt`). |
| `wheel` | `{ "wheel": [800, 450], "deltaY": -240 }` | Move there and scroll (`deltaY` default −240, negative = zoom in). |
| `type` | `{ "type": "Mossbrook", "selector": ".le-dialog input", "delay": 10 }` | Type text; with `selector`, triple-click that field first (select its text). `delay` ms between keys (default 10). |
| `combo` | `{ "combo": ["Control", "KeyZ"] }` | Hold every key but the last, tap the last, release (`["Control", "Shift", "KeyS"]`). |
| `goto` | `{ "goto": "index.html?level=local:__playtest__&autostart=1" }` | Navigate (relative to the dev server, or an absolute `http…` URL). Same origin, so browser storage is kept. |
| `tab` | `{ "tab": "last" }` or `{ "tab": 1 }` | Continue in another tab: `last` = the last entry of `browser.pages()`, a number = that index. The new tab gets the same viewport and is watched for errors; the switch is logged in `evals` as `tab …`. **Put a `wait` step (≈ 1500 ms) before it** — see the note below. |

Keys pressed with `key` / `press` / `combo` are real keyboard events: they go through `Input`, the
title screen and the editor's shortcut dispatch like a user's keys.

**The `tab` step and pop-ups.** The browser starts with an empty `about:blank` tab, so
`browser.pages()` is `[about:blank, <the checked page>, …tabs it opened]` from the start: `tab: 0`
is that blank tab, and `tab: "last"` never waits (its "up to 10 s for a second tab" loop is
already satisfied) — it takes whatever tab is last *at that moment*. Right after the editor's
`app.playtest()` (or a click on Play) the pop-up is usually not listed yet, and the step silently
stays on the editor page (no `tab …` entry appears in `evals`). A `{ "wait": 1500 }` before
`{ "tab": "last" }` makes it reliable (checked 2026-09-27; see [§10.4](#104-play-test-from-the-editor)).

## 10. Recipes

### 10.1 Script a playthrough

Verified on Emberfall (`npm run check -- --page=index.html --query=autostart=1 --out=play --wait=1000 --fps=0 --script=play.json`):

```json
[
  { "eval": "(async () => { for (let k = 0; k < 200 && !(window.__lumina && window.__lumina.loadMs); k++) await new Promise((r) => setTimeout(r, 100)); return window.__lumina.loadMs; })()" },
  { "key": "KeyW", "hold": 800 },
  { "eval": "JSON.stringify(window.__game.state().player)" },
  { "eval": "window.__game.talkTo('elder')" },
  { "wait": 600 },
  { "shot": "elder" },
  { "eval": "(async () => { const g = window.__game; for (let k = 0; k < 40 && g.state().dialogOpen; k++) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true })); await new Promise((r) => setTimeout(r, 50)); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true })); await new Promise((r) => setTimeout(r, 250)); } return g.state().dialogOpen; })()" },
  { "eval": "window.__game.setTime(21.5)" },
  { "eval": "window.__game.setWeather('rain')" },
  { "eval": "window.__game.photo(true)" },
  { "wait": 1500 },
  { "shot": "night_rain" },
  { "eval": "window.__game.photo(false)" },
  { "eval": "window.__game.map(true)" },
  { "wait": 500 },
  { "shot": "world_map" },
  { "eval": "window.__game.map(false)" },
  { "fps": 2000, "label": "night" },
  { "eval": "JSON.stringify(window.__game.state())" }
]
```

Notes:

- The first step waits for `__lumina.loadMs`, so `--wait` can stay short on any level size.
- The dialog loop presses Space until `dialogOpen` is false. Each press first completes the typing
  line, then advances; choices take the preselected **first** answer. To pick another answer,
  dispatch `ArrowDown` (`code: 'ArrowDown'`) before the last Space. For a level NPC whose closing
  page has a **single** choice, that first answer runs its `rest` / `shop` / `music` action.
- `teleport(x, z)` moves the player instantly; walk with `key` steps to test collisions and stairs.
- `photo(true)` hides the whole UI immediately — the cleanest screenshots.
- Emberfall's NPC ids: `elder`, `innkeeper`, `merchant`, `guard`, `farmer`, `child`, `bard`,
  `scholar`; Starfall Vale uses readable ids too (`aldous`, `marigold`, …); editor-made levels use
  `npc_1`, `npc_2`, … Read them from `window.__game.npcs.map((n) => n.id)`.

### 10.2 Play a level you just built (no dev server needed)

```json
[
  { "eval": "(async () => { for (let k = 0; k < 200 && !(window.__lumina && window.__lumina.loadMs); k++) await new Promise((r) => setTimeout(r, 100)); const { createEmptyLevel, addObject } = await import('/src/engine/level/LevelFormat.js'); const L = createEmptyLevel({ name: 'Probe', width: 16, depth: 12 }); addObject(L, 'npc', 8.5, 5.5, { name: 'Ada' }); return window.__lumina.playLocal(L, 'probe'); })()" },
  { "wait": 1500 },
  { "eval": "(async () => { for (let k = 0; k < 300 && !(window.__lumina && window.__lumina.loadMs); k++) await new Promise((r) => setTimeout(r, 100)); return JSON.stringify({ source: window.__lumina.source, warnings: window.__lumina.warnings, mode: window.__game.state().mode }); })()" },
  { "shot": "probe" }
]
```

`playLocal` navigates the tab, so the next step must wait for the new page's `loadMs` again. The
source becomes `local:probe`. `sandbox/game_levels.html?case=<name>` does the same for its
prepared test levels.

### 10.3 Drive the editor

```bash
npm run check -- --page=editor.html --query=open=emberfall --out=ed --wait=1000 --fps=0 --script=ed.json
```

```json
[
  { "eval": "(async () => { await window.__editor.app.ready; await window.__editor.ready3d; return window.__editor.state.level.objects.length; })()" },
  { "eval": "import('/sandbox/editor_shell.helpers.js').then((m) => m.install())" },
  { "press": "3" },
  { "eval": "T.E.state.setTool('paint'); T.E.state.setToolOption('tile', '.'); T.drag([[10, 10], [14, 10]]).then(() => T.E.state.undoLabel)" },
  { "eval": "(() => { const o = T.E.state.addObject('lamppost', 20.5, 20.5); return o.id; })()" },
  { "combo": ["Control", "KeyZ"] },
  { "eval": "JSON.stringify(T.summary())" },
  { "press": "1" },
  { "wait": 800 },
  { "shot": "editor" }
]
```

Drawing with real mouse input: `drag` steps with client coordinates from
`window.P.s2d(x, z)` / `s3d(x, z)` ([`editor_perf.helpers.js`](../../sandbox/editor_perf.helpers.js)).
Wait for `__editor.view3d.busy === false` before comparing the 3D view with a fresh build.

### 10.4 Play-test from the editor

`app.playtest()` saves the level to browser slot `__playtest__` and opens the game in a pop-up
window named `lumina-playtest` (the harness does not block it: `window.open` called from an `eval`
step returns a window). Two ways to continue in the game, both verified on 2026-09-27:

1. **Follow the pop-up** — wait for it to appear, then switch (the wait is required, see the
   `tab` note in [§9](#9-action-scripts)):

   ```json
   [
     { "eval": "(async () => { await window.__editor.app.ready; return window.__editor.app.playtest(); })()" },
     { "wait": 1500 },
     { "tab": "last" },
     { "eval": "(async () => { for (let k = 0; k < 300 && !(window.__lumina && window.__lumina.loadMs); k++) await new Promise((r) => setTimeout(r, 100)); return JSON.stringify({ href: location.href, source: window.__lumina.source }); })()" }
   ]
   ```

2. **Navigate the same tab** — `goto` the play-test URL (same origin, so the slot is there):

   ```json
   [
     { "eval": "(async () => { await window.__editor.app.ready; return window.__editor.app.playtest(); })()" },
     { "goto": "index.html?level=local:__playtest__&autostart=1" },
     { "eval": "(async () => { for (let k = 0; k < 300 && !(window.__lumina && window.__lumina.loadMs); k++) await new Promise((r) => setTimeout(r, 100)); return JSON.stringify({ source: window.__lumina.source, level: window.__game.state().level }); })()" }
   ]
   ```

Without the `wait`, `tab: "last"` stays on the editor page and the next `eval` runs there.

### 10.5 Measure performance

- `fps` steps give frame-time percentiles; headless Chrome caps them at the compositor rate
  (~57–60 fps), so fps alone cannot prove headroom.
- `window.__game.state().drawCalls` / `triangles` (budget: ≤ ~300 scene draw calls including the
  shadow pass on the reference GTX 1060) and `world.stats` (build phases, lights, batching).
- GPU stage timings: `window.__game.postfx.enableTimings(true)`, wait a second, then read
  `window.__game.postfx.timings` (smoothed ms per stage) or `timingsMin`.
- Editor strokes: `sandbox/editor_perf.json` / `editor_perf.stress.json`
  (`npm run check -- --page=editor.html --query=new --out=perf --fps=0 --script=sandbox/editor_perf.json`).
- Details and reference numbers: [../architecture/PERFORMANCE.md](../architecture/PERFORMANCE.md).

### 10.6 The fixed-step play-through bot

[`sandbox/combat_play.js`](../../sandbox/combat_play.js) plays all of Cinderwatch Pass with real
`KeyboardEvent`s (an engine system at order −100 dispatches them before the game reads its input).
The scripts: `combat.play.json` (fixed step, every frame drawn), `combat.play.fast.json` (fixed
step, `renderEvery: 4`), `combat.play.human.json` (fixed step, the human model, every 4th frame),
`combat.play.realtime.json` (the real-time run). The fixed-step ones start with a `goto` to
`index.html?level=cinderwatch-pass&autostart=1&fixedstep=1`, so any `--page` / `--query` works
(`--page=sandbox/index.html --query= --wait=0` loads nothing twice); the real-time one needs
`--page=index.html --query="level=cinderwatch-pass&autostart=1" --wait=5000` and must run alone.

| Export | Effect |
| --- | --- |
| `start(opts)` | waits for the combat level, locks the resolution governor, installs the bot. `fixed` (default: the URL has `fixedstep`): the engine is in manual step, and a virtual page clock (`FixedClock`: `setTimeout`, `setInterval`, `requestAnimationFrame`, `performance.now()` from a fixed origin of 1e6 ms) follows the stepped frames — the bot steps at dt = 1/60 from the level's first frame, 30 frames per real task; `fixed: false` restores real time. `renderEvery` (fixed step): draw every n-th frame only (the last frame is drawn before a screenshot). `route`: `'ruins'` (default), `'mire'`, `'full'`, `'boss'` (with `at`, `kill`, `player`, `delay`); `skill`: `'expert'` (default), `'human'` or an object of `{ reaction, miss, burst, pause, healAt, skillDelay, drinkBusy, seed }`; `shop` (default true); `from` / `to` / `at` / `level` (development slices of the plan) |
| `until(ms = 120000)` | runs until the plan is done, a screenshot is wanted or `ms` of real time passed; in fixed step the game then stays on that frame until the next call (a screenshot shows the frame that asked for it). Returns JSON `{ shot, task, done, frame, t, failed, log }`. A new `until` stops a loop still running from an eval the harness gave up on |
| `verify(ms = 150000)` | the verdict (throws asynchronously on a failure, so the harness exits 1): the plan finished; the drill reward; the route's chests; Lv ≥ 5, ≥ 30 kills, ≥ 50 pickups; the planned death and respawn (route `ruins`); the Whetstone bought at Odo's; the boss down with the results card; programs after load = at load. Returns `{ summary, verdict, result, … }` — `summary` is one line of exact numbers printed first by the harness, e.g. `ok \| fixed done \| f 18261 (304.350 s) \| Lv 6 xp 37 gold 163 potions 4 hp 195 \| kills 36 deaths 1 chests 5 pickups 104 \| boss down 44.483 s [11.133 19.567 13.783] \| hurts 22 dmg 363 rolls 58 keys 592 \| failed 0 \| digest 54c13fa2`; the `digest` hashes the float bits of the player's position and stats and every enemy's position and HP, every frame; `trace` holds it every 10 s of game time (where two runs part), `pace` the real ms per 10 s (not part of the result); `zones`, `bossAttempts`, `damageBy`, `bought`, `goldSpent`, `draughtsDrunk`, `bossUptime`, `segments` are the balance figures |
| `summary()`, `report()` | the summary / the full report so far |
| `stop()` | removes the bot; in fixed step also gives the page its real clock and the engine its loop back |
| `window.__play` | `{ bot, report, summary, until }` while a bot runs |

The same tree gives the same digest on any GPU load (and with `renderEvery: 4`: rendering feeds
nothing back into the game). In fixed step, eval steps must measure real time with `Date.now()`
(`performance.now()` is virtual), combat tick timings read 0, CSS transitions still run in real
time, and a fixed-step run is not the same run as a real-time one (KNOWN_ISSUES TOOL-17).

## 11. Pitfalls

- **Big levels load slowly.** Starfall Vale takes several seconds; wait for `__lumina.loadMs`
  rather than trusting `--wait`.
- **`--query` defaults to `autostart=1`** even for the editor and docs pages; pass `--query=` when
  that matters.
- **Audio** unlocks only after a key or click (the autoplay flag lets Chrome play once unlocked):
  `state().audioReady` stays `false` in a script that never presses a key.
- **The title screen swallows the first key** (without `autostart`), and accepts input only after
  0.45 s.
- **Dialogs block** `talkTo`, `photo` and `map` until they close; check `state().dialogOpen` /
  `busy`.
- **`tab: "last"` does not wait** for a new tab (the launch's blank tab already makes two); put a
  `wait` step before it ([§9](#9-action-scripts)).
- **Keys pressed while a text field has focus** never reach the game or the editor shortcuts
  ([INPUT_AND_CONTROLS.md §5](INPUT_AND_CONTROLS.md#5-game-focus-and-browser-rules)); blur fields
  (`document.activeElement.blur()`) before key steps.
- **Screenshots show the live frame**: dust, particles, the clock and villagers move; for
  comparable shots freeze the clock (`window.__game.lighting.timeSpeed = 0`) and use `photo(true)`.
- **A page loaded with `?fixedstep`** (plus `autostart` / `debug`) does not run by itself: only
  `engine.step()` advances it. Use it only for scripts that step the engine (the fixed-step bot).
- **Never commit `.check/`**; it is gitignored scratch output. Do not write test levels into
  `public/levels/` unless the task asks for it (use browser slots via `playLocal`), and never touch an
  untracked level you did not create.
