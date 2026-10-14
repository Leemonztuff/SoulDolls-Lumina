/**
 * The roster panel's adapter ("Critters Collection" plan §12): the one place that turns the live
 * `CreatureRoster` into the engine's `CreatureRosterUI` rows and back. It reads no input of its own
 * — the panel does, from `UI.update` — and performs the swap / release the panel asks for (the
 * panel has already asked the player to confirm a release). Every change saves the roster and
 * refreshes the panel.
 *
 * Species names go through `ct('species.<id>', …)` (the 'creature' strings, registered by
 * `creatureUIClasses()`), and the row sprite is the species' front pose cropped to its first frame
 * (32 × 32), one fresh canvas per row (a DOM node stands in one place).
 *
 * @import { CreatureRoster } from './CreatureRoster.js'
 * @import { Creature } from './Creature.js'
 * @import { CreatureRosterUILike } from './types.js'
 */

import { createSpeciesSheet } from '../../engine/pixel/CreatureSprites.js';
import { CREATURE_DEFS } from './defs.js';
import { ct } from './strings.js';
import { MAX_ACTIVE, MAX_BOX } from './CreatureRoster.js';

/** The species' English name (the `ct` fallback). @param {string} species */
const speciesName = (species) => CREATURE_DEFS[species]?.name ?? species;

/**
 * Wire a `CreatureRosterUI` panel to a `CreatureRoster`.
 * @param {object} o
 * @param {CreatureRoster} o.roster the live roster
 * @param {CreatureRosterUILike} o.panel the engine panel (created by `UI.enableCreature`)
 * @param {() => void} [o.onChanged] a swap / release happened (the caller may re-read the roster)
 * @param {(name: string) => void} [o.onSound] the panel's UI sounds
 */
export function createRosterController({ roster, panel, onChanged, onSound }) {
  /** @type {Map<string, HTMLCanvasElement>} the species' cropped front sprite, copied per row */
  const cache = new Map();

  /** @param {string} species @returns {HTMLCanvasElement|null} */
  const sprite = (species) => {
    if (!species) return null;
    let master = cache.get(species);
    if (!master) {
      try {
        const sheet = createSpeciesSheet(species, { pose: 'front' });
        const cv = document.createElement('canvas');
        cv.width = sheet.frameWidth;
        cv.height = sheet.frameHeight;
        cv.getContext('2d')?.drawImage(sheet.canvas, 0, 0, sheet.frameWidth, sheet.frameHeight, 0, 0, cv.width, cv.height);
        sheet.dispose();
        master = cv;
        cache.set(species, cv);
      } catch {
        return null;
      }
    }
    const copy = document.createElement('canvas');
    copy.width = master.width;
    copy.height = master.height;
    copy.getContext('2d')?.drawImage(master, 0, 0);
    return copy;
  };

  /** @param {Creature} c */
  const toRow = (c) => ({
    uid: c.uid,
    name: c.nickname || ct('species.' + c.species, speciesName(c.species)),
    species: c.species,
    level: c.level,
    hp: c.hp,
    maxHp: c.maxHp,
    hpRatio: c.hpRatio,
    fainted: c.fainted,
    sprite: sprite(c.species),
  });

  const refresh = () => {
    panel.open({
      active: roster.active.map(toRow),
      box: roster.box.map(toRow),
      maxActive: MAX_ACTIVE,
      maxBox: MAX_BOX,
      canRelease: (uid) => !!roster.find(uid),
      closeKey: 'KeyC',
    });
  };

  panel.onSwap = (uid, slot) => {
    if (!roster.toActive(uid, slot)) return;
    roster.save();
    onChanged?.();
    refresh();
  };
  panel.onRelease = (uid) => {
    if (!roster.release(uid)) return;
    roster.save();
    onChanged?.();
    refresh();
  };
  if (onSound) panel.onSound = onSound;

  return {
    open: refresh,
    close: () => panel.close(),
    panel,
    get isOpen() { return panel.isOpen; },
    dispose() {
      cache.clear();
    },
  };
}
