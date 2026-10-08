# maxVFX Model Inspector — v0.2.0 Cumulative Handoff

**날짜**: 2026-10-08  **리포지토리**: https://github.com/kdc916/Model-Inspector  **배포**: https://kdc916.github.io/Model-Inspector/

## 개발 목표/맥락
- 게임 VFX 아티스트의 Unity 6 / Unreal 에셋 사전 검수용 경량 정적 3D 뷰어.
- 로컬 브라우저에서 FBX, OBJ, GLB/glTF, STL, PLY, 3DS, DAE, 3MF 모델 및 종속 텍스처 선택.
- UV/폴리곤/노멀/버텍스 컬러/탄젠트 데이터 검사, PBR 텍스처 업로드, UV offset 흐름 확인.
- `.max`, `.blend` 브라우저 직독 불가. DCC에서 FBX/GLB 변환.

## v0.1.0 기존 기능 (유지)
- 렌더러, 궤도 카메라, 메시/씬 계층 선택, UV0~UV3 와이어 PNG, PBR 텍스처/노출, 노멀/와이어 모드.
- FBX/OBJ/GLB/glTF/STL/PLY/3DS/DAE/3MF 로더와 GLTF 종속파일 Blob 매핑, 애니메이션, UV Flow.
- 기본 6개 유닛 테스트, 화면 캡처, GitHub Pages 호환.

## v0.2.0 구현
1. `src/mesh-diagnostics.js`: 순수 BufferGeometry 호환 분석 모듈.
   - 삼각형당 `sqrt(worldArea / abs(uvArea))`를 측정하고 메시별 중앙값 대비 `log2(scale / median)`로 왜곡 정도 계산.
   - ±0.75 stop 이상 면을 outlier로 표시. 퇴화 UV/기하 및 입력 누락 처리, 180k faces/mesh 제한.
   - 각 triangle corner마다 색을 매겨 Indexed geometry의 공유 정점 때문에 면별 색이 평균화되지 않도록 임시 `toNonIndexed()` 지오메트리로 표시.
2. Vertex Color RGB 및 개별 R/G/B/A 검사. 컬러 채널용 임시 복제 지오메트리 사용, 원본 BufferGeometry 유지.
3. `VertexTangentsHelper`를 이용한 tangent attribute 벡터 디버그. 15,000 vertices limit.
4. UV Flow 프리셋 8종 (이동 속도, 타일 반복 설정). 속도만 변경해도 Phase jump 방지.
5. Geometry.groups에서 materialIndex가 0보다 큰 면도 보이도록 디버그 재질 배열 적용.
6. 기존 이미지 업로드/UV 애니메이션/메시 선택 유지.

## 검증 / 제한
- Node 단위 테스트 13개, `node --check` 통과.
- 실 CDN에서 Three.js를 로드하는 통합 GUI 테스트는 로컬 테스트 환경의 외부 DNS 제한으로 수행하지 못함. 배포 브라우저 실물 테스트 필요.
- UV Stretch는 텍스처 해상도와 독립된 **메시별 상대 왜곡**이며 texel density/UV overlap 절대 진단 아님.
- 임시 디버그 지오메트리로 인한 메모리 사용을 제한하고 모드 변경/모델 교체 때 dispose.
- 18만 삼각형 초과 메시에서는 UV Stretch 시각화 대신 중립 회색. 전체 Inspector 집계 또한 18만 삼각형 예산을 넘는 메시 생략.
- Skinned/Morph 애니메이션은 기본 렌더에서 지원 가능하나, UV Stretch 분석의 world-space position은 바인드 포즈 기반임.
- `.blend`/`.max` 직독 불가. 인터넷 연결 필요(Three.js CDN/Draco decoder).

## 남은 우선순위
1. 실제 FBX, GLB, OBJ 예제 로딩/모바일 GPU 런타임 E2E.
2. Skinned deforming model에 대한 UV Stretch 정확도 개선, UDIM 2D tile preview, UV overlay.
3. Normal/Tangent/Binormal handedness 기즈모, Vertex Alpha 사용 시 blending 검토.
4. 특정 메시 영역 히트 테스트 및 카메라 포커스 개선, GPU 메모리/DrawCall 베이스라인.
5. GLB export(재질 미리보기 베이크 범위 합의 필요), batch report JSON/CSV.

## 배포 가이드
- 저장소 root에 `index.html`, `styles.css`, `src/`, `tests/`, `tools/`, `README.md`, `package.json`, `.nojekyll` 포함.
- Settings → Pages → Deploy from a branch → main → /(root). 기존 사용자 설정 유지.
- `npm test`는 Node 20+ 단위 테스트, 정적 서빙은 `python -m http.server 8000`.
- GitHub 커밋 확인 및 실배포 URL은 별도 확인 후 사용자에게 알림.
