#!/usr/bin/env node
/**
 * Builds the campaign **Souldolls** — `public/campaigns/souldolls/`:
 * `campaign.json`, its 8 level files and its story files `story/main.json` and `story/dialogue.story`.
 *
 *   hushmoor-hollow     (40 × 32, start) The Dollwright's hollow. Starters, Elder Corvin, wild Peatling.
 *   lantern-road        (56 × 20) The lantern-lit road east. Bram at the campfire, waystone.
 *   gloamford           (48 × 40) The town of Gloamford. Scholar Orla, entrance to the Bellbindery.
 *   bellbindery         (20 × 14) Interior room. Binder Maren and the silent bell notes.
 *   whisperfen          (48 × 32) A rainy fenland. Rowan, entrance to Hollow Tide Cavern.
 *   hollow-tide-cavern  (40 × 28) Cavern with waystone, treasure chest, enemy group, and wild creatures.
 *   saltreach-quay      (48 × 36) The coastal quay. Dockmaster Gull and wild Tidewisp.
 *   tidewatch-light     (32 × 24) The lighthouse beacon. Keeper Vane and the ending bell.
 *
 *   node tools/make-souldolls.mjs [--out=<folder>] [--check] [--force] [--quiet]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createEmptyLevel, setTile, setHeightLevel, addObject, normalizeLevel, parseLevel, validateLevel, serializeLevel,
} from '../src/engine/level/LevelFormat.js';
import { OBJECT_TYPES, EVENT_TRIGGERS, isCampaignType, isStoryType } from '../src/engine/level/ObjectCatalog.js';
import { CAMPAIGN_FORMAT, normalizeCampaign, serializeCampaign, levelFile } from '../src/game/campaign/CampaignFormat.js';
import { buildStory, serializeStory, serializeStoryText, storyFile } from '../src/game/campaign/StoryFormat.js';
import { parseScript } from '../src/engine/level/StoryScript.js';
import { carryCampaignText, carryStoryFile, retagStoryText, seededMint, fileKeyIssues } from '../src/engine/i18n/TextKeys.js';
import { parseArgs, canonicalObject, keyLevel, keyIssueLines, splitSharedKeys, previousOutput, copyKeys } from './lib/levelgen.mjs';
import { checkCampaign } from './lib/campaigncheck.mjs';

/** @import { Level, LevelObject } from '../src/engine/level/types.js' */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
if (args.out === true || args.out === '') {
  console.error('--out needs a folder, e.g. --out=.check/souldolls');
  process.exit(2);
}
const NAME = 'souldolls';
const OUT = path.resolve(root, String(args.out ?? `public/campaigns/${NAME}`));
const log = (...a) => { if (!args.quiet) console.log(...a); };

function fill(L, i0, j0, i1, j1, ch, lvl) {
  for (let j = Math.max(0, j0); j < Math.min(L.depth, j1); j++) {
    for (let i = Math.max(0, i0); i < Math.min(L.width, i1); i++) {
      if (ch != null) setTile(L, i, j, ch);
      if (lvl != null) setHeightLevel(L, i, j, lvl);
    }
  }
}

function put(L, id, type, x, z, fields = {}) {
  const o = addObject(L, /** @type {any} */ (type), x, z, fields);
  if (id) o.id = id;
  return o;
}

function tree(L, kind, x, z, height = 4.4, extra = {}) {
  return addObject(L, 'tree', x, z, { opts: { kind, height, seed: Math.round(x * 10 + z * 3) }, ...extra });
}

function event(L, id, [x0, z0, x1, z1], fields) {
  return put(L, id, 'event', 0, 0, { minX: x0, maxX: x1, minZ: z0, maxZ: z1, ...fields });
}

// ---------------------------------------------------------------------------------------------
// Level 1: hushmoor-hollow (40 x 32)
// ---------------------------------------------------------------------------------------------
function buildHushmoorHollow() {
  const L = createEmptyLevel({ width: 40, depth: 32, fill: 'g', border: 0 });
  L.environment.creatures = true;
  L.spawn = { x: 6, z: 16, facing: 'down' };

  put(L, 'reg_hollow', 'region', 0, 0, { minX: 0, maxX: 40, minZ: 0, maxZ: 32, name: 'Hushmoor Hollow' });

  fill(L, 0, 0, 40, 32, 'g', 0);
  fill(L, 0, 14, 40, 18, '.', 0);
  fill(L, 8, 10, 14, 18, '.', 0);

  // Dollwright cottage
  put(L, 'dollhouse', 'house', 10, 7, {
    name: "Dollwright's Workshop",
    opts: { width: 6, depth: 4, wall: 'timber_frame', roof: 'roof_thatch', chimney: true },
    text: ['The workshop smells of carved wood and dried lavender.'],
  });

  // Entrance & Marker
  put(L, 'en_start', 'entrance', 6, 16, { name: 'hollow-start', facing: 'right' });
  put(L, 'mk_hollow_center', 'marker', 20, 16, { name: 'hollow-center', facing: 'down' });

  // Actors on walkable path
  put(L, 'npc_dollwright', 'npc', 10, 12, {
    name: 'Elspeth', title: 'The Dollwright', actor: 'dollwright', facing: 'down',
    dialogue: ['Welcome to Hushmoor Hollow. Please take one of my souldolls on your journey.'],
  });
  put(L, 'npc_corvin', 'npc', 22, 16, {
    name: 'Corvin', title: 'Hollow Watcher', actor: 'corvin', facing: 'left', flag: 'talked-corvin',
    dialogue: ['The Hush creeps closer every night. Mind the quiet.'],
  });

  // Story objects with when / unless
  put(L, 'lamp_hollow_new', 'lamppost', 14, 13, { when: 'starter-chosen' });
  put(L, 'lamp_hollow_old', 'lamppost', 14, 13, { unless: 'starter-chosen' });

  // Wild creature and zone
  put(L, 'cr_peatling', 'creature', 28, 16, { species: 'peatling', level: 3, radius: 3 });
  put(L, 'cz_heath1', 'creature_zone', 0, 0, { minX: 20, maxX: 36, minZ: 4, maxZ: 28, table: 'heath', steps: 85 });

  // Story events & triggers
  event(L, 'ev_start', [4, 14, 8, 18], {
    on: 'arrive', once: true,
    run: [
      'toast "Welcome to Hushmoor Hollow."',
      'quest souldolls-hush start',
    ],
  });
  event(L, 'ev_corvin_warn', [20, 14, 24, 18], {
    on: 'enter', once: true,
    run: [
      'bark corvin "Watch your step on Lantern Road, traveller!"',
    ],
  });
  event(L, 'ev_leave_hollow', [34, 14, 38, 18], {
    on: 'leave',
    run: [
      'toast "Leaving Hushmoor Hollow."',
    ],
  });
  event(L, 'ev_hollow_clock', [0, 0, 40, 32], {
    on: 'time', at: 18,
    run: [
      'toast "Evening falls over the hollow."',
    ],
  });
  event(L, 'ev_statue', [18, 22, 20, 24], {
    on: 'use', label: 'Inspect Stone',
    run: [
      'bark player "An ancient boundary stone. It feels cold."',
    ],
  });
  event(L, 'ev_starter_change', [10, 14, 14, 18], {
    on: 'change', if: 'starter-chosen',
    run: [
      'toast "A souldoll has joined your party!"',
    ],
  });

  // Seam exit to Lantern Road
  put(L, 'ex_hushmoor_to_road', 'exit', 0, 0, {
    minX: 37.5, maxX: 39.9, minZ: 14, maxZ: 18,
    to: 'lantern-road', entrance: 'from-hushmoor', mode: 'walk', label: 'Travel East',
  });

  // Props & trees
  tree(L, 'oak', 16, 6);
  tree(L, 'pine', 32, 22);
  put(L, 'well_hollow', 'well', 24, 20);

  return L;
}

// ---------------------------------------------------------------------------------------------
// Level 2: lantern-road (56 x 20)
// ---------------------------------------------------------------------------------------------
function buildLanternRoad() {
  const L = createEmptyLevel({ width: 56, depth: 20, fill: 'g', border: 0 });
  L.environment.creatures = true;
  L.spawn = { x: 2, z: 10, facing: 'down' };

  put(L, 'reg_road', 'region', 0, 0, { minX: 0, maxX: 56, minZ: 0, maxZ: 20, name: 'Lantern Road' });

  fill(L, 0, 0, 56, 20, 'g', 0);
  fill(L, 0, 8, 56, 12, '.', 0);

  // Entrances & Exits
  put(L, 'en_from_hushmoor', 'entrance', 2, 10, { name: 'from-hushmoor', facing: 'right' });
  put(L, 'en_from_gloamford', 'entrance', 53, 10, { name: 'from-gloamford', facing: 'left' });

  put(L, 'ex_road_to_hushmoor', 'exit', 0, 0, {
    minX: 0, maxX: 2.5, minZ: 8, maxZ: 12,
    to: 'hushmoor-hollow', entrance: 'hollow-start', mode: 'walk', label: 'To Hollow',
  });
  put(L, 'ex_road_to_gloamford', 'exit', 0, 0, {
    minX: 53.5, maxX: 55.9, minZ: 8, maxZ: 12,
    to: 'gloamford', entrance: 'from-road', mode: 'walk', label: 'To Gloamford',
  });

  // Campfire & Bram on path
  put(L, 'fire_road', 'campfire', 24, 8);
  put(L, 'npc_bram', 'npc', 26, 9, {
    name: 'Bram', title: 'Wayfarer', actor: 'bram', facing: 'left',
    dialogue: ['The road to Gloamford is quiet today. Too quiet.'],
  });

  // Waystone & Creature zone
  put(L, 'ws_lantern', 'waystone', 28, 10, { name: 'Lantern Waystone' });
  put(L, 'cz_heath2', 'creature_zone', 0, 0, { minX: 10, maxX: 46, minZ: 2, maxZ: 18, table: 'heath', steps: 85 });

  // Story event on road
  event(L, 'ev_road_arrive', [2, 8, 6, 12], {
    on: 'arrive', once: true,
    run: [
      'quest souldolls-hush stage road',
    ],
  });

  // Decorative lanterns
  put(L, 'lamp_r1', 'lamppost', 12, 7);
  put(L, 'lamp_r2', 'lamppost', 38, 7);

  return L;
}

// ---------------------------------------------------------------------------------------------
// Level 3: gloamford (48 x 40)
// ---------------------------------------------------------------------------------------------
function buildGloamford() {
  const L = createEmptyLevel({ width: 48, depth: 40, fill: 'g', border: 0 });
  L.environment.creatures = true;
  L.spawn = { x: 2, z: 10, facing: 'down' };

  put(L, 'reg_gloamford', 'region', 0, 0, { minX: 0, maxX: 48, minZ: 0, maxZ: 40, name: 'Gloamford' });

  fill(L, 0, 0, 48, 40, 'g', 0);
  fill(L, 0, 8, 48, 12, '.', 0);
  fill(L, 20, 0, 24, 40, '.', 0);
  fill(L, 30, 12, 34, 16, '.', 0);

  // Entrances
  put(L, 'en_from_road', 'entrance', 2, 10, { name: 'from-road', facing: 'right' });
  put(L, 'en_from_bindery', 'entrance', 32, 15, { name: 'from-bindery', facing: 'down' });
  put(L, 'en_from_fen', 'entrance', 22, 36, { name: 'from-fen', facing: 'up' });

  // Bellbindery Building
  put(L, 'house_bindery', 'house', 32, 6, {
    name: 'The Bellbindery',
    opts: { width: 6, depth: 4, wall: 'stone_brick', roof: 'roof_slate', chimney: true },
    text: ['The ancient stone bindery where silent bells are crafted.'],
  });

  // Scholar Orla
  put(L, 'npc_orla', 'npc', 16, 10, {
    name: 'Orla', title: 'Scholar of Gloamford', actor: 'orla', facing: 'down',
    dialogue: ['The Bellbindery holds secrets of the old dolls.'],
  });

  // Exits
  put(L, 'ex_gloamford_to_road', 'exit', 0, 0, {
    minX: 0, maxX: 2.5, minZ: 8, maxZ: 12,
    to: 'lantern-road', entrance: 'from-gloamford', mode: 'walk', label: 'To Lantern Road',
  });
  put(L, 'ex_gloamford_to_bindery', 'exit', 0, 0, {
    minX: 30, maxX: 34, minZ: 14, maxZ: 16,
    to: 'bellbindery', entrance: 'from-gloamford', mode: 'use', label: 'Enter Bindery',
    requires: 'item:bell-clapper',
    locked: ['The bindery door is locked. A clapper motif is etched on the lock.'],
  });
  put(L, 'ex_gloamford_to_fen', 'exit', 0, 0, {
    minX: 20, maxX: 24, minZ: 37.5, maxZ: 39.9,
    to: 'whisperfen', entrance: 'from-gloamford-north', mode: 'walk', label: 'To Whisperfen',
  });

  // Creature zone
  put(L, 'cz_fen1', 'creature_zone', 0, 0, { minX: 4, maxX: 44, minZ: 16, maxZ: 34, table: 'fen', steps: 95 });

  // Background event
  event(L, 'ev_gloamford_bg', [14, 8, 18, 12], {
    on: 'enter', background: true,
    run: [
      'bark orla "Welcome to Gloamford!"',
    ],
  });

  return L;
}

// ---------------------------------------------------------------------------------------------
// Level 4: bellbindery (20 x 14) - Interior
// ---------------------------------------------------------------------------------------------
function buildBellbindery() {
  const L = createEmptyLevel({ width: 20, depth: 14, fill: 'k', border: 0 });
  L.environment.interior = true;
  L.environment.clock = false;
  L.spawn = { x: 10, z: 11, facing: 'down' };

  put(L, 'reg_bindery', 'region', 0, 0, { minX: 0, maxX: 20, minZ: 0, maxZ: 14, name: 'The Bellbindery' });

  fill(L, 0, 0, 20, 14, 'k', 0);

  put(L, 'en_from_gloamford', 'entrance', 10, 11, { name: 'from-gloamford', facing: 'up' });

  put(L, 'ex_bindery_to_gloamford', 'exit', 0, 0, {
    minX: 8, maxX: 12, minZ: 11, maxZ: 13.9,
    to: 'gloamford', entrance: 'from-bindery', mode: 'use', label: 'Leave Bindery',
  });

  // Maren
  put(L, 'npc_maren', 'npc', 10, 5, {
    name: 'Maren', title: 'Binder Maren', actor: 'maren', facing: 'down',
    dialogue: ['Silence is the canvas upon which souldolls learn their names.'],
  });

  // Interior furnishings
  put(L, 'tbl_bindery', 'table', 10, 7, { opts: { shape: 'rect', width: 2, depth: 1 } });
  put(L, 'shelf_b1', 'shelf', 4, 2, { opts: { kind: 'books', width: 2 } });
  put(L, 'hearth_b1', 'hearth', 16, 2, { opts: { lit: true } });

  // Space use event inside room
  event(L, 'ev_bindery_notes', [9, 6, 11, 8], {
    on: 'use', label: 'Examine Notes',
    run: [
      'bark player "Notes on the Hush: when the beacon at Tidewatch fails, memories drift like mist."',
      'quest souldolls-hush stage bindery',
    ],
  });

  return L;
}

// ---------------------------------------------------------------------------------------------
// Level 5: whisperfen (48 x 32) - Rain
// ---------------------------------------------------------------------------------------------
function buildWhisperfen() {
  const L = createEmptyLevel({ width: 48, depth: 32, fill: 'g', border: 0 });
  L.environment.weather = 'rain';
  L.environment.creatures = true;
  L.spawn = { x: 24, z: 2, facing: 'down' };

  put(L, 'reg_fen', 'region', 0, 0, { minX: 0, maxX: 48, minZ: 0, maxZ: 32, name: 'Whisperfen' });

  fill(L, 0, 0, 48, 32, 'g', 0);
  fill(L, 20, 0, 28, 32, '.', 0);
  fill(L, 8, 12, 22, 16, '.', 0);

  put(L, 'en_from_gloamford_north', 'entrance', 24, 2, { name: 'from-gloamford-north', facing: 'down' });
  put(L, 'en_from_cavern', 'entrance', 10, 14, { name: 'from-cavern', facing: 'right' });
  put(L, 'en_from_quay', 'entrance', 24, 29, { name: 'from-quay', facing: 'up' });

  put(L, 'ex_fen_to_gloamford', 'exit', 0, 0, {
    minX: 20, maxX: 28, minZ: 0, maxZ: 2.5,
    to: 'gloamford', entrance: 'from-fen', mode: 'walk', label: 'To Gloamford',
  });
  put(L, 'ex_fen_to_cavern', 'exit', 0, 0, {
    minX: 8, maxX: 12, minZ: 13, maxZ: 15,
    to: 'hollow-tide-cavern', entrance: 'from-fen', mode: 'use', label: 'Enter Cavern',
  });
  put(L, 'ex_fen_to_quay', 'exit', 0, 0, {
    minX: 20, maxX: 28, minZ: 29.5, maxZ: 31.9,
    to: 'saltreach-quay', entrance: 'from-fen', mode: 'walk', label: 'To Saltreach Quay',
  });

  // Rowan
  put(L, 'npc_rowan', 'npc', 26, 16, {
    name: 'Rowan', title: 'Fen Guide', actor: 'rowan', facing: 'left',
    dialogue: ['Keep to the boardwalks. The fen waters take your footing fast.'],
  });

  // Creature zone
  put(L, 'cz_fen2', 'creature_zone', 0, 0, { minX: 18, maxX: 30, minZ: 6, maxZ: 26, table: 'fen', steps: 95 });

  event(L, 'ev_fen_arrive', [22, 2, 26, 6], {
    on: 'arrive', once: true,
    run: [
      'quest souldolls-hush stage fen',
      'toast "Rain falls over Whisperfen."',
    ],
  });

  return L;
}

// ---------------------------------------------------------------------------------------------
// Level 6: hollow-tide-cavern (40 x 28) - Cavern
// ---------------------------------------------------------------------------------------------
function buildHollowTideCavern() {
  const L = createEmptyLevel({ width: 40, depth: 28, fill: 'd', border: 0 });
  L.environment.creatures = true;
  L.spawn = { x: 10, z: 20, facing: 'down' };

  put(L, 'reg_cavern', 'region', 0, 0, { minX: 0, maxX: 40, minZ: 0, maxZ: 28, name: 'Hollow Tide Cavern' });

  fill(L, 0, 0, 40, 28, 'd', 0);

  put(L, 'en_from_fen', 'entrance', 10, 20, { name: 'from-fen', facing: 'right' });

  put(L, 'ex_cavern_to_fen', 'exit', 0, 0, {
    minX: 8, maxX: 12, minZ: 22, maxZ: 25,
    to: 'whisperfen', entrance: 'from-cavern', mode: 'use', label: 'Exit Cavern',
  });

  put(L, 'ws_cavern', 'waystone', 12, 16, { name: 'Cavern Waystone' });
  put(L, 'ch_cavern', 'chest', 32, 8, { gold: 50, potions: 2, upgrade: 'maxHp' });

  // Enemy group & cleared event
  put(L, 'grp_bat', 'enemy', 18, 12, { kind: 'bat', count: 3, id: 'grp_bat' });
  event(L, 'ev_cleared_bats', [14, 8, 22, 16], {
    on: 'cleared', group: 'grp_bat',
    run: [
      'toast "The bats scattered! The passage is open."',
    ],
  });

  put(L, 'cz_cavern1', 'creature_zone', 0, 0, { minX: 6, maxX: 20, minZ: 4, maxZ: 22, table: 'cavern', steps: 110 });
  put(L, 'cz_cavern2', 'creature_zone', 0, 0, { minX: 22, maxX: 38, minZ: 4, maxZ: 22, table: 'cavern', steps: 110 });

  event(L, 'ev_cavern_enter', [8, 18, 12, 22], {
    on: 'enter', once: true,
    run: [
      'quest souldolls-hush stage cavern',
      'toast "ECHOES IN THE CAVERN"',
    ],
  });

  return L;
}

// ---------------------------------------------------------------------------------------------
// Level 7: saltreach-quay (48 x 36)
// ---------------------------------------------------------------------------------------------
function buildSaltreachQuay() {
  const L = createEmptyLevel({ width: 48, depth: 36, fill: 's', border: 0 });
  L.environment.creatures = true;
  L.spawn = { x: 4, z: 18, facing: 'down' };

  put(L, 'reg_quay', 'region', 0, 0, { minX: 0, maxX: 48, minZ: 0, maxZ: 36, name: 'Saltreach Quay' });

  fill(L, 0, 0, 48, 36, 's', 0);
  fill(L, 0, 14, 48, 22, '.', 0);

  put(L, 'en_from_fen', 'entrance', 2, 18, { name: 'from-fen', facing: 'right' });
  put(L, 'en_from_light', 'entrance', 44, 18, { name: 'from-light', facing: 'left' });

  put(L, 'ex_quay_to_fen', 'exit', 0, 0, {
    minX: 0, maxX: 2.5, minZ: 15, maxZ: 21,
    to: 'whisperfen', entrance: 'from-quay', mode: 'walk', label: 'To Whisperfen',
  });
  put(L, 'ex_quay_to_light', 'exit', 0, 0, {
    minX: 45.5, maxX: 47.9, minZ: 15, maxZ: 21,
    to: 'tidewatch-light', entrance: 'from-quay', mode: 'walk', label: 'To Tidewatch Light',
  });

  // Dockmaster Gull
  put(L, 'npc_gull', 'npc', 20, 16, {
    name: 'Gull', title: 'Dockmaster', actor: 'gull', facing: 'down',
    dialogue: ['Tidewatch Light has been dark three nights now.'],
  });

  // Wild Tidewisp
  put(L, 'cr_tidewisp', 'creature', 34, 18, { species: 'tidewisp', level: 5, radius: 3 });
  put(L, 'cz_tide1', 'creature_zone', 0, 0, { minX: 10, maxX: 42, minZ: 4, maxZ: 20, table: 'tide', steps: 90 });

  event(L, 'ev_quay_arrive', [2, 16, 6, 20], {
    on: 'arrive', once: true,
    run: [
      'quest souldolls-hush stage quay',
    ],
  });

  return L;
}

// ---------------------------------------------------------------------------------------------
// Level 8: tidewatch-light (32 x 24)
// ---------------------------------------------------------------------------------------------
function buildTidewatchLight() {
  const L = createEmptyLevel({ width: 32, depth: 24, fill: 's', border: 0 });
  L.environment.creatures = true;
  L.spawn = { x: 2, z: 12, facing: 'down' };

  put(L, 'reg_light', 'region', 0, 0, { minX: 0, maxX: 32, minZ: 0, maxZ: 24, name: 'Tidewatch Light' });

  fill(L, 0, 0, 32, 24, 's', 0);
  fill(L, 0, 10, 32, 14, '.', 0);

  put(L, 'en_from_quay', 'entrance', 2, 12, { name: 'from-quay', facing: 'right' });

  put(L, 'ex_light_to_quay', 'exit', 0, 0, {
    minX: 0, maxX: 2.5, minZ: 10, maxZ: 14,
    to: 'saltreach-quay', entrance: 'from-light', mode: 'walk', label: 'To Quay',
  });

  // Keeper Vane
  put(L, 'npc_vane', 'npc', 22, 12, {
    name: 'Vane', title: 'Lighthouse Keeper', actor: 'vane', facing: 'left',
    dialogue: ['Help me ring the beacon bell! The Hush will be broken!'],
  });

  put(L, 'cz_tide2', 'creature_zone', 0, 0, { minX: 6, maxX: 28, minZ: 4, maxZ: 20, table: 'tide', steps: 90 });

  event(L, 'ev_beacon', [24, 10, 28, 14], {
    on: 'use', label: 'Ring Beacon Bell',
    run: [
      'toast "THE BEACON IS LIT!"',
      'quest souldolls-hush stage light',
      'toast "The Hush dissipates across the coast."',
    ],
  });

  return L;
}

// ---------------------------------------------------------------------------------------------
// Story Definition
// ---------------------------------------------------------------------------------------------
const STORY_MAIN = {
  items: {
    'orb': { name: 'Souldoll Orb', text: 'A glass orb used to capture wild souldolls.' },
    'salt-toffee': { name: 'Salt Toffee', text: 'A sweet coastal treat made in Saltreach Quay.' },
    'bell-clapper': { name: 'Silenced Clapper', text: 'The missing clapper of the Bellbindery.', key: true },
  },
  quests: {
    'souldolls-hush': {
      title: 'The Hush of Souldolls',
      stages: [
        { id: 'start', text: 'Speak with Elspeth the Dollwright in Hushmoor Hollow.' },
        { id: 'road', text: 'Travel east along Lantern Road.' },
        { id: 'bindery', text: 'Visit the Bellbindery in Gloamford.' },
        { id: 'fen', text: 'Cross the rainy Whisperfen.' },
        { id: 'cavern', text: 'Explore Hollow Tide Cavern.' },
        { id: 'quay', text: 'Reach Saltreach Quay.' },
        { id: 'light', text: 'Light the Tidewatch Beacon.' },
      ],
    },
  },
  actors: {
    'dollwright': { name: 'Elspeth', title: 'The Dollwright', talk: 'dollwright' },
    'corvin': { name: 'Corvin', title: 'Hollow Watcher', talk: 'corvin' },
    'maren': { name: 'Maren', title: 'Binder Maren', talk: 'maren' },
    'bram': { name: 'Bram', title: 'Wayfarer', talk: 'bram' },
    'orla': { name: 'Orla', title: 'Scholar of Gloamford', talk: 'orla' },
    'rowan': { name: 'Rowan', title: 'Fen Guide', talk: 'rowan' },
    'gull': { name: 'Gull', title: 'Dockmaster', talk: 'gull' },
    'vane': { name: 'Vane', title: 'Lighthouse Keeper', talk: 'vane' },
  },
  campaignEvents: [
    { id: 'start_event', if: 'quest:souldolls-hush', toast: 'A journey through the Hush begins.' },
  ],
  startPresets: {
    'default': {
      level: 'hushmoor-hollow',
      entrance: 'hollow-start',
      inventory: [{ id: 'orb', count: 5 }],
    },
  },
};

const STORY_TEXT = {
  dollwright: [
    'if starter-chosen',
    '  - Take good care of your souldoll!',
    '  stop',
    '- Greetings, traveller. The Hush is swallowing names across the moor.',
    '- Choose a companion to journey with you.',
    'choice Which souldoll will you take?',
    '  > Peatling (Grass)',
    '    creature give peatling level 5',
    '    creature give orb 5',
    '    set starter-chosen',
    '    - Take good care of Peatling!',
    '  > Gloamwing (Fire)',
    '    creature give gloamwing level 5',
    '    creature give orb 5',
    '    set starter-chosen',
    '    - Gloamwing\'s flame will warm your way!',
    '  > Tidewisp (Water)',
    '    creature give tidewisp level 5',
    '    creature give orb 5',
    '    set starter-chosen',
    '    - Tidewisp will guide you through the tides!',
    '- Take these orbs to catch wild critters along the road.',
    'give bell-clapper 1',
  ],
  corvin: [
    'if talked-corvin',
    '  - Mind the quiet on the road.',
    '  stop',
    '- Keep your souldolls close. The Hush turns wild critters restless.',
  ],
  bram: [
    '- Rest by the fire, friend. Gloamford lies further east.',
  ],
  orla: [
    '- The Bellbindery holds the ancient logs of all named dolls.',
  ],
  maren: [
    '- Thank you for returning the Silenced Clapper. The bindery door is open.',
  ],
  rowan: [
    '- The rain in Whisperfen never truly stops, but the path is clear.',
  ],
  gull: [
    '- Hollow Tide Cavern connects the fen to our quay. Watch your step.',
    'give salt-toffee 1',
  ],
  vane: [
    '- Ring the bell, traveller! Let the light shine once more!',
  ],
};

// ---------------------------------------------------------------------------------------------
// Campaign Raw Structure
// ---------------------------------------------------------------------------------------------
const campaignRaw = {
  format: CAMPAIGN_FORMAT,
  version: 1,
  name: 'Souldolls',
  title: {
    title: 'SOULDOLLS',
    subtitle: 'A tale of quiet bells, forgotten names, and the dolls that remember.',
    credit: 'Luminati 2.5D Pixel-Art Engine',
  },
  start: { level: 'hushmoor-hollow', entrance: 'hollow-start' },
  levels: [
    { id: 'hushmoor-hollow', at: [0, 0] },
    { id: 'lantern-road', at: [40, 6] },
    { id: 'gloamford', at: [96, 0] },
    { id: 'bellbindery' },
    { id: 'whisperfen', at: [96, 40] },
    { id: 'hollow-tide-cavern' },
    { id: 'saltreach-quay', at: [96, 72] },
    { id: 'tidewatch-light', at: [144, 78] },
  ],
  chapters: [
    {
      id: 'ch1',
      title: 'Chapter One',
      subtitle: 'The Whispering Hollow',
      levels: {},
    },
    {
      id: 'ch2',
      title: 'Chapter Two',
      subtitle: 'The Rain and the Tide',
      levels: {},
    },
    {
      id: 'ch3',
      title: 'Chapter Three',
      subtitle: 'Tidewatch Beacon',
      levels: {},
    },
  ],
  story: ['main.json', 'dialogue.story'],
};

// ---------------------------------------------------------------------------------------------
// Build Pipeline & Checks
// ---------------------------------------------------------------------------------------------
/** @type {[string, Level][]} */
const built = [
  ['hushmoor-hollow', buildHushmoorHollow()],
  ['lantern-road', buildLanternRoad()],
  ['gloamford', buildGloamford()],
  ['bellbindery', buildBellbindery()],
  ['whisperfen', buildWhisperfen()],
  ['hollow-tide-cavern', buildHollowTideCavern()],
  ['saltreach-quay', buildSaltreachQuay()],
  ['tidewatch-light', buildTidewatchLight()],
];

const problems = [];
const texts = new Map();
/** @type {Map<string, Level>} */
const levels = new Map();

const DIR = `public/campaigns/${NAME}`;

// First build story so validateLevel has story context
const storyMain = structuredClone(STORY_MAIN);
carryStoryFile(previousOutput(root, `${DIR}/${storyFile('main.json')}`), storyMain, seededMint(`${DIR}/${storyFile('main.json')}`));
const storyText = retagStoryText(previousOutput(root, `${DIR}/${storyFile('dialogue.story')}`, { text: true }) ?? '', serializeStoryText(STORY_TEXT), seededMint(`${DIR}/${storyFile('dialogue.story')}`));

const campaignKeyed = structuredClone(campaignRaw);
carryCampaignText(previousOutput(root, `${DIR}/campaign.json`), campaignKeyed, seededMint(`${DIR}/campaign.json`));

const { campaign, warnings: cw, errors: ce } = normalizeCampaign(campaignKeyed);
problems.push(...cw.map((m) => `campaign.json: ${m}`), ...ce.map((m) => `campaign.json: ${m}`));
texts.set('campaign.json', serializeCampaign(campaign));
texts.set(storyFile('main.json'), serializeStory(storyMain));
texts.set(storyFile('dialogue.story'), storyText);

const { story, warnings: sw } = buildStory(campaign.story.map((f) => ({ name: f, text: texts.get(storyFile(f)) })));

/** @type {Map<string, { level: Level, warnings: string[], previous: any }>} */
const keyed = new Map();

for (const [id, raw] of built) {
  const { level, warnings } = normalizeLevel(raw);
  level.objects = level.objects.map((o) => /** @type {LevelObject} */ (canonicalObject(o)));
  const { previous } = keyLevel(level, { root, file: `${DIR}/${levelFile(id)}` });
  keyed.set(id, { level, warnings, previous });
}

for (const [id, { level, warnings }] of keyed) {
  const errs = [...validateLevel(level), ...keyIssueLines(level)];
  const text = serializeLevel(level);
  if (serializeLevel(parseLevel(text).level) !== text) errs.push('does not re-serialise byte-identically');
  for (const m of [...warnings, ...errs]) problems.push(`${id}: ${m}`);
  texts.set(levelFile(id), text);
  levels.set(id, parseLevel(text).level);
}

// Coverage checks
const allObjects = [...levels.values()].flatMap((l) => l.objects);
for (const type of Object.keys(OBJECT_TYPES).filter(isCampaignType)) {
  if (!allObjects.some((o) => o.type === type)) problems.push(`coverage: no "${type}" object in campaign`);
}
for (const type of Object.keys(OBJECT_TYPES).filter(isStoryType)) {
  if (!allObjects.some((o) => o.type === type)) problems.push(`coverage: no "${type}" object in campaign`);
}
for (const { value } of EVENT_TRIGGERS) {
  if (!allObjects.some((o) => o.type === 'event' && o.on === value)) problems.push(`coverage: no "${value}" event in campaign`);
}

for (const [file, issues] of /** @type {[string, ReturnType<typeof fileKeyIssues>][]} */ ([
  ['campaign.json', fileKeyIssues('campaign', campaignKeyed)],
  [storyFile('main.json'), fileKeyIssues('story', storyMain)],
  [storyFile('dialogue.story'), fileKeyIssues('storyText', storyText)],
])) for (const i of issues) problems.push(`${file}: text keys: ${i.where}: ${i.msg}`);

for (const [id, sc] of Object.entries(story.scripts)) {
  for (const e of parseScript(sc.lines).errors) problems.push(`${sc.file} › ${id}:${e.line}: ${e.msg}`);
}

const report = checkCampaign(campaign, (id) => (levels.has(id) ? { level: levels.get(id), warnings: [] } : null), {
  strict: false, readStory: (f) => texts.get(storyFile(f)) ?? null,
});
let nErr = problems.length + report.errors.length;
for (const [id, r] of report.levels) {
  nErr += r.report.errors.length;
  for (const m of r.report.errors) problems.push(`${id}: ✗ ${m}`);
  for (const m of r.report.warnings) log(`  ${id}: ! ${m}`);
}
for (const m of report.info) log(`  · ${m}`);
for (const m of report.warnings) log(`  ! ${m}`);
for (const m of [...problems, ...report.errors]) console.error(`  ✗ ${m}`);
log(`check: ${nErr} error(s), ${report.warnings.length + [...report.levels.values()].reduce((n, r) => n + r.report.warnings.length, 0)} warning(s)`);

const rel = path.relative(root, OUT) || '.';
if (args.check) {
  let differ = 0;
  for (const [file, text] of texts) {
    const f = path.join(OUT, file);
    const old = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') : null;
    if (old !== text) {
      differ++;
      console.error(`${path.join(rel, file)} ${old == null ? 'does not exist' : 'differs from generator output'}`);
    }
  }
  if (differ || nErr) process.exit(1);
  console.log(`${rel}: all ${texts.size} files are up to date (byte-identical).`);
  process.exit(0);
}

if (nErr && !args.force) {
  console.error(`not written: ${nErr} error(s) (--force writes anyway)`);
  process.exit(1);
}

for (const [file, text] of texts) {
  const f = path.join(OUT, file);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
}
console.log(`Souldolls → ${rel}: ${texts.size} files generated successfully.`);
