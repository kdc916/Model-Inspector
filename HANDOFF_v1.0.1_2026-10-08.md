# maxVFX Model Inspector — Cumulative Handoff v1.0.1

Date: 2026-10-08 (KST)  
Repository: https://github.com/kdc916/Model-Inspector  
Pages: https://kdc916.github.io/Model-Inspector/  
Base release: v1.0.0 (GitHub commit `eea5dc7411d30f058a1570dcc4e86b1f2cab5e62`)

## Product target and non-regression rules

Static browser VFX asset inspector supporting FBX/GLB/OBJ and other formats, UV diagnostics, texture uploads/flow, shader preview, recorded WebM, model comparison and portable material package ZIP. Do **not** regress FBX alpha recovery (3ds Max RGBA colors), transparent texture + vertex alpha composites, independent pivot controls, UV tiling/offset, Shader Studio presets and v1.0.0 ZIP semantics. No server upload of user models. Deploy main/root to GitHub Pages and deliver ZIP plus MD.

## Previous development milestones

- v0.1–v0.2: model imports, UV overlay, texture checker, mesh statistics.
- v0.3–v0.4.1: PBR materials and FBX raw RGBA vertex alpha recovery.
- v0.5: independent actual Vertex Alpha compositing and material blend modes.
- v0.8–v0.8.2: multi-texture UV Flow, Flipbook, geometry QA, Shader look presets, axis/pivot and manual tiling/offset.
- v0.9.0–v0.9.5: Shader Studio, Dissolve/Fresnel/Mask/Depth Fade, Worker-based UV/mesh diagnostics, optional depth from comparison B.
- v1.0.0: portable preset + user-uploaded texture ZIP, side/overlay compare, limited WebM capture, initial browser DOM smoke checks.

The original historical handoff files remain bundled alongside this document.

## v1.0.1 stabilization implementation

1. **Async lifecycle:** new `src/lifecycle.js` provides `RequestEpoch`, `SlotEpochs`, and deduplicated `disposeDetachedRoot`. Each `openFiles` call has a private LocalModelLoader; only the latest can commit. B-model requests are invalidated on A replacement or B clear. Cancelled imported trees and decoder resources are disposed, including textures.
2. **Texture races:** uploads for individual material slots own a monotonic ticket. Older async decoding results are disposed; clearing a slot, resetting materials or replacing the model invalidates prior uploads. Packed ORM writes its 3 slots together or is discarded when superseded.
3. **WebM recorder:** `src/capture-workflow.js` handles `MediaRecorder.onerror`, ensures track/chunk cleanup and suppresses partial output on errors or >160MB memory threshold. Added failure-mode tests.
4. **ZIP hardening:** `src/production-package.js` first checks ZIP central-directory expanded size and per-image/manifest budgets without inflating, then asks JSZip to verify CRC32. `app.js` compares the active model generation before and throughout package application; partial texture failures are reported as PARTIAL, not success. This does not yet guarantee full rollback of each material previously touched when an image fails midway through import.
5. **Disposal refactor:** comparison B now uses the shared deduplicated detached-object cleanup code.
6. **UI tests:** Chromium+Playwright static DOM smoke now loads local CSS, checks duplicated IDs, tests desktop 1280px and mobile 390px with visible workflow panel. It cannot run CDN Three.js or WebGL in this container.

## Tests / release gates

- Run `npm test` and retain count/output.
- Run `npm run test:browser` (Playwright Python and Chromium required); distinguish DOM-only PASS from WebGL NOT VERIFIED.
- Run `node --check` on every `src/*.js`; check import path references.
- Verify release ZIP CRC and entry count; compare GitHub HEAD after push; verify Pages run success.
- Real supplied example `Fx_Mesh_Circle01_AlphaSide.FBX` was read **locally** using `parseFbxColorLayers` — 1 RGBA layer with 756 color entries, alpha in range [0,1]. **Do not distribute this private user asset.**

## Limitations and next work

- No actual Three.js CDN/GPU/WebGL pixel rendering verification in this sandbox. Run real browser tests in connected environment, using FBX with full alpha, material presets and video recording.
- Uploaded material textures are stored in the portable ZIP as global slots; imported embedded textures and per-material-specific overrides are not serialized.
- ZIP CRC validates corruption, not semantic image decodability. If a format-specific decoder fails mid-apply, the UI reports partial restore; complete atomic rollback is a future enhancement.
- Visual comparison B aligns bounds centers and is not a surface-to-surface geometry difference or remesh.
- Canvas recording WebM only, max 30 seconds and 160 MB.
- Consider browser automation on CI where Three.js CDN is reachable (or bundle dependencies locally), plus real WebGL screenshot snapshots and per-material package v2.

## Distribution

Root `index.html` with static scripts and no build. `Settings → Pages → Deploy from a branch → main / (root)`. Provide a complete project ZIP and this MD after every patch, and record commit + deployment result after publishing. No source FFx private FBX is bundled.
