# maxVFX Model Inspector — v0.4.1 (2026-10-08) handoff

## Source & deployment
- GitHub: https://github.com/kdc916/Model-Inspector
- GitHub Pages: https://kdc916.github.io/Model-Inspector/
- Deploy from branch `main` → `/(root)`; no custom GitHub Actions required.
- Engine dependency: Three.js r186 via jsDelivr import map.

## Reported defect / verified root cause
User supplied an ASCII FBX asset `Fx_Mesh_Circle01_AlphaSide.FBX` and a screenshot where vertex alpha was all magenta (missing). **The FBX itself does contain RGBA**. It has:
- FBX version 7200 (ASCII)
- one mesh Geometry with `LayerElementColor: 0` mapped `ByPolygonVertex`, `IndexToDirect`
- 756 RGBA entries (`Colors` float array: 3024) and 756 color indices
- RGB all 1.0; Alpha levels `[0, 0.1509, 0.882416, 1]` with respective counts `[56, 112, 112, 476]`
- 196 polygons (168 quads, 28 triangles): 364 triangles / 1092 triangulated vertices

Three.js `FBXLoader` r186 already parses 4-channel `LayerElementColor`, but `genBuffers()` explicitly copies only R/G/B, and writes `Float32BufferAttribute(buffers.colors, 3)`. This drops A before the inspector sees the geometry. Earlier v0.4.0 missing-A warning was technically correct about *loaded geometry* but incorrectly suggested missing FBX export data for this file.

## Implementation
- New `src/fbx-alpha-recovery.js` parses ASCII and binary FBX 7.x color layer data (binary zlib `DecompressionStream` supported), with input size limits.
- `triangulatedAlpha` reconstructs polygon corner colors, respects ByPolygonVertex / ByVertice / ByPolygon / AllSame, Direct and IndexToDirect mapping, and uses `THREE.ShapeUtils.triangulateShape` exactly like upstream FBXLoader for polygons with 4+ corners.
- `restoreFBXAlpha` writes a **standalone** `alpha` `Float32BufferAttribute` without replacing RGB or changing source data. Geometry matching is cautious: when multiple same-vertex-count unnamed meshes are ambiguous, it skips rather than putting wrong alpha on the mesh.
- `src/model-loaders.js` calls recovery after `FBXLoader.parse` and exposes recovery stats.
- `src/app.js` displays recovered status and includes recovery metadata in the JSON alpha report.
- `README.md`, UI release and package version set to `v0.4.1`.

## Tests
- `npm test`: 35/35 tests pass (including 4 synthetic binary cases: v7400/7500 compressed/uncompressed).
- `node --check src/*.js`: pass.
- Real user FBX locally parsed: one color layer, 756 RGBA records, 1092 corner alpha entries, recovered min 0/max 1; expected with a simple same-face-count triangulation adapter (not a full WebGL browser render).
- This environment cannot validate actual CDN WebGL model rendering. **User should reload Pages without cache and verify** that Alpha mode shows black-gray-white rather than magenta.

## Known limits & further work
- FBX skins, morphs, multiple geometries sharing same triangulated vertex count, and different FBX dialects require more real-file tests. In ambiguous cases the tool deliberately does NOT invent alpha.
- For browser use of compressed binary arrays, modern browser `DecompressionStream('deflate')` support is required.
- Consider eventually vendoring/patching FBXLoader itself to preserve RGBA natively, provided upstream license and version pinning are addressed.
- Never add the user's sample FBX to the public GitHub repo without explicit permission; not included in the distribution ZIP.

## Change history (condensed)
- v0.1.0: general model viewer, UV check, texture flow.
- v0.2.0: stretch heatmap, Vertex RGB, tangent helper, presets.
- v0.3.0: wire display controls, PBR slots and intensity, Vertex Alpha inspection.
- v0.4.0: missing alpha warning, packed ORM, normal G inversion, per material controls.
- v0.4.1: restore FBX LayerElementColor alpha dropped by Three.js loader, ASCII & binary parser and regressions.
