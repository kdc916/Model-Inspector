# maxVFX Model Inspector

> 3D Asset Workbench — 브라우저에서 모델 구조, UV, 노멀, PBR 텍스처, UV Flow를 검수하는 도구.
>
> **Version:** 0.3.0 (2026-10-08) · Three.js `0.186.0` 고정 · 별도 백엔드 불필요

## 주요 기능

- **파일 로딩:** GLB, glTF(+ BIN/텍스처), FBX, OBJ(+ MTL/텍스처), STL, PLY, 3DS, DAE, 3MF
- **모델 탐색:** 마우스 회전/패닝/줌, 모델 맞춤, 메시 클릭 선택, Scene Hierarchy, 배경·노출 조절, PNG 캡처
- **메시 분석:** 총 삼각형 수, position 정점 수, 메시 수, Draw Calls, FPS, AABB 크기, UV/노멀 유무
- **디버그 뷰:** Material, UV Checker, UV Grid, Normal Color, **UV Stretch Heatmap**, **Vertex RGBA (RGB/R/G/B/A)**, Wireframe, Vertex Normal/Tangent Vector, Double-sided
- **2D UV:** UV 채널 UV0~UV3 선택, 선택 메시/전체 메시 UV 와이어 레이아웃, PNG 내보내기, UV 범위/타일링 확인
- **UV Flow:** 방향/오라/폭포/열기 프리셋, X/Y 시각적 이동 속도, 수동 이동, U/V 반복, 재생/일시정지/초기화. +값은 **보이는 텍스처가 해당 방향으로 이동**하도록 오프셋 부호 처리
- **PBR 업로드:** Base Color, Normal, Roughness, Metallic, Emissive, Opacity, AO, Bump, Height/Displacement. PNG/JPG/WebP/TGA/DDS 등. 전체 또는 선택 메시 적용
- **애니메이션:** GLB/glTF/FBX 등에 들어 있는 지원 AnimationClip 선택 및 Play/Pause
- **반응형:** 데스크톱 3패널 작업 UI, 모바일 스택 레이아웃

## 1분 배포 — GitHub Pages, Actions 설정 불필요

1. GitHub에서 **빈 Public repository**를 만듭니다. 예: `maxVFX-Model-Inspector`.
2. ZIP 압축을 풀고 **내부 파일과 폴더를 저장소 루트**에 업로드합니다. `index.html`, `styles.css`, `src/`, `.nojekyll` 등이 같은 계층이어야 합니다.
3. 저장소 **Settings → Pages → Build and deployment**로 이동합니다.
4. `Source: Deploy from a branch` 선택 → `Branch: main` → `/(root)` → **Save**.
5. 배포된 주소 `https://<사용자명>.github.io/<저장소명>/`에서 엽니다.

Git CLI 예시(이미 저장소를 생성했을 때):

```sh
git init
git add .
git commit -m "Initial maxVFX Model Inspector v0.1.0"
git branch -M main
git remote add origin https://github.com/<사용자명>/<저장소명>.git
git push -u origin main
```

> GitHub Pages는 선택한 브랜치의 루트에서도 정적 페이지를 배포할 수 있습니다. 이 프로젝트는 별도 Vite/npm 빌드를 요구하지 않으며 `.nojekyll` 파일을 포함합니다.

## 로컬에서 실행

`index.html`을 더블클릭해서 `file://`로 열지 마세요. 모듈/보안 제약 때문에 HTTP 서버로 실행해야 합니다.

```sh
python -m http.server 8000
# 접속: http://localhost:8000/
```

Python이 없는 Windows에서는 `py -m http.server 8000`을 사용합니다.

## 모델 불러오기

- **GLB:** 하나의 `.glb`만 선택해도 대체로 바로 동작합니다.
- **glTF:** `.gltf` + `.bin` + 참조 이미지들을 **같이 선택**하거나 `폴더 전체 선택`을 사용합니다.
- **OBJ:** `.obj` + `.mtl` + 이미지들을 함께 선택하세요.
- **FBX:** 텍스처를 별도 저장했다면 이미지를 함께 선택하세요. 다만 FBX 포맷/내보내기 버전별 호환성 제한이 있습니다.
- 파일 묶음에 모델이 여러 개 있으면 우선순위에 따른 첫 모델 하나를 로드합니다. 이 버전은 **다중 모델 동시 열기**가 아닌 **복수 종속 파일 입력** 기능입니다.
- 자산 파일은 브라우저 내부 Blob URL로 연결합니다. 업로드 API나 자체 서버는 없습니다. 모델이 임의의 외부 HTTP(S) 텍스처 주소를 참조하는 경우 개인정보 보호를 위해 해당 참조는 차단합니다.

### .blend, .max 관련 중요 사항

| 파일 | 브라우저 직접 열기 | 권장 방법 |
|---|---:|---|
| `.blend` | X | Blender → `File → Export → glTF 2.0 (.glb)` |
| `.max` | X | 3ds Max → FBX export → `.fbx` 로드 또는 GLB 변환 |
| `.fbx` | O (호환 모델) | FBX 호환성 문제시 GLB 변환 |
| `.glb` | O | **웹에서 권장하는 표준 중간 포맷** |

Blender CLI를 설치했다면 동봉 `tools/blender_to_glb.py`로 변환할 수 있습니다.

```sh
# Blender 소스 열기 + GLB 내보내기
blender -b my_model.blend --python tools/blender_to_glb.py -- --output my_model.glb

# FBX 파일을 Blender에서 임포트하고 GLB로 변환
blender -b --python tools/blender_to_glb.py -- --input my_model.fbx --output my_model.glb
```

`.max`는 Blender로 직접 열 수 없습니다. 3ds Max에서 먼저 FBX로 내보내야 합니다.

## UV Flow 사용법

1. 모델 불러오기 → 상단 `Checker` 또는 `UV Grid`를 누르거나 Material 탭에서 `Base Color` 이미지 업로드.
2. 오른쪽 `UV & Flow` 탭 선택 → UV 채널 지정.
3. `Flow speed X=0.25`, `Flow speed Y=0.00` 입력 후 `▶ UV Flow Play`.
4. `+X`: U축 증가 방향으로 **패턴이 이동**합니다. 일반적인 `Texture.offset.x += speed`는 패턴의 시각적 이동이 반대이므로 내부에서 부호를 보정합니다.
5. Offset X/Y는 초기 위치, Repeat U/V는 타일 수입니다. `Reset offset`은 이동을 원점으로 돌립니다.
6. 기본적으로 연결된 모든 텍스처 슬롯의 샘플링 위치가 함께 바뀝니다. 단일 슬롯만 이동하려면 체크박스를 해제하세요.
7. UV Layout에서 채널별 UV 와이어 구조를 검사하고 PNG로 저장할 수 있습니다.

> UV가 없는 모델에는 체크 패턴이 정상적으로 펼쳐지지 않습니다. `Inspector`의 UV Missing 상태를 먼저 확인하세요. GLB의 UV1/UV2 등 채널이 없는 경우도 동일합니다.

## 범위 및 알려진 제한

- **실행에 인터넷이 필요합니다.** Three.js `0.186.0` 모듈과 Draco 디코더를 jsDelivr CDN에서 가져옵니다. 첫 로딩만 되는 '오프라인 앱'이 아닙니다.
- WebGL이 가능한 최신 Chrome/Edge/Firefox 브라우저 권장. 모바일 성능은 기기 GPU와 모델 복잡도에 따라 달라집니다.
- 3D 자산 내 **Draco/Meshopt GLB** 해제 지원을 연결했지만, **KTX2/BasisU 압축 텍스처**는 별도 트랜스코더 연결 전까지 지원되지 않습니다.
- 디버그 Normal Vector는 **선택/첫 메시 15,000 position vertices 이하**에서만 표시합니다. 성능 보호를 위한 제한입니다.
- Wireframe은 메시마다 약 **18만 트라이앵글** 이하에서만 오버레이합니다. 높은 밀도의 모델은 Material/Normal/통계로 검사하세요.
- `Normal Color`는 표면 노멀 색상, `Normal/Tangent vectors`는 벡터 선입니다. Tangent 표시에는 모델에 tangent attribute가 있어야 합니다. 누락된 tangent를 임의 재생성하지 않습니다.
- `UV Stretch`는 각 메시의 world area / UV area의 **선형값**을 계산하고 메시별 **중앙값(median)**에 대한 로그 편차를 색상으로 표시합니다. 파랑=UV가 상대적으로 촘촘, 초록=중앙값, 빨강=UV가 상대적으로 부족(늘어짐). 0 UV area/정상 데이터 없는 면은 회색입니다. **절대 texel density나 UV Overlap 검사와 다릅니다.**
- Heatmap은 18만 triangles/mesh를 초과하면 성능 보호를 위해 회색으로 표시됩니다. 전체 요약도 최초 최대 18만 triangles 범위 내 메시를 대상으로 계산하며 생략한 메시 개수를 알립니다.
- `Vertex RGBA`는 원본 color attribute의 RGB 및 R/G/B/A 채널을 회색조로 확인합니다. RGB 타입(알파 미포함)의 A 채널은 별도 값이 없다고 표시합니다(핑크 표시). Vertex Color 부재는 중립 회색으로 보입니다.
- 다중 재질 메시의 UV Grid/Checker/Normal 디버그 표시에서 geometry.groups의 materialIndex를 보존하도록 디버그 재질을 복제 매핑합니다.
- `Draw Calls`는 모델 단독 측정이 아니라 **뷰포트 장면의 렌더 호출 수**입니다. `Vertices`는 geometry의 Position attribute 카운트이므로 DCC에서 말하는 유니크 토폴로지 정점 수와 다를 수 있습니다.
- UV 2D Preview는 2만5천 삼각형/메시 수준으로 샘플링하여 초고밀도 모델의 브라우저 부담을 줄입니다. Export도 동일 샘플링이 적용됩니다.
- 파일 무결성·재질 호환성은 내보내기 옵션마다 다릅니다. FBX/DAE/3DS처럼 구조 복잡한 자산에서는 애니메이션과 재질을 완전히 재현하지 못할 수 있습니다.
- 텍스처의 Y 플립은 **다음에 업로드하는 텍스처부터** 적용됩니다. 서로 다른 DCC 포맷의 이미지 방향이 다르면 이 옵션을 확인하세요.
- 오프셋/재질 변경은 **뷰어 안에서의 프리뷰**이며 원본 3D 파일을 수정하거나 역으로 FBX/GLB를 내보내지 않습니다.
- 사용자 모델은 직접 서버에 전송하지 않지만, Three.js 스크립트/압축 디코더는 CDN에서 가져옵니다.

## 테스트

```sh
npm test
```

`node --test`로 UV 이동 부호, 정점/삼각형 카운트, UV 채널/범위 등을 검사합니다. 정적 HTML/CSS 레이아웃은 데스크톱·모바일 크기로 검사했습니다. **이 실행 환경에서는 CDN과 로컬 HTTP 접속이 차단되어 Three.js 런타임 모델 로딩 E2E 검사는 수행하지 못했습니다.** 공개 GitHub Pages에 게시한 뒤 실제 FBX/OBJ/GLB 모델 로딩을 확인해야 합니다.

## 프로젝트 구조

```text
index.html                    정적 GitHub Pages 진입점
styles.css                    반응형 UI
src/app.js                    렌더 루프/UI/재질/애니메이션/선택
src/model-loaders.js          모델 로더/종속파일 URL 매핑
src/analysis.js               2D UV 레이아웃/모델 검수
src/uv-utils.js               UV 계산/통계 (단위 테스트 가능)
src/procedural.js             데모 리본/토러스/체커 텍스처
features TODO: see HANDOFF.md
```

## 기술 / 참고

- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
- [Three.js FBXLoader](https://threejs.org/docs/pages/FBXLoader.html)
- [Three.js LoadingManager](https://threejs.org/docs/pages/LoadingManager.html)
- [GitHub Pages 배포 가이드](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

MIT License.


## v0.2.0 변경 내역 (2026-10-08)

- UV Stretch Heatmap 추가: 면별 UV 면적/메시 표면적 상대 편차, 분석 예산 및 예외처리
- Vertex RGBA 시각화: RGB + 개별 R/G/B/A 그레이스케일, 원본 색상 비파괴
- Tangent Vector 디버그 표시: tangent 속성을 가진 메시 (15k vertices 한도)
- VFX UV Flow 프리셋 8종 추가 (Right/Left/Up/Down/Aura/Waterfall/Heat/Diagonal)
- 멀티 머티리얼 geometry.groups 디버그 뷰 이슈 수정
- 라이브 파일 교체 시 GPU 디버그 지오메트리 정리, 13개 단위 테스트

> GitHub Pages는 기존 설정 `main / (root)`를 유지하고, `src/mesh-diagnostics.js` 파일도 함께 업로드해야 합니다.

## v0.3.0 (2026-10-08) · Wireframe / Vertex Alpha / Material Lab

**Online:** https://kdc916.github.io/Model-Inspector/ · **Repository:** https://github.com/kdc916/Model-Inspector

### 화면에서 사용할 위치

1. 모델을 불러온 후 뷰포트 상단 **Wire** 버튼을 누르면 재질 위로 Wireframe Overlay가 표시됩니다. Inspector에서 Wire opacity / Wire color / X-Ray를 조절합니다. 선은 18만 삼각형 이하 메시의 원본 topology를 참조하며 표면/뒷면을 확인할 수 있습니다. Deform된 SkinnedMesh의 와이어 경계는 현재 원본 바인드 형상을 반영할 수 있습니다.
2. 뷰포트 상단 **Vertex Alpha**를 누르면 RGBA의 A 채널을 흑백으로 확인합니다. **검정 0 = 투명 / 흰색 1 = 불투명**. Inspector의 Vertex Alpha 통계에서 min/max/avg와 transparent/partial/opaque 샘플 수, 채널이 없는 RGB-only 메시를 구분합니다. 데모의 VFX Ribbon에는 검사용 RGBA가 저장되어 있습니다.
3. 우측 **Material** 탭의 Apply to (All meshes / Selected mesh only) 선택 후 텍스처 슬롯을 클릭하여 파일을 올립니다. 슬롯의 × 버튼으로 선택 범위의 텍스처를 제거할 수 있습니다. UI 슬롯 표시명은 마지막 편집 상태이며 일부 선택만 편집한 경우 메시별 상태를 완전히 표현하지 않습니다.
4. 우측 슬라이더로 **Base Color Intensity / Roughness factor / Metallic factor / Normal Strength / AO Intensity / Emissive Intensity + Tint / Bump Scale / Displacement Scale + Bias / Opacity / Alpha Clip threshold**를 조절합니다. **Transparency mode**는 Opaque / Alpha Blend / Alpha Clip입니다.
5. 모든 텍스처의 UV Flow는 기존 **UV & Flow** 탭에서 계속 사용할 수 있습니다. 오프셋과 Repeat은 편집용 재질의 텍스처에만 반영되고 원본에는 영향을 주지 않습니다.

### 텍스처 매핑 규칙 및 제약

| Slot | Internal material property | 주의사항 |
|---|---|---|
| Base Color | `map` | sRGB · Material color/intensity와 곱해짐. RGBA A를 사용하려면 Blend/Clip |
| Normal | `normalMap` | Linear, strength는 normalScale. 음수로 X/Y 축 동시 반전 |
| Roughness | `roughnessMap` | Linear · **G 채널**, roughness factor와 곱해짐 |
| Metallic | `metalnessMap` | Linear · **B 채널**, metallic factor와 곱해짐 |
| Emissive | `emissiveMap` | sRGB · emissive color 및 emissive intensity |
| Opacity | `alphaMap` | Linear · **G 채널**, alpha mode/opacity를 지정 |
| Ambient Occlusion | `aoMap` | Linear · **R 채널**, UV 채널 유무 확인. AO intensity |
| Bump | `bumpMap` | Linear · Bump Scale (Normal Map 사용 시 Normal 우선) |
| Height / Displacement | `displacementMap` | Linear · 실제 정점을 이동. 메시 subdivision 없이 실루엣 세부 묘사 증가 불가 |

**파일 호환성:** PNG/JPG/WebP/BMP/AVIF/GIF/TGA/DDS는 브라우저·Three.js 디코더 지원 범위 안에서 사용할 수 있습니다. PBR 텍스처 전용 HDR/EXR/KTX2 디코더 및 채널 분리 ORM 패킹은 v0.3.0에 포함되지 않습니다.

**브라우저 미검증 범위:** 이 실행 환경에서는 라이브 Three.js CDN 접근/실제 WebGL 모델 렌더링 테스트를 완료하지 못했습니다. 테스트 `npm test`와 정적 JS 문법 검사는 통과했지만, 배포 브라우저에서 파일별 로딩·셰이더 동작을 추가 확인해야 합니다.


## v0.4.1 FBX Vertex Alpha import hotfix (2026-10-08)

`FBXLoader` (Three.js r186) parses FBX `LayerElementColor` as RGBA but writes only RGB into the mesh `color` BufferAttribute. That causes the inspector to report a missing alpha even when the FBX does contain vertex alpha. This is a **loader limitation**, not necessarily a 3ds Max export mistake.

The inspector now reads the uploaded FBX's original `LayerElementColor.a` (ASCII or binary FBX v7, including compressed binary arrays) and recreates a standalone `alpha` BufferAttribute on the matching mesh. It uses polygon-corner index mapping and the same `ShapeUtils.triangulateShape()` path used by the bundled Three.js FBXLoader, so quads/ngons are handled as triangles correctly. It does **not** fabricate alpha from RGB and does **not** modify the original FBX on disk.

**Tested input:** `Fx_Mesh_Circle01_AlphaSide.FBX` (provided privately by the user, NOT stored in this repository) includes 756 RGBA corner records with alpha values 0 / 0.1509 / 0.882416 / 1. The recovery check reconstructs 1,092 triangle vertices and confirms values from black through white.

**Known limitation:** a multi-mesh FBX with several same-size unnamed geometries can be ambiguous; no uncertain alpha assignment is performed. Skinned/morph/complex FBX variants require browser-level model comparison. The source FBX is never uploaded to the app's server; all analysis runs locally.

## v0.5.0 — Vertex Alpha Overlay + Blending

`V.Alpha` (in viewer toolbar) toggles Vertex Alpha on top of **Material, Checker, or UV Grid** while keeping underlying textures and UV Flow active. The Inspector allows a red→green tint (`A=0` red / `A=1` green), grayscale mix, or texture-only mask with adjustable strength. The bottom checkbox is synchronized.

Under **Material → Transparency**, choose:

- **Opaque:** fully opaque surface; preview ignores alpha for transparency but tint/grayscale debug remains available.
- **Alpha Blend:** standard see-through. Enabling `V.Alpha` multiplies the underlying texture/material opacity by the FBX/GLB vertex alpha when supplied.
- **Additive:** additive light blending (typical VFX aura/glow). The alpha and overall opacity scale its contribution.
- **Alpha Clip:** transparent fragments below the slider cutoff are discarded, also using vertex alpha when enabled.

The existing dedicated `Vertex Alpha` view remains an absolute black–white diagnostic. Missing alpha is reported instead of treated as white. Tested with Node unit tests; Three.js CDN access is required for the browser app. The visual blending is a Three.js approximation and may differ from engine-specific material/shader settings.

## v0.8.0 · VFX Production Workflow (2026-10-08)

이 버전은 0.5.0 안정 기능을 유지하면서 0.6~0.8 기능을 함께 통합한 릴리스입니다.

### 0.6 · Material Studio

- `Opaque / Alpha Blend / Additive / Premultiplied / Multiply / Screen / Alpha Clip` 블렌딩 모드
- ZTest, ZWrite, Cull Front / Back / Off 제어 (Three.js 근사 프리뷰이며 Unity·Unreal 픽셀 연산과 완전 동일하다는 의미는 아님)
- Opacity Map RGBA 채널(R/G/B/A) 마스킹 및 Invert. 기존 FBX Vertex Alpha와 곱하여 프리뷰
- 슬롯별 UV0~UV3, Flow Speed X/Y, Offset X/Y, Repeat X/Y. `Individual UV Flow`를 켜면 기존 글로벌 UV Flow 대신 사용하며 상단 UV Flow Play 버튼으로 재생
- UnrealBloomPass 기반 HDR Bloom 프리뷰: Strength / Threshold / Radius. 밝은 픽셀에 적용되며 특정 엔진의 씬 색 관리·Glow와 다른 결과가 나올 수 있음

### 0.7 · Animation & Diagnostics

- Base Color/Emissive/Opacity 슬롯의 Atlas Flipbook: columns, rows, FPS, Loop, 프레임 진행 표시. 활성화되면 자동 재생하며 글로벌 UV Flow Play 상태와 독립적임
- UV 진단: 뒤집힌 UV의 signed area, 퇴화 UV, 후보 삼각형 중첩 **면적 검사**, 비정상/반대 방향 노멀. 상단 Inspector의 `UV 품질 분석` 버튼으로 수동 실행
- 중첩은 VFX에서 의도적인 경우가 많아 경고·통계로만 표시. 5,000 triangles/mesh 샘플 상한, 높은 밀도의 형상에서는 `partial` 표시

### 0.8 · Production Workflow

- Workflow 탭: JSON 설정 저장·불러오기 (텍스처 이미지 바이트 미포함, 텍스처 재업로드 필요)
- 2번째 모델 불러오기: 오른쪽에 배치하고 트라이앵글·정점·머티리얼·UV·Vertex Alpha 유무를 비교
- Production QA JSON 리포트: 모델별 메시·UV·Vertex Alpha·노멀 통계와 비교 자료
- GLB/glTF KTX2/BasisU 압축 텍스처 디코더, 업로드 `.ktx2` 텍스처 지원. jsDelivr의 Basis 트랜스코더 연결 및 호환 GPU/WebGL 환경 필요
- 주요 계산 분리: `production-core.js`, `preset-workflow.js`, `uv-diagnostics.js`, `asset-report.js`. 기존 FBX Alpha 복원, PBR, Checker, UV, 폴리곤 검사는 유지

### 주의할 점

- 이 도구는 **실제 Unity/Unreal 렌더 파이프라인 자체가 아니므로** 1:1 블렌드·깊이·톤매핑 일치가 보장되지 않습니다.
- 세컨드 모델은 시각적으로 옆에 배치해 비교하며 씬에서 추출한 정적 메시 데이터 기준입니다. 자동 메시 디프·정점 대응, 애니메이션 리타겟, 재질 바이너리 비교는 지원하지 않습니다.
- 일부 포맷은 변환기/인코더에 따라 커스텀 머티리얼·FBX 레이어가 유지되지 않을 수 있습니다.
- 프리셋은 **제어 값만** 보관하고 모델, 이미지 파일, 임포트 환경은 포함하지 않습니다.
- UV 중첩은 계산 예산으로 샘플링합니다. UDIM / 반복 타일링 / 0–1 밖 UV도 있지만 본 검사에서는 전 타일을 자동 정규화하지 않습니다.
- Three.js 스크립트와 일부 트랜스코더를 CDN에서 불러오므로 인터넷 연결이 필요합니다. 순수한 오프라인 단일 HTML은 아닙니다.
- 자동 테스트와 정적 검사는 통과해야 게시합니다. 실측 WebGL 결과는 브라우저/GPU/파일에 따라 별도 검증이 필요합니다.

```bash
npm test
python -m http.server 8000
# http://localhost:8000/
```

## v0.8.1 · Vertex Alpha & Pivot QA Patch (2026-10-08)

- **Vertex Alpha가 실제 텍스처에서 투명도를 제거/반영합니다.** `V.Alpha` ON → Material/Checker/UV Grid의 원본 색상 유지 + A=0 완전 투명, A=1 완전 불투명. 사용 중인 재질이 Opaque여도 **미리보기 한정** Alpha Blend가 자동 활성화됩니다. OFF 시 원래 Opaque 렌더 상태로 복귀합니다.
- `Visualization` 기본값을 `Apply Alpha · original texture`로 변경. 이전 적/녹색 Tint 및 Grayscale은 **별도 진단용 옵션**으로 유지하며, 선택 시에도 Vertex Alpha를 실제 투명도에 적용합니다.
- FBX 복구 RGBA 및 glTF 기본 RGBA에서 **알파를 두 번 곱하지 않도록** `vertexColors` 여부를 검사합니다. RGB-only 모델은 알파 데이터를 자동 생성하지 않으며 경고/누락 진단은 유지합니다.
- `World Axis` / `Mesh Pivot` 독립 ON/OFF. 월드 축은 (0,0,0), 피벗은 선택 메시 / 전체 메시(최대 64개) / 모델 루트 중 고를 수 있습니다. X(빨강)·Y(초록)·Z(파랑) 화살표와 로컬 방향 및 원점 표시. 메시의 이동·회전을 따라갑니다.
- `Gizmo relative size`로 **모델 월드 바운딩 크기에 비례한 길이**를 0.05~1.5 범위에서 조절. 선택 메시의 피벗 월드 위치/로컬 위치/월드 XYZ 회전값을 Inspector에서 조회할 수 있습니다.
- 오류 수정: 모델 임포트 시 `root.position=(0,0,0)`으로 강제 덮어쓰던 처리를 제거해 원본 루트 위치·피벗을 보존합니다.
- `render-state.js`(순수 렌더 블렌딩 상태), `scene-guides.js`(World/Pivot Gizmo), `alpha-preview.js`(알파 처리)를 분리해 회귀 테스트를 강화했습니다.

**수동 검증 권장:** `Fx_Mesh_Circle01_AlphaSide.FBX`의 `V.Alpha + Checker + Opaque`, `V.Alpha + User Texture + Opaque`, `V.Alpha + Additive`, `V.Alpha OFF 복구`, 메시 회전/애니메이션의 피벗 방향과 Gizmo 크기를 Edge/Chrome에서 확인하세요. 이 로컬 테스트 환경은 Three.js CDN 접근이 차단되어 실시간 WebGL 픽셀 캡처가 아직 검증되지 않았습니다.
