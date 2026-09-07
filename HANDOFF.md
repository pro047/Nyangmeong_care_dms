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

## 현재 위치 (2026-09-07 갱신)

**착수한 스트림이 없다.** 계획된 마일스톤도 백로그도 비었다 — M0~M6 이 2026-08-28 에
전부 닫혔고, 그 뒤에 연 스트림 여섯(xlsx·html 미리보기 · S3 고아 정리 · 폴더 2뎁스 ·
구버전 흐리기 · 목록 버전 열 · 권한 경계)도 **전부 배포까지 끝났다.** 각 일지는
`HANDOFF-ARCHIVE.md` 에 있다.

**지금은 관찰 단계다.** 이 문서와 `MILESTONES.md` 가 여러 곳에서 같은 판단을 내려 뒀다 —
성능도 검색도 *팀이 실제로 쓰는 것을 보고* 정한다. **다음 스트림을 고르기 전에 아래
"다음 작업"의 관찰 항목부터 볼 것.**

**권한 경계 변경은 팀 공지까지 끝났다** (2026-09-07, 사람이 처리). 남이 올린 문서의
휴지통·새 버전 버튼이 사라진 것을 팀이 안다.

> **이월 — 폴더 2뎁스 스트림에서 남은 것들.** 그 스트림의 일지는
> `HANDOFF-ARCHIVE.md` 로 내렸지만, 아래는 아직 살아 있어서 본문에 남긴다
> (상시분은 아카이브 금지).
>
> **아직 안 끝난 것 둘.**
> 1. **운영 화면을 눈으로 안 봤다.** `AUTH_SECRET` 이 Vercel 에서 Sensitive 라 세션을 못 만들어
>    e2e 를 운영에 못 태운다. 확인한 것은 `/login` 200 · `/` 401(비로그인 차단)뿐이다.
>    **`화면설계서` 가 직접 문서 0건 · 자식 9개라 이번 변경이 바로 그 화면이다** — 팀이 보기 전에
>    사람이 한 번 열어 볼 것
> 2. **미검증으로 남은 것: S6(낙관적 잠금) · B4(흡수 힌트).** 2뎁스 스트림의 잔여분이다
>
> **배포가 조용히 막힐 수 있다** — 이 맥의 git 전역 신원이 회사 계정이라 `pro047` 리포에서
> 커밋하면 Vercel 이 배포를 막는다. 이번 커밋들은 `--local` 로 `pro047` 을 맞춰 두고 찍었다.
> 확인: `gh api repos/pro047/Nyangmeong_care_dms/commits/<sha>/status --jq '.state'`
>
> **운영 환경변수는 CLI 로 못 읽는다** (2026-09-06 실측). `vercel env pull` 은
> `DATABASE_URL`·`AUTH_SECRET`·`AWS_*`·`DISCORD_*`·`S3_BUCKET` 11개를 `[SENSITIVE]`
> 자리표시자로 내려준다 — Sensitive 플래그는 쓰기 전용이라 대시보드에서도 되읽을 수 없다.
> 운영 DB 에 붙어야 하면 **Neon 콘솔에서 연결 문자열을 뽑는다**(`vercel` 경유는 원리상 불가).
>
> **범위 밖 결함을 하나 봤고 안 고쳤다.** `app-sidebar.tsx:106` 가 `pathname === href` 로
> 활성을 정하는데 `usePathname()` 은 쿼리스트링을 뺀다 → `/?folder=…` 에서 사이드바의
> '전체 문서'와 해당 폴더가 **동시에** `aria-current="page"` 다. 1뎁스 시절부터 있던 것이다.
>
> **파이프라인 하네스를 스킬 정본으로 재동기화했다**(`0e01ad5`, 733줄). 어제 design 을
> 16초 만에 죽인 레이트리밋 소진이 정본에는 순환 로직으로 들어와 있다.
> `test/run-tests.sh` 64케이스 통과. **`PREFLIGHT_CMD` 기본값은 비워 둔다** —
> run-tests 가 `package.json` 없는 임시 디렉터리에서 돌아서, 기본값을 박으면 64케이스가
> 전부 프리플라이트에서 죽는다(실측).

> **배포 후 확인이 하나 남았다** — 운영에서 PDF 미리보기(`VERIFY.md` 케이스 #7).
> **2026-08-30 에 착수했다가 보류했다** — 확인하려면 운영에 PDF 를 올려야 하는데
> 그것이 **팀 디스코드 채널에 알림을 쏜다**(`discord.ts:78` 은 `NODE_ENV !== 'production'`
> 일 때만 생략하므로 운영에서는 반드시 나간다). 문서는 영구삭제로 지워도 **메시지는
> 앱이 되돌리지 못한다.** 남은 위험 표면이 iframe 하나뿐이라 사람이 건너뛰기로 결정했다.
> 하려면 알림 1건을 감수하거나, Vercel 에서 `DISCORD_WEBHOOK_URL` 을 빼고 재배포한 뒤
> 확인하고 되돌린다(배포 2회).
>
> **⚠ 그 과정에서 전제 하나가 깨졌다 — 개발 DB 와 운영 DB 는 같지 않다** (2026-08-30 실측).
> 아래 "다음 작업" 3번 ⑨가 *"운영 DB 가 개발과 같은 Neon 이라 같은 파일을 본 것이다"*
> 라고 적었는데 틀렸다. **Neon 브랜치 복사본이라 분기 이전 문서는 id 까지 같고, 분기
> 이후 것만 갈린다.**
>
> | 확인 | 결과 |
> |---|---|
> | 운영 목록의 문서 id 26개 → 개발 DB 조회 | 26/26 존재 (**그래서 같은 DB 처럼 보였다**) |
> | 개발 DB 활성 문서 | 28건 |
> | 운영에 없는 2건 | `dms-preview-test`(png, 08-27 18:44) · `dms-preview-test-v2`(pdf, 08-27 19:22) — 상세가 운영에서 **404** |
> | 운영에 있는 문서의 최신 생성 시각 | 2026-08-25 22:40 → **분기 시점이 08-25 22:40 ~ 08-27 18:44 사이** |
>
> ⑨의 **결론(운영 xlsx 10/10 정상)은 유효하다** — 그 10건이 전부 08-25 이전 파일이라
> 양쪽에 다 있었다. 틀린 것은 근거다. **앞으로 "개발에서 올린 파일을 운영에서 본다"는
> 성립하지 않는다.**
>
> 재확인 방법: 로컬 `.env` 의 `AUTH_SECRET` 으로 `dms_session` 을 민팅해
> (`.pipeline/mint-session.mjs`) 운영에 `curl -H "Cookie: dms_session=…"` 로 붙는다.
> **운영 `AUTH_SECRET` 은 로컬과 같다**(2026-08-30 실측, 운영 `/` 가 200). 목록 HTML 에서
> `/documents/<id>` 를 긁어 개발 DB 와 대조하면 분기가 보인다.

**M0 · M1 · M2 · M3 · M4 · M5 · M6 완료.**
**배포됨 — https://nyangmeong-care-dms.vercel.app** (2026-08-25, Vercel).
배포 환경에서 로그인·업로드·다운로드가 돌고, 업로드 5건의 DB `size_bytes` 와 S3
`ContentLength` 가 바이트 단위로 일치하는 것까지 대조했다.
**길드 비멤버 거부도 확인됐다** (2026-08-25, 부계정 실측 — `HANDOFF-ARCHIVE.md` 의
"개발 DB Neon 전환과 초기 브라우저 실측 목록" 절).
**M6 의 완료 기준("팀원 6명이 각자 접속해 로그인")도 충족됐다** (2026-08-26 DB 확인) —
6명이 각자 로그인했고 그중 5명이 문서를 올렸다. **M6 은 이걸로 끝났다.**
타임라인은 `HANDOFF-ARCHIVE.md` 의 "M6 채택 타임라인" 절.
파이프라인 도구(`orchestrate.sh`) 수정도 끝났다 — `HANDOFF-ARCHIVE.md` 의 "파이프라인 부검" 절.
**단, M4 주행에서 결함 2건이 새로 나왔고 아직 안 고쳤다** — "파이프라인 결함" 절.

**미검증** — 다음 세션이 확인할 것:

| 항목 | 방법 |
|---|---|
| 100MB 상한 근처의 큰 파일 | M2 부터 미검증. **이 표에서 가장 오래된 항목이다** |
| **운영 환경 PDF 미리보기** | 2026-08-28 신규. 로컬에서만 봤다. 리다이렉트 → presigned GET 체인은 실환경에서 봐야 한다 (`VERIFY.md` #7). 운영 DB 에도 PDF·이미지가 없을 것이므로 올려서 확인하고, 남기기 싫으면 휴지통 → 영구삭제 |
| **Geist 토큰 값이 실제와 맞나** | 2026-08-28 신규. 출처가 `vercel.com/geist` 공식 문서가 아니라 **커뮤니티 정리본**이다(그 세션에 웹 페이지를 직접 여는 도구가 없었다). 실제 Vercel 대시보드에서 devtools 로 **제목 크기(24px)와 카드 모서리(6px)** 두 개만 재면 대부분 판가름난다 |
| **제목 24px 이 목록에서 과하지 않나** | 2026-08-28 신규. 18 → 24px 은 Geist 대시보드 기준을 따른 것인데 이 앱은 목록 밀도가 더 높다. 팀이 쓰는 것을 보고 판단할 것 — 되돌리려면 `text-xl font-semibold` → `text-lg` 다섯 곳 |
| **이미지 재업로드 시 미리보기 갱신** | 2026-08-28 신규. PDF 는 실측했지만 이미지(`<img>`)는 실측 목록에 없었다. 같은 `previewSrc` 를 쓰므로 같이 고쳐졌을 것이나 눈으로는 안 봤다 |
| 맥 NFD 파일명 실분류 | 테스트로 덮었고(`classify.test.ts`) 2026-08-27 에 Windows 산 NFD 파일명으로 **프록시 실측**까지 했다. 남은 것은 **맥 실기** — 맥 팀원이 올린 한글 파일명 1건. **2026-08-28 부터 개발 머신이 맥이므로 지금은 언제든 할 수 있다** |
| 별칭 경로로 기존 폴더 흡수 | 0-1 실측(2026-08-28)은 **이름 경로만** 봤다. dev 브랜치의 별칭이 전부 비어 있어서다. 보려면 사이드바에서 별칭을 먼저 넣어야 한다 |
| 제안 이름의 **적절성** | 문자열 매칭으로 판정이 안 되므로 e2e 에 없다. 0-1 이 존재하는 이유 자체다 — 사람이 눈으로 볼 것 |
| 편집값이 목적지 변경 시 리셋되는 것 | 이름을 고친 뒤 셀렉트를 미분류로 바꿨다 되돌리면 `changeDest`(`upload-dialog.tsx:337`)가 `proposedName` 으로 되돌린다. 명시적 목적지 변경이라 **수용 가능해 보이지만 결정하지 않았다.** 코드리뷰는 라벨과 동작이 일치하므로 결함이 아니라고 판정했다 |
| 영문 태그 대소문자 정책 | 한 문서 안에서는 합쳐지는데 필터는 완전일치라 문서 간에는 갈린다 (`DESIGN.md` §4, 의도한 수용) |


### 파이프라인 결함 (2026-08-25, `m4` 주행) — 미수정

M4 주행에서 새로 드러난 것 둘. **둘 다 아직 안 고쳤다.**

**1. ~~파킹본을 되살리면 `impl` 이 불필요하게 재주행한다.~~ 해소됨 (2026-08-30).**

`RESUME_FROM=verify` 를 넣었다 — 첫 바퀴에서만 `impl` 을 건너뛰고 `verify` 부터 돈다.
고칠 방향 셋 중 **두 번째(진입점 지정)** 를 골랐다. 세 번째("`IMPL.md` 가 DONE 이고 `src/`
가 안 바뀌었으면 건너뛴다")는 **정확히 재주행이 필요한 순간에 막는다** — 검증 실패로 인한
재시도에서 `src/` 는 당연히 안 바뀌어 있다(고칠 기회를 아직 안 줬으니까).

계기: `s3-orphan-cleanup` 주행에서 verify 가 계정 세션 한도(`terminal_reason=api_error`)로
죽었다. 코드는 그대로였는데 재실행하면 impl($2.56)이 다시 돌 자리였다.

- 근거 없이 건너뛰지 않는다 — 값이 `verify` 가 아니거나 `IMPL.md` 가 `DONE` 이 아니면 죽는다
  (오타 `verfiy` 가 impl 진입 전에 걸리는 것을 실측)
- **보호 파일을 git 으로 한 번 더 본다** — `check_protected` 는 "이번 실행이 바꿨는가"를
  보는데, impl 을 이번에 안 돌리면 이전 실행의 결과가 기준선에 들어가 있어 원리상 안 보인다
- **`test/run-tests.sh` 에 이 기능을 덮는 케이스가 아직 없다** (50/50 통과는 회귀 확인일 뿐)

아래는 원문이다.

`verify` 가 예산으로 죽어 `VERIFY.md.crashed` 로 파킹됐고, 안내대로 `mv` 해서 되살린 뒤
재실행했더니 **`impl` 부터 다시 돌았다.** 재시도 루프(`orchestrate.sh:697`)가
`impl → verify` 를 한 쌍으로 묶고 있어 루프에 재진입하면 `impl` 이 먼저다.
`design`·`judge` 에는 "`STATUS: DONE` 이면 재사용" 로직이 있는데(`:619`·`:631`)
`impl`·`verify` 에는 없다.

**원인은 루프가 두 실패를 구분하지 않는 것이다.**

| `verify` 가 죽은 이유 | `impl` 재주행이 | 지금 |
|---|---|---|
| 검증 명령 실패 (테스트·빌드가 빨감) | **필요하다** — 코드를 고쳐야 한다 | 재주행 |
| 예산·턴 초과로 단계 자체가 사망 | **불필요하다** — 코드는 그대로다 | 재주행 |

실측 손해: `impl` 1차가 이미 `STATUS: DONE` 으로 $4.99 를 썼고, 그 산출물로
`npm test`(164 통과) · `lint` · `build` 가 전부 통과하는 것을 사람이 확인한 상태에서
같은 단계를 다시 띄웠다. 비용 중복에 더해 **이미 통과한 코드를 다시 건드릴 위험**이 붙는다.

되돌릴 수도 없다 — 파킹본을 되살리는 유일한 경로가 `mv` 인데 그것이 루프 재진입을 동반한다.
`STATE.md` 안내문은 "`impl`·`verify` 는 단계가 다시 돈다"고 **예고만** 할 뿐 선택지를 주지 않는다.

고칠 방향(택일):
- 파킹 파일명에 사인을 남겨(`VERIFY.md.crashed.budget`) 되살릴 때 루프 진입 지점을 가른다
- `RESUME_FROM=verify` 같은 진입점 지정
- `IMPL.md` 가 `DONE` 이고 그 뒤로 `src/` 가 안 바뀌었으면 건너뛴다 — 단 **검증 실패로 인한
  재시도에서는 반드시 재주행**해야 하므로 그 조건과 분리해야 한다

**2. `impl` 단계의 `npm run build` 권한 거부가 재발했다** (`256c567` 이후에도).

> **원인이 밝혀졌다 (2026-08-26, 3차 주행).** 규칙이 안 듣는 게 아니라 **에이전트가
> `PowerShell` 도구로 불렀고 allow 는 전부 `Bash(...)` 였다.** `HANDOFF-ARCHIVE.md` 의 "파이프라인 3차 주행 실측" 절 참조. 고치는 법도 거기 있다 — 아직 안 고쳤다.

`IMPL.md` 가 6가지 경로를 시도했고 전부 거부됐다고 신고했다 — `npm run build`(Bash·
PowerShell·sandbox 해제), `npx tsc --noEmit`, `./node_modules/.bin/tsc`,
`node node_modules/typescript/bin/tsc`. `.claude/settings.json` 의 allow 에
`Bash(npm run build)` 가 **있는데도** 거부됐다.

치명적이진 않다 — 판정권은 셸에 있고 `run_verify()` 가 별도로 돌린다. 이번에도 실제로
타입 오류는 없었다. 하지만 `impl` 이 자기 결과를 한 번도 못 보고 끝내므로 **타입 오류가
있었다면 재시도 루프를 한 바퀴 더 돌았을 것**이다 (그 한 바퀴가 $5~10).

**실측 4점 추가** (2026-08-25, `BUDGET_DESIGN=8 BUDGET_JUDGE=8` 로 올려 돌림):

| 단계 | 턴 | 비용 | 결과 |
|---|---|---|---|
| design | 25 | $3.93 | 통과 |
| judge | 48 | $5.27 | 통과 (**기본값 $5 였으면 죽었다**) |
| impl | 63 | $4.99 | 통과 |
| verify | 35 | $5.12 | **돈 초과사** ($5 상한) — 산출물은 온전했다 |

> **`BUDGET_JUDGE` $5 유지 결정을 재검토할 것.** 실측이 3점이 됐고
> ($4.72 통과 / $5.08 사망 / $5.27 — $5 였으면 사망) 세 번 중 두 번이 $5 를 넘었다.
> `BUDGET_VERIFY` 도 같다 — 이번 사망이 그것이다. M3 보다 범위가 넓은 기능에서는
> 40턴/$5 가 `judge`·`verify` 양쪽에 모자란다.

### 미룬 리뷰 항목 (상시 — 계기가 오면 처리)

2026-08-22 리뷰에서 나왔으나 지금 고치지 않기로 한 것들. 각 행의 "언제" 가 계기다.
그 리뷰의 진단 원문·해소된 항목은 `HANDOFF-ARCHIVE.md` 에 있다.

**미룬 8건** — 지금 고치지 않는다:

| 위치 | 내용 | 언제 |
|---|---|---|
| ~~`discord.ts:88`~~ | 임베드 `url` 이 없는 `/documents/[id]` 를 가리킴 | **해소됨** — M3 가 그 라우트를 만들었다. 다만 알림은 `NODE_ENV=production` 에서만 나가므로 임베드 링크가 실제로 열리는지는 배포(M6) 후 확인 |
| ~~`documents/route.ts:37`~~<br>~~`[id]/versions/route.ts:35`~~ | **해소됨 (2026-08-30)** — 두 라우트가 토큰 검증 직후 `documentVersion.findFirst({where:{s3Key}})` 로 끊고, DB 의 `@@unique([s3Key])` 가 동시 요청까지 막는다. 실측: 순차 재사용 400(X4·X5), 동시 두 발 `201/400` 에 버전 행 1개(X9). 아래는 원문이다. `keyToken` 이 5분간 재사용 가능 → 같은 S3 객체에 Document N개. **M3 에서 versions 라우트가 같은 구멍을 복제했다** (2026-08-24 리뷰). `verifyUploadToken`(`upload-token.ts:35`)은 검증만 하고 토큰을 소모하지 않아, TTL 300초 안에 같은 `(s3Key, keyToken)` 으로 **서로 다른 문서**의 `/versions` 에 반복 POST 가 된다 — 피해 범위가 한 문서 안에서 문서 **사이**로 넓어졌다 | **고아 객체 정리 때 같이** — 정리 배치가 붙는 순간 한 문서를 지우면 다른 문서 파일이 사라진다. **두 곳을 같이 막을 것.** 토큰 1회용화는 사용 기록 저장소가 필요해 스키마 변경을 부른다. **2026-08-25: 영구삭제(`[id]/purge`)가 이 구멍을 우회한다** — `deleteObject` 앞에서 같은 `s3Key` 를 가리키는 버전이 남아 있는지 세고 0 일 때만 지운다. 구멍 자체는 그대로이고, 공유된 객체는 고아로 남는다(파일 유실보다 낫다) |
| `session.ts:6`<br>`session.ts:34` | **길드 멤버십은 로그인 순간에만 검사된다.** 세션은 30일 JWT 이고 `getSession()` 은 서명만 검증한다 — 길드 멤버십을 다시 안 본다. 그래서 **팀원이 길드에서 나가거나 추방돼도 최대 30일간 문서 열람·업로드·삭제가 된다.** `CLAUDE.md` 는 "접근 제어는 디스코드 길드 멤버십 하나뿐"이라고 적었지만 실제로는 **로그인 시점의 스냅샷**이다. JWT 라 개별 무효화 수단이 없고, 전역 무효화는 `AUTH_SECRET` 교체(= 전원 재로그인)뿐이다 (2026-08-25 코드 확인) | **팀원 이탈이 생기면 즉시** — 그전까지는 노출이 없다. 7인 팀에 이탈이 없으면 계기가 안 온다. 고치는 방향 둘: (a) `MAX_AGE_SECONDS` 를 30일 → 1~7일로 줄여 창을 좁힌다(싸다, 재로그인이 잦아진다) (b) `getSession()` 에서 길드를 재확인한다(정확하다, 매 요청 디스코드 API 를 쳐서 비싸다). **급하면 `AUTH_SECRET` 교체가 즉효다** |
| `login/page.tsx:31` | `?error=` 값을 **화이트리스트 없이 그대로 렌더**한다. `page.tsx` 배너(`/`)는 `pageErrorMessage` 로 거르는데 `/login` 은 안 거른다 — 임의 문장이 빨간 배너로 뜬다. React 가 이스케이프하므로 XSS 는 아니고, 로그인 폼에 입력 필드가 없어 훔칠 것도 없다 (2026-08-25 코드 확인) | **계기 없음** — 심각도가 낮다. `/` 와 정책이 갈린다는 것만 기록해 둔다. 고친다면 `pageErrorMessage` 를 `/login` 에도 적용 |
| `s3.ts:71` | `catch { return null }` 이 403·503 을 "파일 없음"으로 뭉갬 | 로그 추가로 충분 |
| `upload-dialog.tsx:39,74,139`<br>`version-upload-dialog.tsx:39,50,98` | `inFlight` 에서 완료된 XHR 을 제거하지 않음. 줄번호는 `putToS3` 를 `lib/upload-xhr.ts` 로 뺀 뒤 기준(2026-08-24). 같은 결함이 재업로드 다이얼로그에 복제됐다 | 누수는 다이얼로그 수명 한정 |
| ~~`(app)/error.tsx:17-28`~~ | **해소됨 (2026-08-31).** 계기("M6 배포 때")가 2026-08-25 에 이미 지났는데 6일간 처리가 안 됐다 — **계기 기반 목록의 약점이 이것이다. 계기가 왔는지 아무도 안 본다.** 고친 문구는 팀원이 실제로 할 수 있는 행동이다(관리자에게 "DB 연결 실패"라고 알림). 원문은 개발자용 지시가 사용자 화면에 새어 나온 것이었고, Neon 직결로 옮긴 뒤로는 터널 자체가 없다 |
| `lib/tag.ts` (정규화) vs `lib/search.ts` (필터) | 영문 태그 대소문자 정책이 갈린다. **한 문서 안**에서는 `Plan`/`plan` 이 합쳐지는데(`normalizeTags` 가 대소문자 무시 중복 제거) **문서 사이**에서는 필터가 완전일치라 갈린다. `DESIGN.md` §4 가 "팀 태그는 한글 위주"를 근거로 의도적으로 수용한 것이다 | **영문 태그를 실제로 쓰기 시작하면** — 팀이 안 쓰면 계기가 안 온다. 고친다면 `Tag.name` 을 소문자로 저장하고 표시용 원본을 따로 두는 쪽인데 스키마 변경을 부른다 |
| `page.tsx` 배너 (2차 리뷰) | `?error=notfound` 가 주소창에 눌러앉는다. 배너를 띄운 화면에서 업로드하면 `close()` 의 `router.refresh()` 가 **URL 을 안 바꿔서** 방금 성공한 업로드 옆에 낡은 에러가 남는다 | 닫기 버튼(`history.replaceState`)이나 렌더 후 파라미터 제거. ~~M3 상세 페이지가 배너를 하나 더 쓸 것이므로 그때 같이~~ — **그 전제가 깨졌다.** 상세 페이지는 배너 대신 `notFound()` + 세그먼트 `not-found.tsx` 를 쓴다(URL 에 에러가 눌러앉지 않는다). 배너를 쓰는 곳은 목록의 다운로드 링크뿐이라 이 항목은 계기 없이 남는다 |
| `download/route.ts:36` (2차 리뷰) | 같은 핸들러의 401 만 여전히 내비게이션에 JSON 을 준다 | **의도된 것.** proxy 가 같은 쿠키를 같은 키로 먼저 검증하므로 도달 창은 프록시 통과와 라우트 도착 사이 수 ms 경합뿐이다. 이유를 `route.test.ts` 주석에 박아 뒀다 |

---

## 지뢰 (겪은 것들)

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

**진단 스크립트로 DB 시각을 읽을 때 주의.** `created_at` 은 `timestamp without time zone`
이라 node-postgres 가 로컬 시간으로 해석해 9시간 어긋나 보인다. Prisma는 정상이다.

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

**계획된 작업이 없다.** M0~M6 과 이 목록의 0~4 번이 전부 끝났다. 끝난 항목의 기록은
`HANDOFF-ARCHIVE.md` 의 "§다음 작업 — 끝난 항목들" 절에 있다.

**다음 스트림은 관찰 결과로 고른다.** 아래 1·2 는 코드가 아니고, 3 은 계기 대기다.

1. **운영 문서 증가분의 출처를 가른다** (관찰 — 이걸로 다음 스트림이 갈린다).
   `MILESTONES.md:63` 이래 미측정으로 남은 *"7명 규모에서 검색이 실제로 필요한가"* 의
   사후 검증 자리다. 배포 후 1주는 2026-09-01 에 이미 지났다.

   | 시점 | 운영 활성 문서 | 근거 |
   |---|---|---|
   | 2026-08-30 | 26건 | 위 "개발 DB 와 운영 DB 는 같지 않다" 표의 id 26개 |
   | 2026-09-07 | 28행 | 권한 경계 운영 실측 (`HANDOFF-ARCHIVE.md`) |

   **8일에 2건이다 — 다만 두 수의 출처가 다르다.** 26 은 운영 목록 HTML 에서 긁은 문서
   id 개수이고 28 은 권한 경계 실측 때 센 목록 행 수다. 둘 다 활성 문서 1건 = 1 이므로
   비교는 성립하지만, **증가분 2건이라는 값 자체를 아래 쿼리로 다시 확인하고 쓸 것.**

   그 2건의 `created_by_id` 가 팀원이면 팀이 쓰기 시작한 것이고,
   개발자면 아직 아무도 안 쓰는 것이다 — **후자면 무엇을 만들어도 안 쓰는 기능이 된다.**
   운영 DB 는 CLI 로 못 붙으므로(위 "현재 위치") **Neon 콘솔**에서 본다:
   `select created_by_id, count(*) from documents where created_at > '2026-08-30' and deleted_at is null group by 1;`

2. **운영 스키마에 `@@unique([s3Key])` 가 있는지 확인한다.** 밀었다는 기록이 어느 문서에도
   없다(전수 grep). 다만 2026-09-06 의 S7 운영 `--apply` 가 `Folder.parentId` 를 요구했고
   `prisma db push` 는 스키마 **전체**를 미므로 **같이 들어갔을 가능성이 높다 — 이건 추정이다.**
   없으면 `keyToken` 재사용의 최종 방어선이 운영에만 빠져 있는 것이고, 앱은 안 죽으므로
   신호가 없다. 확인은 Neon 콘솔에서 `document_versions` 의 인덱스 목록 하나다.
   아래 원문 절차가 그대로 유효하다.

   **⚠ 운영 배포 전에 할 일** — 운영 DB 는 dev 와 **다른 Neon 브랜치**다(위 "현재 위치").
   같은 제약을 따로 밀어야 하고, **그 전에 중복부터 확인**해야 한다. 중복이 있으면 push 가
   실패한다.
   ```sql
   select s3_key, count(*) from document_versions group by 1 having count(*) > 1;
   ```
   dev 는 0건이었다(44행 전수). 적용은 direct 엔드포인트로 — pooled(`-pooler`)로 보내면
   스키마 변경이 어긋난다:
   `DATABASE_URL="<direct>" npx prisma db push --accept-data-loss`

3. **계기 대기 항목 중 하나를 앞당긴다** (위 §미룬 리뷰 항목, 8건). 권한 경계를 방금
   좁힌 것과 이어지는 것은 `session.ts` 의 30일 JWT 다 — 길드에서 나간 사람도 최대
   30일간 자기 문서를 영구삭제할 수 있다. **계기("팀원 이탈")는 아직 안 왔다.**

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


> **M4 를 M6 보다 먼저 두는 것은 사람이 내린 결정이다** (2026-08-24). 근거를 대조한
> 기록은 남긴다 — 제품 존재이유 3개 중 미해결로 남은 하나("어디 있는지 못 찾는다")가
> M4 이고, `MILESTONES.md:63` 은 M2 를 "진짜 최소 제품"으로 못박아 뒀다. 반대 논거는
> 배포가 채택(팀이 실제로 쓰기 시작하는 것)과 알림 경로 실측을 동시에 사는 가장 싼
> 순간이라는 것이었다. **7명 규모에서 검색이 실제로 필요한지는 측정되지 않았다** —
> 배포 후 1주 문서 수로 사후 검증할 것.

## 파이프라인 실행 방법

`./orchestrate.sh <feature>` — 설계→판단검증→구현→검증을 각각 별도 `claude -p` 로 띄우고
산출물과 종료 코드로 물리적 게이트를 건다. 세션(LLM)은 **런처**다: 실행·전달만 하고
판정하지 않는다. 진행 중에는 `.pipeline/<feature>/STATE.md` 만 읽는다
(`*.stream.jsonl` 을 tail 하면 컨텍스트가 오염된다).

멈추면 `STATE.md` 의 **`## 다음 행동`** 블록을 그대로 따른다. 종료 코드:

| | 뜻 |
|---|---|
| 2 | 게이트 위반·사망 (`DIED`) — `FAIL_LOG.md` 에 사인이 있다 |
| 3 | `BLOCKED` — 에이전트가 사람 판단을 요청 |
| 4 | 승인 대기 — **실패가 아니다** |

**게이트 승인은 사람만 한다.** 세션이 `approve.sh` 를 대신 실행하거나 `.approved` 파일을
직접 쓰는 것은 금지다. **클로드 세션의 `!` 셸에는 tty 가 없다** (2026-08-24 실측:
`/dev/tty: Device not configured`). 그래서 진짜 터미널에서 띄우거나, 런처 모드(exit 4)로
멈춘 뒤 진짜 터미널에서 `./approve.sh <feature> <산출물>` 로 승인해야 한다.
`approve.sh` 주석이 전제하는 "`!` 프리픽스로 승인" 은 이 환경에서 동작하지 않는다.

**죽었는데 산출물이 온전하면** 셸이 `<파일>.crashed` 로 파킹하고 멈춘다. 검토 후 살리려면
`mv <파일>.crashed <파일>` 하고 재실행한다 — **mv 라는 사람의 행위 자체가 승인이다**
(design·judge 는 재사용 로직이 집고, impl·verify 는 단계가 다시 돈다).

**측정했다 (2026-08-26, `auto-classify` 주행).** 기준선(`document-detail`)은 design 1 ·
impl 5 · judge 7 · verify 3 = **16건**이었고, 이번엔 design 0 · judge 2 · impl 5 ·
verify 1 = **8건**으로 절반이 됐다. **규칙은 듣는다.**

**다만 남은 8건 중 4건은 규칙으로 막을 수 없는 것이었다** — 에이전트가 `PowerShell`
도구로 불렀는데 allow 가 전부 `Bash(...)` 다. 상세와 조치는 `HANDOFF-ARCHIVE.md` 의 "파이프라인 3차 주행 실측" 절.
