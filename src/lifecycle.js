/** Each async import owns its decoder and may publish only while its ticket is current. */
export class RequestEpoch {
  #version = 0;
  next() { return ++this.#version; }
  invalidate() { this.#version++; }
  isCurrent(ticket) { return ticket === this.#version; }
}

/** Dispose a parsed but unmounted scene (e.g. superseded FBX import). */
export function disposeDetachedRoot(root, textureSlots = []) {
  if (!root?.traverse) return { geometries: 0, materials: 0, textures: 0 };
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    const list = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    for (const material of list) {
      if (!material) continue;
      materials.add(material);
      for (const slot of textureSlots) if (material[slot]) textures.add(material[slot]);
    }
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
  for (const texture of textures) texture.dispose?.();
  return { geometries: geometries.size, materials: materials.size, textures: textures.size };
}

/** An upload of slot A never invalidates an in-flight upload of slot B. */
export class SlotEpochs {
  #versions = new Map();
  next(slot) { const v = (this.#versions.get(slot) || 0) + 1; this.#versions.set(slot, v); return v; }
  invalidate(slot) { this.next(slot); }
  invalidateAll() { for (const key of this.#versions.keys()) this.invalidate(key); }
  isCurrent(slot, ticket) { return this.#versions.get(slot) === ticket; }
}
