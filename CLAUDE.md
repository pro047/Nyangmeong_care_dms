@AGENTS.md

# DMS — 팀 문서 관리 시스템

7인 팀의 프로젝트 문서를 한 곳에서 관리하는 사내 웹앱. 개발자 1명, 사용자 7명.
Next.js 16 · React 19 · TypeScript · Tailwind 4 · Prisma 7 + PostgreSQL(RDS) · S3 · 디스코드 OAuth

> **작업을 시작하기 전에 `HANDOFF.md`를 읽을 것.** 프로젝트 배경, 아키텍처와 그 근거,
> 현재 진행 위치가 거기 있다. 진행 상황의 정본은 `MILESTONES.md`, 셋업 절차는 `SETUP.md`.

## 뭉개면 안 되는 것

근거는 `HANDOFF.md`에 있다. 리팩터링하다 아래를 무너뜨리지 말 것.

- **`Document`와 `DocumentVersion`은 분리 유지.** 재업로드 시 `Document`에 쓰는 것은
  **제목 하나뿐**이고(아래), 나머지는 `DocumentVersion`만 추가한다. 파일 정보(`fileName`·
  `s3Key`·`mimeType`·`sizeBytes`)가 `Document`로 올라가면 분리가 깨진 것이다.
  "최신 버전"은 컬럼이 아니라 `versionNo desc` 정렬로 구한다.
  - **제목은 2026-08-28 에 연 예외다.** 현재 제목이 *이전 버전 파일명에서 자동 생성된 값
    그대로*일 때만 새 파일명을 따라간다(`retitleOnReupload`). 사람이 고친 제목은 덮지
    않는다 — 되돌릴 방법이 없다. 판정은 버전 조회에 얹어서 하고 **쿼리를 더 내지 않는다**.
- **1문서 = 1파일.** 한 문서에 여러 파일을 붙이지 않는다.
- **파일은 앱 서버를 거치지 않는다.** 업로드는 presigned PUT으로 브라우저 → S3 직접,
  다운로드는 presigned GET. 서버로 받아 중계하는 방식으로 바꾸지 말 것.
- **접근 제어는 디스코드 길드 멤버십 하나뿐.** 역할·권한 개념을 추가하지 않는다.
  - **삭제와 재업로드는 예외다** (삭제 2026-09-06 · 재업로드 2026-09-07). 문서 삭제
    3종(소프트 삭제·복구·영구삭제)과 **새 버전 올리기**를 **올린 사람**
    (`Document.createdById`)과 `ADMIN_DISCORD_ID` 계정에게만 준다 — 같은 경계를
    `denyIfNotOwner()`(`src/lib/ownership-guard.ts`)가 공유한다. 조회·다운로드·
    제목/설명 수정·태그·폴더는 **여전히 전원 동등**이다 — 범위를 넓히지 말 것.
    소유자는 `DocumentVersion.uploadedById`(그 판을 올린 사람)가 **아니다**;
    그쪽을 쓰면 남의 문서에 재업로드하는 순간 소유권이 조용히 넘어간다.

    > 이 항목은 원래 **재업로드를 "여전히 전원 동등"** 쪽에 적고 있었다 (2026-09-08 정정).
    > 코드는 `225a3e6`(2026-09-07)부터 소유자 전용이고 `MILESTONES.md` 의 '삭제 권한' 행도
    > 그렇게 적혀 있었는데, 이 파일만 안 따라왔다. 근거: `[id]/versions/route.ts:44` 의
    > `denyIfNotOwner(id, session, VERSION_FORBIDDEN)`. **읽는 쪽이 갈리면 낡은 쪽을
    > 먼저 읽는다** — 이 파일은 매 세션 로딩되므로 특히 그렇다.
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

**`.env`가 더미인지는 키마다 다르다** (2026-08-31 정정). 이 문단은 원래 *"`.env`에 더미
값이 들어 있어 로그인·업로드가 동작하지 않는다"* 였다. **`DATABASE_URL`은 실제 값이고 dev
브랜치에 실제로 붙는다** (읽기 전용 조회로 확인). 디스코드·S3 키가 유효한지는 확인하지
않았다 — **"안 붙는다"를 전제로 판단하지 말고 그때 확인할 것.**
`.env`는 gitignore 대상이고, `.gitignore`의 `!.env.example` 예외를 지우지 말 것
(기본값 `.env*`가 예제 파일까지 무시한다).

**`vercel env pull` 이 `npm run build` 를 죽인다** (2026-09-06 실측). 증상이 얄궂다 —
**`next dev` 는 멀쩡히 뜨고 빌드만 죽는다.** 읽는 파일이 다르기 때문이다.

| | 읽는 env 파일 |
|---|---|
| `next dev` | `.env.local` · `.env` |
| `next build` | `.env.local` · **`.env.production`** · `.env` (앞이 이긴다) |

Vercel 대시보드에서 **Sensitive 로 표시된 변수는 값 대신 리터럴 `[SENSITIVE]`** 로 내려온다.
그 문자열이 `.env` 의 실값을 덮어 `env.ts` 가 던진다:
`환경 변수가 올바르지 않습니다: AUTH_SECRET, APP_URL, DISCORD_WEBHOOK_URL`.

`HANDOFF.md` 에 같은 현상의 **읽기 쪽 절반**이 이미 적혀 있다("운영 환경변수는 CLI 로 못
읽는다") — 거기는 *운영 값을 되읽을 수 없다*는 얘기고, 여기는 *그 자리표시자가 로컬 빌드를
죽인다*는 얘기다. 한쪽만 고치면 갈라진다.

**조치는 `.env.production` 을 치우는 것 하나다.** Vercel 배포는 대시보드 값을 주입하므로
이 파일이 없어도 아무 영향이 없다 (gitignore 대상이라 올라가지도 않는다). 치운 뒤 빌드가
라우트 20개와 `ƒ Proxy (Middleware)` 를 찍으면 정상이다.

> **에러에 3개만 뜨는 것이 함정이다.** 앱 환경변수 11개가 전부 `[SENSITIVE]` 인데
> `z.string().min(1)` 을 쓰는 8개는 **통과한다**(11자니까). `AUTH_SECRET` 의 `min(32)` 와
> URL 검사 둘이 우연히 걸어 준 것뿐이고, 그게 없었다면 **가짜 `DATABASE_URL` 로 빌드가
> 그냥 진행됐다.** `src/lib/env.ts` 의 스키마가 "값이 있다"만 보고 "값이 값인지"는 안 본다.

**개발 환경은 macOS 다** (2026-08-31 정정). 이 문단은 원래 *"Windows 개발 환경.
git의 LF→CRLF 경고는 정상이다. 셸은 Git Bash"* 라고 적혀 있었다. 지금은 Darwin + zsh 다.
경로가 갈리는 곳이 있으니 문서를 그대로 믿지 말 것 — 예: Playwright 브라우저는
`~/AppData/Local/ms-playwright`(구 기록)가 아니라 `~/Library/Caches/ms-playwright` 에 있다.
`.claude/settings.local.json` 의 PowerShell 규칙도 이 PC 에서는 쓰이지 않는다.

## 명시적으로 범위 밖

넣자고 제안하지 말 것. 전부 의도적으로 뺐다 (근거는 `MILESTONES.md`).

docx/xlsx 미리보기 · 파일 내용 전문 검색 · 버전 롤백 버튼 · 문서 상태 라벨 ·
문서별 세부 권한 · 한 문서에 여러 파일 · 모바일 업로드

# 파이프라인 런처 프로토콜 (serial-agent-pipeline)

이 리포에는 셸 오케스트레이터(`orchestrate.sh`)가 있다. 세션(LLM)은 **런처**다 — 실행·전달만 하고 판정하지 않는다.

- 실행: worktree 에서 `./orchestrate.sh <feature>` 를 백그라운드로. 진행 중에는 `.pipeline/<feature>/STATE.md` 만 읽는다 (`*.stream.jsonl` tail 금지 — 컨텍스트 오염)
- 멈추면 STATE.md 의 `## 다음 행동` 블록을 그대로 따른다. exit 4 = 사람 승인 대기(실패 아님), 2 = 게이트 위반, 3 = BLOCKED
- 게이트 승인은 사람만 한다 — 방법은 STATE.md 안내를 따른다. 세션이 approve.sh 를 대신 실행하거나 `.approved` 파일을 쓰는 것은 금지
- 사람에게 터미널을 더 열라고 안내하지 마라 — advisor.sh 는 선택지일 뿐, 상담은 이 세션이 STATE.md·산출물 읽기로 대신한다
