@AGENTS.md

# DMS — 팀 문서 관리 시스템

## 이 프로젝트가 뭔가

7명이 진행 중인 팀 프로젝트(요구사항정의서·IA구조도·화면설계서 작성 완료)의 문서를
한 곳에서 관리하기 위한 사내용 웹앱. **개발자는 1명(저장소 소유자)이고 사용자는 팀원 7명.**

기존에는 디스코드로 파일을 주고받았는데 (1) 한눈에 안 들어오고 (2) 어디 있는지 못 찾고
(3) `최종_진짜최종.docx` 문제가 반복돼서 만들게 됐다. 이 세 가지가 제품의 존재 이유이므로,
기능을 고민할 때는 항상 "이게 저 셋 중 뭘 해결하나"로 되돌아올 것.

**목표는 완성도가 아니라 팀이 실제로 쓰기 시작하는 것.** 판단이 갈릴 땐 빨리 쓸 수 있는 쪽을 택한다.

## 현재 위치

- **M0 (기반), M1 (로그인·앱 셸) 완료. 다음은 M2 (업로드 + 문서 목록).**
- 진행 상황과 남은 범위의 정본은 `MILESTONES.md`다. 작업을 끝내면 그 파일의 체크박스를 갱신할 것.
- 아직 **DB에 한 번도 연결한 적이 없다.** 마이그레이션 미실행, 실제 로그인·업로드 미검증.

## 문서 지도

| 파일 | 내용 |
|---|---|
| `CLAUDE.md` (이 파일) | 프로젝트 개요, 아키텍처, 규칙, 함정 |
| `MILESTONES.md` | 확정된 설계 결정 + M0~M6 계획 + 완료 기준 **(진행 상황 정본)** |
| `SETUP.md` | RDS 터널·디스코드 앱·S3 버킷 셋업 절차 |
| `AGENTS.md` | Next가 자동 생성. Next 16 주의사항 |

## 기술 스택

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind 4 ·
Prisma 7 + PostgreSQL(AWS RDS) · AWS S3 · 디스코드 OAuth

## 아키텍처

### 인증 — 디스코드 길드 멤버십이 곧 접근 권한

```
/api/auth/login     state 쿠키 발급 → 디스코드로 리다이렉트
/api/auth/callback  state 대조 → code 교환 → users/@me/guilds 조회
                    → DISCORD_GUILD_ID 포함 여부 확인 (★ 접근 제어의 전부)
                    → User upsert → JWT 쿠키(dms_session, 30일) 발급
src/proxy.ts        /login 과 인증 라우트를 제외한 전 경로 차단
                    페이지면 /login 리다이렉트, /api/* 면 401 JSON
```

디스코드 서버에서 나가면 다음 로그인부터 자동 차단된다. **그래서 사용자 관리 화면이 없다.**
별도의 역할·권한 개념도 없다 (전원 동등).

`proxy.ts`의 검사는 낙관적 확인이므로, 실제 보호는 `src/app/(app)/layout.tsx`의
`getSession()`이 한 번 더 한다. 새 보호 구간을 만들 때도 이 이중 구조를 지킬 것.

### 데이터 모델 — Document와 DocumentVersion 분리가 핵심

```
User      디스코드 사용자 (discordId 유니크)
Folder    parentId 자기참조 트리
Document  문서의 논리적 단위. 파일 정보를 갖지 않는다. deletedAt(소프트 삭제)
DocumentVersion  실제 파일. versionNo, s3Key, fileName, sizeBytes, changeNote
Tag / DocumentTag  N:M
```

재업로드하면 `Document`는 그대로 두고 `DocumentVersion`만 추가한다.
이게 `최종_진짜최종.docx` 문제를 구조적으로 없애는 장치이므로 **절대 뭉개지 말 것.**
"최신 버전"은 별도 컬럼이 아니라 `versionNo desc` 정렬로 구한다 (동기화 버그 방지).

**1문서 = 1파일**이다. 여러 파일을 한 문서에 붙이지 않는다.

### 업로드 — 파일이 앱 서버를 거치지 않는다

```
브라우저 → POST /api/documents/presign  (S3 키 + 서명 URL 발급)
브라우저 → PUT  S3 직접 업로드
브라우저 → POST /api/documents          (메타데이터 저장, 버전 생성)
```

EC2가 저사양이어도 큰 파일이 문제되지 않게 하려는 설계다. 파일을 서버로 받아 중계하는
방식으로 바꾸지 말 것. 다운로드도 같은 이유로 presigned GET을 쓴다 (`src/lib/s3.ts`).

### 디렉터리

```
src/
  app/
    (app)/        로그인 필수 구간. layout.tsx가 세션 검사 + 헤더/사이드바
      page.tsx    문서 목록 (최근 수정순)
      error.tsx   에러 바운더리. DB 연결 실패를 따로 안내
    login/        비로그인 구간
    api/auth/     login · callback · logout
  components/     app-header, app-sidebar
  lib/
    env.ts        zod로 환경변수 검증. 누락 시 부팅 실패
    prisma.ts     PrismaPg 어댑터 + HMR 커넥션 누수 방지 싱글턴
    session.ts    jose JWT 쿠키 (createSession/getSession/requireSession/destroySession)
    discord.ts    OAuth 교환 · 길드 검증 · 웹훅 알림(notifyUpload)
    s3.ts         presignUpload/presignDownload/buildS3Key/canPreview
    format.ts     파일 크기 · 상대 시간 · 확장자 라벨
  generated/prisma  Prisma 산출물 (gitignore, postinstall로 자동 생성)
  proxy.ts        구 middleware.ts
```

## 개발 환경

```bash
npm run dev        # 개발 서버
npm run build      # 프로덕션 빌드 (타입 검사 포함)
npm run db:push    # 스키마를 DB에 반영 (개발용, 마이그레이션 파일 없음)
npm run db:migrate # 마이그레이션 생성 (운영 배포 전에)
npm run db:studio  # DB GUI
```

DB는 기존 EC2를 경유하는 SSH 터널로 RDS에 붙는다. 개발자가 별도 창에서 직접 띄워야 한다
(자세한 절차는 `SETUP.md`). 터널이 없으면 DB 접근 코드는 전부 실패하지만,
`/login`과 앱 셸은 정상 렌더된다.

## 이 저장소에서 일할 때

- **UI 문구와 코드 주석은 한국어.** 사용자가 전원 한국인 팀이다.
- 주석은 "왜"만 적는다. 코드를 읽으면 알 수 있는 "무엇"은 적지 않는다.
- 커밋 전에 `npm run build`를 돌린다 (타입 검사가 포함돼 있다).
- **Next 16 기능을 쓰기 전에 `node_modules/next/dist/docs/`의 해당 문서를 먼저 읽는다.**
  이름이 바뀐 API가 실제로 있다 (아래 함정 참고).
- 진행 상황을 바꿨으면 `MILESTONES.md` 체크박스를 갱신한다.
- 설계 결정을 새로 내렸으면 `MILESTONES.md`의 "확정된 설계 결정" 표에 추가한다.

## 함정 (실제로 겪은 것들)

**Next 16: `middleware.ts`가 `proxy.ts`로 바뀌었다.**
export 이름도 `middleware` → `proxy`. 구 이름은 deprecated 상태로 아직 동작하지만
곧 제거된다. `npm run build` 출력의 `ƒ Proxy (Middleware)` 줄로 인식 여부를 확인할 수 있다.

**Prisma 7은 6과 많이 다르다.**
- `datasource`에 `url`을 쓸 수 없다. `prisma.config.ts`로 옮겨졌다.
- 드라이버 어댑터가 필수다 (`@prisma/adapter-pg`). `PrismaClient`에 `adapter`를 넘긴다.
- 생성 위치가 `node_modules`가 아니라 `src/generated/prisma`다. import 경로는
  `@/generated/prisma/client`.

**`.env`에 더미 값이 들어 있다.**
DB·디스코드·S3 자격증명이 전부 플레이스홀더다. 개발 서버를 띄우기 위한 임시값이므로
실제 값으로 바꾸기 전에는 로그인·업로드가 동작하지 않는다. `.env`는 gitignore 대상.

**`DATABASE_URL`에 `connection_limit=5`를 반드시 유지할 것.**
이 RDS 인스턴스에는 **운영 중인 다른 프로젝트 2개가 함께 물려 있다.**
Prisma 기본 풀이 크고 개발 중 HMR로 계속 재연결되기 때문에, 제한이 없으면
그 프로젝트들이 커넥션 부족으로 죽을 수 있다. 같은 이유로 RDS 인스턴스 설정을
함부로 바꾸지 말 것 (파라미터 그룹, 보안 그룹, 마스터 비밀번호 등).

**`.gitignore`의 `!.env.example` 예외를 지우지 말 것.**
create-next-app 기본값이 `.env*`라 예제 파일까지 무시된다. 예외가 없으면
팀원이 어떤 환경변수가 필요한지 알 수 없다.

**Windows 개발 환경.** git이 LF→CRLF 경고를 쏟아내는데 정상이다. 셸은 Git Bash.

## 명시적으로 범위 밖

넣자고 제안하지 말 것. 전부 의도적으로 뺐다.

- docx/xlsx 미리보기 (서버 변환 필요 — PDF·이미지만 지원)
- 파일 *내용* 전문 검색 (제목·설명·태그만)
- 버전 롤백 버튼 (이전 버전 다운로드 후 재업로드로 대체)
- 문서 상태 라벨(초안/검토중/확정)
- 문서별 세부 권한, 역할 구분
- 한 문서에 여러 파일 첨부
- 모바일 업로드 (보기만 대응)
