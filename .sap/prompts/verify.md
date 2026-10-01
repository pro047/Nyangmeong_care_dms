### 테스트 환경
vitest 4. `npm test` = `vitest run`. 셸은 `npm test`·`npm run lint`·`npm run build` 로 판정한다.

- 테스트 파일: `$ROOT/src/**/*.test.ts` 만 `TEST_FILES` 에 해당한다
- 테스트 파일 위치: 대상 소스 **옆**에 `*.test.ts` (예: `src/lib/format.test.ts`)
- 수집 대상: `src/**/*.test.ts` 만 (`vitest.config.mts`)
- 환경: **node**. jsdom 이 없으므로 **React 컴포넌트 렌더 테스트는 쓸 수 없다.**
  컴포넌트 동작 검증이 필요하면 로직을 순수 함수로 뽑아 그걸 테스트하거나,
  "사람이 확인할 것"으로 넘긴다
- `@/` 별칭은 `src/` 를 가리킨다. 상대 경로 대신 이걸 쓴다
- 전역 API 없음. `import { describe, it, expect, vi } from 'vitest'` 로 명시 import
- 참고 예시: `src/lib/format.test.ts`
- 패키지를 추가하지 않는다 (jsdom·@testing-library 포함). 필요하면 BLOCKED.
- 셸이 지문으로 감시하는 러너 설정: `vitest.config.mts`·`package.json`

**돌릴 수 없는 것** — `.env` 는 gitignore 대상이라 없을 수 있다.
DB·S3·디스코드에 실제로 붙는 테스트는 쓰지 마라. 외부 호출은 `vi.mock` 으로 막는다.
`src/lib/env.ts` 는 import 시점에 zod 로 검증하며 throw 하지만, 테스트에서는 `vitest.config.mts` 의
`test.env` 더미 값으로 통과하므로 `.env` 없이도 뜬다.

### 불변식 회귀 테스트
이번 변경이 아래를 깨뜨릴 수 있는 자리에 있으면 그걸 고정하는 케이스를 넣는다.
해당 없으면 "해당 없음"이라고 쓴다. VERIFY.md 에 위 4개 각각의 결과(넣음 / 해당 없음)를 적는다.
- "최신 버전"은 `versionNo desc` 정렬로 구한다 (컬럼이 아니다)
- 1문서 = 1파일
- 파일이 앱 서버를 거치지 않는다 (presigned PUT/GET)
- 접근 제어는 디스코드 길드 멤버십 하나 (역할·권한 개념 없음)

### 사람 체크리스트
테스트로 못 덮는 것은 "어느 화면에서 무엇을 하면 무엇이 보여야 하는가" 수준의 재현 절차로 쓴다.
