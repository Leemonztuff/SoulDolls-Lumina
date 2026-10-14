/**
 * The creature battle UI class, handed to `UI.useCreatureUI` / `UI.enableCreature` by the creature
 * system — imported here, in the creature chunk, so a game with no creature battle loads neither it
 * nor `creature.css`, the creature icons or the 'creature' strings (plan §5, §15; `CREATURE_PURE`
 * in vite.config.js). Asking for it registers the 'creature' strings (src/game/creatures/strings.js),
 * which the overlay's caller reads: wherever the battle UI is made, it has its words.
 */
import { CreatureBattleHUD } from '../../engine/ui/CreatureBattleHUD.js';
import { CreatureRosterUI } from '../../engine/ui/CreatureRosterUI.js';
import { registerCreatureStrings } from './strings.js';
import '../../engine/ui/creature.css';

/** @returns {import('./types.js').CreatureUIClasses} */
export function creatureUIClasses() {
  registerCreatureStrings();
  return { CreatureBattleHUD, CreatureRosterUI };
}
