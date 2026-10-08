# maxVFX Model Inspector — cumulative development handoff v1.0.0

Date: 2026-10-08 (KST)  
Repository: https://github.com/kdc916/Model-Inspector  
Pages: https://kdc916.github.io/Model-Inspector/  
Base: v0.9.5 at commit `efc1a02184cf4c48cc7dd1b9e9b37dec75f9bd4b`

## Mission / user expectations

Browser-only VFX asset workbench: FBX (including 3ds Max vertex alpha restored from RGBA FBX layers), OBJ, GLB/glTF and other 3D formats; mesh/pivot/UV/vertex channels; shader tests, tiling and UV flow. Every patch must preserve working functions, publish to GitHub, verify Pages where possible, and provide a complete ZIP plus cumulative MD handoff.

## Cumulative milestones

- v0.1–0.2: loaders, mesh inspection, UV flow, UV stretch/vertex visualization.
- v0.3–0.4: extended PBR slots, wireframe/pivots, vertex alpha diagnostics, ORM channels; fix FBXLoader dropping the FBX A component by restoring aligned per-triangle vertex alpha.
- v0.5: independent `V.Alpha` overlay with real transparency + blending.
- v0.8–0.8.2: production VFX material previews, atlas/flipbook, UV/mesh QA, presets, comparison, HDR Bloom, independent tiling/offset and pivot guide controls.
- v0.9.0: Fresnel, Dissolve, Noise/Mask, Distortion and Depth Fade Shader Studio.
- v0.9.5: Worker-backed diagnostics and Texel Density, bounded analysis, shader-inspired presets and comparison model depth source.

## v1.0.0 changes

### 1. Portable material preview ZIP

- Workflow > `텍스처+프리셋 ZIP` and `ZIP 복원`.
- Packages JSON preset plus **uploaded** material slots (9) and Shader Studio noise/mask images (2). Does not package FBX, GLB or other 3D model files and does not embed original model textures that were imported within FBX/GLB but not separately uploaded into the Material tab.
- ZIP manifest schema `maxvfx-preview-package`, version 1, validated via `normalizePreset` and path allowlist.
- Limits: 160MB ZIP and total texture budget; 32MB per image; max 11 recognized image slots. Path traversal, unexpected entries, slot duplicates and size mismatches rejected.
- Uses JSZip 3.10.1 from a CDN via lazy loading on package actions (application already requires CDN for Three.js). On network failure an error is shown, never silently reports success.
- Archive restore requires an already loaded model and applies material textures to all meshes. Individual material-ID overrides and external references from FBX/GLB are **not** serialized in v1.0.0.
- `src/production-package.js` is pure/portable and has 10 targeted tests. Real ZIP generate/load roundtrip verified with JSZip installed in the build environment.

### 2. Comparison visual modes

- `Side by side`, `Overlay · align centers`, `B opacity` (in overlay), and `Show model B`.
- Compares spatial bounds centers without destructive changes to model A.
- The original B material state is recorded and restored when leaving overlay or opacity returns to 1.
- Comparison geometry/materials/textures released when clearing/replacing model; depth reference reset.

### 3. WebM recording

- `WebM 녹화` button under Workflow.
- Captures **canvas only** using MediaRecorder/`captureStream`, no system audio or mic permissions.
- 30fps, maximum 30 seconds, 160MB chunk budget. Download is triggered after stop, and media stream tracks are stopped on stop/cancel/replacing model.
- WebM support varies by browser. MP4 is not provided. Bloom included because output canvas is recorded.
- Implemented as `src/capture-workflow.js`, with bounded memory/cleanup tests.

### 4. Resource lifecycle / regression

- Revoke uploaded material and ORM blob URLs as soon as async decode completes, rather than keeping all until model replacement.
- Shader Studio image files retained only as File objects (for ZIP export), revoked image URLs as before.
- Existing FBX RGBA recovery, Alpha Overlay, UV Flow and shaders untouched functionally.

### 5. Browser smoke test

- `python tests/browser-smoke.py` checks static DOM, new Workflow controls and version using Chromium/Playwright.
- Because the current container blocks local HTTP requests, the test uses `page.set_content` and **does not validate actual Three.js module loading / WebGL pixel output**. It reports that separately as NOT VERIFIED. See remaining release gates.

## Verified tests

- `npm test` → 105 passed, 0 failed.
- `node --check` for all JavaScript modules → no parse errors.
- `python tests/browser-smoke.py` → static UI smoke passed; WebGL NOT VERIFIED due blocked local HTTP / CDN.
- Real JSZip generate/re-import: 1 texture preserved byte-for-byte with manifest controls.
- ZIP output checksum/list verified in build container.
- GitHub commit and Pages status must be checked and appended after publishing.

## Known limitations / next stage

- **Do not call this pixel-validated or bug-free** until running on a real browser with CDN/GPU access and testing ZIP restore + WebM + B overlay + FBX V.Alpha.
- JSZip CDN dependency; optional future vendor/shrink bundle.
- Material packs cannot capture per-mesh/per-Material-ID overrides or referenced imported model textures; consider schema v2 for this.
- Screen recording only supports MediaRecorder-compatible WebM, is real-time, and has a bounded duration.
- Compare overlay aligns bounding centers, not mesh topology or surface registration.
- Real browser test automation with Playwright should run on a network-enabled CI runner with Three.js dependencies available and capture GPU screenshots (the static DOM smoke isn't a substitute).
- Ensure ZIP importer validates archive uncompressed sizes **before** allocating large blobs. Current limits apply to manifest and matching archived assets.

## Build and publishing

```bash
npm test
python tests/browser-smoke.py
python -m http.server 8000
```

`Settings > Pages`: deploy from `main / (root)`. This repo uses static HTML and needs no build step or custom GitHub Action. Do not overwrite the known-good branch if tests fail. For an updated patch, produce complete ZIP and cumulative MD handoff.
