/**
 * Combat bindings and legends (COMBAT.md §5.1–§5.2). Registered at runtime on combat levels only
 * (`input.addBindings(COMBAT_BINDINGS, COMBAT_PAD_BINDINGS)`), so peaceful levels keep today's
 * bindings exactly: keyboard keys are only added (J K L U I O C 1–4 and the mouse buttons were
 * unbound); on the pad X / Y become attack / draught (zoom moves to the right stick), RS becomes
 * lock-on and photo mode moves to an LS click (`photoPad`, ignored while the stick is deflected).
 */

/** Keyboard + mouse (the `Mouse*` codes need `input.enableMouseButtons(canvas)`). */
export const COMBAT_BINDINGS = Object.freeze({
  attack: ['KeyJ', 'Mouse0'], dodge: ['KeyK', 'Mouse2'],
  skill1: ['KeyU', 'Digit1'], skill2: ['KeyI', 'Digit2'], skill3: ['KeyO', 'Digit3'],
  draught: ['KeyC', 'Digit4'], lock: ['KeyL', 'Mouse1'],
});

/** Gamepad. While `skillMod` (LT) is held, X / Y / B give skill1 / skill2 / skill3 instead. */
export const COMBAT_PAD_BINDINGS = Object.freeze({
  attack: ['GamepadX'], dodge: ['GamepadB'], draught: ['GamepadY'], lock: ['GamepadRS'],
  skillMod: ['GamepadLT'], zoomIn: [], zoomOut: [], photo: [], photoPad: ['GamepadLS'],
});

/** Pad face button → skill while `skillMod` is held (§5.1). */
export const PAD_SKILL_CODES = Object.freeze({ GamepadX: 'skill1', GamepadY: 'skill2', GamepadB: 'skill3' });

/** The player's combat actions (the input buffer's keys), in priority order (§5.1). */
export const COMBAT_ACTIONS = Object.freeze(['dodge', 'skill1', 'skill2', 'skill3', 'attack', 'draught', 'lock']);

/** HUD legend on combat levels (keyboard / mouse), 12 rows. */
export const COMBAT_CONTROLS = Object.freeze([
  { keys: 'WASD', label: 'Move' },
  { keys: 'Shift', label: 'Run' },
  { keys: 'J/Mouse0', label: 'Attack (combo)' },
  { keys: 'K/Mouse2', label: 'Dodge roll' },
  { keys: 'U/I/O', label: 'Skills (or 1-3)' },
  { keys: 'C', label: 'Healing Draught' },
  { keys: 'L/Mouse1', label: 'Lock on / next' },
  { keys: 'Space', label: 'Talk / Rest / Open' },
  { keys: 'Q/E', label: 'Rotate camera' },
  { keys: 'Z/X', label: 'Zoom (or wheel)' },
  { keys: 'N/Tab', label: 'World map' },
  { keys: 'T/R/P/M', label: 'Time / Weather / Photo / Music' },
]);

/** HUD legend while `input.lastDevice === 'gamepad'`, 12 rows. */
export const COMBAT_PAD_CONTROLS = Object.freeze([
  { keys: 'LS', label: 'Move' },
  { keys: 'RT', label: 'Run' },
  { keys: 'X', label: 'Attack (combo)' },
  { keys: 'B', label: 'Dodge roll' },
  { keys: 'LT+X/Y/B', label: 'Skills' },
  { keys: 'Y', label: 'Healing Draught' },
  { keys: 'RS', label: 'Lock on / next' },
  { keys: 'A', label: 'Talk / Rest / Open' },
  { keys: 'LB/RB', label: 'Rotate camera' },
  { keys: 'R-Stick', label: 'Zoom' },
  { keys: 'Back', label: 'World map' },
  { keys: 'LS-Click', label: 'Photo' },
]);

/** Shown once, on the first gamepad input of the session on a combat level. */
export const PAD_HINT = 'Pad: X attack · B roll · LT+X/Y/B skills · Y draught · RS lock · right stick zoom · LS click photo';

/** Photo on the pad (§5.1): ignored while the move vector is longer than this, and for PHOTO_PAD_QUIET s after. */
export const PHOTO_PAD_DEFLECT = 0.35;
export const PHOTO_PAD_QUIET = 0.3;

/** Right-stick zoom speed on combat levels (u/s at full deflection, `rig.stickZoom`). */
export const STICK_ZOOM = 14;
