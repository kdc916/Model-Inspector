/** UV translation is expressed as the apparent motion of the image across mesh UVs.
 * three.js Texture.offset changes sampling coordinates, so its sign is reversed.
 */
export function textureOffsetFromVisual(visualX, visualY) {
  return { x: -finite(visualX), y: -finite(visualY) };
}
export function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
export function wrapPhase(value) {
  const n = finite(value);
  return ((n % 4096) + 4096) % 4096;
}
export function triangleCount(geometry) {
  if (!geometry) return 0;
  const n = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
  return Math.floor(n / 3);
}
export function uvAttributeName(channel) {
  return channel === 0 ? 'uv' : `uv${channel}`;
}
export function uvBounds(attribute) {
  if (!attribute || !attribute.count) return null;
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity, outOfRange = 0;
  for (let i = 0; i < attribute.count; i++) {
    const u = attribute.getX(i), v = attribute.getY(i);
    if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
    if (u < -0.0001 || u > 1.0001 || v < -0.0001 || v > 1.0001) outOfRange++;
  }
  if (!Number.isFinite(minU)) return null;
  return { minU, maxU, minV, maxV, outOfRange, count: attribute.count };
}
export function modelStats(meshes) {
  let triangles = 0, vertices = 0, withUV = 0, withNormals = 0;
  for (const mesh of meshes) {
    const g = mesh.geometry;
    triangles += triangleCount(g);
    vertices += g.getAttribute('position')?.count ?? 0;
    if (g.getAttribute('uv')) withUV++;
    if (g.getAttribute('normal')) withNormals++;
  }
  return { triangles, vertices, meshes: meshes.length, withUV, withNormals };
}
