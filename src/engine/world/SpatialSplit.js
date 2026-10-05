import * as THREE from 'three';

/**
 * Spatial batching helpers for big levels: cut a set of items (mesh pieces, instances, chunks)
 * into spatially compact groups that are each worth one draw call — small enough for the camera
 * and the shadow pass to cull what they can't see, big enough that the draw calls stay few.
 */

/**
 * k-d partition of `items` into groups whose total weight stays ≤ `maxWeight` and — for groups
 * heavier than `minWeight` — whose positions span at most `maxExtent` world units: such a group is
 * halved along the longer axis of its items' positions at the weighted median, recursively.
 * Deterministic (ties keep the input order); a single item heavier than `maxWeight` forms its own
 * group. With the defaults (no limits) the result is one group with every item, in order.
 * @template T
 * @param {T[]} items
 * @param {{ x: (item: T) => number, z: (item: T) => number, weight?: (item: T) => number,
 *           maxWeight?: number, maxExtent?: number, minWeight?: number }} opts
 *   minWeight (0): groups this light are never split for their extent (a cheap draw call that
 *   spans the map costs less than several)
 * @returns {T[][]} groups, in a stable spatial order
 */
export function kdSplit(items, { x, z, weight = () => 1, maxWeight = Infinity, maxExtent = Infinity, minWeight = 0 }) {
  if (!items.length) return [];
  const n = items.length;
  const px = new Float64Array(n);
  const pz = new Float64Array(n);
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = x(items[i]);
    pz[i] = z(items[i]);
    w[i] = Math.max(0, weight(items[i]) || 0);
  }
  const out = [];
  const visit = (idx) => {
    let total = 0;
    for (const i of idx) total += w[i];
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const i of idx) {
      if (px[i] < x0) x0 = px[i];
      if (px[i] > x1) x1 = px[i];
      if (pz[i] < z0) z0 = pz[i];
      if (pz[i] > z1) z1 = pz[i];
    }
    const wide = Math.max(x1 - x0, z1 - z0) > maxExtent && total > minWeight;
    if (idx.length < 2 || !(total > maxWeight || wide)) {
      out.push(idx);
      return;
    }
    const p = x1 - x0 >= z1 - z0 ? px : pz;
    const sorted = idx.slice().sort((a, b) => p[a] - p[b] || a - b);
    // weighted median: the first cut where the left half reaches half the weight (never empty)
    let acc = 0;
    let cut = 1;
    for (let k = 0; k < sorted.length - 1; k++) {
      acc += w[sorted[k]];
      cut = k + 1;
      if (acc >= total / 2) break;
    }
    visit(sorted.slice(0, cut));
    visit(sorted.slice(cut));
  };
  visit(Array.from({ length: n }, (_, i) => i));
  return out.map((g) => g.sort((a, b) => a - b).map((i) => items[i]));
}

/** Triangle count of a BufferGeometry (indexed or not). */
export function triangleCount(geometry) {
  if (!geometry) return 0;
  const n = geometry.index ? geometry.index.count : (geometry.attributes.position?.count ?? 0);
  return n / 3;
}

/**
 * Frustum-cull a static mesh by its world-space bounding **box** instead of three.js' bounding
 * sphere. A batch of flat, wide terrain or a row of houses has a sphere far bigger than the
 * geometry — it stays "visible" long after it left the view, above all for the tilted diorama
 * camera and the long shadow frustum. The box is computed once (the mesh must not move; call
 * again after moving it).
 * @param {(THREE.Mesh & { isInstancedMesh?: false })|THREE.InstancedMesh} mesh
 * @param {{ pad?: number,
 *   only?: ((frustum: THREE.Frustum|THREE.FrustumArray) => boolean)|null }} [opts]
 *   pad: world units added on every side (vertex animation: wind sway, billboards);
 *   only: frustums the mesh may be drawn in at all (e.g. shadow frustums), others cull it
 * @returns {THREE.Mesh|THREE.InstancedMesh} the mesh
 */
export function cullByBox(mesh, { pad = 0, only = null } = {}) {
  mesh.updateWorldMatrix(true, false);
  let local;
  if (mesh.isInstancedMesh) {
    if (!mesh.boundingBox) mesh.computeBoundingBox();
    local = mesh.boundingBox;
  } else {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    local = mesh.geometry.boundingBox;
  }
  const box = local.clone().applyMatrix4(mesh.matrixWorld);
  if (pad) box.expandByScalar(pad);
  mesh.userData.cullBox = box;
  mesh.frustumCulled = true;
  mesh.intersectsFrustum = function intersectsFrustumByBox(frustum) {
    if (only && !only(frustum)) return false;
    return frustum.intersectsBox(this.userData.cullBox);
  };
  return mesh;
}
