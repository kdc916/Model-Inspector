# maxVFX Model Inspector · Cumulative Handoff v0.9.0

Release date: 2026-10-08. Base: v0.8.2, main branch `kdc916/Model-Inspector`.

## Goal
Implement VFX Shader Studio without regressing previously verified FBX Vertex Alpha, texture blending, UV Flow and pivot displays.

## Changed files
- `src/shader-studio.js` (new): normalized shader controls, onBeforeCompile extension chained after alpha shader, animated uniforms, Fresnel/Dissolve/noise/mask/distortion/depth fade.
- `src/depth-preview.js` (new): separate depth-buffer test-plane render, resize, fit and disposal.
- `src/app.js`: shader UI bindings, safe async image uploads (including stale-request invalidation), cloned-material activation, shader uniform updates, additive plane prepass, optional transparency, preset hook.
- `src/production-core.js`: v1 preset schema supports new Shader Studio parameters while continuing to accept v0.8.x presets.
- `index.html` and `styles.css`: separate 5th Shader tab, controls, mobile-friendly tab fit.
- `package.json`, `README.md` and three new test files.

## Functionality
1. Base Color mapping with UV noise distortion; independent noise layer and mask. Noise/Mask have separate upload/remove.
2. Fresnel rim with tint/power/intensity; dissolve threshold/edge glow.
3. Soft Particle-style depth fade against a single isolated depth test plane only.
4. VFX shader parameters roundtrip through JSON presets; uploaded image *bytes* not included.
5. Vertex Alpha shader remains installed first and is not replaced; FBX color layer recovery unchanged.

## Verification
- `npm test` includes previous v0.8.2 tests plus new shader-studio, depth-preview and preset/UI regressions.
- `node --check` on all JavaScript source and test files.
- HTML ID uniqueness + link verification for JS modules.
- Browser WebGL pixel-level validation **not yet completed** due no CDN access in the local test container. Do not claim cross-browser rendering is perfect until field-tested.

## Known limitations
- Depth-only isolated test-plane prepass (not the complete opaque scene); no automatic normals/tangents reconstruction; no multichannel UV remap for noise.
- `onBeforeCompile` shader insertions target Three.js r186; future Three.js version upgrades require fragment-chunk integration tests.
- Texture references are ephemeral browser objects and never sent to a server. Preset JSON excludes image assets.
- Shader Studio Noise/Mask images are standard web-readable image formats; KTX2 and DDS remain supported in regular PBR slots only.

## Next tasks
- Add full Chromium WebGL automation on a runner with Three.js dependencies cached locally and golden image comparisons.
- Expand scene-wide Depth Fade prepass with non-VFX opaque occluders and selection masking.
- Package VFX preset + local textures as ZIP; automatic scene/camera export; Shader node parity presets for engine-specific workflows.

## Historic handoffs
Previous cumulative history is retained in the included `HANDOFF_v*.md` files.
