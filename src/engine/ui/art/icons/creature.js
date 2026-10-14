/**
 * The pixel UI's creature-battle icons (docs/specs/PIXEL_UI.md §2), in the style of mockup G's icon
 * set; palette keys as in icons/core.js (`o` the outline, `d m l h` a main ramp dark → highlight,
 * `a b c` an accent ramp dark → light, `w` a white glint). Listed in CREATURE_PURE (vite.config.js):
 * only the creature chunk imports this file, so a game with no creature battle holds none of it.
 *
 * `orb` is the capture orb the battle bags; `leaf`, `flame` and `drop` are the type emblems, one to
 * each `CreatureType` (creature.type.<id>), and mirror the head emblems the species sprites carry
 * (`src/engine/pixel/CreatureSprites.js`, `emblem`).
 */
import { ICON_RAMPS, CORE_ICONS, iconCanvas } from './core.js';

/** @import { IconDef, IconOptions } from './core.js' */

const { MAIN, ACCENT, pal } = ICON_RAMPS;

/** @type {Record<string, IconDef>} */
export const CREATURE_ICONS = {
  // A capture orb: an accent (red) upper half, a bone lower half, an ink equator and a white button.
  orb: {
    palette: pal(MAIN.BONE, ACCENT.RED),
    rows: [
      '................',
      '.....oooooo.....',
      '...ooccccccoo...',
      '..occcbbbbccco..',
      '.ocbbbaaaabbcco.',
      '.ocbaaaaaaaabco.',
      'ocbaaaaaaaaaabco',
      'ocbaaacccaaabcco',
      'oooooooooooooooo',
      'ohhllllmmlllhho.',
      'ohllllmmmmllho..',
      '.ohllllmmllho...',
      '..ohllllllho....',
      '...oohllhoo.....',
      '.....oooo.......',
      '................',
    ],
  },
  // Grass: a diagonal leaf blade with a light midrib.
  leaf: {
    palette: pal(MAIN.GREEN, ACCENT.GREEN),
    rows: [
      '................',
      '........ooooo...',
      '......oohhhhlo..',
      '.....ohhllllo...',
      '....ohhllllmo...',
      '...ohhllllmo....',
      '..ohhllllmo.....',
      '..ohhhllmo......',
      '.ohhhlllmo......',
      '.ohhlllmo.......',
      '.ohhllmo........',
      '..ohlmo.........',
      '..omdo..........',
      '...o............',
      '................',
      '................',
    ],
  },
  // Fire: a teardrop flame, hot core light, rim dark.
  flame: {
    palette: pal(MAIN.FIRE, ACCENT.FIRE),
    rows: [
      '................',
      '.......o........',
      '......obo.......',
      '......oco.......',
      '.....ocbco......',
      '....ocbccbo.....',
      '...ocbchhcbo....',
      '...ocbchhcbo....',
      '..ocbchhhhcbo...',
      '..ocbchhhhcbo...',
      '..ocbchhhhcbo...',
      '...ocbchhcbo....',
      '...occbbbcco....',
      '....ocbbbco.....',
      '.....ooooo......',
      '................',
    ],
  },
  // Water: a droplet, light from the upper left.
  drop: {
    palette: pal(MAIN.BLUE, ACCENT.BLUE),
    rows: [
      '................',
      '.......o........',
      '......obo.......',
      '......oco.......',
      '.....ocbco......',
      '....ocbcco......',
      '....ocbbco......',
      '...ocbbbbco.....',
      '..ocbbbbbbco....',
      '..ocbbbbbbco....',
      '.ocbbbbbbbbco...',
      '.ocbbbbbbbbco...',
      '..ocbbbbbbco....',
      '...occbbcco.....',
      '.....ooooo......',
      '................',
    ],
  },
};

/** The icon of each `CreatureType` (defs.js CREATURE_TYPE_IDS). */
export const TYPE_ICONS = Object.freeze({ grass: 'leaf', fire: 'flame', water: 'drop' });

/**
 * An icon's canvas: a creature icon or a core one (`icon(name, { palette, scale, mono, outline })`).
 * @param {string} name
 * @param {IconOptions} [o]
 * @returns {HTMLCanvasElement}
 */
export function icon(name, o) {
  const own = (t) => (Object.prototype.hasOwnProperty.call(t, name) ? t[name] : null);
  const def = own(CREATURE_ICONS) ?? own(CORE_ICONS);
  if (!def) throw new Error(`icon: no icon "${name}" (creature: ${Object.keys(CREATURE_ICONS).join(', ')}; core: ${Object.keys(CORE_ICONS).join(', ')})`);
  return iconCanvas(def, o);
}
