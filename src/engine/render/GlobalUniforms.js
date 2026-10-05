import * as THREE from 'three';

/** @import { GlobalUniforms } from './types.js' */

/**
 * Uniforms shared by every custom shader in the engine. Materials should reference
 * these objects directly (e.g. `uniforms.uTime = globalUniforms.uTime`) so a single
 * write per frame updates all of them.
 *
 * Writers:
 *  - Engine:          uTime (seconds since start, affected by timeScale)
 *  - CameraRig:       uCameraYaw (radians, billboard orientation), uCameraPosition
 *  - LightingSystem:  uNight (0 = day, 1 = full night), uSunDirection (normalised, points FROM
 *                     the scene TOWARD the sun), uSunColor (linear, intensity-scaled 0..~1.5), uFogColor
 *  - (anyone):        uWind (xz direction * speed), uWindStrength
 * @type {GlobalUniforms}
 */
export const globalUniforms = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uWind: { value: new THREE.Vector2(1.0, 0.35) },
  uWindStrength: { value: 1.0 },
  uCameraYaw: { value: 0 },
  uCameraPosition: { value: new THREE.Vector3() },
  uSunDirection: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.9, 0.75) },
  uFogColor: { value: new THREE.Color(0.6, 0.65, 0.75) },
};
