# 인수인계 문서

새 세션이나 새 사람이 이 프로젝트를 이어받을 때 읽는 문서.
코딩 규칙과 함정은 `CLAUDE.md`, 진행 상황의 정본은 `MILESTONES.md`, 셋업은 `SETUP.md`.

## 왜 만드는가

7명이 진행 중인 팀 프로젝트(요구사항정의서·IA구조도·화면설계서 작성 완료)의 문서를
한 곳에서 관리하기 위한 사내용 웹앱. **개발자는 1명이고 사용자는 팀원 7명.**

기존에는 디스코드로 파일을 주고받았는데 세 가지가 문제였다.

1. 한눈에 안 들어온다
2. 어디 있는지 못 찾는다
3. `최종_진짜최종.docx` 문제가 반복된다

이 셋이 제품의 존재 이유다. 기능을 고민할 때는 항상 "이게 저 셋 중 뭘 해결하나"로 되돌아올 것.

**목표는 완성도가 아니라 팀이 실제로 쓰기 시작하는 것.** 판단이 갈리면 빨리 쓸 수 있는 쪽을 택한다.

---

## 현재 위치 (2026-08-24)

**M0 · M1 · M2 · M3 완료.** 아직 배포 전이라 개발자 로컬에서만 돈다.

실제로 돌려서 확인된 것 (전부 브라우저 실측):

- 디스코드 로그인 → 빈 목록 화면 (`users` 테이블에 행 생성 확인)
- 파일 업로드 → S3 객체와 DB 행 일치 → 다운로드
- 소프트 삭제 → 휴지통 표시 → 복구 → 목록 복귀
- 삭제 상태에서 다운로드 URL 직접 접근이 404, 복구 후에는 파일이 내려옴 (대조 확인)
- **presign 대기 중 업로드 취소 → S3 요청 0건** (2026-08-23, 대조 확인). presign 라우트에
  10초 지연을 임시로 넣어 취소 창을 만들고, 진행바 0% 에서 닫으니 DevTools Network 의 `s3`
  필터에 **preflight(OPTIONS)조차 안 떴다** — `send()` 가 아예 안 불렸다는 뜻이다.
  같은 지연에서 취소하지 않으면 정상 업로드된다(대조). 임시 지연 줄은 삭제했다.
- **잘못된 `?v=` 가 배너로 돌아온다** (2026-08-23, 대조 확인). 같은 문서 id 로
  `?v=1e21` → 배너, `?v=2147483648` → 배너, `?v=1` → 파일이 내려옴. 셋을 대조했으므로
  "id 가 원래 안 열린다"가 아니라 **파서가 걸렀다**는 것이 확정된다.
  셋 다 목록 위 배너로 떴다 — 탭이 JSON 텍스트로 바뀌지 않는다.
- **남이 지운 문서 링크 클릭 → 배너** (2026-08-23). 탭1 삭제 → 탭2 목록에서 제목 클릭.
  위 `?v=` 경로는 DB 조회 **전**, 이쪽은 조회 **후** 로 분기가 다른데 둘 다 같은 배너다.
- **`/?error=<임의 문장>` 으로는 배너가 뜨지 않는다** (2026-08-23, 대조 확인).
  `?error=notfound` 는 배너, `?error=보안 점검으로 재인증이 필요합니다` 는 아무것도 안 뜬다.
- **M3 상세 페이지 9항목 전부 통과** (2026-08-24, Playwright 자동화 · `npm run test:e2e`).
  `DESIGN.md` §7.2 의 B1·B3·B4·B5·B6·B7·B8·B9 + V3. 스크린샷은 `test/e2e/shots/`(gitignore).
  이 중 셋은 **판단검증이 미확인으로 남긴 주장의 첫 실측**이었다:
  - **V3 — 부모 `@updatedAt` 은 중첩 create 로도 갱신된다.** 재업로드 직후 목록 최상단에 왔다.
    설계가 준비해 둔 폴백(`data.updatedAt: new Date()`)은 **필요 없다**. (`JUDGE.md` #27)
  - **`hour12: false` 가 실제로 필요했다.** 화면에 `2026년 8월 24일 21:52` — 12시간제였다면
    `오후 09:52` 였다. (`JUDGE.md` #30)
  - **P2025 → 404 경로가 실동작한다.** 탭에서 상세를 연 채 다른 경로로 삭제한 뒤 재업로드하면
    `문서를 찾을 수 없거나 휴지통에 있습니다.` 가 모달에 뜬다. (`JUDGE.md` #26)

**미검증** — 다음 세션이 확인할 것:

| 항목 | 방법 |
|---|---|
| 길드 비멤버 거부 | 다른 디스코드 계정 필요 |
| 다중 파일 동시 업로드 | 파일 여러 개를 한 번에 끌어다 놓기 |
| 재업로드 진행 중 취소 (B10) | e2e 가 안 덮는다 — 타이밍 의존이라 수동. presign 라우트에 지연을 임시로 넣어 창을 만든다 |
| 디스코드 임베드 링크 (B11) | `NODE_ENV=production` 에서만 발송되므로 M6 배포 후 |

### 코드 리뷰 결과 (2026-08-22, `690aeeb`~`3948ea5` 4개 커밋) — 수정·검증 완료

돌렸다. 7건 중 **3건이 "고쳤다고 선언한 것을 절반만 고친" 상태**였다.
`./orchestrate.sh review-fixes` 로 묶어서 처리했고 **2026-08-23 파이프라인 통과**
(`npm test` 58개 · `lint` · `build`).

**"코드 완성" 과 "검증됨" 은 다르다** — 셋 다 브라우저까지 갔다
(최종 검증: `npm test` 63개 · `lint` · `build`, 2026-08-23 실측):

| 리뷰 | 코드 | 단위 테스트 | 브라우저 실측 |
|---|---|---|---|
| 1 `?v=1e21` 500 | ✅ | ✅ | ✅ 2026-08-23, 대조 포함 |
| 2 presign 대기 중 취소 | ✅ | ✅ | ✅ 2026-08-23, 대조 포함 |
| 3 404 가 탭을 JSON 으로 | ✅ | ✅ | ✅ 2026-08-23 |

#### 수정본에 대한 2차 리뷰 (2026-08-23, `/code-review high`)

고친 코드 자체는 리뷰를 안 거쳤기에 커밋 전에 한 번 더 돌렸다. 3건 나왔다.

**고친 것 — 배너에 임의 문장을 실을 수 있었다.** 리다이렉트가 문구 자체를
`?error=문서를 찾을 수 없습니다.` 로 싣고 페이지가 그대로 렌더해서, 누구든
`/?error=<원하는 문장>` 링크로 앱의 공식 경고 배너를 흉내낼 수 있었다. React 가
이스케이프하므로 XSS 는 아니지만 내용이 전부 링크 작성자 것이었다. 같은 리포의
`proxy.ts:38` 이 로그인 리다이렉트에서 `url.search = ''` 로 쿼리를 버리는 패턴을
이 변경이 깬 것이다. `src/lib/page-error.ts` 로 코드→문구 매핑을 만들어 닫았다.
객체 리터럴이 아니라 `Map` 인 이유는 `?error=toString` 이 `Object.prototype` 속성을
주워 오기 때문이다 (테스트로 고정).

**미룬 2건** — 아래 "미룬" 표에 합쳤다.

아래는 1차 리뷰 당시 진단 원문이다 (수정 근거로 남겨둔다).

**1. `?v=1e21` 이 여전히 500** (`src/lib/version.ts:12`) — `f7ef0b8` 이 없애려던 그 증상.
`Number.isInteger(Number('1e21')) === true` 라 파서를 통과하고, Prisma 가
`PrismaClientValidationError: Unable to fit value 1e+21 into a 64-bit signed integer` 를
**DB 연결 없이** 던진다 (2026-08-22 실측). 라우트에 try/catch 가 없어 그대로 500.
`versionNo` 가 `Int`(int4)라 `2147483648` 도 같은 계열로 봤는데, 상한(`MAX_VERSION_NO`)이
파서에서 먼저 막으므로 **DB 가 int4 범위를 어떻게 거절하는지는 알 필요가 없어졌다**
(2026-08-23 배너 확인). 이 추정은 해소된 것이 아니라 무관해진 것이다.

> **결정**: 파서를 `/^[1-9]\d*$/` + 상한 `2147483647` 로 좁힌다. 지수(`1e3`)·16진수(`0x10`)·
> 공백(` 5 `) 표기를 전부 거부한다. 사람이 주소창에 칠 버전 번호는 `1`,`2`,`3` 뿐이다.
> `src/lib/version.test.ts:23` 의 `expect(parseVersionParam('1e3')).toBe(1000) // 경계 명시`
> 는 **구멍을 의도된 경계로 문서화해 둔 것**이므로 같이 뒤집는다.

**2. presign 대기 중 취소가 안 먹는다** (`src/components/upload-dialog.tsx:98`) —
`close()` 가 `batch.cancelled` 를 세우고 `inFlight` 의 XHR 을 abort 하지만, 그 순간 워커가
presign fetch 를 await 중이면 이후 `putToS3` 가 **새 XHR 을 만들어 끝까지 전송**한다.
`batch.cancelled` 검사는 PUT 이 끝난 뒤(106행)뿐이다. 80MB 3개를 presign 대기 중 취소하면
240MB 가 백그라운드로 올라가고 전부 고아 객체가 된다. `putToS3` 호출 직전 검사가 필요하다.

> 정정 (2026-08-23): 처음에 "`onStart` 에서 즉시 `xhr.abort()`" 도 함께 적었는데 **그 방식은
> 동작하지 않는다.** WHATWG XHR §3.5.7 의 `abort()` 는 `send() invoked` 플래그가 서 있을 때만
> 동작하고, `send()` 전에는 `open()` 앞이든 뒤든 완전한 no-op 이라 뒤이은 `send()` 가 정상
> 전송된다. 이중 안전장치는 `putToS3` 안 `xhr.send(file)` **직전의 동기 검사**로 넣는다
> (`.pipeline/review-fixes/DESIGN.md` §4.3.1). 호출 사슬 어디에 `await` 가 끼어도 우회되지 않는다.

**3. 404 가 탭을 JSON 으로 바꾼다** (`download/route.ts:27,41`) — `03a530a` 가 401 에 대해
고친 것을 404 는 그대로 갖고 있다. 이 엔드포인트는 목록에서 평범한 `<a href>` 로 열린다
(`src/app/(app)/page.tsx:67,93`). 남이 방금 지운 문서 링크를 누르면 탭 전체가
`{"error":"문서를 찾을 수 없습니다."}` 가 된다.

**미룬 4건** — 지금 고치지 않는다:

| 위치 | 내용 | 언제 |
|---|---|---|
| ~~`discord.ts:88`~~ | 임베드 `url` 이 없는 `/documents/[id]` 를 가리킴 | **해소됨** — M3 가 그 라우트를 만들었다. 다만 알림은 `NODE_ENV=production` 에서만 나가므로 임베드 링크가 실제로 열리는지는 배포(M6) 후 확인 |
| `documents/route.ts:37`<br>`[id]/versions/route.ts:35` | `keyToken` 이 5분간 재사용 가능 → 같은 S3 객체에 Document N개. **M3 에서 versions 라우트가 같은 구멍을 복제했다** (2026-08-24 리뷰). `verifyUploadToken`(`upload-token.ts:35`)은 검증만 하고 토큰을 소모하지 않아, TTL 300초 안에 같은 `(s3Key, keyToken)` 으로 **서로 다른 문서**의 `/versions` 에 반복 POST 가 된다 — 피해 범위가 한 문서 안에서 문서 **사이**로 넓어졌다 | **고아 객체 정리 때 같이** — 정리 배치가 붙는 순간 한 문서를 지우면 다른 문서 파일이 사라진다. **두 곳을 같이 막을 것.** 토큰 1회용화는 사용 기록 저장소가 필요해 스키마 변경을 부른다 |
| `s3.ts:71` | `catch { return null }` 이 403·503 을 "파일 없음"으로 뭉갬 | 로그 추가로 충분 |
| `upload-dialog.tsx:39,74,139`<br>`version-upload-dialog.tsx:39,50,98` | `inFlight` 에서 완료된 XHR 을 제거하지 않음. 줄번호는 `putToS3` 를 `lib/upload-xhr.ts` 로 뺀 뒤 기준(2026-08-24). 같은 결함이 재업로드 다이얼로그에 복제됐다 | 누수는 다이얼로그 수명 한정 |
| `page.tsx` 배너 (2차 리뷰) | `?error=notfound` 가 주소창에 눌러앉는다. 배너를 띄운 화면에서 업로드하면 `close()` 의 `router.refresh()` 가 **URL 을 안 바꿔서** 방금 성공한 업로드 옆에 낡은 에러가 남는다 | 닫기 버튼(`history.replaceState`)이나 렌더 후 파라미터 제거. ~~M3 상세 페이지가 배너를 하나 더 쓸 것이므로 그때 같이~~ — **그 전제가 깨졌다.** 상세 페이지는 배너 대신 `notFound()` + 세그먼트 `not-found.tsx` 를 쓴다(URL 에 에러가 눌러앉지 않는다). 배너를 쓰는 곳은 목록의 다운로드 링크뿐이라 이 항목은 계기 없이 남는다 |
| `download/route.ts:36` (2차 리뷰) | 같은 핸들러의 401 만 여전히 내비게이션에 JSON 을 준다 | **의도된 것.** proxy 가 같은 쿠키를 같은 키로 먼저 검증하므로 도달 창은 프록시 통과와 라우트 도착 사이 수 ms 경합뿐이다. 이유를 `route.test.ts` 주석에 박아 뒀다 |

---

## 지뢰 (겪은 것들)

`CLAUDE.md` 의 "함정" 절과 별개로, 운영하다 부딪히는 것들.

**SSH 터널이 조용히 죽는다.** `ServerAliveInterval 30` / `CountMax 3` 이라 90초 무응답이면
스스로 끊는다. 맥이 절전에 들어가면 그렇게 된다. 증상은 `PrismaClientKnownRequestError` +
`code: 'ECONNREFUSED'` 인데, **에러가 `findMany` 줄을 가리켜서 쿼리 문제로 보인다.**
`nc -z localhost 15432` 로 먼저 확인할 것. 복구는 `ssh -N hymn-tunnel` 한 줄.

**EC2 퍼블릭 IP가 재시작마다 바뀐다.** 탄력적 IP 미할당(M6 항목). 히스토리상 최소 세 번
바뀌었다. `~/.ssh/config` 의 `hymn` / `hymn-tunnel` 항목을 고쳐야 하고, 새 값은:

```bash
aws ec2 describe-instances --region ap-northeast-2 \
  --filters "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].[Tags[?Key==`Name`].Value|[0],PublicIpAddress]' --output table
```

**로컬 포트가 3000이 아니라 3002다.** neemba 컨테이너가 3000을, grafana가 3001을 점유한다.
`package.json` 의 `dev` 에 `-p 3002` 로 고정했다 — 자동으로 밀리면 디스코드 `redirect_uri` 가
어긋나기 때문이다. 포트를 바꾸면 `.env` 의 `APP_URL`, 디스코드 Redirects, **버킷 CORS**
세 곳을 같이 고쳐야 한다. CORS를 빠뜨리면 업로드만 조용히 실패한다.

**S3 고아 객체가 쌓인다.** 업로드를 취소하거나 문서를 소프트 삭제해도 객체는 남는다.
`src/lib/s3.ts` 의 `deleteObject` 는 정의만 되고 호출처가 0건이다. 정리 경로가 없다.

**그리고 앱 자격증명으로는 고아를 찾을 수 없다** (2026-08-24 실측). IAM 사용자 `dms-app` 에
`s3:ListBucket` 이 없어서 `ListObjectsV2` 가 403 으로 막힌다:

```
AccessDenied: User: arn:aws:iam::989785488374:user/dms-app is not authorized to
perform: s3:ListBucket on resource: "arn:aws:s3:::nm-care-...-an"
```

**"버킷을 훑어 DB 에 없는 키를 지운다"는 정리 배치는 이 권한으로는 못 만든다.** 선택지는
(a) `infra/iam-dms-app.json` 에 `s3:ListBucket` 을 추가하거나, (b) 애초에 고아를 안 만드는
쪽 — 업로드 취소·문서 생성 실패 시 **그 자리에서** `deleteObject` 를 부르는 것이다.
`test/e2e/document-detail.mjs` 가 (b) 를 쓴다: presign 응답의 키를 들고 있다가 teardown 에서
지운다. 만든 쪽이 그 자리에서 지우는 것이 유일하게 확실한 방법이다.

**진단 스크립트로 DB 시각을 읽을 때 주의.** `created_at` 은 `timestamp without time zone`
이라 node-postgres 가 로컬 시간으로 해석해 9시간 어긋나 보인다. Prisma는 정상이다.

**"자리만 잡아둔" UI 가 실제로는 살아 있을 수 있다.** 헤더 검색창이 주석에
"M4에서 실제 검색으로 연결"이라 적힌 채 `<form action="/search">` 로 **동작하고 있었다** —
그 라우트가 없어서 엔터 한 번에 Next 기본 404 였다. 사이드바 "새 폴더"는 `disabled` 로
정직하게 막혀 있었는데 검색창만 빠진 것이다 (2026-08-23 `ee7f11d` 에서 맞춤).
비슷한 자리표시 UI 를 새로 넣을 때는 **주석이 아니라 `disabled` 로 막을 것.**
주석은 사용자를 막지 못한다.

---

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
```

**왜 이렇게 했나.** 팀원 초대/제거를 디스코드에서 하던 대로 하면 DMS 접근권도 따라온다.
덕분에 사용자 관리 화면이 아예 필요 없다. 디스코드 서버에서 나가면 다음 로그인부터 자동 차단된다.

`proxy.ts` 의 검사는 쿠키 서명만 보는 낙관적 확인이다. 실제 보호는
`src/app/(app)/layout.tsx` 의 `getSession()` 이 한 번 더 한다. 새 보호 구간을 만들 때도
이 이중 구조를 지킬 것.

**미인증 응답은 경로가 아니라 요청 방식으로 가른다.** `Sec-Fetch-Dest: document` 면
주소창 이동이므로 `/login` 리다이렉트, 그 외(fetch·XHR)는 JSON 401. 경로로 가르면
다운로드 링크(`<a href="/api/...">`)가 최상위 내비게이션이라 탭 전체가 JSON 텍스트로 바뀐다.
30일 쿠키가 만료되면 팀 전원이 그걸 보게 된다.

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

삭제 필터는 `src/lib/trash.ts` 한 곳에 모았다. 목록·다운로드·삭제가 같은 조건을 봐야 하는데
흩어져 있으면 한 곳만 빠뜨려도 지운 문서가 새어 나온다. 호출마다 새 객체를 반환하는 이유는
호출자가 spread 로 변형하다 공유 상수를 오염시키는 사고를 막기 위해서다.

### 업로드 — 파일이 앱 서버를 거치지 않는다

```
브라우저 → POST /api/documents/presign   S3 키 + 서명 URL + keyToken 발급
브라우저 → PUT  S3                        직접 업로드 (XHR, 진행률·취소 가능)
브라우저 → POST /api/documents            keyToken 검증 → HeadObject → 버전 생성
```

**왜 이렇게 했나.** 배포 대상 EC2가 저사양일 수 있는데, 파일이 서버를 거치면
메모리·대역폭이 병목이 된다. 이 구조면 인스턴스 스펙과 무관해진다.
다운로드도 같은 이유로 presigned GET을 쓴다.

S3 키는 UUID로 만들고 원본 파일명은 DB에만 둔다. 파일명 충돌과 한글·공백 문제를 피하기 위해서다.
IAM 정책이 `documents/*` 접두사로 좁혀져 있으므로 **키 규칙을 바꾸면 정책도 같이 바꿔야 한다**
(`infra/iam-dms-app.json`).

**`keyToken` 이 필요한 이유.** 이 구조는 클라이언트가 "다 올렸다"고 알려주는 것에 의존한다.
검증이 없으면 로그인만 한 사람이 임의의 `s3Key` — 남의 문서 키 포함 — 로 문서를 만들 수 있다.
`presign` 이 `{s3Key}` 를 담은 5분짜리 JWT를 함께 내려주고 문서 생성 때 대조한다.
세션과 같은 `AUTH_SECRET` 을 쓰되 `aud` 를 분리했다 — 안 나누면 세션 쿠키를 그 자리에
넣는 것이 통과한다 (`src/lib/upload-token.ts`).

**`HeadObject` 로 크기를 다시 잰다.** presigned PUT에는 크기 조건이 서명돼 있지 않아서
클라이언트 신고값과 실제가 다를 수 있다. 그래서 `sizeBytes` 는 요청 body에서 아예 뺐다.
덤으로 "PUT을 실제로 끝냈는가"도 확인된다.

**업로드 취소는 배치 단위다.** `xhr.abort()` 만으로는 부족하다 — 이미 전송이 끝난 건은
abort가 무효라 문서 생성으로 넘어가고, 아직 시작 안 한 대기 파일은 모달을 닫아도 계속 올라간다.
`close()` 는 배치를 먼저 접고 그다음 abort한다. 순서가 반대면 abort로 깨어난 흐름이
다음 단계로 넘어간다. `xhr.timeout` 을 안 쓴 것은 의도다 — 100MB를 느린 회선으로 올리면
멀쩡한 업로드가 그 숫자에 걸려 죽는다.

### 알림

`notifyUpload` 는 **배포 환경에서만** 나간다(`NODE_ENV === 'production'`). 개발 중 테스트
파일이 팀 채널에 쌓이는 것을 막기 위해서다. 임베드 링크가 `/documents/[id]` 를 가리키는데
**그 라우트가 아직 없으므로**, M6 배포 전에 M3 상세 페이지를 만들어야 링크가 유효해진다.

---

## 디렉터리

```
src/
  app/
    (app)/                    로그인 필수 구간. layout.tsx가 세션 검사 + 헤더/사이드바
      page.tsx                문서 목록 (최근 수정순). 제목은 상세로 간다
      documents/[id]/page.tsx 문서 상세 — 메타 수정 · 재업로드 · 버전 타임라인
      documents/[id]/not-found.tsx  없는/휴지통 문서. 배너 리다이렉트가 아니라 이 자리에서 알린다
      trash/page.tsx          휴지통
      error.tsx               에러 바운더리. DB 연결 실패를 따로 안내 (터널 끊김 대비)
    login/                    비로그인 구간
    api/auth/                 login · callback · logout
    api/documents/
      route.ts                POST 문서 생성 (keyToken 검증 + HeadObject)
      presign/route.ts        POST 서명 URL + keyToken 발급
      [id]/route.ts           DELETE 소프트 삭제 · PATCH 제목·설명 수정
      [id]/restore/route.ts   POST 복구
      [id]/versions/route.ts  POST 재업로드 (v2+ 누적, keyToken 검증 + HeadObject)
      [id]/download/route.ts  GET presigned URL로 리다이렉트
  components/                 app-header · app-sidebar · upload-dialog
                              document-row-actions(삭제, redirectTo 로 상세에서도 씀)
                              trash-row-actions(복구) · document-meta-editor(제목·설명)
                              version-upload-dialog(재업로드)
  lib/
    env.ts                    zod로 환경변수 검증. 누락 시 부팅 실패
    prisma.ts                 PrismaPg 어댑터(max:5) + HMR 커넥션 누수 방지 싱글턴
    session.ts                jose JWT 쿠키
    upload-token.ts           presign이 발급한 s3Key 서명 토큰
    discord.ts                OAuth 교환 · 길드 검증 · 웹훅 알림
    s3.ts                     presignUpload/Download · buildS3Key · headObjectSize · canPreview
    trash.ts                  삭제 필터 where 절 (목록·다운로드·삭제·수정 공유)
    version.ts                ?v= 파라미터 파싱
    format.ts                 파일 크기 · 상대 시간 · 절대 시각 · 확장자 라벨
    document-edit.ts          PATCH 본문 스키마 + 정규화 (description '' → null)
    version-create.ts         재업로드 본문 스키마 · 다음 버전 번호 · Prisma 오류 → HTTP
    upload-xhr.ts             putToS3 (진행률·취소). 클라이언트 전용 — env·s3.ts import 금지
  generated/prisma            Prisma 산출물 (gitignore, postinstall로 자동 생성)
  proxy.ts                    구 middleware.ts

infra/                        AWS 콘솔 설정 기록 (CORS · IAM 정책). 테라폼 안 씀
prompts/ orchestrate.sh advisor.sh test/run-tests.sh test/fake-claude   직렬 에이전트 파이프라인
test/e2e/                     M3 브라우저 검증 (Playwright). helpers.mjs 가 세션 쿠키를
                              직접 서명해 디스코드 OAuth 를 우회한다. shots/ 는 gitignore
```

테스트는 소스 옆에 `*.test.ts`. vitest 4, node 환경, `src/**/*.test.ts` 만 수집.
**jsdom이 없어 컴포넌트 렌더 테스트는 쓸 수 없다** — 로직을 `lib/` 순수 함수로 빼면 덮인다.

---

## 개발 환경

```bash
ssh -N hymn-tunnel   # 별도 창. DB 접근에 필수 (~/.ssh/config 에 별칭 있음)

npm run dev          # http://localhost:3002
npm test             # vitest run
npm run lint
npm run build        # 타입 검사 포함
npm run db:push      # 스키마를 DB에 반영 (개발용)
npm run db:studio    # DB GUI
bash test/run-tests.sh   # 파이프라인 게이트 검증 (API 호출 0회)
npm run test:e2e     # M3 브라우저 검증 (터널 + dev 서버 + 실제 .env 필요)
```

터널이 없으면 DB 접근 코드는 전부 실패하지만 `/login` 과 앱 셸은 정상 렌더되므로,
UI 작업은 터널 없이도 진행할 수 있다.

`.env` 에는 **실제 자격증명이 들어 있다**(gitignore 대상). 새 체크아웃에서는 직접 만들어야
하고 절차는 `SETUP.md` 0번에 있다. `uselibpqcompat=true` 를 빼면 `db push` 는 되는데
앱만 TLS 오류로 죽는다 — 같은 URL을 Prisma 엔진과 node-postgres가 다르게 읽기 때문이다
(`SETUP.md` 의 "두 파서" 절).

---

## 다음 작업

우선순위 순. M3 는 2026-08-24 에 끝났다 (브라우저 실측 포함).

1. **S3 고아 객체 정리** — 업로드 취소와 소프트 삭제 경로에 `deleteObject` 연결.
   "휴지통 비우기"는 `MILESTONES.md` 에 없는 기능이므로 범위를 넓히지 말 것.
   **먼저 위 지뢰의 `s3:ListBucket` 항목을 읽을 것** — 사후에 훑어서 지우는 방식은 지금 권한으로
   불가능하고, 만든 쪽이 그 자리에서 지우는 형태로 설계해야 한다. `keyToken` 재사용 구멍
   (`documents/route.ts:37` · `[id]/versions/route.ts:35`)도 이때 **두 곳을 같이** 막는다 —
   정리 배치가 붙는 순간 한 문서를 지우면 다른 문서 파일이 사라진다.
2. **배포 (M6)** — 탄력적 IP 할당이 첫 항목. `NODE_ENV=production` 이 PM2에서 실제로
   서는지 확인해야 알림이 나간다. 운영 `.env` 의 `uselibpqcompat=true` 는 개발용 터널
   때문에 필요한 것이므로 그대로 가져가지 말 것 (`SETUP.md` M6 절 참조).

작업은 직렬 에이전트 파이프라인으로 돌릴 수 있다 — `./orchestrate.sh <feature>`.
게이트에서 `y` 를 누를 사람이 필요한데 **클로드 세션의 `!` 셸에는 tty 가 없다** (2026-08-24 실측:
`/dev/tty: Device not configured`). 그래서 진짜 터미널에서 띄우거나, 런처 모드(exit 4)로 멈춘 뒤
진짜 터미널에서 `./approve.sh <feature> <산출물>` 로 승인해야 한다. `approve.sh` 주석이 전제하는
"`!` 프리픽스로 승인" 은 이 환경에서 동작하지 않는다.

**파이프라인 자체에 남은 결함 3건** (2026-08-24 하루에 세 번 죽으며 드러났다). 고칠 내용은
스크래치패드의 `pipeline-fix-prompt.md` 에 정리해 두었고 별도 세션에 넘긴다:
- `orchestrate.sh:172` 가 사인을 읽기 **전에** 죽는다 — 사인은 `*.stream.jsonl` 의 result
  이벤트(`subtype`·`errors`·`terminal_reason`)에 항상 있는데 exit code 만 보고 버린다
- `FAIL_LOG.md` 는 **검증 실패에만** 쓰인다(`:515` 한 곳). 프로세스 사망은 한 줄도 안 남아
  다음 재시도가 이전 실패를 모른다
- 재시도가 이전 시도의 `stream.jsonl` 을 덮어써 증거가 사라진다
