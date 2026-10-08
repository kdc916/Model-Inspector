# maxVFX Model Inspector — cumulative handoff v0.8.2 (2026-10-08)

## Project and deployment
- Repository: https://github.com/kdc916/Model-Inspector
- GitHub Pages: https://kdc916.github.io/Model-Inspector/
- Hosting: `main` / root; static HTML and ES module, Three.js dependency on CDN.
- Stable predecessor: v0.8.1 (`7f74e3a714de325b8897489e9800dea8cfb45f93`).

## v0.8.2 changes
1. **Pivot guide size independent from world axis:** Inspector `World Axis size` and `Mesh Pivot size` are separate sliders. Pivot default = 0.12 of model bounds diagonal versus the old shared default 0.35; both controls range 0.05–1.50. `SceneGuides.configure()` builds separate guides; `SceneGuides.resize(worldSize,pivotSize)` changes existing guide scales without recreating geometries on every slider input. Original local pivot positions and directions remain unchanged.
2. **Material tab texture transform:** All nine texture slots have independent additional `Tiling U/V` and `Offset U/V` numbers, with slot switch, per-slot reset and jump to UV & Flow. The panel sits directly beneath the texture upload grid. Selecting/uploading a texture selects the corresponding editable slot.
3. **Manual values + UV Flow:** Overrides compose with whichever global/independent UV flow currently applies, and remain stable when animated offsets advance. Formula (visible positive direction convention): `finalRepeat = flowRepeat * tileMultiplier`, `finalOffset = flowOffset - manualOffset`. This supports checker/UV grid for Base Color as well as PBR maps; unedited slots retain their previous behavior. Flipbook frame transforms are preserved (with the same per-slot composition convention).
4. **Preset compatibility:** New `pivotSize` UI value and validated `textureTransforms` dictionary are stored in schema version 1 preset JSON; older v0.8 presets import with sensible defaults. No texture bytes embedded.
5. **Minor quality improvements:** UI numeric input clamps on change; slider output display refreshes after preset import; QA report version updated to v0.8.2. Existing FBX Vertex Alpha recovery/Apply Alpha logic intentionally unchanged.

## Test results
- Node native test suite: 62 passed, 0 failed (`npm test`).
- All source `.js` files passed `node --check`.
- DOM cross-reference test: 169 unique IDs, zero missing static selectors.
- New regression tests `tests/pivot-and-texture-transform.test.mjs`: world/pivot independence, resizing without rebuild, additive flow + tiling offsets, clamping, JSON presets, material UI wiring.
- Real WebGL pixel-level visual verification in Chrome/Edge and CDN availability remain unverified in the sandbox; validate on live Pages with FBX alpha sample, e.g. `Fx_Mesh_Circle01_AlphaSide.FBX`.

## Manual release smoke-check
1. Load FBX and verify `V.Alpha ON` still reveals appropriate alpha transparency with Base Color texture.
2. Inspector -> Pivot Guides: tick Pivot and World Axis, change only `Mesh Pivot size`; verify World Axis length doesn't change. Reverse with `World Axis size`.
3. Material -> upload Base Color then change `Tiling U=2`, `Tiling V=3`, `Offset U=0.25`, `Offset V=-0.2`; verify repeat and scrolling in viewport.
4. Change slot to Emissive and edit separate values. Re-select Base Color and verify original transform persisted.
5. UV & Flow -> enable animation and verify static manual Offset remains relative to flowing texture; pause and reset animation.
6. Workflow -> save JSON; reload and verify both pivot size and material texture transforms restored.
7. Check Checker/UV Grid, Alpha Blend/Additive and model switch/reset behavior.

## Implementation notes and future work
- `src/scene-guides.js` builds a unit-size guide and resizes groups, so slider movement does not reallocate GPU geometry. `guideLength()` still clamps relative range and uses model diagonal.
- `src/production-core.js` provides pure `createTextureOverride()` and `composeTextureTransform()` functions, so future texture shader changes can use identical UV logic.
- `src/app.js` `state.textureTransforms` map is intentionally separate from `state.slotFlows`, avoiding accidental changes to the existing speed and per-slot Flow panel.
- Unlike image editing, these changes affect browser preview only, not source FBX/GLB exports.
- Consider future end-to-end Playwright WebGL screenshot comparisons and richer per-material-instance manual transforms (current transform scope is texture slot across loaded meshes).
- Previous `HANDOFF_v*.md` files remain part of the package and source repository.
