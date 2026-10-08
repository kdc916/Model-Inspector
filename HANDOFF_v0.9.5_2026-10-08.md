# maxVFX Model Inspector v0.9.5 · Cumulative Handoff

- Date: 2026-10-08
- GitHub repository: https://github.com/kdc916/Model-Inspector
- GitHub Pages: https://kdc916.github.io/Model-Inspector/
- Stable base: v0.9.0 (GitHub commit `c36e0b42c980afcaaeebcee2357d20b44783ceca`)
- Release scope: v0.9.5 QA/Diagnostics, Shader preview look presets, depth occluder model B.

## 1. Implemented

**Production QA**
- `src/diagnostics-pro.js` is a pure JS BufferGeometry snapshot and QA function with configurable resolution and scale, indexed/non-indexed geometry support and transformed model world coordinates.
- `src/diagnostics.worker.js` runs QA off main thread, communicates progress/errors/final results; UI supports Cancel and JSON export. It never mutates FBX/GLB geometry.
- Checks: UV overlapping triangle pairs, flipped UV winding, degenerate UVs/triangles, invalid indices, UV out-of-range, invalid/opposing normals, duplicated vertex positions, density px/m.
- Explicit partial and comparison budgets prevent misreporting incomplete overlap analysis as complete.
- `src/app.js` manages job ID/cancellation on asset replacement, worker life cycle, progress, result view and downloadable report. `index.html` exposes QA controls.

**Shader presets**
- `src/shader-presets.js`: Energy Shield, URP-inspired Dissolve, Niagara-inspired Aura, Soft Smoke. Converts preset to existing material/shader controls; editable after applying.
- These are descriptive templates only and do not export compiled Unity or Unreal shader files.

**Depth preview**
- `src/depth-preview.js`: reference source model B proxies share geometry, apply world transform per frame, depth prepass avoids primary VFX self-occlusion. Select plane / comparison / both.
- B's transparent geometry is treated as opaque by the depth prepass. Only use as representative depth test.
- Reference proxies own no geometry; removed before disposal of comparison model.

**Compatibility**
- Legacy settings and v0.8.x/v0.9.0 JSON presets preserved.
- Existing Three.js FBX Vertex Alpha restoration, Apply Alpha compositing, pivot controls, per-texture UV Flow, flipbook, and material controls remain intact.

## 2. QA and constraints

- Node built-in `npm test`: 90 passing tests, 0 failures.
- All JS modules syntax-check; static HTML IDs and module relative imports checked.
- Local Chromium tried but access to 127.0.0.1 was blocked by execution environment: WebGL pixel regression **not verified**.
- The QA analyzer caps per-mesh face scanning at 300K and overlap comparisons at 350K. The UI defaults to 150K faces and 200K comparison checks; incomplete results show lower-bound notes.
- Snapshots consume browser memory; do not use huge scan budgets on mobile. Job cancel stops worker.
- UV overlap and mirrored winding can be intentional; avoid simplistic pass/fail scores.
- Texel density accuracy depends on correct model-units-per-meter and texture resolution.

## 3. Workflow / Verification checklist

1. Load `Fx_Mesh_Circle01_AlphaSide.FBX`; inspect Vertex Alpha overlay with Checker/normal texture and ensure previous behavior unchanged.
2. Set Inspector / UV QA Pro 1024px / 1 units per meter; Run QA and inspect result, JSON.
3. Repeat with 100 units per meter if model coordinates represent centimeters; compare px/m.
4. Cancel long QA scan; load a new model during scan, verify previous job does not update UI afterward.
5. Shader tab: apply each look. Ensure custom controls can be adjusted afterward; save and restore JSON preset.
6. Workflow: load comparison model B; Shader Studio > Depth Fade > Comparison Model; verify depth changes at intersections, then remove comparison and recheck.
7. Compare behavior across Chrome/Edge/Firefox and mobile; test WebGL2/KTX2 and Bloom combinations. Browser rendering has not been asserted automatically.

## 4. Next recommended releases

- v0.9.6: WebGL screenshot golden tests in CI using packaged Three.js assets, advanced mesh normal diagnostics and seam marking.
- v1.0.0: One-file texture + preset ZIP import/export, side-by-side synchronized camera comparison, video export/recording, memory and load-time profiling.

## 5. History

See earlier `HANDOFF_v*.md` files inside the ZIP. Keep these with each future version. For every patch publish whole ZIP + cumulative Handoff MD and update the official repository, verify Pages status.
