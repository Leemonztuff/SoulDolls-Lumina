/** @import * as THREE from 'three' */

/**
 * SpriteManager — a tiny registry that updates every registered sprite once per frame.
 * Engine-system compatible: `engine.addSystem(spriteManager, order)` works because
 * `update(dt)` ignores the extra `(t, engine)` arguments. Register it AFTER the camera rig has
 * written `globalUniforms.uCameraYaw` for the frame (e.g. as a late system) so billboards match
 * the camera exactly.
 */
export class SpriteManager {
  /** @param {THREE.Camera} camera camera passed to every `sprite.update(dt, camera)` */
  constructor(camera) {
    this.name = 'SpriteManager';
    /** Camera handed to sprites (may be swapped at runtime). */
    this.camera = camera;
    this._sprites = [];
  }

  /**
   * Register a sprite (anything with `update(dt, camera)`). Duplicate adds are ignored.
   * @template T
   * @param {T} sprite
   * @returns {T}
   */
  add(sprite) {
    if (sprite && !this._sprites.includes(sprite)) this._sprites.push(sprite);
    return sprite;
  }

  /**
   * Unregister a sprite (does not dispose it).
   * @param {object} sprite
   * @returns {boolean} true when it was registered
   */
  remove(sprite) {
    const i = this._sprites.indexOf(sprite);
    if (i < 0) return false;
    this._sprites.splice(i, 1);
    return true;
  }

  /** Registered sprites (live array — do not mutate). */
  get sprites() {
    return this._sprites;
  }

  /**
   * Update every registered sprite.
   * @param {number} dt seconds
   */
  update(dt) {
    const list = this._sprites;
    const cam = this.camera;
    for (let i = 0; i < list.length; i++) list[i].update(dt, cam);
  }

  /**
   * Clear the registry.
   * @param {{ disposeSprites?: boolean }} [opts] also dispose the sprites (default false)
   */
  dispose({ disposeSprites = false } = {}) {
    if (disposeSprites) for (const s of this._sprites.slice()) s.dispose?.();
    this._sprites.length = 0;
  }
}
