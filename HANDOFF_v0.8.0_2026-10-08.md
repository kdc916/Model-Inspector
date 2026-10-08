# maxVFX Model Inspector · v0.8.0 Integrated Handoff

- Repo: https://github.com/kdc916/Model-Inspector
- Pages: https://kdc916.github.io/Model-Inspector/
- User requirement: v0.6.0 + v0.7.0 + v0.8.0 features in one tested update, retain FBX vertex alpha, ship ZIP and Handoff MD.
- Baseline: v0.5.0 (commit `3eca9c00560836d4d2d3c4ebac3830ea2ae13eac`). Do not replace/remove preexisting features.

## Implemented 0.6.0

1. Extended blend modes: Opaque, Standard Alpha, Add, Premultiply, Multiply, Screen/Soft Add, Clip. Depth Test, Depth Write, Cull mode independently editable.
2. `src/alpha-preview.js`: custom alpha channel selection of uploaded `alphaMap` R/G/B/A, optional inversion; preserves vertex alpha multiply behavior.
3. Per-texture UV Flow using `src/production-core.js` with UV channel 0..3, speed, offset, tiling. Global controls remain; enable independent flow to override global slot settings.
4. HDR Bloom via EffectComposer/RenderPass/UnrealBloomPass/OutputPass. This is threshold-based full-frame postprocessing, not an Unreal/Unity bloom matching shader.

## Implemented 0.7.0

1. Flipbook grid 1..64 columns/rows, 0.01..120 FPS, Loop, independently selectable Base Color/Emissive/Alpha channel.
2. Geometry diagnostics `src/uv-diagnostics.js`: signed UV winding, zero UV area, area-based overlapping triangle candidates, missing/invalid/opposing normals; performance cap 5,000 faces per mesh. High-density results partial.
3. UI `Inspector → UV 품질 분석` runs on demand, not synchronously at file import.

## Implemented 0.8.0

1. JSON Presets in `src/preset-workflow.js`, validated schema/version and 512KB size limit; save/load control values and per-slot transforms. Referenced textures are not packaged in JSON and must be re-uploaded.
2. Compare model root separately loaded by a distinct `LocalModelLoader`, positioned to the right, disposed independently. `src/asset-report.js` produces comparable counts and JSON model details. No per-vertex correspondence claims.
3. Inspector QA report JSON, UV & normal diagnostics and vertex alpha summaries.
4. KTX2 via `KTX2Loader` for glTF and explicitly uploaded textures. Basis workers fetched over CDN. Browser/GPU-dependent.
5. Added `tests/production-core.test.mjs`, `tests/uv-diagnostics.test.mjs`, `tests/asset-report.test.mjs`, `tests/workflow-ui.test.mjs`; existing alpha/FBX tests retained.

## Stability and testing

- `npm test`: run before committing and document exact count.
- `node --check` all JS/MJS.
- Validate every `document.querySelector('#id')` reference resolves to a DOM ID.
- Recheck provided original file `Fx_Mesh_Circle01_AlphaSide.FBX` in local test context; **do not commit this user test asset**.
- Check `src/app.js` import specifiers and render order. Real WebGL browser playback is a separate QA layer; pass/fail of unit tests alone cannot prove all graphics paths or exact parity with game engines.

## Known limitations / manual QA

- External CDN assets prevent full offline functionality. KTX2 compressed textures require Basis decoder and supported WebGL/GPU implementation.
- Blend/Screen/Premultiply/depth/bloom are approximations of engine-specific shaders and render settings.
- UV-overlap warnings can be expected/intentional in stacked VFX UVs; 5k triangle per-mesh cap.
- Imported `.max` / `.blend` still require conversion to GLB/FBX. Unsupported FBX geometry mappings remain possible.
- Material preset JSON excludes textures; missing dependencies must be uploaded after import.
- Browser-side benchmarks, GPU regression screenshots, and interactivity tests still require manual validation if unavailable in container.

## Suggested next steps

- Verify v0.8.0 in desktop Edge/Chrome with original alpha FBX and checker plus additive/premultiply; compare UV Flow channels 0/1 and flipbook sheet.
- Add optional golden-image tests in CI with locally bundled Three.js, fixtures with user permission, and headless Chromium real WebGL capture.
- Gradually factor remaining UI management from `src/app.js` into controller files while preserving stable state ownership.

## Release policy

Deliver project ZIP and this Handoff MD as separate links. GitHub branch is `main`, Pages `Deploy from a branch / (root)`; commit changes atomically and confirm Actions run outcome.
