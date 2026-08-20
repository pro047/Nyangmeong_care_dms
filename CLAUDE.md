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

**`DATABASE_URL`의 `connection_limit=5`를 반드시 유지할 것.**
이 RDS 인스턴스에는 **운영 중인 다른 프로젝트 2개가 함께 물려 있다.** 제한이 없으면
개발 중 HMR 재연결로 커넥션이 고갈돼 그 프로젝트들이 죽을 수 있다. 같은 이유로
RDS 인스턴스 설정(파라미터 그룹, 보안 그룹, 마스터 비밀번호)을 건드리지 말 것.

**`.env`에 더미 값이 들어 있다.** 실제 자격증명이 아니므로 로그인·업로드는 동작하지 않는다.
`.env`는 gitignore 대상이고, `.gitignore`의 `!.env.example` 예외를 지우지 말 것
(기본값 `.env*`가 예제 파일까지 무시한다).

**Windows 개발 환경.** git의 LF→CRLF 경고는 정상이다. 셸은 Git Bash.

## 명시적으로 범위 밖

넣자고 제안하지 말 것. 전부 의도적으로 뺐다 (근거는 `MILESTONES.md`).

docx/xlsx 미리보기 · 파일 내용 전문 검색 · 버전 롤백 버튼 · 문서 상태 라벨 ·
문서별 세부 권한 · 한 문서에 여러 파일 · 모바일 업로드
