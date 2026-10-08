# maxVFX Model Inspector — Cumulative Handoff (v0.3.0)

2026-10-08 · https://github.com/kdc916/Model-Inspector · Pages: `main / (root)` · live URL `https://kdc916.github.io/Model-Inspector/`

## Contract

- GitHub Pages only, no backend. Keep original user model data local; the Three.js CDN is remote.
- Preserve every previous stable feature. Deliver ZIP + cumulative handoff MD. Publish directly to `kdc916/Model-Inspector` with commit ID, deployment check, tests.
- `.blend` and `.max` cannot be opened directly in the browser; convert to GLB or FBX.

## Versions

### v0.1.0 — Base MVP
Model loaders (GLB/GLTF, FBX, OBJ, STL, PLY, 3DS, DAE, 3MF); glTF sidecar files, hierarchy, draw calls/FPS/triangle/vertex stats; 2D UV layout, UV checker/grid; texture upload; flow offsets, repeat, animation, screenshots; local-only processing; desktop/mobile layout. First package delivered.

### v0.2.0 — Diagnostics
UV Stretch Heatmap relative to mesh median, up to 180K faces per mesh, neutral fallback; Vertex RGB/R/G/B/A grayscale visualization; tangent helper; eight directional UV flow presets; groups debug material fix; unit tests 13; official GitHub Pages branch deployed (see `f6e3570a4b7e80aad698686f33585aaf4a3cc6b9`).

### v0.3.0 — Wireframe, Alpha, Material
- Quick Wire button in viewer top bar synchronizes the bottom Wireframe overlay checkbox. Inspector Wire Color/Opacity/X-Ray (depthTest off) configuration; wire helper disposal and original geometry source, guard for >180K triangles per mesh.
- One-click Vertex Alpha black–white debug mode and legend. Alpha statistics distinguish actual RGBA (attribute itemSize 4) vs RGB-only vs no vertex colors, including min/max/mean and opaque/partial/transparent count. Demo ribbon has per-vertex alpha gradient.
- Extend material slots to 9: Base Color, Normal, Roughness, Metallic, Emissive, Opacity, AO, Bump, Height/Displacement. Slot clear button; upload scoped by all/selected mesh.
- Expose Base color intensity, normal strength, AO intensity, emissive intensity + tint, bump, displacement + bias, global opacity, alpha mode and cutoff, existing roughness/metallic factors. Imported original material stays unchanged until override; Reset removes overrides and stops flow.
- Extract pure `material-controls.js` for validated controls/modes; `analyzeVertexAlpha` in `mesh-diagnostics.js`. More tests in `tests/material-controls.test.mjs`.

## Known limitations

1. Browser-based WebGL CDN runtime loading not tested in the authoring environment, due network/UI sandbox restrictions. Validate on deployed GitHub Pages with representative GLB/FBX/OBJ, PNG/TGA/DDS maps, RGB/RGBA vertex formats.
2. Wire geometry reflects original mesh vertex positions; deformation-dependent skinned wireframe and extremely dense (>180K triangles) wire are limited. Edge geometry is an overlay, not a wireframe-only renderer.
3. Alpha Map samples G, Roughness G, Metallic B, AO R in Three.js. Setting Color Map's embedded alpha requires selecting Blend/Clip. AO/UV channels must exist on imported geometry.
4. Bump and normal map may conflict; Normal typically takes precedence. Displacement modifies vertex positions; increase tessellation upstream to actually add silhouette detail.
5. Material controls apply uniformly to selected scope, and toggling scope does not auto-populate parameter sliders from an existing material. Per-material texture-slot state indicators show the most recently uploaded/cleared slot, not a true multi-mesh consensus.
6. `Flip uploaded texture Y` affects future uploads, not old ones. Blend sorting, huge textures, vertex colors with custom shaders, FBX variants, packed mask channel remapping need further checks.

## Next patch proposals

- v0.3.1: native in-viewer 3D ray pick and material-target synchronization; per-mesh material UI readback; reset UX correctness for partial selection; user texture channel selection RGB/R/G/B/A; ORM packed import.
- v0.4: GLB preview export, normal map green-only inversion, texture transform/UV rotation, separate multi-UV per texture slot, weighted transparent/alpha cutoff preview, viewport environment probes/HDRI, searchable mesh statistics.
- Stability: real-browser smoke tests with CDN module pin/cache, model and map fixtures, render screenshot regression for desktop/mobile, fragment shader PBR validation.

## Verification

Run `npm test` from project directory (no npm install needed for pure unit tests). Run `node --check src/*.js` via shell loop. For web preview use `python -m http.server 8000`; opening `index.html` with `file://` is not a valid runtime test.
