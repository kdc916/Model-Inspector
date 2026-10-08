# maxVFX Model Inspector — 누적 Handoff v0.4.0

- 기준 저장소: https://github.com/kdc916/Model-Inspector
- GitHub Pages: https://kdc916.github.io/Model-Inspector/
- 프레임워크: Vanilla HTML/CSS/ES Modules, Three.js 0.186.0 CDN, GitHub Pages main/root.
- 기준 소스: v0.3.0 GitHub main 커밋 f7dec091aa2d191c39b555c14e01729a219e66d2.

## v0.1.0 ~ v0.3.0 누적 요약

- 로더: GLB/glTF, FBX, OBJ, STL, PLY, 3DS, DAE, 3MF. .max/.blend는 직접 열기 미지원.
- UV Checker/Grid/Flow/Stretch, 파일 연결, 재질 업로드, 노멀/탠젠트, 메시별 통계, 와이어프레임, Vertex RGBA, PBR 9종 슬롯.
- v0.2.0 UV Stretch, Vertex RGBA, Tangent, 프리셋.
- v0.3.0 와이어 오버레이, alpha 진단, 9종 텍스처, 재질 강도/투명도.

## 이번 v0.4.0 변경

1. **핵심 버그:** RGB만 가진 모델의 alpha 프리뷰를 `1(white)`으로 합성하던 처리 제거. `extractVertexColors(...,'a')`는 알파가 없으면 null. `updateDisplayMaterial`은 핑크 missing-alpha 재질을 별도 사용.
2. `readColorComponent`에서 Float 및 정규화 여부에 따른 UInt8/UInt16 정규화 지원. `locateVertexAlpha`가 color.a 또는 명시적 alpha 어트리뷰트 판독. 가짜 채널은 생성하지 않음.
3. `analyzeVertexAlpha`가 min/max/avg/black/partial/white/invalid, all-white, all-black, rgb-only, varying-alpha 상태를 구분. 뷰포트 경고 및 Inspector 진단.
4. `btnAlphaReport`: 현재 선택 범위의 Geometry alpha 보고서 JSON 다운로드. 원본 FBX 원시 바이트 검사는 아님.
5. ORM Packed 텍스처 R/AO, G/Roughness, B/Metalness 할당. 노멀맵 Y 반전 기능.
6. 선택 메시의 서브 Material ID 선택 후 텍스처 및 수치 편집. 슬라이더 단일 파라미터만 갱신하여 기타 채널 임의 초기화 방지.
7. HTML/JS/CSS, 테스트, README 업데이트.

## 테스트

- `npm test` -> 27/27 통과. 특히 검정 A=0, RGB-only, all-white, 명시적 alpha attribute, raw Uint8, ORM 채널 규약을 검증함.
- JS `node --check` 및 DOM 참조/중복 ID 확인.
- 실 FBX 파일/브라우저 WebGL End-to-End 테스트는 해당 모델이 없고 제한된 인터넷 환경이므로 미완료. 사용자 문제의 실제 FBX 익스포터 원인은 확정할 수 없음.

## 다음 개발 우선순위

- 사용자의 **문제 FBX 파일** 확보 후 내부 Vertex Alpha(-2), LayerElementVertexColor, Export 버전, FBXLoader 해석 결과 비교 및 필요 시 로더 확장.
- 선택 메시별 수치 UI 역동기화, ORM 단일 텍스처 선택 시 슬롯별 미리보기.
- 실제 FBX/GLB fixture를 포함한 Chrome/WebGL 자동 브라우저 테스트 및 모바일 대형 모델 성능 측정.

## 인수인계와 패키징

- ZIP 전체 소스 + 본 MD를 함께 제공. GitHub에 파일 업로드 후 Pages 배포 상태 검사.
- 원본 모델은 클라이언트 로컬에서 로딩하고 별도 서버로 업로드하지 않음.
- CDN 의존성으로 인터넷 미연결 환경에서는 Three.js 초기화가 불가.
