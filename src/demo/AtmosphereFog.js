import * as THREE from 'three';

const TAG = '/* emberfall:fog-start */';

/**
 * Aerial perspective for the diorama: shifts where the scene fog *begins* so the band around the
 * player stays crisp and saturated while everything beyond melts into the horizon colour.
 *
 * three's `fog_vertex` chunk writes the eye-space depth used by FogExp2 / Fog; replacing it with
 * `max(0, depth - start)` offsets the fog curve for every material that uses the standard chunks
 * (terrain, props, sprites, foliage, water, waterfalls, god rays, flames, particles — the particle
 * shader includes the same chunk, so leaves and petals near the player are not washed toward the
 * fog colour). Must be called before the first material compiles.
 * @param {number} start distance from the camera (world units) where fog starts
 */
export function installFogStart(start = 16) {
  if (THREE.ShaderChunk.fog_vertex.includes(TAG)) return;
  THREE.ShaderChunk.fog_vertex = `${TAG}
#ifdef USE_FOG
	vFogDepth = max( 0.0, - mvPosition.z - ${start.toFixed(2)} );
#endif
`;
}
