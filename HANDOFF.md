# 인수인계 문서

새 세션이나 새 사람이 이 프로젝트를 이어받을 때 읽는 문서.
코딩 규칙과 함정은 `CLAUDE.md`, 진행 상황의 정본은 `MILESTONES.md`에 있다.

## 왜 만드는가

7명이 진행 중인 팀 프로젝트(요구사항정의서·IA구조도·화면설계서 작성 완료)의 문서를
한 곳에서 관리하기 위한 사내용 웹앱. **개발자는 1명이고 사용자는 팀원 7명.**

기존에는 디스코드로 파일을 주고받았는데 세 가지가 문제였다.

1. 한눈에 안 들어온다
2. 어디 있는지 못 찾는다
3. `최종_진짜최종.docx` 문제가 반복된다

이 셋이 제품의 존재 이유다. 기능을 고민할 때는 항상 "이게 저 셋 중 뭘 해결하나"로 되돌아올 것.

**목표는 완성도가 아니라 팀이 실제로 쓰기 시작하는 것.** 판단이 갈리면 빨리 쓸 수 있는 쪽을 택한다.
`MILESTONES.md`에 "일정이 밀리면 M2 직후 배포로 건너뛴다"고 적어둔 것도 같은 이유다.

## 현재 위치

- **M0(기반) · M1(로그인·앱 셸) 완료. 다음은 M2(업로드 + 문서 목록).**
- **아직 DB에 한 번도 연결한 적이 없다.** 마이그레이션 미실행, 실제 로그인·업로드 미검증.
- 검증된 것: `next build` 통과, `/login` 렌더, 비로그인 시 `/` → `/login` 리다이렉트,
  보호된 API 401 응답.

## 아키텍처

### 인증 — 디스코드 길드 멤버십이 곧 접근 권한

```
/api/auth/login     state 쿠키 발급 → 디스코드로 리다이렉트
/api/auth/callback  state 대조(CSRF) → code를 access_token으로 교환
                    → users/@me/guilds 조회
                    → DISCORD_GUILD_ID 포함 여부 확인   ← 접근 제어의 전부
                    → User upsert(닉네임·아바타 갱신)
                    → JWT 쿠키(dms_session, 30일) 발급
src/proxy.ts        /login 과 인증 라우트를 제외한 전 경로 차단
                    페이지면 /login 리다이렉트, /api/* 면 401 JSON
```

**왜 이렇게 했나.** 팀원 초대/제거를 디스코드에서 하던 대로 하면 DMS 접근권도 따라온다.
덕분에 사용자 관리 화면이 아예 필요 없다. 디스코드 서버에서 나가면 다음 로그인부터 자동 차단된다.

`proxy.ts`의 검사는 쿠키 서명만 보는 낙관적 확인이다. 실제 보호는
`src/app/(app)/layout.tsx`의 `getSession()`이 한 번 더 한다. 새 보호 구간을 만들 때도
이 이중 구조를 지킬 것.

### 데이터 모델 — Document와 DocumentVersion 분리가 핵심

```
User             디스코드 사용자 (discordId 유니크). 권한 컬럼 없음
Folder           parentId 자기참조 트리
Document         문서의 논리적 단위. 파일 정보를 갖지 않는다. deletedAt(소프트 삭제)
DocumentVersion  실제 파일. versionNo, s3Key, fileName, mimeType, sizeBytes, changeNote
Tag / DocumentTag  N:M
```

**왜 이렇게 했나.** 재업로드하면 `Document`는 그대로 두고 `DocumentVersion`만 추가된다.
그래서 이력이 자동으로 쌓이고 `최종_진짜최종.docx` 문제가 구조적으로 사라진다.
이게 이 제품의 존재 이유 중 하나이므로 절대 뭉개지 말 것.

"최신 버전"을 `Document`의 컬럼으로 들고 있지 않는 이유는 동기화 버그를 막기 위해서다.
`versions` 를 `versionNo desc` 로 정렬해 첫 번째를 쓴다.

### 업로드 — 파일이 앱 서버를 거치지 않는다

```
브라우저 → POST /api/documents/presign   S3 키 + 서명 URL 발급
브라우저 → PUT  S3                        직접 업로드
브라우저 → POST /api/documents            메타데이터 저장, 버전 생성
```

**왜 이렇게 했나.** 배포 대상 EC2가 저사양일 수 있는데, 파일이 서버를 거치면
메모리·대역폭이 병목이 된다. 이 구조면 인스턴스 스펙과 무관해진다.
다운로드도 같은 이유로 presigned GET을 쓴다 (`src/lib/s3.ts`).

S3 키는 UUID로 만들고 원본 파일명은 DB에만 둔다. 파일명 충돌과 한글·공백 문제를 피하기 위해서다.

## 디렉터리

```
src/
  app/
    (app)/        로그인 필수 구간. layout.tsx가 세션 검사 + 헤더/사이드바
      page.tsx    문서 목록 (최근 수정순)
      error.tsx   에러 바운더리. DB 연결 실패를 따로 안내 (터널 끊김 대비)
    login/        비로그인 구간
    api/auth/     login · callback · logout
  components/     app-header · app-sidebar
  lib/
    env.ts        zod로 환경변수 검증. 누락 시 부팅 실패
    prisma.ts     PrismaPg 어댑터 + HMR 커넥션 누수 방지 싱글턴
    session.ts    jose JWT 쿠키 (createSession/getSession/requireSession/destroySession)
    discord.ts    OAuth 교환 · 길드 검증 · 웹훅 알림(notifyUpload)
    s3.ts         presignUpload / presignDownload / buildS3Key / canPreview
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
(절차는 `SETUP.md`). 터널이 없으면 DB 접근 코드는 전부 실패하지만 `/login`과 앱 셸은
정상 렌더되므로, UI 작업은 터널 없이도 진행할 수 있다.

`.env`에는 개발 서버가 뜨도록 더미 값이 들어 있다. 실제 자격증명으로 교체해야
로그인·업로드가 동작한다.

## 다음 작업 — M2 (업로드 + 문서 목록)

목록 테이블(`src/app/(app)/page.tsx`)과 S3 유틸(`src/lib/s3.ts`)은 이미 있다. 남은 것:

1. `POST /api/documents/presign` — `buildS3Key` + `presignUpload`로 서명 URL 발급
2. `POST /api/documents` — 업로드 완료 후 `Document` + `DocumentVersion`(v1) 생성
3. 드래그&드롭 **다중 파일** 업로드 모달 + 파일별 진행률
   (디스코드의 기존 문서를 한 번에 이전해야 하므로 다중 업로드는 필수다)
4. 다운로드 라우트 — `presignDownload`로 리다이렉트
5. `page.tsx`의 업로드 버튼 `disabled` 해제 후 모달 연결

주의: 새 버전을 추가할 때 `Document.updatedAt`을 함께 갱신해야 목록 정렬이 맞는다.
Prisma의 `@updatedAt`은 `Document` 행 자체를 업데이트할 때만 동작하기 때문이다.

**M2까지 끝나면 팀에 공유해도 된다.** 이후 마일스톤은 전부 "불편함 줄이기"다.
