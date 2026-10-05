# Project timeline (from the orchestrating session) — source material for docs/history

All work was done by Claude Code (Opus) orchestrating multi-agent workflows ("ultracode" mode):
builder agents in parallel against a written contract, then independent auditors / reviewers,
then fixers and a final verifier. Reports of every workflow are in this folder (docs/history/reports/; until 2026-10-01 in .check/history/).

## User requests (in order)
1. 2026-09-25 — "Create a 3D pixel art game engine looks like the OCTOPATH TRAVELER II game. Use
   three.js to create the project. Create a demo scene to show the engine's capabilities."
2. 2026-09-26 — "Create a visual map/level editor so that the user can create map by hand and save the map."
3. 2026-09-27 — "Create a 128×128 full featured demo level."
4. 2026-09-27 — /init → CLAUDE.md, then "commit it".
5. 2026-09-27 — "Create detailed documentations in the docs folder…" (this task).

## Phase 1 — engine (commits f778242 … 807bfe4)
- Orchestrator scaffolded Vite + three r186 + lil-gui + @fontsource + puppeteer-core, wrote the
  headless check harness (tools/check.mjs), the foundation modules (constants, utils/math,
  GlobalUniforms, PixelCanvas, Palette) and ARCHITECTURE.md (the module contract).
- Workflow "lumina-build-modules": 9 builders in parallel (core+audio, postfx, textures, sprite art,
  sprite runtime+particles, lighting+sky+godrays, UI; terrain+water and props started once the
  texture library existed), each followed by an independent auditor. 18 agents. Each module has a
  sandbox page. docs/contracts/MODULE_NOTES.md condenses their reports.
## Phase 2 — Emberfall demo (9dadcf8, 8e36884)
- Integrator agent (interrupted once by a usage limit, resumed) built the demo; 4 reviewers
  (runtime, art, perf, gameplay) → 57 findings → fixer (43 applied) → final verifier.
## Phase 3 — level editor (8ec4849 … 1643b2c)
- Orchestrator wrote the level format, object catalog, object builder, level storage, dev-server
  level API and EditorState + docs/contracts/LEVEL_EDITOR.md (contract).
- 3 builders in parallel (game level loading + Emberfall → emberfall.json; editor shell/2D/tools;
  3D viewport) + auditors; then a perf/integration polish pass, 4 reviewers with REAL mouse input
  (harness extended with drag/wheel/type/combo) → 53 findings, fixer (interrupted by usage limit,
  resumed with triage) and a verifier that built Brightwater Crossing through the UI.
## Phase 4 — Starfall Vale 128×128 (ef71917, db41c62)
- Baseline measured by orchestrator: synthetic 128×128 ran but only 12 of ~150 lights lit, 1.29 M
  triangles always drawn (no culling).
- Scalability engineer (LightPool, SpatialSplit/ShadowCasters batching & culling, collider grid,
  shore worker, minimap + world map) ∥ level designer (tools/make-starfall-vale.mjs); integration
  & art polish; 4 reviewers (explorer, art, perf, data) → 50 findings → all fixed → verifier.
## Phase 5 — CLAUDE.md (584fbc5)

## Environment facts
- Windows 10, Git Bash, Node 24, GTX 1060 3 GB, 12 logical CPUs. Headless Chrome (x86 Chrome
  install) renders on the real GPU through ANGLE/D3D11; the compositor caps fps at ~57–60.
- public/levels/untitled.json appeared during the session (probably the user's own experiment);
  it is intentionally left untracked and must not be modified or committed by agents.
