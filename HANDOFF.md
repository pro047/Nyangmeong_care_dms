# 인수인계 문서

새 세션이나 새 사람이 이 프로젝트를 이어받을 때 읽는 문서.
코딩 규칙과 함정은 `CLAUDE.md`, 진행 상황의 정본은 `MILESTONES.md`, 셋업은 `SETUP.md`.

**끝난 스트림의 일지는 `HANDOFF-ARCHIVE.md` 로 내린다 — 세션 시작 시 읽지 않는다.**
이 문서에는 상시분(지뢰·머신 상태·현재 우선순위)과 최신 스트림만 남긴다.
아카이브로 내려간 절을 본문이 가리킬 때는 `HANDOFF-ARCHIVE.md 의 "…" 절` 로 적는다.

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

## 현재 위치 (2026-09-29 갱신)

**정합성 패널이 "세 화살표" 로 바뀌어 운영에 배포됐다** (2026-09-28, PR #20 · #21). 패널은 ① 화면설계 요구사항 반영률
② 기능명세 요구사항 반영률 ③ 기능명세 화면 매핑률과, 화면설계·기능명세 둘 다에 없는 **미반영 요구사항**(ID·요구사항명,
세부내용 툴팁)만 본다. 헤더에 실행 상태(검사 완료 · 검사 중 · 검사 실패) 신호등. 운영 첫 측정 38/46 · 38/47 · 626/630, 미반영 7.
설계 근거는 `MILESTONES.md` 설계 표 '정합성 = 세 화살표' · '정합성 실행 상태' 행. 그 전 단계(이관 · 안전망) 설계 기록은 `HANDOFF-ARCHIVE.md` 의 "메인 페이지 재측정 안전망" 절.

**정합성 측정 이관이 운영에 배포됐다** (2026-09-27, PR #18 — 같은 날 앞서 "운영에 붙이지 말자" 였다가 메인 안전망을
붙인 뒤 단계마다 사람 승인으로 적용했다). docKey 가 달린 문서에 새 버전을 올리면 DMS 가 응답 뒤(`after()`)에 19개 문서를 직접
재서 스냅샷을 쌓고 메인 밴드가 그린다. 엔진은 정본 `docs.py` 와 **골든 항목 단위 diff 0**. 결정 D1~D7 은 전부
정해졌다(`HANDOFF-ARCHIVE.md` 의 "정합성 검사 이관 인계문" 절). 기록은 `MILESTONES.md` §'정합성 측정 이관', 운영 적용 순서도 거기 있다.

docKey 는 **화면이 없다 — 관리자가 요청하면 세션이 스크립트로 단다**(키 목록은 `doc_keys` 표 20개 · 상세 편집기는
만들었다가 걷었다 · API 두 개는 남김 — 2026-09-27 사람 결정). 운영 매핑 20개는 운영 MCP 읽기로 만들어 **사람이 확인했다** →
`runs/dockeys-plan-prod-20260927.json`.

> **머신 상태 (2026-10-02).** `origin/main` = `3a9973b`(PR #21 머지 `d9e1874` 뒤 파이프라인 chore 2건). 로컬은 브랜치 `docs/handoff-archive-20261002` 에 있고
> 09-28 배포 기록과 이 문서의 10-02 아카이빙이 거기 커밋돼 있다(아직 푸시·PR 전).
> - **운영**: PR #18(이관 · 안전망) → #20(실행 상태, `consistency_run` 표는 사람이 `db execute`) → #21(세 화살표, 스키마 변경 없음) 모두 배포.
>   운영 표: `doc_keys` · `documents.doc_key` · `consistency_refresh` · `consistency_run`. 운영 첫 세 화살표 측정 09-28 23:43(2830ms).
> - **백업 브랜치** `backup-before-dockey-20260927`(Neon, 컴퓨트 없음) — 09-27 스키마 적용 전 운영. 문제 없으면 지워도 된다(사람 판단).
> - **dev**: 운영과 같은 표 전부 적용. dev 는 08-26 복사본이라 REQ 가 v0.3 — ADM·NFR 에 "해당 없음" 이 없어 화면설계 분모가 60 으로
>   크고, FN-AIM·SCR-LAN 문서가 없어 "측정 제외 문서" 2건이 뜬다(운영은 0). E2E 가 쓴 스냅샷은 지웠다.
> - **dev 서버**: 09-28 세션이 백그라운드로 띄운 `next dev -p 3002` 는 **세션이 끝나면 같이 꺼진다** — 다음 세션은 직접 띄울 것.
>   스키마를 바꿨으면 반드시 다시 띄운다(옛 Prisma 클라이언트로 메인이 500 — 09-28 에 실제로 밟았다).
> - **운영 접속**: 이 맥에 `npx neonctl` 로그인이 남아 있다 — 운영 URL 은
>   `npx neonctl connection-string production --project-id frosty-field-49245768` 로 얻는다(값을 화면에 찍지 말 것).
> - `.scratch/prod/` 에 운영 최신판 20개(09-27 받음, git 제외)가 있다 — 엔진 드라이런 입력으로 썼다. 오늘 판과 다르다(REQ v0.8.4 이전).

> **`origin/main` 이 곧 운영이다.** 푸시가 Vercel 배포를 튼다 — 문서가 "미배포"라고 적혀
> 있어도 **브랜치에 있으면 이미 나간 것**이다. 2026-09-14 에 세션이 `MILESTONES.md` 제목의
> 낡은 *"3단계는 미배포"* 를 믿고 *"다음에 푸시하는 사람이 3단계를 배포한다"* 고 적었는데
> **이미 배포된 뒤였다.** 배포 여부는 문서가 아니라 `git merge-base --is-ancestor <커밋>
> origin/main` 으로 본다.

> **세션이 여러 개 붙어 있다.** 정합성 저장소 쪽(`nyangmeong-care-*`)이 하루에 셋 바뀌었고
> DMS 도 메인 체크아웃과 MCP 스트림이 **3002 포트를 같이 쓴다.** 측정이 서로 다른 세션에서
> 날아온 적이 있으니 `origin/main` 을 자주 fetch 할 것 — 오늘 두 번 갈라졌다.

**운영 DB 에 붙을 수 있게 됐다** (2026-09-09). 이 문서 곳곳과 "다음 작업" 1·2 번이
*"운영 DB 는 CLI 로 못 붙으므로 Neon 콘솔에서 본다"* 를 전제로 쓰여 있는데, **사람이 Neon
콘솔에서 접속 문자열을 건네면 세션이 직접 붙는다.** 다만 `uselibpqcompat=true` 를 붙여야
하고(없으면 self-signed 오류), **운영 엔드포인트는 `ep-winter-meadow-azns3bbw`, dev 는
`ep-aged-king-az3kh35r`** 다.

> **운영 `measured_at` 만 `timestamptz` 다** (2026-09-14). 나머지 시각 컬럼은 여전히
> `timestamp` 이고 UTC 벽시계다 — `pg` 로 읽으면 로컬(KST)로 파싱되므로 `::text` 로 원본을
> 받아야 한다. §지뢰의 *"DB 시각을 읽을 때 9시간이 밀린다"* 가 그 컬럼들에는 그대로 유효하다.


### 쪼개진 문서 합치기 — 롤백 (2026-09-22 운영 적용분, 상시)

- **쪼개진 문서를 두 차례 합쳤다 — 운영 적용** (2026-09-22). 남는 문서는 전부 정합성 인계문 §4 의 docKey id 다.
  1차 9묶음(25건) · 2차 3묶음(21건 — 건강기록 화면·기능, 로그인). 활성 77 → 52 → **31**, 버전 행 127 그대로.
  상세·검증은 `MILESTONES.md` §'쪼개진 문서 합치기'.
  **롤백**: `DATABASE_URL=<운영> node scripts/merge-rollback.mjs --snapshot runs/merge-prod-20260922.json --apply`
  (2차는 `…20260922b.json`) — 남은 문서에 새 버전·제목·태그 변경이 생기면 그 그룹은 거절한다. 1차와 2차는 남는 문서가
  겹치지 않아 **어느 쪽부터 되돌려도 된다**(2차 적용 뒤 1차 되돌리기 dry-run 9/9, 실측). Neon 백업 브랜치는 **`backup-before-merge-20260922`**(1차 합치기 **전** 시점, 사람이 만듦) — 이것으로 되돌리면 두 차례
  합치기와 **그 뒤 업로드까지 함께** 사라진다.
  **없어진 46건을 가리키던 디스코드 알림 링크는 404 다.**

### 정합성 화면 — 뒤집으면 안 되는 것 (2026-09-14 확정, 상시)

**뒤집으면 안 되는 것** (저쪽이 근거와 함께 못박음):
축 전부 표시 · 두 REQ 분모 나란히 · 측정 시각 크게 · **신호등 금지** ·
**`scrFuncCoverage` 합계 금지** · 없는 문서는 링크만 빼고 행은 남김.
**E2E 18개가 이걸 실제로 지킨다** — 렌더를 지우면 빨개지는 것을 확인했다.
### 되풀이되는 원리 — **파일명·판번호로는 신원과 정본을 못 가른다**

2026-09-10 하루에 같은 모양의 사고가 **세 번** 나왔다. 셋 다 파일 **바깥**의 정보(파일명·
판번호)로 판단하려다 틀렸고, 파일 **안**을 열어야 갈렸다.

| | 밖에서 본 것 | 안에서 갈린 것 |
|---|---|---|
| SCR-ACC (우리 오탐) | 파일명이 같은 계열 → 같은 문서 | **개정내역의 작성자 열** — 두 사람의 병행 판이었다 |
| FN-MYP·SCR-PLC (저쪽 오기) | 판번호가 DMS < manifest → DMS 가 구판 | **개정내역의 판번호·날짜** — 저쪽 기록이 틀렸다 |

> **판번호 파서가 두 벌이다** (2026-09-10). 저쪽이 `dms_sync.py` 의 `ver_from_filename` 을
> 우리 `VERSION_TOKEN`·`file-version.ts` 와 같은 범위로 맞췄다(못 읽는 키 4 → 0). 다만
> 파이썬은 가변 폭 lookbehind 를 못 써서 `(?<=^|[\s_—–-])` 를 `(?<![^\s_—–\-])` 로 바꿨다.
> **우리가 `VERSION_TOKEN` 을 고치면 저쪽도 같이 고쳐야 한다 — 알려 줄 것.**
> (한 벌로 만드는 길은 §다음 작업의 *판번호 라벨* 항목이고 아직 결정 안 났다.)

**이것은 `similar-document.ts` 가 영영 못 넘는 벽이다** — 판정은 파일명만 본다.
파일을 열어 판단하는 것은 **명시적 범위 밖**이고(파일 내용 전문 검색과 같은 이유),
그래서 이 앱의 답은 *자동으로 붙이지 않고 사람에게 묻는 것* 이다. 기본값이 "새 문서"인
근거가 여기서 한 번 더 확인됐다 — SCR-ACC 에서 실제로 그 기본값이 사고를 막았다.

**문구도 같은 병을 앓는다.** 우리 `notice` 는 *"순서"* 만 말하고 신원은 안 말한다.
저쪽 퇴행 가드도 *"DMS 에 최신본을 올려라"* 로 **한쪽을 단정**하고 있었다(저쪽은
*"어느 쪽이 맞는지 개정내역으로 확인하라"* 로 중립화했다). **한쪽을 단정하는 경고는
그 단정이 틀렸을 때 사람을 잘못된 방향으로 민다** — 우리 문구도 같은 손질이 필요하다.

### 미룬 리뷰 항목 (상시 — 계기가 오면 처리)

2026-08-22 리뷰에서 나왔으나 지금 고치지 않기로 한 것들. 각 행의 "언제" 가 계기다.
그 리뷰의 진단 원문·해소된 항목은 `HANDOFF-ARCHIVE.md` 에 있다.

**미룬 8건** — 지금 고치지 않는다:

| 위치 | 내용 | 언제 |
|---|---|---|
| ~~`discord.ts:88`~~ | 임베드 `url` 이 없는 `/documents/[id]` 를 가리킴 | **해소됨** — M3 가 그 라우트를 만들었다. 다만 알림은 `NODE_ENV=production` 에서만 나가므로 임베드 링크가 실제로 열리는지는 배포(M6) 후 확인 |
| ~~`documents/route.ts:37`~~<br>~~`[id]/versions/route.ts:35`~~ | **해소됨 (2026-08-30)** — 두 라우트가 토큰 검증 직후 `documentVersion.findFirst({where:{s3Key}})` 로 끊고, DB 의 `@@unique([s3Key])` 가 동시 요청까지 막는다. 실측: 순차 재사용 400(X4·X5), 동시 두 발 `201/400` 에 버전 행 1개(X9). 아래는 원문이다. `keyToken` 이 5분간 재사용 가능 → 같은 S3 객체에 Document N개. **M3 에서 versions 라우트가 같은 구멍을 복제했다** (2026-08-24 리뷰). `verifyUploadToken`(`upload-token.ts:35`)은 검증만 하고 토큰을 소모하지 않아, TTL 300초 안에 같은 `(s3Key, keyToken)` 으로 **서로 다른 문서**의 `/versions` 에 반복 POST 가 된다 — 피해 범위가 한 문서 안에서 문서 **사이**로 넓어졌다 | **고아 객체 정리 때 같이** — 정리 배치가 붙는 순간 한 문서를 지우면 다른 문서 파일이 사라진다. **두 곳을 같이 막을 것.** 토큰 1회용화는 사용 기록 저장소가 필요해 스키마 변경을 부른다. **2026-08-25: 영구삭제(`[id]/purge`)가 이 구멍을 우회한다** — `deleteObject` 앞에서 같은 `s3Key` 를 가리키는 버전이 남아 있는지 세고 0 일 때만 지운다. 구멍 자체는 그대로이고, 공유된 객체는 고아로 남는다(파일 유실보다 낫다) |
| `session.ts:6`<br>`session.ts:34` | **길드 멤버십은 로그인 순간에만 검사된다.** 세션은 30일 JWT 이고 `getSession()` 은 서명만 검증한다 — 길드 멤버십을 다시 안 본다. 그래서 **팀원이 길드에서 나가거나 추방돼도 최대 30일간 문서 열람·업로드·삭제가 된다.** `CLAUDE.md` 는 "접근 제어는 디스코드 길드 멤버십 하나뿐"이라고 적었지만 실제로는 **로그인 시점의 스냅샷**이다. JWT 라 개별 무효화 수단이 없고, 전역 무효화는 `AUTH_SECRET` 교체(= 전원 재로그인)뿐이다 (2026-08-25 코드 확인). **MCP(`oauth/tokens.ts`)도 같은 모양이다** — access(1시간)는 세션이 있어야 새로 나가지만, refresh 는 발급 이후 `prisma.user` 재조회만 하고 길드 멤버십은 다시 안 본다. refresh 의 만료는 **최초 동의 시각(`auth_time`) + 30일 고정**이라 세션 쿠키와 같은 30일 창이다(2026-09-11). *원래는 리프레시마다 새 30일을 줘서 창이 무기한이었고, 여기에 "두 배로 만들지 않는다"고 적었던 것은 그걸 못 본 것이다 — 코드 리뷰로 정정* | **팀원 이탈이 생기면 즉시** — 그전까지는 노출이 없다. 7인 팀에 이탈이 없으면 계기가 안 온다. 고치는 방향 둘: (a) `MAX_AGE_SECONDS` 를 30일 → 1~7일로 줄여 창을 좁힌다(싸다, 재로그인이 잦아진다) (b) `getSession()`·MCP 리프레시 양쪽에서 길드를 재확인한다(정확하다, 매 요청 디스코드 API 를 쳐서 비싸다). **급하면 `AUTH_SECRET` 교체가 즉효다** — MCP 토큰의 키도 이 시크릿에서 파생되므로 세션과 함께 전부 무효화된다 |
| `login/page.tsx:31` | `?error=` 값을 **화이트리스트 없이 그대로 렌더**한다. `page.tsx` 배너(`/`)는 `pageErrorMessage` 로 거르는데 `/login` 은 안 거른다 — 임의 문장이 빨간 배너로 뜬다. React 가 이스케이프하므로 XSS 는 아니고, 로그인 폼에 입력 필드가 없어 훔칠 것도 없다 (2026-08-25 코드 확인) | **계기 없음** — 심각도가 낮다. `/` 와 정책이 갈린다는 것만 기록해 둔다. 고친다면 `pageErrorMessage` 를 `/login` 에도 적용 |
| `s3.ts:71` | `catch { return null }` 이 403·503 을 "파일 없음"으로 뭉갬 | 로그 추가로 충분 |
| `upload-dialog.tsx:39,74,139`<br>`version-upload-dialog.tsx:39,50,98` | `inFlight` 에서 완료된 XHR 을 제거하지 않음. 줄번호는 `putToS3` 를 `lib/upload-xhr.ts` 로 뺀 뒤 기준(2026-08-24). 같은 결함이 재업로드 다이얼로그에 복제됐다 | 누수는 다이얼로그 수명 한정 |
| ~~`(app)/error.tsx:17-28`~~ | **해소됨 (2026-08-31).** 계기("M6 배포 때")가 2026-08-25 에 이미 지났는데 6일간 처리가 안 됐다 — **계기 기반 목록의 약점이 이것이다. 계기가 왔는지 아무도 안 본다.** 고친 문구는 팀원이 실제로 할 수 있는 행동이다(관리자에게 "DB 연결 실패"라고 알림). 원문은 개발자용 지시가 사용자 화면에 새어 나온 것이었고, Neon 직결로 옮긴 뒤로는 터널 자체가 없다 |
| `lib/tag.ts` (정규화) vs `lib/search.ts` (필터) | 영문 태그 대소문자 정책이 갈린다. **한 문서 안**에서는 `Plan`/`plan` 이 합쳐지는데(`normalizeTags` 가 대소문자 무시 중복 제거) **문서 사이**에서는 필터가 완전일치라 갈린다. `DESIGN.md` §4 가 "팀 태그는 한글 위주"를 근거로 의도적으로 수용한 것이다 | **영문 태그를 실제로 쓰기 시작하면** — 팀이 안 쓰면 계기가 안 온다. 고친다면 `Tag.name` 을 소문자로 저장하고 표시용 원본을 따로 두는 쪽인데 스키마 변경을 부른다 |
| `page.tsx` 배너 (2차 리뷰) | `?error=notfound` 가 주소창에 눌러앉는다. 배너를 띄운 화면에서 업로드하면 `close()` 의 `router.refresh()` 가 **URL 을 안 바꿔서** 방금 성공한 업로드 옆에 낡은 에러가 남는다 | 닫기 버튼(`history.replaceState`)이나 렌더 후 파라미터 제거. ~~M3 상세 페이지가 배너를 하나 더 쓸 것이므로 그때 같이~~ — **그 전제가 깨졌다.** 상세 페이지는 배너 대신 `notFound()` + 세그먼트 `not-found.tsx` 를 쓴다(URL 에 에러가 눌러앉지 않는다). 배너를 쓰는 곳은 목록의 다운로드 링크뿐이라 이 항목은 계기 없이 남는다 |
| `download/route.ts:36` (2차 리뷰) | 같은 핸들러의 401 만 여전히 내비게이션에 JSON 을 준다 | **의도된 것.** proxy 가 같은 쿠키를 같은 키로 먼저 검증하므로 도달 창은 프록시 통과와 라우트 도착 사이 수 ms 경합뿐이다. 이유를 `route.test.ts` 주석에 박아 뒀다 |

---

## 지뢰 (겪은 것들)

**xlsx 3건이 `<x:workbook>` 네임스페이스 접두사라 ExcelJS 가 못 읽는다** (2026-09-14).
MCP 워크트리 세션이 MCP 쪽에서 먼저 찾았고(운영 19건 중 3건, 전부 `sannabi1` 업로드),
**웹 미리보기도 같은 로더(`xlsx-view.ts` → ExcelJS 4.4.0)를 써서 똑같이 깨진다 — 운영에서
3건 전부 실측했다:**

```
이 파일은 미리보기를 만들지 못했습니다. 내려받아서 여세요.
(Cannot read properties of undefined (reading 'sheets'))
```

깨진 문서: `로그인·회원가입_기능명세서_v0.3_20260913` · `06_로그인_회원가입_기능명세서` ·
`05_플레이스_동물병원_기능명세서`. **팀원이 실제로 보는 화면이 이미 안 열리고 있다.**

> **에러 문구는 정직했다.** *"미리보기를 만들지 못했습니다"* 로 실패를 밝히고 다운로드로
> 보낸다 — 빈 화면을 보여주거나 성공한 척하지 않는다. 그래서 **사고가 조용하지 않았는데도
> 아무도 신고하지 않았다.** 화면이 실패를 말해도 사람이 그걸 우리에게 전하지는 않는다.

**고쳐져서 배포됐다** (2026-09-14, PR #7 → `c7e1a68`, MCP 워크트리 세션). ExcelJS 가 실패할 때만
접두사를 걷고 재시도하는 `src/lib/xlsx-load.ts` 를 **웹 미리보기와 MCP 가 공유**한다
(`jszip 3.10.1` 직접 의존성 추가, 사람 승인). **운영에서 3건 전부 열리는 것을 확인했다** —
웹 미리보기는 시트 탭(`표지`·`제.개정내역`·`기능 목록`)까지 그려지고, MCP `read_document` 로도
3건 모두 읽힌다(실측). **xlsx 를 여는 새 경로를 만들면 `loadXlsx` 를 거칠 것** —
`workbook.xlsx.load` 를 직접 부르면 이 파일들에서 다시 깨진다.

> **깨진 것도 나은 것도 같은 방법으로 쟀다.** 운영 문서를 직접 열어 실패 문구와 셀 수를
> 봤다(깨졌을 때 셀 7·14, 지금 38·45). 남이 고쳤다고 해서 고쳐진 것이 아니라 **열어 보고**
> 고쳐진 것이다.


**스냅샷 두 개를 나란히 놓으면 두 가지로 틀린다** (2026-09-13, 하루에 둘 다 겪음).
① **분모가 같이 바뀌면 비율이 거짓말을 한다** — `scrCoverage 54/54 → 58/59` 는 100%→98%
로 보이지만 퇴행이 아니다(분모에 화면 5개가 새로 들어왔다). ② **집계 축이 다른 두 표의
숫자를 나란히 놓으면 안 된다** — 세션이 `참조 37 → 33` 이라고 보고했는데 37 은 warning 만,
33 은 error+warning 이었다. 실제는 51→33 이다. **저장값은 맞았고 읽는 쪽이 틀렸다.**
스냅샷 비교 화면은 아직 없지만 **만드는 순간 둘 다 재현된다** — 상세는
`MILESTONES.md` §'스냅샷 두 개를 나란히 놓을 때의 함정'.


**목록의 `버전` 열은 파일명에서 읽은 값이라 재업로드해도 안 움직인다** (2026-09-13).
운영 실물에서 요구사항정의서의 4회·5회가 **둘 다 `v0.6`** 이었다 — 새 버전을 올려도 목록이
한 글자도 안 바뀐다. SharePoint 류가 `1.0 → 2.0` 으로 움직이는 것과 정반대이고, 실제로
*"이전 문서가 하나도 없다"* 는 오판을 낳았다. 지금은 `v0.6 · 5회` 로 **앱이 센 횟수**를
같이 띄운다. **"목록이 안 바뀌었다"를 "안 올라갔다"로 읽지 말 것.**

**`latest.ts` 의 재업로드 빈도 주석이 8배 틀어져 있었다** (2026-09-13 운영 실측).
*"활성 28건 중 27건이 versionNo=1"*(3.6%)이라고 적혀 있었는데 지금은 **33건 중 10건(30%)**
이다. 붙이기가 쓰이기 시작한 결과다. **"재업로드는 거의 없다"를 전제로 쓴 판단이 있으면
다시 재야 한다** — 이 숫자 하나가 "목록에 이력을 펼칠 값이 있나"의 결론을 뒤집었다.
dev 통계(23건 중 6건)만 보고 한 번 틀린 판단을 했다: **운영과 dev 는 다르다.**


**`next dev` 를 오래 띄워 두면 `prisma generate` 결과를 못 본다** (2026-09-12 실측).
증상이 고약하다 — **단위 테스트는 전부 통과하는데 실제 왕복만 500** 이다. 라우트도 zod 도
살아 있고(잘못된 본문에는 정상적으로 400 을 낸다) `prisma.<새모델>` 만 undefined 다.

모델을 더한 날 서버가 5일 전에 떠 있었다: 기동 `Sep 7 22:05` · generate `Sep 12 20:32`.
HMR 은 `src/` 를 다시 읽지만 **`src/generated/prisma` 의 클라이언트 인스턴스는 다시 안 만든다.**

**조치는 dev 서버 재시작 하나다.** 확인 방법: `ps -o lstart= -p $(lsof -ti:3002)` 로 기동
시각을 보고 `stat -f %Sm src/generated/prisma` 와 비교한다. 서버가 더 오래됐으면 그것이다.

> **이 사고는 라우트 단위 테스트로는 원리상 안 잡힌다.** 그쪽은 `vi.mock('@/lib/prisma')`
> 라 실제 클라이언트를 안 쓴다. 스키마를 건드린 스트림에서는 **실제 왕복을 한 번 재는
> 것이 선택이 아니다** — 정합성 저장소가 302→307 로 겪은 것과 같은 종류다.

**상태를 다룰 때 걸리는 lint 벽이 둘 있다** (2026-09-06, 사이드바 정비에서 겪음).
React Compiler 규칙이라 **우회하지 말 것** — 각각 정해진 해법이 있다. 세 방식을 다 시도해
본 기록은 `MILESTONES.md` §'사이드바 정비'.

| 규칙 | 걸리는 자리 | 해법 |
|---|---|---|
| `react-hooks/set-state-in-effect` | `useEffect` 안의 `setState`. props 변화에 상태를 맞출 때 | **렌더 중 상태 조정**(React 문서화 패턴). `open = expanded.has(id) \|\| id === parentOf(active)` 같은 OR 합성은 짧지만 **접기를 막는다** |
| `react-hooks/refs` | 렌더 중 ref 읽기. `drag.current === null` 을 클래스에 쓸 때 | **상태로 승격.** 이벤트 핸들러 안에서 읽는 것은 괜찮다 |

**드래그처럼 `window` 리스너가 필요해 보이는 자리는 `setPointerCapture` 로 이펙트 자체를
없앨 수 있다** — 포인터를 캡처하면 커서가 본문 위로 나가도 이벤트가 핸들 요소로 온다.

**테스트가 통과하는 것과 테스트가 무언가를 지키는 것은 다르다.** 2026-09-06 에 `/code-review`
가 새 테스트 2건 중 1건이 **옛 구현에서도 통과한다**는 것을 실측으로 잡았다. 새 테스트를 쓰면
**옛 구현으로 되돌려 실제로 실패하는 것까지 확인할 것.** 같은 날 버전 열 작업에서 이 확인이
후보 하나를 지웠을 때 5건/1건이 각각 실패하는 것을 보여 규칙이 실제로 뭔가를 지킨다는 것을
확정했다.

**DB 시각을 읽을 때 9시간이 밀린다.** `created_at` 은 `timestamp without time zone` 이고
Prisma 가 **UTC 로 저장**한다. 그런데 node-postgres 는 시간대 정보가 없는 값을 **실행
머신의 로컬(KST)로 파싱**한다. 거기에 `.toISOString()` 을 걸면 **다시 -9 시간** 해서
저장값보다 9시간 이른 값이 나온다.

2026-08-26 에 이걸로 오판했다. 팀원 로그인이 08-24 로 보여 "배포 하루 전에 팀이 쓰고
있었다 → 방어선 검증 전에 URL 이 뿌려졌다"는 결론까지 갔는데, **전부 없는 사실이었다.**
실제로는 배포 당일 오후였다.

```sql
-- 저장된 값 그대로 보기 (UTC). 여기에 +9 를 해야 KST 다
select created_at::text, username from users order by created_at;
```

`.toISOString()` 을 쓰지 말고 `::text` 로 원본을 받을 것. **날짜 하나로 사건의 순서를
뒤집는 판단을 할 때는 반드시 원본부터 확인한다.**

**Tailwind 4 의 `@theme` 과 shadcn 의 `@theme inline` 은 같은 이름공간을 쓴다.**
`shadcn init` 이 넣는 `@theme inline` 블록은 `--color-*` 를 **재정의**한다. 우리가 이미
쓰던 이름과 겹치면 나중 것이 이긴다. 2026-08-26 에 `--color-border`(순환 참조로 화면 전체
테두리가 잉크색) 와 `--color-accent`(주 버튼이 흰 배경에 흰 글씨) 두 개가 이렇게 깨졌다.

**빌드·린트·타입검사가 전부 통과한다.** CSS 변수 충돌은 어느 검사도 안 잡고 배포까지 나간다.
확인하려면 **빌드 산출 CSS 를 직접 봐야 한다**:

```bash
npm run build
grep -o -- "--color-accent:[^;}]*" .next/static/chunks/*.css   # 리터럴이어야 정상
```

`var(...)` 가 나오면 `@theme inline` 이 덮은 것이다. 배포본은 `/login` HTML 의
`.css` 링크를 받아 같은 grep 을 건다. **`shadcn add` 로 컴포넌트를 새로 받을 때마다
`@theme inline` 블록을 대조할 것** — 그 두 줄이 다시 들어오고 `bg-accent` 를 쓰는 코드도
딸려 온다.

`CLAUDE.md` 의 "함정" 절과 별개로, 운영하다 부딪히는 것들.

**`.pipeline/` 산출물은 git 어디에도 없다. 설계·검증 문서가 그 머신에만 남는다.**
(2026-08-28 에 실제로 잃었다.) `.gitignore:48` 이 `.pipeline/` 을 통째로 무시하므로
`DESIGN.md`·`JUDGE.md`·`VERIFY.md` 가 커밋에 안 들어간다 —
`git log --all --diff-filter=A -- '*.pipeline*'` 이 **빈 출력**이다(확인함).
0-1 의 `VERIFY.md` §5(B1~B9 절차)는 Windows worktree 에만 있었고 개발 머신이 맥으로
바뀌면서 **복구 불가가 됐다.** 실측 항목은 `8e3ef4b` 의 코드와 커밋 메시지에서 역산해
`test/e2e/suggest-name-edit.mjs` 로 재구성했다 — **원본과 항목 번호가 다르다.**
남은 것은 커밋 메시지뿐이므로 **파이프라인 주행의 커밋 메시지를 길게 쓰는 것이 실제로
보험이 된다.** `.pipeline/` 을 추적할지는 **아직 정하지 않았다**(gitignore 정책 변경).

**문서가 Windows 를 전제한 곳이 남아 있다** (2026-08-31 정정). `CLAUDE.md:87` 이
*"Windows 개발 환경 · 셸은 Git Bash"* 라고 적고 있었다 — 지금 머신은 Darwin + zsh 다.
경로가 갈리는 자리가 실제로 있다:

- Playwright 브라우저는 `~/AppData/Local/ms-playwright` 가 아니라
  `~/Library/Caches/ms-playwright` 에 있다 (아카이브 "실측 방법" 절의 기록이 구 경로다)
- `.claude/settings.local.json` 의 PowerShell 규칙은 이 PC 에서 쓰이지 않는다. 그래서
  **파이프라인 결함 2번의 "다음 주행에서 권한 거부 8→4 로 떨어지는지 확인"은 이 머신에서는
  계기가 오지 않는다** — 검증 항목으로 계속 들고 있을 이유가 없다

**맥에서 처음 돌릴 때 `prisma generate` 를 안 하면 `GET / 500` 이 난다** (2026-08-28).
사인은 `Unknown field 'aliases' for select statement on model 'Folder'` 인데
**DB 문제가 아니다** — `folders.aliases` 컬럼은 psql 로 읽힌다. `prisma/schema.prisma:33`
에는 있는데 `src/generated/prisma/` 가 낡은 것이다(생성 시각 2026-08-21).
`postinstall` 이 `prisma generate` 라 `npm install` 을 돌리면 자동으로 되지만,
**코드만 pull 해 오면 안 돌아간다.**

> **generate 만으로는 안 낫는다 — dev 서버를 재시작해야 한다.** Turbopack 이
> `.next/dev` 에 낡은 클라이언트 청크를 캐시하고 있어 `prisma generate` 직후에도
> 같은 에러가 그대로 났다. 재시작하니 `GET / 200`. 고친 것과 서버가 읽는 것이
> 다른 자리라, 아래 "`.env` 가 두 벌" 함정과 같은 계열이다.

**커밋 작성자가 `pro047` 이 아니면 Vercel 배포가 블락된다** (2026-08-25, 맥에서 겪음).

에러 문구: `The deployment was blocked because the commit author did not have
contributing access to the project on Vercel. The Hobby Plan does not support
collaboration for private repositories.`

Vercel 은 head 커밋의 **작성자 이메일**을 GitHub 계정으로 역매핑해 프로젝트 접근 권한을
본다. GitHub 리포와 Vercel 프로젝트의 소유 계정이 `pro047` 인데 다른 이메일로 커밋하면
**제3자로 판정**되고, private 리포의 제3자 배포는 Pro 플랜 기능이라 차단된다.

**맥의 git 전역 설정이 회사 신원(`viajinseong <jinseong@viasofts.com>`)이라 걸렸다.**
윈도우 PC 는 `pro047 <pro047@naver.com>` 이라 여태 문제가 없었다. 리포 로컬 설정으로 막았다:

```bash
git config --local user.name  pro047
git config --local user.email pro047@naver.com
```

**로컬 설정이라 이 리포에서만 적용된다** — 다른 프로젝트의 회사 신원은 그대로다.
새로 클론하면 로컬 설정이 없으니 **다시 걸린다. 클론 직후 위 두 줄을 먼저 실행할 것.**

증상 구분: 사이트는 200 으로 멀쩡하다 — **빌드가 실패한 게 아니라 배포가 시작조차 안 되고
이전 배포가 계속 서빙**되기 때문이다. `curl` 로는 구분이 안 되고 Deployments 탭을 봐야 한다.

> **`Co-Authored-By` 트레일러는 원인이 아니다.** 배포에 성공한 `d909c87`·`7586a7c`·
> `008b7da` 에도 똑같이 붙어 있다. 처음에 그쪽을 의심했다가 커밋 로그 대조로 걸러냈다.

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

**~~S3 고아 객체가 쌓인다.~~ 해소됨 (2026-08-30, `s3-orphan-cleanup`).** 원문은
*"`deleteObject` 는 정의만 되고 호출처가 0건이다. 정리 경로가 없다"* 였는데 **두 번 낡았다** —
2026-08-25 에 영구삭제(`purge/route.ts:57`)가 부르기 시작했고, 이번에 취소·생성 실패 경로가
붙었다. 지금 호출처는 `purge` 와 `api/uploads/discard` 둘이다.

정리 방식은 아래 (b) 다 — **만든 쪽이 그 자리에서 지운다.** 브라우저가 취소하거나
`create` 가 실패하면 `POST /api/uploads/discard` 로 그 키를 넘기고, 서버가 **그 키를
참조하는 버전 행이 있는지 세어** 0 일 때만 지운다(파일 유실 방어선). 실측은
`npm run test:e2e:orphan` (9케이스).

**남는 고아는 넷이고 전부 의도적이다** — ① 탭 강제 종료, ② 토큰 만료(5분 초과 업로드),
③ discard 요청 자체의 네트워크 실패, ④ **이번 변경 이전에 이미 쌓인 것**(아래 `ListBucket`
때문에 사후 스캔이 불가능해 손대지 못한다).

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

**버킷의 CORS 설정은 앱 자격증명으로 읽을 수 없다** (2026-08-28 실측).
`dms-app` 에 `s3:GetBucketCORS` 가 없어 `GetBucketCors` 가 `AccessDenied` 로 떨어진다.
위의 `s3:ListBucket` 과 같은 계열이다. 그래서 **`infra/s3-cors.json` 은 "의도"일 뿐
적용 여부의 근거가 아니다** — 확인 수단은 그 오리진의 브라우저로 실제 요청을 쏴 보는
것뿐이다. 허용 오리진을 늘리면 같은 절차가 필요하다.

**worktree 에는 `.env` 가 안 따라간다.** gitignore 대상이라 `pipeline-worktree.sh` 로 판
worktree 는 `.env` 도 `src/generated/prisma` 도 없다. 그러면 프리플라이트가 빌드 게이트를
끄고 사람 게이트를 띄운다 — 런처 모드(tty 없음)에서는 exit 4 다. **타입 검사가 꺼진 채
`DONE` 을 받는 것이 실제로 일어난 사고다.** 둘 중 하나를 고를 것:
- `.env` 를 worktree 로 복사하고 `npx prisma generate` → 빌드 게이트가 켜진다 (권장)
- 그대로 두고 `./approve.sh <feature> PREFLIGHT.md` 로 승인 → 타입 검사 없이 돈다

`settings.local.json` 도 전역 gitignore 대상이라 worktree 에 안 간다 (실측). 그래서
파이프라인 권한 규칙은 **커밋되는** `.claude/settings.json` 에 있다.

**"자리만 잡아둔" UI 가 실제로는 살아 있을 수 있다.** 헤더 검색창이 주석에
"M4에서 실제 검색으로 연결"이라 적힌 채 `<form action="/search">` 로 **동작하고 있었다** —
그 라우트가 없어서 엔터 한 번에 Next 기본 404 였다. 사이드바 "새 폴더"는 `disabled` 로
정직하게 막혀 있었는데 검색창만 빠진 것이다 (2026-08-23 `ee7f11d` 에서 맞춤).
비슷한 자리표시 UI 를 새로 넣을 때는 **주석이 아니라 `disabled` 로 막을 것.**
주석은 사용자를 막지 못한다.

---

**Neon 브랜치는 만료 옵션이 붙으면 조용히 사라진다** (2026-08-27 겪음).
dev 브랜치가 하루 만에 없어져 앱이 `28P01 password authentication failed` 로 죽었고,
새로 만들자 엔드포인트가 바뀌었다. **저절로 지워지는 경로는 만료(TTL) 하나뿐이다** —
흔히 삭제로 오해하는 compute 자동 정지(접속하면 깨어난다)와 비활성 브랜치
아카이빙(목록에 계속 보인다)은 삭제가 아니다. **브랜치를 만들 때 만료 옵션을 끌 것.**
원인 확정은 Neon 콘솔 Operations 이력의 `delete_branch`.

**Neon 리전은 바꿀 수 없고, 바꿀 곳도 없다** (2026-08-25 공식 문서 확인).
Neon 은 서울(`ap-northeast-2`)을 지원하지 않는다 — 아시아는 싱가포르
(`ap-southeast-1`)와 시드니뿐이고 도쿄도 없다. 기존 프로젝트의 리전은 변경 불가라
옮기려면 새 프로젝트 + 마이그레이션이다. 지금이 이미 최선이다.
(Vercel 함수 리전은 `icn1` 로 고정돼 있다 — 위 "현재 위치".)

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

> **읽기 예외 하나 (2026-09-13 사람 결정 · 2026-09-14 배포).** MCP `read_document` 만 서버가
> S3 에서 원본(≤1MB, `Range` 로 상한 이중)을 받아 텍스트로 바꿔 싣는다 — claude.ai 웹챗
> 샌드박스가 S3 에 직접 못 붙어서다. 올리기와 화면 다운로드는 여전히 직결이다. 근거는
> `CLAUDE.md` 읽기 예외 절 · `MILESTONES.md` 설계 결정 표 '웹챗 읽기' 행.

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
    .well-known/
      oauth-authorization-server/route.ts   GET RFC 8414 인가 서버 메타데이터
      oauth-protected-resource/route.ts     GET RFC 9728 보호 자원 메타데이터 (mcp-handler)
    oauth/authorize/page.tsx  MCP 동의 화면. (app) 밖 — login/page.tsx 와 같은 층
    api/oauth/
      register/route.ts       POST 동적 클라이언트 등록(DCR)
      authorize/route.ts      POST 동의 제출 → 인가 코드
      token/route.ts          POST 토큰 교환·리프레시
    api/mcp/route.ts          MCP 서버 본체 (withMcpAuth + createMcpHandler)
    (app)/                    로그인 필수 구간. layout.tsx가 세션 검사 + 헤더/사이드바
      page.tsx                문서 목록 (최근 수정순). 제목은 상세로 간다
      documents/[id]/page.tsx 문서 상세 — 메타 수정 · 재업로드 · 버전 타임라인
      documents/[id]/not-found.tsx  없는/휴지통 문서. 배너 리다이렉트가 아니라 이 자리에서 알린다
      trash/page.tsx          휴지통
      search/page.tsx         검색 결과 (헤더 검색창의 대상)
      error.tsx               에러 바운더리. DB 연결 실패를 따로 안내 (문구는 팀원용 — 개발자 지시 금지)
    login/                    비로그인 구간
    api/auth/                 login · callback · logout
    api/documents/
      route.ts                POST 문서 생성 (keyToken 검증 + HeadObject)
      presign/route.ts        POST 서명 URL + keyToken 발급
      [id]/route.ts           DELETE 소프트 삭제 · PATCH 제목·설명 수정
      [id]/restore/route.ts   POST 복구
      [id]/versions/route.ts  POST 재업로드 (v2+ 누적, keyToken 검증 + HeadObject)
      [id]/download/route.ts  GET presigned URL로 리다이렉트
      [id]/purge/route.ts     DELETE 영구삭제 (휴지통 문서만)
      [id]/tags/route.ts      PUT 태그 교체
    api/uploads/discard/       문서가 되지 못한 S3 객체 삭제 (POST)
    api/folders/
      route.ts                POST 폴더 생성
      [id]/route.ts           PATCH 이름변경 · DELETE 삭제
  components/                 app-header · app-sidebar · upload-dialog(폴더 셀렉트 포함)
                              document-table · document-row-actions(삭제, redirectTo 로 상세에서도 씀)
                              trash-row-actions(복구·영구삭제) · document-meta-editor(제목·설명)
                              version-upload-dialog(재업로드) · folder-tree(생성·이름변경·삭제)
                              document-folder-select(문서 이동) · tag-editor
    ui/                       shadcn/ui 산출물. **손으로 고친 자리가 있다** —
                              sonner.tsx 의 useTheme 을 걷고 theme 을 light 로 고정했다
                              (ThemeProvider 가 없어 OS 다크에서 토스트만 검게 뜬다).
                              **select.tsx 는 받아만 두고 안 붙였다(사용처 0곳).**
                              <select> 3곳은 네이티브 그대로 — 모바일 OS 피커와
                              키보드 조작이 공짜라 바꾸면 그걸 잃는다
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
    upload-flow.ts            업로드 한 건의 흐름 (presign → PUT → 생성) · 취소 처리
    folder.ts                 폴더 이름 검증·정규화 · 트리 조립
    tag.ts                    태그 정규화(대소문자·중복) · 파싱
    search.ts                 검색어 파싱 → where 절 (제목·설명·태그)
    page-error.ts             `?error=` 화이트리스트 (임의 문장은 배너로 안 뜬다)
    request-kind.ts           내비게이션 요청 판별 — JSON 대신 배너로 돌려보낼지 가른다
    utils.ts                  shadcn 의 cn() — clsx + tailwind-merge
    classify.ts               파일명 → 폴더 판정. 정규화(NFC·소문자·문자/숫자만) ·
                              노이즈 제거(버전·날짜·중복접미사·숫자prefix) · 점수(키 길이)
    classify-plan.ts          목적지 계획 · 폴더 선생성 · 빈 폴더 정리 (의존성 주입)
    oauth/                    MCP 인가 서버 (전부 순수 함수 + jose)
      tokens.ts                client_id·code·access·refresh JWT 발급·검증 (aud 로 용도 분리,
                               키는 AUTH_SECRET 파생 — 세션 쿠키로 통과하지 않게)
      redirect-uri.ts          redirect_uri 허용 목록·루프백 매칭
      pkce.ts                  S256 검증
      return-to.ts             로그인 후 돌아갈 곳 검증
      authorize-request.ts     /oauth/authorize 쿼리 스키마·오류 리다이렉트
      metadata.ts              RFC 8414 메타데이터 조립
    mcp/                      MCP 리소스 서버
      tools.ts                 도구 입력 스키마 + Prisma 행 → 출력 변환 (순수)
      server.ts                registerDmsTools — 도구 4개를 McpServer 에 등록 (접착)
      auth.ts                  withMcpAuth 의 verifyToken (Bearer → AuthInfo)
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

**2026-09-29: 살아 있는 코드 작업이 없다.** 정합성 패널(세 화살표 · 실행 상태 · 안전망)은 운영 배포됐다. 남은 것(전부 착수 전 —
사람이 고를 것):
- 09-28 배포 기록(이 파일·`MILESTONES.md` 의 커밋 안 한 변경)을 PR 로 올리기
- **미반영 요구사항 7건 확인** — 문서 쪽 일이다(ACC-004 · HOS-002~005 · PLC-002 · CSC-003). 요구사항에는 화면을 지정했는데 화면설계서가
  그 요구사항 ID 를 안 적은 경우일 수 있다
- 미검증: MCP `add_version` 경로에서 `after()` 가 도는지(다음에 MCP 로 올릴 때 로그 확인)
- 남긴 리뷰 항목: 외부 POST 가 미래 시각의 옛 형식 스냅샷을 보내면 "곧 다시 잽니다" 가 안 풀림(외부 경로 미사용) · 툴팁 세부내용 500자 잘림 ·
  기능명세 분모는 여전히 영역 기준 · "더 새 변경" 신호가 측정 안 하는 쓰기(PATCH·태그)까지 셈(우회로 막음 — 근본 해법은 요청 시각 기록)
- 의미(내용) 검사는 **비용으로 접었다**(월 1.5만~40만 원 추정 — 설계 표 참조). 규칙 기반 숫자 대조(무료)는 후보로만
- 백업 브랜치 `backup-before-dockey-20260927` 정리 여부

0-3. **MCP 서버 — 1~3단계 배포·운영 확인 끝 (2026-09-14).** Claude Code·Codex·claude.ai·ChatGPT 가
   문서를 찾아 읽고(1단계 `c2e658d`) 새 버전으로 올리고(2단계 `f04dd12`) 본문을 텍스트로
   읽는다(3단계 `88fa444` + 결함 수정 `c7e1a68`). 정본은 `MILESTONES.md` §'MCP 서버 · 1~3단계' 다.
   1~3단계 착수 지시와 운영 확인 일지 전문은 `HANDOFF-ARCHIVE.md` §'MCP 서버 0-3 본문' 으로 내렸다.
   **3단계에서 배운 것 둘**: ① **MCP 클라이언트마다 도구 응답을 다르게 보여준다** — `[메타, 본문]`
   두 content 블록을 웹챗은 둘 다 보여줬고 Claude Code 는 메타만 보여줬다(2026-09-14 실측).
   도구 응답은 **텍스트 블록 하나**로 싣는다(`structuredContent` 없음). 새 도구를 만들 때도 같다
   ② 운영 xlsx 에 네임스페이스 접두사 파일이 섞여 있다 — §지뢰 첫 항목.
   **남은 것 (전부 계기 대기 — 실사용에서 문제가 보이면 본다)**:
   - 3단계: H3 175KB 이어 읽기·기본 limit 20,000 · H4 1MB 초과·빈 파일·EUC-KR 경고 · H5 xlsx 응답 시간 ·
     H7 기존 9개 도구 회귀
   - 1단계: ⓔ 1시간 뒤 리프레시 · ⓖ 비길드 차단(부계정이 없어 미확인).
     ⓕ ③ A(샌드박스가 S3 에 직접)는 3단계 B안으로 대체되어 닫혔다.
     **ⓑ Codex 와 ChatGPT 웹은 2026-09-14 에 닫혔다** — *이 절 머리말은 그 전부터 "ChatGPT 가
     읽는다"고 적고 있었지만 ChatGPT 는 그날 전까지 한 번도 붙어 본 적이 없었다.*
     - **Codex CLI** (0.153.4): `codex mcp add dms --url …/api/mcp` 가 OAuth 를 스스로 감지해
       로그인까지 끝냈고 `list_folders` 가 24건을 돌려줬다. **지뢰: `codex exec` 는 MCP 도구 호출을
       승인 정책으로 막는다** (`requires approval, but approval policy is never`) — 서버 문제가
       아니다. `-c 'mcp_servers.dms.default_tools_approval_mode="approve"'` 로 통과한다
       (값은 `auto`·`prompt`·`writes`·`approve`). `enabled_tools` 를 `-c` 로 넘기면 도구가 아예 안 보였다
     - **ChatGPT** (Plus · 개발자 모드 — Plus 에도 있다): 첫 커넥터 생성이 DCR 에서
       `invalid_redirect_uri` 로 거절됐다. 인가 서버가 RFC 9207(`iss`)을 광고하지 않으면
       ChatGPT 는 고정 콜백 대신 커넥터별 `https://chatgpt.com/connector/oauth/<id>` 를 쓴다.
       허용 목록에 넣어(PR #9 → `7d15767`) 배포한 뒤 **사람이 생성·로그인·도구 호출까지 확인했다.**
       RFC 9207 구현안을 버린 근거는 `MILESTONES.md` redirect_uri 절. **ChatGPT 는 개발자 모드가
       웹 전용이라 데스크톱·모바일 앱에서는 못 쓴다**(OpenAI 도움말)
     - 남은 클라이언트 쪽 미확인: Claude 데스크톱·모바일 앱(웹에서 추가한 커넥터가 따라온다는 것은
       도움말 기준) · 웹챗에서 올리기 도구
   - 2단계: 화면 회귀 — dev 에서 `npm run test:e2e:orphan`(X1·X2·X3 취소·X6~X9).
     **3002 의 `cwd` 부터 확인할 것** — 다른 체크아웃의 서버면 거짓 초록불이다
   - `CLAUDE.md` 인증 절에 MCP 한 줄은 아직 안 넣었다(보호 파일 — 사람이 세션에서)
   *옛 본문 끝의 "worktree `../Nyangmeong_care_dms-pipeline-mcp-read` · 브랜치 `pipeline/mcp-read`
   는 지워도 된다" 는 닫혔다 — 2026-09-14 에 둘 다 이미 없다(`git worktree list` · `git branch -a` 실측).*
> **이미 끝난 배포 작업의 기록** — 다시 배포할 일이 생기면 여기를 본다.
> **EC2 가 아니다** (2026-08-25 변경, 근거는 `MILESTONES.md` "확정된 설계 결정" 표).
> 두 가지가 겹쳐 바꿨다 — `hymn.pem` 이 이 PC 에 없어 EC2 에 못 붙고, DB 를 Neon 으로
> 옮기면서 **앱이 EC2 안에 있어야 할 이유(VPC 안의 RDS)가 사라졌다.** RDS 에 이어서 쓸
> DMS 데이터도 없다(2026-08-25 확인). 탄력적 IP·PM2·Nginx·Let's Encrypt 항목이 통째로
> 없어졌고, `DATABASE_URL` 을 RDS 로 되돌리는 항목도 없어졌다 — 개발도 운영도 같은 Neon 이다.
>
> - **`DATABASE_URL` 은 Neon 의 pooled 엔드포인트로** — 서버리스는 함수 인스턴스가 여러 개
>   뜨고 `prisma.ts:16` 의 `max: 5` 는 인스턴스당이라 곱해진다. 개발용 `db push` 는 direct
>   를 그대로 쓴다(pooled 로는 스키마 변경이 어긋난다)
> - **`infra/s3-cors.json` 에 배포 주소** — 빠뜨리면 업로드가 **조용히** 실패한다(브라우저 →
>   S3 직접 PUT 이라 화면에 이유가 안 나온다). 이미 넣었다 (`008b7da`)
> - **`vercel.json` 의 `regions`** — 대시보드보다 파일이 우선이다 (`icn1` 서울)
> - **커밋 작성자가 `pro047` 이어야 한다** — 아니면 배포가 블락된다 (아래 "지뢰" 절)


