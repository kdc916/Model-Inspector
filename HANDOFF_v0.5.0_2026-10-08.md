# maxVFX Model Inspector — cumulative handoff v0.5.0
Date: 2026-10-08 · Target: GitHub Pages (`main` / root)
Repository: https://github.com/kdc916/Model-Inspector
Live: https://kdc916.github.io/Model-Inspector/

## Requirements implemented in this patch
- Vertex Alpha remains accessible independently of the exclusive view-mode toolbar, like Wireframe: a persistent `V.Alpha` toolbar toggle + synchronized bottom-bar and Inspector checkboxes.
- Material / Checker / UV Grid previews retain their base texture and UV Flow while providing independent alpha visualization.
- View options: red(low)–green(high) tint over texture, alpha grayscale over texture, or texture-only mask mode, with adjustable overlay strength.
- Transparency preview: Opaque (ignores transparency), Alpha Blend, Additive, Alpha Clip. Overall Opacity and Clip Threshold are separate controls.
- For Alpha Blend / Additive / Clip, when Vertex Alpha overlay is enabled, actual vertex alpha multiplies fragment opacity; missing alpha does not make geometry disappear.
- Alpha remains separated from RGB; v0.4.1 FBX alpha recovery for indexed polygons is intact; native RGBA vertexColors do not receive duplicate alpha multiplication.
- Uses an `onBeforeCompile` shader extension on *working/debug* materials; never patches imported original materials. Uniform updates do not need re-uploading textures. Supports multi-material meshes and UV Flow by adding a per-vertex preview attribute to source BufferGeometry that is propagated into cloned debug geometries.

## Interaction
1. Open FBX (example: `Fx_Mesh_Circle01_AlphaSide.FBX`).
2. Select `Material`, `Checker`, or `UV Grid`.
3. Toggle `V.Alpha` on viewer toolbar (or checkbox in Inspector/bottom); select Tint / Grayscale / Texture-only and intensity in Inspector.
4. Open Material → Transparency: `Opaque`, `Alpha Blend`, `Additive`, or `Alpha Clip`.
5. Select opacity factor and clip threshold as appropriate. Alpha remains visible while UV Flow animates.

## Important technical details
- `src/alpha-preview.js`: pure overlay state, mask gate, patcher, shader uniform updates.
- `src/material-controls.js`: added Additive and explicit Opaque behavior, returns blending key.
- `src/app.js`: controls, preparation of `vfxInspectionAlpha` per geometry, per-visible-material uniforms, Blend/Additive/Clip assignment to material and checker/UV-grid.
- `index.html`, `styles.css`: persistent controls, explanatory text.
- `tests/alpha-preview.test.mjs`: new pure and mock-shader tests. Existing 35 tests preserved; total 39 passing as of build.

## Validation and limitations
- `node --check src/app.js src/alpha-preview.js` and `npm test`: tests pass locally (39/39).
- This environment cannot retrieve Three.js from CDN, so **full browser/WebGL shader rendering is not verified**. The shader chunk names and injection locations follow the existing Three.js r186 shader pipeline; exercise the live Pages build with actual FBX after deployment.
- These blend modes are WebGL/Three.js inspection approximations, not guaranteed pixel-perfect matches for Unity URP/HDRP or Unreal Niagara material implementations.
- The old dedicated `Vertex Alpha` diagnostic view remains available for absolute black–white inspection. Overlay is currently supported on Material / Checker / UV Grid; Normals/UV Stretch/Vertex diagnostic views intentionally remain unchanged.
- If a mesh has no alpha source, leave its appearance unchanged in composite mode and display a warning. When using native RGBA vertex colors with a vertexColors material, Three.js may already multiply vertex alpha in its material shader.

## Next steps
1. Confirm live visual output with the supplied sample FBX and Checker/Uploaded texture/UV Flow.
2. Consider dedicated `vfx-alpha-material` preview presets mapping Unity URP blend factor pairs (SrcAlpha/OneMinusSrcAlpha, One/One, SrcAlpha/One).
3. Add preset save/load, debug inspector to compare material behavior across engines, and WebGL automated screenshots with a pinned Three.js build.
4. Reconcile material target UI with per-submaterial blending and support mobile smaller screens.

## Cumulative context
- v0.1: model loads, UV, material/normal/statistics/animation.
- v0.2: UV stretch heatmap, channel previews, tangent, UV Flow presets.
- v0.3: wireframe, vertex-alpha inspection, extra PBR map slots.
- v0.4: distinguish missing alpha, ORM/normal green flip and material IDs.
- v0.4.1: reparsed original FBX color layers so FBXLoader's RGB-only extraction no longer drops vertex alpha.
- v0.5.0: independent composite Vertex Alpha overlay and Opaque/Blend/Additive/Clip preview.
