# 단계: 설계

기능: $FEATURE

## 출력 (이 파일 하나만 쓴다)
$WORK/DESIGN.md

## 입력 (읽기만, 절대 수정 금지)
- $ROOT/CLAUDE.md — 불변식·코딩 규칙·함정. **가장 먼저 읽는다**
- $ROOT/HANDOFF.md — 프로젝트 배경과 아키텍처 근거
- $ROOT/MILESTONES.md — 확정된 설계 결정 표, 현재 진행 위치
- $ROOT/src/ — 실제 코드

## 할 일
1. 위 문서와 `$ROOT/src` 의 관련 코드를 읽고 현재 구조를 파악한다.
2. 이 기능의 설계를 `$WORK/DESIGN.md` 에 쓴다.

## DESIGN.md 필수 섹션
- STATUS 라인 (첫 줄)
- 변경 대상 파일 목록 (경로 명시, 신규/수정 표시)
- 공개 인터페이스 (함수 시그니처 / API 스펙 / Prisma 스키마 변경)
- 데이터 흐름 (입력 → 처리 → 출력)
- 검증 기준: 이 기능이 "됐다"는 걸 무엇으로 확인하는지 케이스 수준으로.
  **타입·빌드로 확인되는 것과 사람이 브라우저에서 확인해야 하는 것을 나눠서 쓴다**
  (아래 "이 저장소의 제약" 참조)
- 하지 않는 것 (범위 밖 명시)

## 이 저장소의 제약 — 설계가 여기에 걸리면 방향을 바꿔라

**절대 무너뜨리지 않는다** (근거는 HANDOFF.md):
- `Document` 와 `DocumentVersion` 은 분리 유지. "최신 버전"은 컬럼이 아니라 `versionNo desc` 정렬
- 1문서 = 1파일
- 파일은 앱 서버를 거치지 않는다 (업로드 presigned PUT, 다운로드 presigned GET)
- 접근 제어는 디스코드 길드 멤버십 하나뿐. 역할·권한 개념 추가 금지
- 보호 구간 이중 검사: `src/proxy.ts` 는 낙관적 확인, 실제 보호는 서버 컴포넌트의 `getSession()`

**범위 밖** (제안하지 말 것): docx/xlsx 미리보기 · 파일 내용 전문 검색 · 버전 롤백 버튼 ·
문서 상태 라벨 · 문서별 세부 권한 · 한 문서에 여러 파일 · 모바일 업로드

**Next 16 은 학습 데이터와 다르다.** Next 16 기능(라우팅·캐싱·proxy·서버 액션 등)을
설계에 넣으려면 `$ROOT/node_modules/next/dist/docs/` 의 해당 문서를 **먼저 읽고**
근거를 DESIGN.md 에 `파일:줄` 로 남긴다. `middleware.ts` 는 `proxy.ts` 로 바뀌었다.

**Prisma 7 은 6과 다르다.** `datasource` 에 `url` 을 쓸 수 없고 `prisma.config.ts` 로
옮겨졌다. 드라이버 어댑터 필수(`@prisma/adapter-pg`). import 경로는
`@/generated/prisma/client`.

**검증 수단은 vitest 하나뿐이다.** `npm test` = `vitest run`, node 환경,
`src/**/*.test.ts` 만 수집한다. jsdom 이 없어서 **React 컴포넌트 렌더 테스트는 못 쓴다.**
`.env` 는 gitignore 대상이라 없을 수 있고 있어도 더미 값이라 **DB·S3·디스코드에 실제로
붙는 검증은 불가능하다.**

따라서 검증 기준을 쓸 때 두 가지로 나눠라:
- **[테스트 가능]** — 순수 함수·직렬화·정렬·분기 로직처럼 mock 만으로 돌릴 수 있는 것
- **[사람 확인 필요]** — 브라우저 동작·실제 업로드·OAuth 왕복처럼 못 돌리는 것

설계할 때 **검증 가능한 쪽으로 구조를 밀어라.** 로직을 컴포넌트나 라우트 핸들러
안에 묻지 말고 `src/lib/` 의 순수 함수로 빼면 그만큼 [테스트 가능] 으로 넘어간다.

## 게이트에 걸리는 것 — 설계에 넣지 말고 STATUS: BLOCKED 로 올려라
- npm 패키지 추가/제거
- Prisma 스키마 변경 (마이그레이션이 필요한 것)
- 공개 API(라우트 시그니처) 변경
- `DATABASE_URL` 의 `connection_limit=5` 에 영향을 주는 것
  (이 RDS 는 hymn 이 쓰는 인스턴스를 빌린 것이고 `max_connections` 가 79뿐이다)

## 금지
- 코드를 쓰지 않는다. 시그니처와 스펙까지만.
- 설계에 필요한 정보가 없으면 추측하지 말고 STATUS: BLOCKED.
