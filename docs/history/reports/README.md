# Workflow reports (raw build history)

> **Purpose.** The raw material behind [PROJECT_HISTORY.md](../PROJECT_HISTORY.md),
> [DECISIONS.md](../DECISIONS.md) and [KNOWN_ISSUES.md](../../ai/KNOWN_ISSUES.md): the result of
> every multi-agent workflow that built or fixed Lumina, as the orchestrator received it — builder,
> reviewer, fixer and verifier reports with their findings, measurements and verdicts. Read the
> history page for the story; come here for the evidence behind a sentence there.
>
> **Status.** Archived as-is (committed on 2026-10-01; until then they lived in the gitignored
> `.check/`). They are not maintained: paths, line numbers and counts are those of the day each
> workflow ran, and the code is the truth where they differ. Absolute paths such as
> `E:\workspace\3d_pixel\…` are the development machine's.

## Files

Reports are JSON. 01–09 and 15, 17, 19 are the workflow tool's full output (`summary`,
`agentCount`, `logs`, `result`, …); the others are the `result` part only.

| File | Workflow | Commits |
| --- | --- | --- |
| `01-engine-modules-build.json` | engine modules built in parallel against ARCHITECTURE.md, each audited | `807bfe4` |
| `02-emberfall-integration-review.json` | Emberfall demo: integration, four-lens review, fixes, verification | `9dadcf8`, `8e36884` |
| `03-level-editor-build.json` | level editor (shell, 2D map, tools, 3D viewport) and level loading in the game (the foundations of `8ec4849` were written before it) | `dadfcd6` |
| `04-level-editor-polish-review.json` | editor stroke performance and polish; review with real mouse input | `4a32326`, `30290d0` |
| `04b-editor-review-findings.json` | the 53 findings of that review | — |
| `05-level-editor-fix-verify.json` | the rest of the editor findings applied; Brightwater Crossing built through the UI | `1643b2c` |
| `06-starfall-vale-build.json` | big-level scalability and the 128 × 128 Starfall Vale | `ef71917` |
| `07-starfall-vale-review.json` | Starfall review (four lenses), fixes, verification | `db41c62` |
| `08-docs.json` | the documentation tree | `8ae4ad8`, `6f87685` |
| `09-fix-five.json` | five known-issue fixes (level-API cross-site writes, one-choice dialogue, …) | `4f30592`, `a9f02a8` |
| `10-door-stall-weather-cors.json` | door Knock prompt, Brightwater stall, editor weather preview, dev-server CORS | `7df6c5b` |
| `11-combat-design.json` | ARPG combat design contract (COMBAT.md) | `65e76a3` |
| `12-combat-build.json` | combat system and Cinderwatch Pass: build, integration, review, fixes | `eb82076` |
| `13-combat-open-issues.json` | the open combat known issues (pathing, zones, shop, fixed-step bot, audio QA …) | `630855d` |
| `14-typecheck-evaluation.json` | should the project move to TypeScript? (tsc trial triage, bug history, migration cost) | — |
| `15-typecheck-contract-types.json` | contract types for the JSDoc type check | `afd58b6` |
| `16-typecheck-burn-down.json` | the type errors cleared area by area (nine agents) | `afd58b6` |
| `17-typecheck-finish.json` | cross-area requests, mutation test, reviews, fixes, docs | `afd58b6` |
| `18-lvl17-prototype-names.json` | KNOWN_ISSUES LVL-17: level-data names that match `Object.prototype` members | `edab403` |
| `19-ed16-interrupted-strokes.json` | KNOWN_ISSUES ED-16: interrupted editor strokes | `08bc3e8` |
| `timeline.md` | the orchestrator's notes for phases 1–5, written for the first docs pass | — |
| `git-log.txt` | `git log --oneline` at that time | — |
| `scripts/` | local helper scripts of the early phases (level fingerprint and comparison, image diff, the level-API CSRF / CORS probes); superseded by the snippets in [TASK_PLAYBOOKS.md](../../ai/TASK_PLAYBOOKS.md#appendix-tested-harness-snippets) and kept for reference — not maintained, not type-checked | — |

The COMBAT-24 fix (`ea213c2`) and the CLAUDE.md / docs commits ran without a workflow.
