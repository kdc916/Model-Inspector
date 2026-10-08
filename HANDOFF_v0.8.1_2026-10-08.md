# maxVFX Model Inspector — Cumulative Handoff v0.8.1 (2026-10-08)

## Baseline and requested change

Repository: https://github.com/kdc916/Model-Inspector (`main`, GitHub Pages branch/root). Based directly on v0.8.0 commit `c3b1aad0167ab662415c7c5b5afbd0374a9aeef0`. Earlier 0.1–0.8 histories included as separate files in ZIP.

User verified v0.8.0 but provided screenshots with washed red/green/gray V.Alpha over a detailed texture rather than the expected vertex-alpha transparency. User requested axis enlargement, visual display of per-mesh pivot position and orientation, debugging and refactoring. Native WebGL screenshot verification is pending because network access to jsDelivr was unavailable in this execution environment; no claim of pixel-perfect engine parity.

## Design / Behavior v0.8.1

1. **V.Alpha = actual alpha**, not only a color tint. Default `alphaOverlayView = apply`. The shader preserves sampled albedo/texture and multiplies output alpha by the imported FBX vertex alpha. If original vertex `color` already contains RGBA and Three.js consumes its alpha with `vertexColors`, avoid applying it twice. If A attribute is absent, leave opaque and report it. Alpha mask can combine with Opacity textures through existing shader patch. Tint/Gray remain opt-in diagnostic colors.
2. **Effective blend mode:** `resolvePreviewBlend()` converts `Opaque` to Alpha Blend only while V.Alpha is enabled on meshes containing alpha. This is a non-destructive *preview state*, never overwriting FBX/GLB source files. `OFF` restores Opaque; custom Additive/Multiply/Screen/Premultiplied/Mask modes continue to use selected equations, though Three.js/Unity/Unreal blend results can differ. `render-state.js` encapsulates material blending and depth write decisions.
3. **World/Pivot visuals:** `SceneGuides` manages independent world XYZ arrows, mesh pivot XYZ arrows and origin dots. Axes are world-size proportional, not hardcoded 3 units. Inspector provides world/local pivot coordinates and world Euler degrees. Selection or animation updates the pivot position and quaternion. Scope options: selected/first mesh, all (up to 64), model root. All visual aids are disposable and don't mutate geometry.
4. **Source transform regression fix:** stop forcing the imported root's local position to zero when installing a model, preserving authoring transforms and pivot relationship.
5. **Settings:** `toggleAxes`, `togglePivot`, `axisSize`, and `pivotScope` stored with existing JSON presets, imported controls are applied and guides refreshed.

## Code changes

- `index.html`: v0.8.1 label, V.Alpha default Apply, docs, axis/pivot options.
- `src/alpha-preview.js`: default Apply and Opaque alpha enablement, shader cache key bumped.
- `src/render-state.js` **new**: pure blend config + THREE material state renderer.
- `src/scene-guides.js` **new**: lifecycle for scaled pivot/world guides, arrows and labels.
- `src/app.js`: hooks, lifecycle, imported root preservation, inspector pivot readout, Alpha blend switching and source clone protection.
- `src/production-core.js`: preset field keys.
- `tests/alpha-preview.test.mjs`: changed expectations with Opaque alpha preview.
- `tests/pivot-and-alpha-blend.test.mjs` **new**: shader/material setup, world pivot scaling, field bindings and alpha fallback.
- `package.json`, `README.md` and cumulative handoff updated.

## QA and remaining limits

- Run `npm test`, `node --check src/*.js`, static duplicate-ID/import resolution checks, ZIP CRC integrity checks and test model analysis before GitHub publication.
- **Runtime WebGL coverage remains unverified on the user's Edge/GPU.** These are unit and static integration checks, not browser pixel output validation; testing requires CDN access and GPU/WebGL.
- Invalid/broken FBX vertex channel mappings still need specific fixtures. FBX color alpha recovery from v0.4.1 has been preserved and is covered by previous fixtures/tests.
- On import, `.blend` and `.max` remain unsupported without conversion; KTX2 needs decoder and WebGL support.
- The module `scene-guides.js` instantiates a separate arrow, origin dot and letter sprites for each inspected pivot (at most 64, not thousands). Recreates safely when size/selection changes and disposes geometries/materials/textures.

## Suggested manual QA order

1. Import previous `Fx_Mesh_Circle01_AlphaSide.FBX`, enable `Checker` + `V.Alpha` with Transparency mode `Opaque`; examine open background through zero-alpha region.
2. Upload an actual Base Color image, switch Material/Checker, test V.Alpha ON/OFF and compare to prior color preview. Ensure true texture color remains unchanged in default mode.
3. Check Additive / Alpha Blend / Alpha Clip and alpha intensity, packed mask + vertex alpha, and independent UV flow.
4. Enable World Axis and Mesh Pivot, increase Gizmo slider, select a transformed mesh, check arrow orientation and pivot world coordinates. For model root/origin far from center, use root mode to see authoring pivot.
5. Import/Export preset with guide controls, replace model, and check no orphan graphics or duplicated arrows.

## Release policy

Deliver complete ZIP and standalone cumulative Handoff MD; update GitHub `main` using fast-forward expected SHA, verify the returned HEAD and Pages status. Never claim every mesh and browser are error-free without runtime fixture coverage.
