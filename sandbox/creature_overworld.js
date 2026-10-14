/**
 * Creature overworld fixture ("Critters Collection" FASE 5) — two small levels in the browser's
 * `local:` storage and the scripted checks over the real game page (sandbox/creature.encounter.json):
 *
 *  - `creature-peaceful` (PEACEFUL_SLOT): a 28 × 20 field with NO creature object. A level without
 *    creatures must create no creature runtime at all (no `Game.creatures`, no `state().creatures`,
 *    no `.lu-creature` DOM, no creature bindings — the creature chunk stays out, CREATURE_PURE).
 *  - `creature-demo` (DEMO_SLOT): the same field with one wild `creature` (a Leafling, level 2, a
 *    small 0.6 u roam radius), one `creature_zone` with a `steps: 2` override and one without
 *    (the meadow default) — the roam, the no-party toast, the contact battle and the battle gate
 *    (the world freezes while a battle runs), the orb capture, the zone encounter, and the
 *    campaign mirror (plan §10; the fixture is a loose level: no campaign runtime, and the flat
 *    mirror a campaign seat would write is proven through the live roster).
 *  - `creature-starter` (STARTER_SLOT): the field with NO creature object and a starter NPC whose
 *    `talk` script is `if not starter_chosen → creature starter → set starter_chosen` — a level
 *    that plays no creatures makes the system lazily when the story gives one (`Game.ensureCreatures`)
 *    and the roster snapshot feeds the `creature` conditions (plan §13).
 *
 * A script plays them with (game page; see AUTOMATION_API.md §3.5):
 *   import('/sandbox/creature_overworld.js').then((m) => m.saveFixtures())
 *   goto game.html?level=local:creature-peaceful&autostart=1   → ready() → tests.peaceful()
 *   goto game.html?level=local:creature-demo&autostart=1       → ready() → tests.overworld()
 *     → tests.noParty() → tests.openContact() [shot] → tests.finishContact() → tests.capture()
 *     → tests.openZone() [shot] → tests.finishBattle() → tests.mirror()
 *   goto game.html?level=local:creature-starter&autostart=1    → ready() → tests.starter()
 *
 * Every battle the script drives runs on real frames: the non-menu phases advance on the system's
 * STEP timer, the tests only make the menu choices (`chooseAction` / `chooseMove`) the frame's
 * phase asks for — the same surface a player's keys reach.
 */
import { createEmptyLevel, addObject, normalizeLevel } from '../src/engine/level/LevelFormat.js';
import { saveLocalLevel } from '../src/engine/level/LevelStorage.js';

/** The play-test roster key the tests start from (the system uses it for `local:` starts). */
const TEST_ROSTER_KEY = 'luminati.creatures.test';

export const PEACEFUL_SLOT = 'creature-peaceful';
export const DEMO_SLOT = 'creature-demo';
export const STARTER_SLOT = 'creature-starter';

/** The starter level: a peaceful field, no creature object, one NPC who gives the first companion. */
export const STARTER = Object.freeze({
  spawn: { x: 4.5, z: 15.5 },
  professor: { x: 14, z: 10, id: 'professor', name: 'Professor Birch', species: 'leafling', level: 5 },
});

/** Named points (world units) of the demo level, for the scripts. */
export const DEMO = Object.freeze({
  spawn: { x: 4.5, z: 15.5 },
  creature: { x: 8.5, z: 8.5, id: 'wild-leafling', species: 'leafling', level: 2 },
  /** A `creature_zone` with a `steps: 2` override (a 2-unit walk inside triggers a battle). */
  zone: { x: 23, z: 6, id: 'wild-zone', minX: 21, maxX: 25, minZ: 4, maxZ: 8, table: 'meadow', steps: 2 },
  /** A `creature_zone` with no `steps` (the meadow table's `stepsPerEncounter` = 90). */
  zoneDefault: { x: 23, z: 16, id: 'wild-zone-default', minX: 21, maxX: 25, minZ: 14, maxZ: 18, table: 'meadow' },
});

/** A flat grass field, held clear of the demo objects. */
function makeField(name) {
  const L = createEmptyLevel({ name, width: 28, depth: 20, fill: 'g', level: 0, border: 1 });
  L.subtitle = 'A Creature Field';
  Object.assign(L.environment, { timeOfDay: 12, clock: false, weather: 'clear', music: false, dust: false, godRays: false });
  L.spawn = { x: DEMO.spawn.x, z: DEMO.spawn.z, facing: 'up' };
  return L;
}

/**
 * @returns {import('../src/engine/level/types.js').Level} the peaceful level (raw; normalise before use)
 */
export function makePeacefulFixture() {
  return makeField('Creature Peaceful');
}

/**
 * @returns {import('../src/engine/level/types.js').Level} the demo level (raw; normalise before use)
 */
export function makeCreatureFixture() {
  const L = makeField('Creature Demo');
  const wild = addObject(L, 'creature', DEMO.creature.x, DEMO.creature.z, { species: DEMO.creature.species, level: DEMO.creature.level, radius: 0.6 });
  wild.id = DEMO.creature.id;
  const zone = addObject(L, 'creature_zone', DEMO.zone.x, DEMO.zone.z, { table: DEMO.zone.table, steps: DEMO.zone.steps });
  zone.id = DEMO.zone.id;
  const zoneDefault = addObject(L, 'creature_zone', DEMO.zoneDefault.x, DEMO.zoneDefault.z, { table: DEMO.zoneDefault.table });
  zoneDefault.id = DEMO.zoneDefault.id;
  return L;
}

/**
 * @returns {import('../src/engine/level/types.js').Level} the starter level (raw; normalise before
 *   use): no creature object, one NPC whose `talk` script gives the first companion.
 */
export function makeStarterFixture() {
  const L = makeField('Creature Starter');
  const npc = addObject(L, 'npc', STARTER.professor.x, STARTER.professor.z, {
    name: STARTER.professor.name,
    behaviour: 'post',
    talk: [
      'if not starter_chosen',
      '  creature starter',
      '  set starter_chosen',
    ],
  });
  npc.id = STARTER.professor.id;
  return L;
}

/**
 * Save a fixture (normalised) into this browser's level storage; open it with
 * `game.html?level=local:<slot>&autostart=1`.
 * @param {string} slot
 * @param {ReturnType<typeof makeField>} level
 * @returns {string} the slot
 */
function saveSlot(slot, level) {
  const { level: normal, warnings } = normalizeLevel(level);
  if (warnings.length) console.warn('[creature_overworld]', warnings.join('; '));
  return saveLocalLevel(slot, normal);
}

/** Save both fixtures and clear the play-test roster (a clean, empty start). @returns {string} the demo slot */
export function saveFixtures() {
  localStorage.removeItem(TEST_ROSTER_KEY);
  saveSlot(PEACEFUL_SLOT, makePeacefulFixture());
  saveSlot(STARTER_SLOT, makeStarterFixture());
  return saveSlot(DEMO_SLOT, makeCreatureFixture());
}

/** @param {string} [slot] @returns {string} the slot */
export function savePeacefulFixture(slot = PEACEFUL_SLOT) {
  return saveSlot(slot, makePeacefulFixture());
}

/** @param {string} [slot] @returns {string} the slot */
export function saveCreatureFixture(slot = DEMO_SLOT) {
  return saveSlot(slot, makeCreatureFixture());
}

// =============================================================================================
// Scripted checks (sandbox/creature.encounter.json): each returns a result object; a failed
// assertion throws asynchronously (the harness exits 1) and is listed in `result.failures`.
// =============================================================================================

/** Real time. @param {number} ms @returns {Promise<void>} */
const waitMs = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait until `fn` returns something truthy; the game loop runs real frames meanwhile.
 * @param {() => unknown} fn
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>} false on timeout
 */
async function until(fn, timeoutMs = 8000) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    try {
      if (fn()) return true;
    } catch {
      /* a frame mid-change: retry */
    }
    await waitMs(50);
  }
  return false;
}

/** Wait until the game page finished loading (`__luminati.loadMs`) and lock the resolution governor. */
export async function ready(timeoutMs = 60000) {
  const t0 = performance.now();
  while (!(window.__luminati && window.__luminati.loadMs && window.__game)) {
    if (performance.now() - t0 > timeoutMs) throw new Error('creature fixture: the game did not load');
    await waitMs(100);
  }
  const g = window.__game;
  g.game.resolution.enabled = false;
  g.engine.renderScale = 1;
  return g;
}

function checker(name) {
  const failures = [];
  const check = (ok, msg, detail) => {
    if (ok) return true;
    const text = `[${name}] ${msg}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`;
    failures.push(text);
    setTimeout(() => { throw new Error(text); });
    return false;
  };
  return { failures, check };
}

const G = () => window.__game;

/** The creature hooks of the running level. */
function CS() {
  const cs = G().creatures;
  if (!cs) throw new Error('[creature_overworld] this level has no creature system');
  return cs;
}

/**
 * Record every HUD toast's text while it is shown (a toast lives ~3 s on a real timer, so a check
 * that reads the DOM after a slow stretch finds nothing). `stop()` restores `toast`.
 * @returns {{ texts: string[], stop: () => void }}
 */
function recordToasts() {
  const hud = G().game.ui.hud;
  const own = Object.prototype.hasOwnProperty.call(hud, 'toast');
  const keep = hud.toast;
  /** @type {string[]} */
  const texts = [];
  hud.toast = function recordToast(text, ...rest) {
    texts.push(String(text ?? ''));
    return keep.call(this, text, ...rest);
  };
  return {
    texts,
    stop() {
      if (own) hud.toast = keep;
      else delete hud.toast;
    },
  };
}

const totalRoster = (r) => r.active.length + r.box.length;

/** The overlay count: the HUD element exists on a creature level, `.is-on` only in a battle. */
const onOverlay = () => document.querySelectorAll('.lu-creature.is-on').length;

/**
 * Drive one battle to its end with menu choices only (the system advances the rest on its own
 * timer): Fight with the active creature's first move. Resolves as: win, lose (the player faints),
 * caught (a bag battle) or fled. The outcome read from the last living battle reference: a catch
 * or a flee sets `outcome` on the same frame the battle is torn down, so a poll can miss it.
 * @param {import('../src/game/creatures/types.js').CreatureHooks} cs
 * @param {number} timeoutMs
 * @returns {Promise<{ outcome: import('../src/game/creatures/types.js').BattleOutcome } | null>}
 *   the final outcome; null when no battle ran
 */
async function fightOut(cs, timeoutMs) {
  const t0 = performance.now();
  let saw = null;
  /** @type {import('../src/game/creatures/types.js').BattleHooks | null} */
  let last = null;
  while (performance.now() - t0 < timeoutMs) {
    const st = cs.state().battle;
    if (st === null) {
      // the battle object survives its teardown: its final outcome is still readable
      return { outcome: (saw?.outcome) ?? last?.system?.outcome ?? null };
    }
    if (st.outcome) saw = { outcome: st.outcome };
    const b = cs.battle();
    if (!b) continue;
    last = b;
    if (st.phase === 'action') b.chooseAction('fight');
    else if (st.phase === 'moveSelect') b.chooseMove(b.player().moves[0] ?? 'emberpuff');
    await waitMs(90);
  }
  return { outcome: (saw?.outcome) ?? last?.system?.outcome ?? null };
}

export const tests = {
  /**
   * The peaceful level: a level without creature objects must create no creature state at all
   * (the lazy import stays away, CREATURE_PURE).
   */
  peaceful() {
    const { failures, check } = checker('creature.overworld/peaceful');
    const g = G();
    const s = g.state();
    check(g.game.creatures === null, 'no creature system on a level without creatures');
    check(!('creatures' in s), 'state() has no creatures key');
    check(g.creatures === undefined, 'no __game.creatures hook');
    check(document.querySelectorAll('.lu-creature').length === 0, 'no .lu-creature DOM (creature.css stays a chunk)');
    const b = g.engine.input.bindings;
    check(!(b.creatureBattleUp || b.creatureBattleDown || b.creatureBattleLeft || b.creatureBattleRight
      || b.creatureBattleConfirm || b.creatureBattleCancel), 'no creature battle bindings');
    return { level: s.level, failures };
  },

  /**
   * The demo level's overworld: the two object types land with their defaults, the actor roams
   * while the player stands still, and the overlay exists but stays hidden.
   */
  async overworld() {
    const { failures, check } = checker('creature.overworld/overworld');
    const cs = CS();
    const s0 = cs.state();
    check(s0.enabled === true, 'the system reports enabled');
    check(s0.creatures.length === 1 && s0.creatures[0].species === 'leafling' && s0.creatures[0].level === 2,
      'one wild Leafling at level 2', s0.creatures);
    check(s0.zones.length === 2, 'two encounter zones');
    const z1 = s0.zones.find((z) => z.id === DEMO.zone.id);
    const z2 = s0.zones.find((z) => z.id === DEMO.zoneDefault.id);
    check(z1?.need === DEMO.zone.steps, 'a zone with steps: 2 waits for its own steps override', z1);
    check(z2?.need === 90, 'a zone without steps waits for the meadow table default (90)', z2);
    // the creature overlay is created when a battle starts (enableCreature), never before
    check(document.querySelectorAll('.lu-creature').length === 0, 'no .lu-creature DOM outside a battle');
    check(onOverlay() === 0, 'and no overlay');
    const a0 = cs.state().creatures[0];
    const t0 = performance.now();
    let moved = 0;
    // the roam runs in cycles (a ~1 s walk, then a 1–3 s pause, then a 3 s idle wait): a long
    // poll catches at least one walk segment
    while (performance.now() - t0 < 12000 && moved < 0.05) {
      await waitMs(150);
      const a = cs.state().creatures[0];
      moved = Math.hypot(a.x - a0.x, a.z - a0.z);
    }
    check(moved >= 0.05, 'the wild creature roams while the player stands still', { from: a0, moved: +moved.toFixed(3) });
    return { wild: cs.state().creatures[0], zones: cs.state().zones, failures };
  },

  /**
   * A contact with nobody to fight: `ui.noParty` — one toast, no battle, no overlay (design:
   * no battle without a standing companion).
   */
  async noParty() {
    const { failures, check } = checker('creature.overworld/noParty');
    const g = G();
    const cs = CS();
    const s0 = cs.state();
    check(s0.roster.active.length === 0 && s0.roster.box.length === 0, 'the play-test roster starts empty', s0.roster);
    const rec = recordToasts();
    const got = await until(() => {
      const a = cs.state().creatures[0];
      if (a) g.teleport(a.x, a.z);
      return rec.texts.some((t) => /no companion/i.test(t));
    }, 6000);
    rec.stop();
    check(got, 'standing on a wild creature without a party toasts ui.noParty', rec.texts);
    check(cs.state().battle === null, 'and starts no battle');
    check(onOverlay() === 0, 'the overlay stays hidden');
    return { toasts: rec.texts.slice(-3), failures };
  },

  /**
   * The contact battle, held open at the action menu for a screenshot: `demo()` seeds an Emberling
   * and three orbs; the first contact (the player already stands on the wild Leafling) starts the
   * seeded battle.
   */
  async openContact() {
    const { failures, check } = checker('creature.overworld/openContact');
    const g = G();
    const cs = CS();
    cs.demo();
    const s1 = cs.state();
    check(s1.roster.active.length === 1 && s1.roster.active[0].species === 'emberling' && s1.orbs === 3,
      'demo seeds an Emberling and three orbs', { active: s1.roster.active.length, orbs: s1.orbs });
    const started = await until(() => {
      const a = cs.state().creatures[0];
      if (a) g.teleport(a.x, a.z);
      return cs.state().battle !== null;
    }, 8000);
    check(started, 'standing on the wild creature starts a battle');
    const atMenu = await until(() => cs.state().battle?.phase === 'action', 5000);
    check(atMenu, 'the battle waits at the action menu', cs.state().battle);
    check(onOverlay() === 1, 'the creature overlay is up');
    return { phase: cs.state().battle?.phase, foe: cs.battle()?.foe().species, failures };
  },

  /**
   * End the contact battle: while it runs the frame is the battle's (a held W — also the battle
   * menu's up key — must not move the player), then fight to the win.
   */
  async finishContact() {
    const { failures, check } = checker('creature.overworld/finishContact');
    const g = G();
    const cs = CS();
    const p0 = { x: g.player.position.x, z: g.player.position.z };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
    await waitMs(500);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
    const moved = Math.hypot(g.player.position.x - p0.x, g.player.position.z - p0.z);
    check(cs.state().battle !== null, 'a battle is running');
    check(moved < 0.05, 'the player cannot walk during a battle (the frame is the battle\'s)', { moved: +moved.toFixed(3) });
    const out = await fightOut(cs, 25000);
    check(out?.outcome === 'win', 'the level-5 Emberling beats the level-2 Leafling', out);
    check(cs.state().battle === null, 'the battle is over');
    check(onOverlay() === 0, 'the overlay is down again');
    const r = cs.state().roster;
    check(r.active[0].exp > 0, 'the win granted experience', r.active[0]);
    return { outcome: out?.outcome ?? null, exp: r.active[0].exp, failures };
  },

  /** Throw orbs at a scripted wild foe: each throw spends one orb, a catch joins the roster. */
  async capture() {
    const { failures, check } = checker('creature.overworld/capture');
    const cs = CS();
    // the seeded 'catch-me' battle catches on its third throw (a deterministic full-HP run)
    cs.roster.active[0]?.heal();
    cs.setOrbs(8);
    const before = totalRoster(cs.state().roster);
    cs.startBattle('leafling', 2, 'catch-me');
    check(cs.state().battle !== null, 'the scripted wild battle starts');
    const t0 = performance.now();
    let threw = 0;
    /** @type {import('../src/game/creatures/types.js').BattleHooks | null} */
    let lastB = null;
    while (performance.now() - t0 < 25000) {
      const st = cs.state().battle;
      if (st === null) break;
      const b = cs.battle();
      if (!b) continue;
      lastB = b;
      if (st.phase === 'action') {
        if (cs.state().orbs > 0) { b.chooseAction('bag'); threw++; }
        else b.chooseAction('run');
      } else if (st.phase === 'moveSelect') {
        b.chooseMove(b.player().moves[0] ?? 'emberpuff');
      }
      await waitMs(70);
    }
    const outcome = lastB?.system?.outcome ?? null;
    const s = cs.state();
    check(s.battle === null, 'the capture battle ends');
    check(threw >= 1, 'at least one orb was thrown', { threw });
    check(s.orbs === Math.max(0, 8 - threw), 'each throw spent one orb', { orbs: s.orbs, threw });
    const after = totalRoster(s.roster);
    check(after === before + (outcome === 'caught' ? 1 : 0), 'a catch joins the roster, a break-free leaves it', { outcome, before, after });
    check(outcome === 'caught' && after === before + 1, "the seeded 'catch-me' battle catches the Leafling", { outcome, threw });
    return { outcome, threw, orbs: s.orbs, roster: { active: s.roster.active.length, box: s.roster.box.length }, failures };
  },

  /** The encounter zone: after the steps override (2 u inside the rect) a battle is rolled. */
  async openZone() {
    const { failures, check } = checker('creature.overworld/openZone');
    const g = G();
    const cs = CS();
    await waitMs(2300); // the post-battle cooldown (BATTLE_COOLDOWN) must pass first
    cs.roster.active[0]?.heal();
    const z = DEMO.zone;
    const zoneB = cs.state().zones.find((zz) => zz.id === z.id);
    g.teleport(z.minX + 1, z.minZ + 1); // entering records the position (no step)
    await waitMs(250);
    g.teleport(z.maxX - 1, z.maxZ - 1); // the ~2.8 u jump covers the 2 u steps override
    const started = await until(() => cs.state().battle !== null, 5000);
    check(started, 'the zone battle starts after its steps are walked', { need: zoneB?.need, steps: zoneB?.steps });
    const atMenu = await until(() => cs.state().battle?.phase === 'action', 5000);
    check(atMenu, 'the zone battle waits at the menu');
    check(onOverlay() === 1, 'the creature overlay is up');
    const zAfter = cs.state().zones.find((zz) => zz.id === z.id);
    check((zAfter?.steps ?? 99) < 2, "the zone's step counter reset with the battle", zAfter);
    return { phase: cs.state().battle?.phase, foe: cs.battle()?.foe().species, failures };
  },

  /** End whatever battle is running (fight to its outcome), the world back. */
  async finishBattle() {
    const { failures, check } = checker('creature.overworld/finishBattle');
    const cs = CS();
    const out = await fightOut(cs, 25000);
    check(cs.state().battle === null, 'the battle ends', out);
    check(onOverlay() === 0, 'the overlay is down');
    return { outcome: out?.outcome ?? null, failures };
  },

  /**
   * The roster panel in the running game (phase 6): the level's creature system binds the opt-in
   * `creatureRoster` hotkey (C), so on a creature level C opens the panel over the world — the one
   * path no sandbox covers (the panel's own page is sandbox/creature_roster). Left open for a
   * screenshot; `rosterClose` puts it away. `rosterTap` holds a key for a frame or two.
   * @param {string} code
   */
  async rosterTap(code) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    await waitMs(120);
    window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  },

  /** C opens the roster over the world (`C` is bound by the creature system, phase 6). */
  async roster() {
    const { failures, check } = checker('creature.overworld/roster');
    const g = G();
    const cs = CS();
    g.teleport(DEMO.spawn.x, DEMO.spawn.z); // out of the wild actor's reach: a contact must not start a battle
    await waitMs(2300); // the post-battle cooldown (BATTLE_COOLDOWN) must pass first
    await tests.rosterTap('KeyC');
    const opened = await until(() => cs.rosterOpen(), 3000);
    check(opened, 'C opens the roster on a creature level');
    check(document.querySelectorAll('.lu-creature-roster.is-on').length === 1, 'the roster overlay is up');
    const rows = document.querySelectorAll('.lu-creature-roster__row').length;
    check(rows >= cs.state().roster.active.length, 'the party rows are drawn', { rows });
    const sprites = document.querySelectorAll('.lu-creature-roster__sprite').length;
    check(sprites >= cs.state().roster.active.length, 'every party member has a sprite', { sprites });
    check(cs.state().battle === null, 'and no battle is started by the roster');
    return { opened, rows, sprites, failures };
  },

  /** Esc closes the roster again. */
  async rosterClose() {
    const { failures, check } = checker('creature.overworld/rosterClose');
    const cs = CS();
    await tests.rosterTap('Escape');
    const closed = await until(() => !cs.rosterOpen(), 3000);
    check(closed, 'Esc closes the roster');
    return { closed, failures };
  },

  /**
   * The campaign mirror (plan §10): a campaign run links `game.campaign.state` into the roster at
   * construction and the seat's `setState`/`onTravel` keep the mirror following the save. The
   * fixture is a loose level (no `game.campaign`), so the roster must hold no mirror at birth —
   * and the flat mirror the seat would write is proven through the live roster itself:
   * `setState` repoints it and `save()` writes the roster into the state's `creatures` field
   * (the same assertion stands for `roster.save()` in Node, the mirror being a plain field).
   */
  async mirror() {
    const { failures, check } = checker('creature.overworld/mirror');
    const g = G();
    const cs = CS();
    const r = cs.roster;
    check(!g.campaign, 'the fixture is a loose level: no campaign runtime');
    check(r.state === null, 'without a campaign the roster holds no mirror at construction');
    const fake = /** @type {any} */ ({ creatures: null });
    r.setState(fake); // the seat's setState body (CampaignRuntime.newGame)
    const saved = r.save(); // the seat's onTravel body (CampaignRuntime.travel)
    check(saved === true, 'roster.save() succeeds with a state attached');
    const mirror = fake.creatures;
    check(mirror !== null && mirror.version === 1, 'roster.save() writes the mirror into state.creatures', mirror);
    check(mirror.active.length === r.active.length && mirror.box.length === r.box.length,
      'the mirror holds the roster', { active: r.active.length, box: r.box.length });
    r.setState(null); // back to the standalone play-test key; the mirror is forgotten with the run
    check(r.state === null, 'the roster is standalone again');
    return {
      mirror: mirror ? { version: mirror.version, active: mirror.active.length, box: mirror.box.length } : null,
      failures,
    };
  },

  /**
   * The starter NPC (plan §13): a level that plays no creatures makes the system lazily when its
   * story gives one (`creature starter` → `Game.ensureCreatures`), the roster snapshot feeds the
   * `creature` conditions, and the `starter_chosen` flag keeps it from being given twice.
   */
  async starter() {
    const { failures, check } = checker('creature.overworld/starter');
    const g = G();
    // (the level is created lazily: clear the shared play-test roster so the start is empty)
    localStorage.removeItem(TEST_ROSTER_KEY);
    check(g.game.creatures === null, 'a peaceful level with a starter NPC plays no creatures at build');
    check(g.creatures === undefined, 'and exposes no creature hook yet');
    check(!!g.game.story, 'the starter NPC gives the level a story');
    check(!('creatures' in g.state()), 'state() has no creatures key yet');
    // talk to the professor: the talk script gives the starter and sets the flag
    const started = g.talkTo(STARTER.professor.id);
    check(started, 'the talk starts');
    const got = await until(() => g.game.creatures && g.game.creatures.roster.active.length === 1 && g.game.story.state.get('starter_chosen') === 1, 8000);
    check(got, 'the story command made the system and gave the starter', {
      creatures: !!g.game.creatures, flag: g.game.story?.state.get('starter_chosen'),
    });
    const c = g.game.creatures?.roster.active[0];
    check(c?.species === STARTER.professor.species, `the starter is a ${STARTER.professor.species}`, c?.species);
    check(c?.level === STARTER.professor.level, `at level ${STARTER.professor.level}`, c?.level);
    check(g.game.story.test('creature:leafling'), 'the creature:leafling condition holds');
    check(g.game.story.test('creature'), 'creature counts the roster');
    check(g.game.story.test('creature = 1'), '… and its count');
    check(g.creatures !== undefined, 'the __game.creatures hook is exposed once the system exists');
    check('creatures' in g.state(), 'state() reports the roster too');
    // talking again does not give a second starter (the flag)
    await waitMs(300);
    const again = g.talkTo(STARTER.professor.id);
    check(again, 'the professor talks again');
    await waitMs(700);
    check(g.game.creatures.roster.active.length === 1, 'the flag keeps the starter from being given twice',
      g.game.creatures.roster.active.length);
    return {
      species: c?.species ?? null, level: c?.level ?? null,
      flag: g.game.story.state.get('starter_chosen'), failures,
    };
  },
};