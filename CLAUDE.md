@AGENTS.md

# DMS — 팀 문서 관리 시스템

7인 팀의 프로젝트 문서를 한 곳에서 관리하는 사내 웹앱. 개발자 1명, 사용자 7명.
Next.js 16 · React 19 · TypeScript · Tailwind 4 · Prisma 7 + PostgreSQL(RDS) · S3 · 디스코드 OAuth

> **작업을 시작하기 전에 `HANDOFF.md`를 읽을 것.** 프로젝트 배경, 아키텍처와 그 근거,
> 현재 진행 위치가 거기 있다. 진행 상황의 정본은 `MILESTONES.md`, 셋업 절차는 `SETUP.md`.

## 뭉개면 안 되는 것

근거는 `HANDOFF.md`에 있다. 리팩터링하다 아래를 무너뜨리지 말 것.

- **`Document`와 `DocumentVersion`은 분리 유지.** 재업로드 시 `Document`는 그대로 두고
  `DocumentVersion`만 추가한다. "최신 버전"은 컬럼이 아니라 `versionNo desc` 정렬로 구한다.
- **1문서 = 1파일.** 한 문서에 여러 파일을 붙이지 않는다.
- **파일은 앱 서버를 거치지 않는다.** 업로드는 presigned PUT으로 브라우저 → S3 직접,
  다운로드는 presigned GET. 서버로 받아 중계하는 방식으로 바꾸지 말 것.
- **접근 제어는 디스코드 길드 멤버십 하나뿐.** 역할·권한 개념을 추가하지 않는다.
- **보호 구간은 이중으로 검사한다.** `proxy.ts`는 낙관적 확인이고, 실제 보호는
  서버 컴포넌트의 `getSession()`이 한다.

## 코딩 규칙

- **UI 문구와 코드 주석은 한국어.** 사용자가 전원 한국인 팀이다.
- 주석은 "왜"만 적는다. 코드를 읽으면 아는 "무엇"은 적지 않는다.
- 커밋 전에 `npm run build`를 돌린다 (타입 검사 포함).
- **Next 16 기능을 쓰기 전에 `node_modules/next/dist/docs/`의 해당 문서를 먼저 읽는다.**
- 작업을 끝냈으면 `MILESTONES.md` 체크박스를 갱신한다. 설계 결정을 새로 내렸으면
  같은 파일의 "확정된 설계 결정" 표에 추가한다.

## 함정 (실제로 겪은 것들)

**Next 16: `middleware.ts` → `proxy.ts`.** export 이름도 `middleware` → `proxy`.
구 이름은 deprecated 상태로 아직 동작하지만 곧 제거된다.
`npm run build` 출력의 `ƒ Proxy (Middleware)` 줄로 인식 여부를 확인한다.

**Prisma 7은 6과 다르다.** `datasource`에 `url`을 쓸 수 없고 `prisma.config.ts`로 옮겨졌다.
드라이버 어댑터가 필수다(`@prisma/adapter-pg`). 생성 위치는 `src/generated/prisma`이고
import 경로는 `@/generated/prisma/client`.

**같은 `DATABASE_URL`을 두 파서가 다르게 읽는다.** 어댑터가 필수가 되면서 생긴 함정이다.
"마이그레이션은 되는데 앱만 죽는" 증상이 나오면 여기를 의심한다.

| | 파서 | `sslmode=require` | `connection_limit` |
|---|---|---|---|
| `db push`·`migrate` | Prisma 엔진(Rust) | 검증 **안 함** | 적용됨 |
| 앱 런타임 | `PrismaPg` → node-postgres | **`verify-full`로 취급** | **무시됨** |

그래서 `.env`에 `uselibpqcompat=true`가 필요하다. 빼면 앱만
`P1011 TlsConnectionError: self-signed certificate in certificate chain`으로 죽는다.
터널을 타면 호스트명이 `localhost`라 `verify-full`은 **원리상 통과할 수 없다**.
근거와 M6 대응은 `SETUP.md`의 "두 파서" 절에 있다.

**커넥션 상한은 두 군데에 있고 둘 다 필요하다.** 공유 RDS(`hymn-stg-db`)의
`max_connections`가 **79뿐이다** (2026-08-21 실측). 제한이 없으면 HMR 재연결로
풀이 닫히지 않고 쌓여 **혼자서도 고갈시킬 수 있다.** 위험의 주체는 남이 아니라 나다.

- `src/lib/prisma.ts`의 `new PrismaPg({ ..., max: 5 })` — **앱 런타임**을 막는다
- `DATABASE_URL`의 `connection_limit=5` — **CLI**(`db push`·`migrate`)를 막는다

**둘 중 하나만 두면 안 된다.** Prisma 7은 드라이버 어댑터가 필수라 앱의 풀은
node-postgres 것이고 `max`를 보는데, `connection_limit`은 Prisma 자체 풀(Rust)
파라미터다. 이름이 달라서 **조용히 버려지고 pg 기본값 10이 적용된다** (실측으로 확인).

같은 인스턴스에서 **hymn 백엔드가 `postgres` DB에 커넥션 4개로 돌고 있다.**
DMS는 별도 DB `dms`를 쓰므로 테이블은 안 섞이지만 커넥션 풀은 공유한다.
RDS 인스턴스 설정(파라미터 그룹, 보안 그룹, 마스터 비밀번호)을 건드리지 말 것.

> 이 문단은 원래 "운영 중인 다른 프로젝트 2개가 물려 있다"고 적혀 있었다.
> 2026-08-21 실측 결과 **사용자 DB는 `postgres` 하나뿐이고 붙어 있는 앱도 hymn
> 하나**였다 — `docker ps`의 컨테이너 2개(nginx 프론트 + uvicorn 백엔드)를
> 프로젝트 2개로 옮겨 적은 것으로 보인다. 결론(제한 유지)은 같지만 근거가 달랐다.
> 재확인: `psql ... -c "SHOW max_connections;"`,
> `SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;`

**`.env`에 더미 값이 들어 있다.** 실제 자격증명이 아니므로 로그인·업로드는 동작하지 않는다.
`.env`는 gitignore 대상이고, `.gitignore`의 `!.env.example` 예외를 지우지 말 것
(기본값 `.env*`가 예제 파일까지 무시한다).

**Windows 개발 환경.** git의 LF→CRLF 경고는 정상이다. 셸은 Git Bash.

## 명시적으로 범위 밖

넣자고 제안하지 말 것. 전부 의도적으로 뺐다 (근거는 `MILESTONES.md`).

docx/xlsx 미리보기 · 파일 내용 전문 검색 · 버전 롤백 버튼 · 문서 상태 라벨 ·
문서별 세부 권한 · 한 문서에 여러 파일 · 모바일 업로드
