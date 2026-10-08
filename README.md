# maxVFX Model Inspector

> 3D Asset Workbench — 브라우저에서 모델 구조, UV, 노멀, PBR 텍스처, UV Flow를 검수하는 도구.
>
> **Version:** 0.1.0 (2026-10-08) · Three.js `0.186.0` 고정 · 별도 백엔드 불필요

## 주요 기능

- **파일 로딩:** GLB, glTF(+ BIN/텍스처), FBX, OBJ(+ MTL/텍스처), STL, PLY, 3DS, DAE, 3MF
- **모델 탐색:** 마우스 회전/패닝/줌, 모델 맞춤, 메시 클릭 선택, Scene Hierarchy, 배경·노출 조절, PNG 캡처
- **메시 분석:** 총 삼각형 수, position 정점 수, 메시 수, Draw Calls, FPS, AABB 크기, UV/노멀 유무
- **디버그 뷰:** Material, UV Checker, UV Grid, Normal Color, Wireframe, Vertex Normal Vector, Double-sided
- **2D UV:** UV 채널 UV0~UV3 선택, 선택 메시/전체 메시 UV 와이어 레이아웃, PNG 내보내기, UV 범위/타일링 확인
- **UV Flow:** X/Y 시각적 이동 속도, 수동 이동, U/V 반복, 재생/일시정지/초기화. +값은 **보이는 텍스처가 해당 방향으로 이동**하도록 오프셋 부호 처리
- **PBR 업로드:** Base Color, Normal, Roughness, Metallic, Emissive, Opacity. PNG/JPG/WebP/TGA/DDS 등. 전체 또는 선택 메시 적용
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
- `Normal Color`는 표면 노멀 색상 시각화이며, Vertex Normal Vector는 벡터 선을 그립니다. UV Stretch Heatmap, 탄젠트 시각화, 이중 UV Diff 뷰는 추후 개발 항목입니다.
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
