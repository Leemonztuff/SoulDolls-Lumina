# Getting started

> **Purpose** — Everything you need to run Lumina on your own machine: requirements, install,
> the dev server and its URLs, production builds and deployment, and fixes for the problems
> people usually hit on day one.
>
> **Audience** — Players, level designers and developers (human or AI) opening the project for the
> first time.
>
> **Source of truth** — [`package.json`](../../package.json), [`vite.config.js`](../../vite.config.js),
> [`index.html`](../../index.html) + [`src/main.js`](../../src/main.js) (game boot and URL
> parameters), [`editor.html`](../../editor.html) + [`src/editor/EditorApp.js`](../../src/editor/EditorApp.js)
> (`EditorApp._openFirst`), [`src/engine/level/LevelStorage.js`](../../src/engine/level/LevelStorage.js),
> [`tools/vite-level-api.js`](../../tools/vite-level-api.js),
> [`src/demo/ResolutionGovernor.js`](../../src/demo/ResolutionGovernor.js).
>
> **Related** — [Playing the game](PLAYING_THE_GAME.md) · [Level editor guide](LEVEL_EDITOR_GUIDE.md) ·
> [Shortcut cheat-sheet](shortcuts.html) · [Development workflow](../development/DEVELOPMENT_WORKFLOW.md) ·
> [Testing & verification](../development/TESTING_AND_VERIFICATION.md) ·
> [Level storage API](../specs/LEVEL_STORAGE_API.md) · [Performance](../architecture/PERFORMANCE.md)

---

## 1. What you are installing

Lumina is three things built on one engine (three.js r186, plain JavaScript ES modules):

| Front end | Entry | What it is |
| --- | --- | --- |
| **The game** | `index.html` → `src/main.js` → `src/demo/` | Plays any *lumina-level* JSON file. Default: **Emberfall**. |
| **The level editor** | `editor.html` → `src/editor/` | Paint terrain, place objects, play-test. |
| **Sandboxes** | `sandbox/index.html` | One test page per engine module (dev server only). |

Every texture, sprite, sound and music track is generated procedurally at runtime — there are no
image or audio files to download, and the UI fonts (Cinzel, Crimson Pro, Pixelify Sans) are
bundled from npm (`@fontsource/*`). After `npm install` nothing needs the network.

---

## 2. Requirements

| Need | Details |
| --- | --- |
| **Node.js** | Developed with **Node 24.13** and npm 11.11. Vite 8.3 (the build tool) requires Node `^20.19.0` or `>=22.12.0`. |
| **Browser** | A browser with **WebGL 2** and hardware acceleration switched on (three.js r186 has no WebGL 1 path). Lumina was developed and verified in **Google Chrome on Windows** (ANGLE / Direct3D 11). Other Chromium browsers (Edge) use the same engine; Firefox and Safari were not tested. |
| **GPU** | The reference machine is a **GeForce GTX 1060 3 GB** at 1600 × 900: 60 fps in every level. On a weaker GPU, lower the render scale (see [Performance tips](#63-performance-tips)). |
| **Input** | Keyboard (a standard-mapping gamepad is optional in the game). The editor needs a mouse with a **right button and a wheel** for the camera; a middle button is optional (Shift + right-drag or Space + drag also pan). |
| **Screen** | The editor layout is designed for **1280 × 720 and up**. |

### Performance to expect (reference machine)

Measured numbers from the build history and [`README.md`](../../README.md) (GTX 1060, 1600 × 900,
pixel ratio 1):

| Scene | Frame rate | Draw calls | Loading to first frame |
| --- | --- | --- | --- |
| Emberfall (48 × 40) | 60 fps (vsync) | ~170–245 incl. the shadow pass | a few seconds |
| Starfall Vale (128 × 128) | 60 fps | 135–283 at the default zoom | 2.4–2.8 s on a warm dev server, 4.0–4.4 s with a cold shader cache |
| Editor, 64 × 64 level, ~200 objects | strokes p95 ≈ 18 ms (display rate), max ≤ 36 ms | — | — |
| Editor, Starfall Vale (split view) | idles at ~57–60 fps; strokes p95 18–36 ms | ~915 | opening blocks ~2 s (a loading overlay shows) |

On a cold dev server the very first load is slower, because Vite transforms the modules on demand.
See [architecture/PERFORMANCE.md](../architecture/PERFORMANCE.md) for the full measurements.

---

## 3. Install

```bash
git clone <this repository> lumina
cd lumina
npm install
```

What gets installed ([`package.json`](../../package.json)):

| Package | Version | Used for |
| --- | --- | --- |
| `three` | ^0.186.1 | Rendering |
| `lil-gui` | ^0.21.0 | The in-game debug panel |
| `@fontsource/cinzel`, `@fontsource/crimson-pro`, `@fontsource/pixelify-sans` | ^5.3.0 | UI fonts, bundled |
| `vite` (dev) | ^8.3.1 | Dev server, level-save API, production build |
| `puppeteer-core` (dev) | ^25.12.0 | Only the headless check harness (`npm run check`); it drives your installed Chrome / Edge and downloads no browser |
| `typescript`, `@types/three`, `@types/node` (dev) | ^7.0.2, ^0.186.0, ^24.19.0 | Only the type check (`npm run typecheck`) of the JavaScript through its JSDoc; nothing is compiled — the game runs the `.js` files as they are |

---

## 4. Run it

```bash
npm run dev        # Vite dev server on http://127.0.0.1:5173/
```

The server listens on **127.0.0.1 only** (`vite.config.js` → `server.host`). Use exactly that
address: browser storage (levels saved "in this browser", the editor's autosave and play-test slot)
is kept **per address and port**, so `http://localhost:5173` would see different saved levels —
and may not reach the server at all. If port 5173 is taken, Vite moves to the next free port and
prints the URL; the same per-port rule applies.

### 4.1 URLs of the game

| URL | What it does |
| --- | --- |
| `/` or `/index.html` | Emberfall with its title screen (`public/levels/emberfall.json`). |
| `/?autostart=1` | Skips the title screen and starts in gameplay. Any value except `0` counts. |
| `/?level=starfall-vale` | **Starfall Vale**, the 128 × 128 showcase. |
| `/?level=brightwater-crossing` | **Brightwater Crossing**, the 36 × 28 hamlet built entirely in the editor. |
| `/?level=cinderwatch-pass` | **Cinderwatch Pass**, the 96 × 120 combat level: real-time ARPG combat ([Playing the game §15](PLAYING_THE_GAME.md#15-combat-cinderwatch-pass)). |
| `/?level=sample-hamlet` | **Willowmere**, the small 28 × 22 example level. |
| `/?level=<name>` | `public/levels/<name>.json`. The name is slugified first (`?level=Starfall Vale` → `starfall-vale`). |
| `/?level=local:<slot>` | A level saved in this browser (editor: *Save as › This browser*). |
| `/?level=local:__playtest__&autostart=1` | The editor's most recent play-test. |
| `/?debug` | Also exposes the engine as `window.__engine` (automation; any `?autostart` parameter does this too). `window.__game` and `window.__lumina` (storage helpers, load time) are always exposed — see [Automation API](../specs/AUTOMATION_API.md). |

Parameters combine: `/?level=starfall-vale&autostart=1`. See [Playing the game](PLAYING_THE_GAME.md)
for what to do once you are in.

### 4.2 URLs of the editor

| URL | What it does |
| --- | --- |
| `/editor.html` | Offers to restore autosaved unsaved work from an earlier session, otherwise starts a blank *Untitled* 32 × 24 level. The layout of your last session is restored. |
| `/editor.html?open=<name>` | Opens `public/levels/<name>.json`, e.g. `?open=emberfall`, `?open=starfall-vale`. |
| `/editor.html?local=<slot>` | Opens a level saved in this browser. |
| `/editor.html?new` | Starts an empty level (no restore prompt). |

After `?open=` / `?local=` the editor only offers a restore when the autosaved copy belongs to that
same level. Details: [Level editor guide › Opening the editor](LEVEL_EDITOR_GUIDE.md#1-opening-the-editor).

### 4.3 Sandbox gallery (dev server only)

`/sandbox/` (`sandbox/index.html`) is a gallery of standalone test pages, one per engine module:
core, textures, sprite art, sprite runtime, terrain, props, lighting (standalone and through the
real engine), post-processing, UI and a WebGL smoke test. Three more pages exist but are not linked
from the gallery: `/sandbox/level_builder.html` (level format + object builder),
`/sandbox/game_levels.html` (game level-loading edge cases, `?case=…`) and `/sandbox/editor3d.html`
(the editor's 3D viewport on its own). They are development tools, not part of the production
build — see [development/TESTING_AND_VERIFICATION.md](../development/TESTING_AND_VERIFICATION.md).

---

## 5. Build and deploy

```bash
npm run build      # production build of the game and the editor into dist/
npm run preview    # serve dist/ on http://127.0.0.1:4173/ (Vite's preview host follows server.host)
```

`dist/` contains `index.html`, `editor.html`, `assets/` (hashed JS, CSS, fonts) and `levels/` —
Vite copies everything in `public/` as-is, so every `public/levels/*.json` ships with the build and
stays playable at `?level=<name>`.

**Deploying** — copy `dist/` to any static web host. It must be served over `http(s)://`: opening
`dist/index.html` from the file system does not work (ES modules and the level `fetch` need a web
server).

**Hosting under a sub-path** — the built pages reference `/assets/…` absolutely. For a site like
`https://example.com/lumina/`, build with Vite's base option; the level loader follows it
(`import.meta.env.BASE_URL` in `loadProjectLevel`):

```bash
npm run build -- --base=/lumina/
```

> In Git Bash on Windows, prefix the command with `MSYS_NO_PATHCONV=1`, otherwise the shell rewrites
> `/lumina/` into a Windows path.

### What only exists under `npm run dev`

| Feature | Dev server | Built site (`dist/`, `npm run preview`) |
| --- | --- | --- |
| Playing project levels (`?level=<name>`) | yes | yes |
| Editor: open project levels (`?open=<name>`) | yes | yes |
| Editor: *Save as › Project folder*, the *Project folder* tab of *Open*, deleting project files | yes (the `/api/levels` REST API of [`tools/vite-level-api.js`](../../tools/vite-level-api.js)) | **no** — the card says "Needs the dev server (npm run dev)" |
| Editor: save in the browser, download `.level.json`, open a file, play-test | yes | yes |
| `/sandbox/` pages | yes | no (not in the build inputs) |

To ship a level made on a built site: download it (*Save as › Download file* or Ctrl+E), rename
`<name>.level.json` to **`<name>.json`**, put it in `public/levels/` and rebuild (or copy it into
`dist/levels/`). The file name matters: `?level=my-hamlet.level` would look for
`my-hamlet-level.json`.

---

## 6. Troubleshooting

### 6.1 Blank page, black screen or an error on the loading screen

The game keeps its loading screen (an ember, a gold bar and a caption) up until the first frame is
drawn. A problem during start-up turns the caption red and shows the message, with links to
*Play Emberfall* (only when the URL asked for a `?level=`) and *Open the level editor*
(`showErrorActions` in [`src/main.js`](../../src/main.js)).

| You see | Cause and fix |
| --- | --- |
| *Error creating WebGL context* (or a similar WebGL message) | WebGL 2 is unavailable. Turn on hardware acceleration in the browser settings, update the GPU driver, check `chrome://gpu`, and try Chrome or Edge. |
| *Could not load level "x": Level "x" not found* (dev server and `npm run preview`, which answer a missing file with the HTML page) or *…: Level "x" not found (HTTP 404)* (a static host that returns 404) | There is no `public/levels/x.json`. Check the spelling; the name is slugified (lower case, dashes). |
| *Could not load level "local:x": No level "x" in this browser's storage* | Browser levels live in the browser **and address** where they were saved (see [§4](#4-run-it)). Open the game from the same address as the editor. |
| *the file is not valid level JSON (…)* | The file is broken. Open it in the editor (File › Open › File on disk) to see what it reports. |
| Nothing at all, from a `file://` URL | Serve it: `npm run dev` or `npm run preview`. |
| Editor: *The level editor could not load* on the boot splash | A module failed to load. The message names it; the browser console has the details. |
| Editor: *3D preview unavailable* in the 3D pane | The 3D view could not start (usually WebGL). The 2D map is fully editable on its own; the pane offers *Retry* and *2D only*. |

Start-up warnings about the level itself (a spawn moved off water, adjusted data) go to the browser
console with a `[Lumina]` prefix.

### 6.2 No sound

Browsers only start audio after a user gesture. The **title screen's key press** unlocks audio and
starts the music. With `?autostart=1` (and in editor play-tests) the **first key press or click**
does it — unless that first key is **M**, which toggles the music itself. After that:

- **M** turns the music on and off (a toast confirms).
- A level can start without music (`environment.music: false`, *Level settings › Environment ›
  Music* in the editor); press **M** to start it anyway.
- Ambience (birds, crickets, fire, water) plays whenever audio is unlocked.

### 6.3 Performance tips

- Open the **debug panel** (**`** backquote or **F1**) and look at the stats overlay: fps, frame
  ms, draw calls, triangles.
- **Render › render scale** (0.5–1) renders fewer pixels; moving it switches the automatic
  governor off. **Render › dynamic resolution** switches the governor back on.
- The **resolution governor** ([`ResolutionGovernor.js`](../../src/demo/ResolutionGovernor.js)) caps
  the drawing buffer at about 2.1 megapixels (a 2560 × 1440 window renders at ~1930 × 1086 and is
  scaled up) and, when the browser exposes GPU timer queries, lowers the render scale in 0.1 steps
  down to **0.7** after 2 s of a median GPU time above **13.5 ms**, and raises it after 10 s below
  **8.5 ms** (never twice within 3 s). Each step reallocates buffers — a one-off hitch of a few ms
  on an idle GPU, up to ~0.2 s on a busy one.
- MSAA is 2× instead of 4× when the drawing buffer is above ~1.8 megapixels (decided once at
  start-up from the window size).
- A smaller browser window is the simplest speed-up. Close other GPU-heavy applications.
- **Post FX › Depth of field › enabled** off is the biggest single saving among the effects (the
  look changes, of course).
- In the editor keep *View › 3D: HD-2D post effects* and *3D: particles & god rays* off while
  editing (they are off by default), and use the **2D only** layout (key **3**) on 128 × 128 levels.

### 6.4 Keys do nothing

- **Click into the page** first (the game only receives keys while its tab and window have focus).
- Keys are ignored while a text field has focus (the debug panel's number fields, the editor's
  inspector). Click on the scene; in the editor, **Enter** or **Esc** also leaves a field.
- The game binds **physical key positions** (`KeyboardEvent.code`): on AZERTY or QWERTZ keyboards
  the movement keys are the keys *where* W A S D sit on a US keyboard (Z Q S D on AZERTY), and so on
  for Q / E / Z / X. The editor's tool letters use the *printed* letter instead.
- In the editor, **Ctrl+N** opens a new browser window in Chrome — use **Alt+N** or *File › New*.
- On a Mac, **Cmd** works wherever the editor says Ctrl.

### 6.5 Editor-specific

| Problem | Fix |
| --- | --- |
| *Project folder* is greyed out in *Save as* | Only available under `npm run dev`. Save in the browser or download the file. |
| *Saving failed: Cannot write public/levels/x.json (the file is read-only or in use by another program)* | Close the program holding the file, or clear its read-only flag. |
| *Pop-up blocked* after **Play** / **F5** | Allow pop-ups for the editor's address. The level is already stored in the play-test slot: open `/?level=local:__playtest__&autostart=1` yourself. |
| The unsaved dot turns red, *Autosave failed — browser storage is full or unavailable* | Browser storage is full (big levels use a lot). Save to the project folder or download the level; delete old levels in *File › Open › This browser*. |
| Opening a 128 × 128 level freezes the page for ~2 s | Expected: the terrain is rebuilt in one task; a loading overlay shows. See [Limits](LEVEL_EDITOR_GUIDE.md#14-limits-and-known-quirks). |

More in [ai/KNOWN_ISSUES.md](../ai/KNOWN_ISSUES.md).

---

## 7. Where to go next

- **Play** — [Playing the game](PLAYING_THE_GAME.md): controls, HUD, time and weather, and guided
  tours of Emberfall and Starfall Vale.
- **Make a level** — [Level editor guide](LEVEL_EDITOR_GUIDE.md), including a 15-minute tutorial.
- **Print the keys** — [shortcuts.html](shortcuts.html).
- **Develop** — [development/DEVELOPMENT_WORKFLOW.md](../development/DEVELOPMENT_WORKFLOW.md) and
  [ai/AGENT_ONBOARDING.md](../ai/AGENT_ONBOARDING.md); the verification tool is
  `npm run check` ([development/TESTING_AND_VERIFICATION.md](../development/TESTING_AND_VERIFICATION.md)),
  and `npm run typecheck` checks the JSDoc types (about two seconds, no browser needed).
