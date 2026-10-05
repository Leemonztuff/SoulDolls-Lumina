import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { kdSplit, triangleCount, cullByBox } from './SpatialSplit.js';

/**
 * Shadow-caster proxies for big levels. The shadow pass only needs depth, and three.js renders
 * every opaque, non-alpha-tested material with the same depth material (per face side) — so the
 * casting geometry of many materials can be merged into a few position-only meshes per region
 * that draw in the shadow pass only, while the per-material meshes stop casting. Shadows are the
 * same; the shadow pass issues a handful of draw calls instead of one per material and region.
 */

/**
 * Can this mesh's shadow be drawn by a merged proxy? (casts, one material, no custom depth
 * material, no alpha test / displacement / alpha-to-coverage / shadow clipping.)
 * @param {THREE.Mesh & { isInstancedMesh?: boolean }} mesh any mesh (an InstancedMesh answers
 *   false)
 */
export function isProxyCaster(mesh) {
  if (!mesh?.isMesh || !mesh.castShadow || mesh.isInstancedMesh || mesh.customDepthMaterial) return false;
  /**
   * @type {THREE.Material[] | THREE.Material & { isShaderMaterial?: boolean,
   *   map?: THREE.Texture|null, alphaMap?: THREE.Texture|null, displacementMap?: THREE.Texture|null,
   *   displacementScale?: number }}
   */
  const m = mesh.material;
  if (!m || Array.isArray(m) || m.isShaderMaterial) return false;
  if (m.alphaTest > 0 && (m.map || m.alphaMap)) return false;
  if ((m.displacementMap && m.displacementScale !== 0) || m.alphaToCoverage || m.clipShadows) return false;
  return true;
}

/**
 * Let `mesh` render only in the shadow passes of `lights` (its frustum test fails for every
 * other frustum, e.g. the camera's). Works with three.js r16x+ `Object3D.intersectsFrustum`.
 * @param {THREE.Mesh} mesh
 * @param {THREE.Light[]} lights shadow-casting lights
 */
export function makeShadowOnly(mesh, lights) {
  mesh.frustumCulled = true;
  mesh.intersectsFrustum = function intersectsShadowFrustum(frustum) {
    return isShadowFrustum(lights, frustum) && frustum.intersectsObject(this);
  };
  return mesh;
}

/** Is `frustum` the shadow frustum of one of `lights`? */
export function isShadowFrustum(lights, frustum) {
  for (let i = 0; i < lights.length; i++) if (lights[i].shadow?.getFrustum?.() === frustum) return true;
  return false;
}

const _sphere = new THREE.Sphere();

/**
 * Merge world-space casting geometry into shadow-only proxy meshes: grouped by the depth pass's
 * face side (and index layout), cut into spatially compact pieces (≤ maxTriangles, spanning
 * ≤ maxExtent units — SpatialSplit.kdSplit over each piece's centre).
 * @param {{ geometry: THREE.BufferGeometry, side?: number }[]} pieces world-space geometries (only
 *   their positions / index are read; they are not modified or kept)
 * @param {{ lights: THREE.Light[], maxTriangles?: number, maxExtent?: number, name?: string }} opts
 * @returns {{ object: THREE.Group, meshes: THREE.Mesh[], dispose(): void }}
 */
export function buildShadowCasters(pieces, { lights, maxTriangles = 64000, maxExtent = 48, name = 'shadowCasters' }) {
  const group = new THREE.Group();
  group.name = name;
  const meshes = [];
  const materials = new Map();
  const byKey = new Map();
  for (const p of pieces) {
    const g = p.geometry;
    if (!g?.attributes?.position || !triangleCount(g)) continue;
    const side = p.side ?? THREE.FrontSide;
    const key = `${side}|${g.index ? 1 : 0}`;
    let list = byKey.get(key);
    if (!list) byKey.set(key, (list = []));
    if (!g.boundingSphere) g.computeBoundingSphere();
    _sphere.copy(g.boundingSphere);
    list.push({ g, side, x: _sphere.center.x, z: _sphere.center.z, tris: triangleCount(g) });
  }
  for (const list of byKey.values()) {
    const parts = kdSplit(list, { x: (p) => p.x, z: (p) => p.z, weight: (p) => p.tris, maxWeight: maxTriangles, maxExtent });
    for (const part of parts) {
      // position-only copies (the depth pass reads nothing else)
      const geos = part.map(({ g }) => {
        const c = new THREE.BufferGeometry();
        c.setAttribute('position', g.getAttribute('position'));
        if (g.index) c.setIndex(g.index);
        return c;
      });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const side = part[0].side;
      let mat = materials.get(side);
      if (!mat) {
        // never drawn in a colour pass; the shadow pass derives its depth material from `side`
        mat = new THREE.MeshBasicMaterial({ side, colorWrite: false, depthWrite: false });
        mat.name = `${name}:proxy`;
        materials.set(side, mat);
      }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `${name}#${meshes.length}`;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      // shadow pass only, culled by its box (tighter than a sphere for spread-out geometry)
      cullByBox(mesh, { only: (f) => isShadowFrustum(lights, f) });
      group.add(mesh);
      meshes.push(mesh);
    }
  }
  return {
    object: group,
    meshes,
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      for (const m of materials.values()) m.dispose();
      group.removeFromParent();
    },
  };
}
