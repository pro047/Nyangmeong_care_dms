### 입력 문서
- $ROOT/CLAUDE.md — 불변식·코딩 규칙·함정. **가장 먼저 읽는다**
- $ROOT/HANDOFF.md — 프로젝트 배경과 아키텍처 근거
- $ROOT/MILESTONES.md — 확정된 설계 결정 표, 현재 진행 위치
- $ROOT/src/ — 실제 코드

공개 인터페이스에는 Prisma 스키마 변경도 포함한다. 검증 기준을 쓸 때는
**타입·빌드로 확인되는 것과 사람이 브라우저에서 확인해야 하는 것을 나눠서 쓴다**
(아래 "이 저장소의 제약" 참조).

### 이 저장소의 제약 — 설계가 여기에 걸리면 방향을 바꿔라

**절대 무너뜨리지 않는다** (근거는 HANDOFF.md):
- `Document` 와 `DocumentVersion` 은 분리 유지. "최신 버전"은 컬럼이 아니라 `versionNo desc` 정렬
- 1문서 = 1파일
- 파일은 앱 서버를 거치지 않는다 (업로드 presigned PUT, 다운로드 presigned GET)
  - **예외: MCP 웹챗 읽기** (2026-09-13 사람 결정) — 서버가 S3 에서 받아 텍스트로 바꿔 도구
    응답에 싣는다. 텍스트(html·md·csv·txt)·xlsx, 원본 1MB 이하. 올리기는 여전히 PUT 직결.
    근거는 `MILESTONES.md` 설계 결정 표 '웹챗 읽기' 행
- 접근 제어는 디스코드 길드 멤버십 하나뿐. 역할·권한 개념 추가 금지
- 보호 구간 이중 검사: `src/proxy.ts` 는 낙관적 확인, 실제 보호는 서버 컴포넌트의 `getSession()`

**범위 밖** (제안하지 말 것): docx 미리보기 · 파일 내용 전문 검색 · 버전 롤백 버튼 ·
문서 상태 라벨 · 문서별 세부 권한 · 한 문서에 여러 파일 · 모바일 업로드
(xlsx 미리보기는 2026-08-28 에 이미 들어갔다. 문서 한 건을 텍스트로 돌려주는 것은 전문 검색이 아니다)

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

### 게이트에 걸리는 것 (이 저장소 추가분) — 설계에 넣지 말고 STATUS: BLOCKED 로 올려라
- npm 패키지 추가/제거
- Prisma 스키마 변경 (마이그레이션이 필요한 것)
- 공개 API(라우트 시그니처) 변경
- `DATABASE_URL` 의 `connection_limit=5` 에 영향을 주는 것
  (이 RDS 는 hymn 이 쓰는 인스턴스를 빌린 것이고 `max_connections` 가 79뿐이다)

### 짝 테스트 파일
짝이 되는 테스트 파일은 `*.test.ts` 다 (소스 옆, 예: `src/lib/format.ts` ↔ `src/lib/format.test.ts`).
(2026-09-13 `mcp-upload`: `api/mcp/route.ts` 만 넣고 `route.test.ts` 를 빠뜨려 판단검증부터 재주행)
