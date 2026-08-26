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

## 현재 위치 (2026-08-26)

**M0 · M1 · M2 · M3 · M4 완료. M6(배포) 은 체크박스 5/5.**
**배포됨 — https://nyangmeong-care-dms.vercel.app** (2026-08-25, Vercel).
배포 환경에서 로그인·업로드·다운로드가 돌고, 업로드 5건의 DB `size_bytes` 와 S3
`ContentLength` 가 바이트 단위로 일치하는 것까지 대조했다.
**길드 비멤버 거부도 확인됐다** (2026-08-25, 부계정 실측 — 아래 목록).
**M6 의 완료 기준("팀원 6명이 각자 접속해 로그인")도 충족됐다** (2026-08-26 DB 확인) —
6명이 각자 로그인했고 그중 5명이 문서를 올렸다. **M6 은 이걸로 끝났다.**
타임라인은 아래 "M6 채택 타임라인" 절.
파이프라인 도구(`orchestrate.sh`) 수정도 끝났다 — 아래 "파이프라인 부검" 절.
**단, M4 주행에서 결함 2건이 새로 나왔고 아직 안 고쳤다** — "파이프라인 결함" 절.

**함수 리전을 `icn1`(서울)로 옮겼다** (2026-08-25, `vercel.json` 에 고정). 배포 직후에는
`iad1`(미국 동부)에서 돌고 있었다. `/login` TTFB 가 웜 315ms → 172ms 로 떨어졌지만
**같은 페이지의 편차가 260ms 라 리전 이득이 콜드 스타트에 묻힌다** — "배포 성능 실측" 절.

**UI 정비를 한 번 했다** (2026-08-26, 마일스톤 밖). shadcn/ui 를 들이고 브라우저 기본
다이얼로그를 걷었다 — `window.alert` 7곳 → sonner 토스트, 파괴적 확인 3곳 → AlertDialog,
`window.prompt` 2곳 → Dialog 폼. 색 토큰을 무채색으로 바꾸고 Geist 를 폴백 체인으로 붙였고,
업로드 다이얼로그에 폴더 셀렉트를 넣었다. **`MILESTONES.md` 의 확정된 설계 결정 3건이
여기서 바뀌었다** — 컴포넌트("라이브러리 없이 직접 작성" → shadcn/ui) · 시각 언어 ·
확인·알림 UI. 근거는 그 표와 `MILESTONES.md` 의 "UI 정비" 절.
**색이 깨져 있었고 고쳤다** (2026-08-26). `@theme` 과 shadcn 의 `@theme inline` 이
`--color-border`·`--color-accent` 를 서로 다른 뜻으로 정의해 테두리는 순환 참조로 무효가
되고 주 버튼은 흰 배경에 흰 글씨가 됐다. **배포본에도 나가 있었다.** 근거와 고친 방법은
`MILESTONES.md` "UI 정비" 절, 재발 방지는 아래 "지뢰" 절.
**토스트·AlertDialog·Dialog 폼의 동작은 아직 안 봤다.**

**업로드 자동 분류를 구현했다** (2026-08-26, 파이프라인 `auto-classify` 3차 주행,
브랜치 `feature/auto-classify` 커밋 `a32259c`). 파일명으로 폴더를 정하고 올라가기 전에
미리보기로 확인받는다. `npm test` 169 → **224**, `lint`·`build` 통과. **브라우저 실측은
아직 안 했고 머지도 안 했다.** 사양·설계 결정은 `MILESTONES.md` "업로드 자동 분류" 절,
실측 항목 9종은 그 worktree 의 `.pipeline/auto-classify/DESIGN.md` §4.2.

**개발 DB 와 운영 DB 를 나눴다** (2026-08-26). 같은 Neon 프로젝트의 다른 브랜치다 —
운영 `production`(Vercel), 개발 `dev`(로컬 `.env`). **`db push` 가 팀이 쓰는 DB 로
직행하던 것이 계기다.** 절차와 대가(스키마를 두 번 민다)는 `SETUP.md` 1-2 절.

**다음은 브라우저 실측이고, 그다음이 M5(미리보기)다.** 근거는 "다음 작업"에 있다.

> **개발 DB 가 RDS 가 아니라 Neon 이다** (2026-08-25 전환). 이 PC 에 `hymn.pem` 이 없어
> SSH 터널을 못 열었고, `SETUP.md` 가 대안으로 적어 둔 Neon 무료 티어로 갈아탔다.
> `DATABASE_URL` 한 줄만 바뀌었고 `uselibpqcompat=true` 는 뺐다 — 호스트가 실제 도메인이라
> `verify-full` 이 정상 통과한다(실측). **팀 RDS 데이터는 안 보인다.** 아래 M4 실측은
> 전부 빈 Neon DB 에 직접 만든 데이터 위에서 이뤄졌다. **RDS 로 되돌리지 않는다** —
> 배포처를 Vercel 로 바꾸면서 개발도 운영도 같은 Neon 을 쓰기로 했다 (아래 "다음 작업").

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
- **길드 비멤버는 거부된다** (2026-08-25, 부계정 실측). 길드에 없는 디스코드 부계정으로
  OAuth 로그인을 끝까지 진행하니 `/login?error=팀%20디스코드%20서버%20멤버만%20이용할%20수%20있습니다.`
  로 튕겼다. **판정 근거는 화면 문구가 아니라 주소창의 `?error=` 다** — 같은 문장이
  로그인 화면 하단(`login/page.tsx:44`)에 **상시 안내문으로도 떠 있어서** 눈으로는 구분이
  안 된다. 그 문구를 `?error=` 로 실어 보내는 코드 경로는 `callback/route.ts:24` 하나뿐이고,
  그 줄은 `isGuildMember` 가 false 일 때만 도달한다. **M1 부터 미검증으로 끌려온 항목이었다.**
  안 한 것: 길드 가입 후 같은 계정이 통과하는지(대조), `users` 행이 안 생겼는지(DB 확인)
- **팀원 6명이 각자 로그인했고 5명이 문서를 올렸다** (2026-08-26 DB 확인). **M6 의 완료
  기준이 이걸로 충족됐다.** `users` 6행이 전부 서로 다른 실제 디스코드 계정이고,
  `documents.created_by` 가 5명으로 갈린다. **로그인 행만으로는 개발 중 생긴 것과 구분이
  안 되므로 업로드 쪽을 근거로 삼았다** — 파일을 고르는 건 사람이 한 것이다.
  결정적인 건 분포다: **4명이 08-24 20:22~20:39 의 17분 안에 몰려 있다.**
- **다중 파일 동시 업로드** (2026-08-26). 3개를 한 번에 끌어다 놓아 확인했다.
  M2 부터 미검증으로 끌려온 항목이었다.
- **재업로드 진행 중 취소 (B10)** (2026-08-26). e2e 가 안 덮는 타이밍 의존 항목이라
  수동으로 했다. **취소 창은 두 가지를 겹쳐 만들었다** — DevTools 의 Slow 4G 스로틀링 +
  업로드 지연을 10초로 늘린 임시 코드. 둘 중 하나만으로는 창이 안 열린다.
  M3 부터 미검증으로 끌려온 항목이었다.
- **디스코드 임베드 링크 (B11)** (2026-08-26). `DISCORD_WEBHOOK_URL` 을 채워 재배포했고
  **지금도 업로드할 때마다 알림이 온다.** `discord.ts:78` 의 `NODE_ENV !== 'production'`
  게이트가 Vercel 에서 열려 있다는 것이 이걸로 확정됐다 — **M5 의 알림 항목이 여기서 끝났다.**
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
| 100MB 상한 근처의 큰 파일 | M2 부터 미검증 |
| 토스트·AlertDialog·Dialog 폼 동작 | UI 정비(2026-08-26)의 색 문제는 고쳤지만 동작은 안 봤다. 토스트 7곳 · AlertDialog 3곳 · Dialog 폼 2곳 · 업로드 폴더 셀렉트(**파일을 담은 뒤 잠기는지**가 핵심) |
| 자동 분류 전체 (9종) | 2026-08-26 구현했고 `test`·`lint`·`build` 만 통과했다. 브라우저는 한 번도 안 봤다. 목록은 `feature/auto-classify` 의 `.pipeline/auto-classify/DESIGN.md` §4.2 |
| 맥 NFD 파일명 실분류 | 테스트로는 덮었지만(`classify.test.ts`) **실기가 필요하다** — 맥 팀원이 올린 한글 파일명 1건 |
| 영문 태그 대소문자 정책 | 한 문서 안에서는 합쳐지는데 필터는 완전일치라 문서 간에는 갈린다 (`DESIGN.md` §4, 의도한 수용) |

### 파이프라인 부검 (2026-08-24, `f315622`·`256c567`) — 완료

`./orchestrate.sh` 가 하루에 세 번 죽었는데 **세 번 다 로그에 사인이 한 줄도 안 남았다.**
사람이 매번 `*.stream.jsonl` 을 jq 로 파서 원인을 알아냈다. 그걸 고쳤다.
지시서는 리포 루트의 `PIPELINE-FIX.md` 였고, 작업이 끝나 삭제했다 (내용은 이 절과
커밋 메시지에 남았다). **손으로 고쳤다** — 파이프라인으로 돌리면 실행 중인 셸을
그 실행이 수정하게 된다.

핵심은 하나다. **사인 확보를 exit code 검사보다 앞으로 옮겼다.** claude 가 0 이 아닌
코드로 죽어도 스트림 마지막 result 이벤트에 이유가 들어 있다 — 셸이 그 파일을 손에
쥐고도 숫자 하나만 보고 버리고 있었다.

| 무엇 | 지금 |
|---|---|
| 사인 | `FAIL_LOG.md` 에 `subtype`·`errors`·턴·비용·`terminal_reason` 이 남는다. result 이벤트가 없으면 "사인 확인 불가"를 정직하게 남긴다 |
| 온전한 산출물 | `STATUS: DONE` 이면 `<파일>.crashed` 로 파킹하고 사람에게 묻는다 (`force=1` — `AUTO=1` 에서도 멈춘다). 파킹은 게이트를 띄우기 **전에** 한다 — 제자리에 두면 다음 실행의 재사용 로직이 게이트 없이 되살린다 |
| 증거 | 스트림·result 를 `attempt<N>` 번호로 보존한다. 재시도가 1차 증거를 덮던 것을 막는다 |
| 상한 | 단계별로 갈렸다 (`TURNS_*`/`BUDGET_*`). 기본은 impl 80턴/$8, 나머지 40턴/$5 |
| 런처 계약 | `STATE.md` 에 `## 다음 행동` 블록이 생겼다. 계약이 문서에만 있어 안 지켜졌다 |

**실측 4점** (2026-08-24, `document-detail` 주행). 다음 주행에서 점을 더 쌓을 것:

| 단계 | 턴 | 비용 | 결과 |
|---|---|---|---|
| design | 20 | $4.80 | 통과 (아슬아슬) |
| judge | 28 | $4.72 | 통과 |
| judge (다음 주행) | 34 | $5.08 | **돈 초과사** |
| impl | 41 → 42 | $3.84 → $2.50 | **턴 초과사**(40 상한) → 통과 |

> `BUDGET_JUDGE` 는 **$5 그대로 두기로 했다** (2026-08-24 결정). 실측 2점으로 기본값을
> 올리지 않는다. 이제 초과해도 사인이 남고 산출물이 파킹되므로 되돌릴 수 있다.
> 필요하면 `BUDGET_JUDGE=8 ./orchestrate.sh <feature>` 로 그때그때 넘긴다.

`/code-review high` 가 5건을 잡았고 **전부 고쳤다.** 두 건은 재현까지 확정했다:

- **이전 주행 산출물을 이번 것으로 오인했다.** 파일 존재만 봤다. `FRESH_DESIGN=1` 로
  버리라고 명시한 설계를 셸이 "온전해 보인다"며 되살리라고 내밀었다. 지금은 실행 전
  내용 지문과 비교한다. **mtime(`-nt`)을 안 쓴 이유**: 이 머신의 `/bin/bash` 는 3.2.57 이고
  mtime 을 **초 단위로만** 비교해서, 같은 초에 끝난 단계의 산출물이 전부 오판됐다
- **프리플라이트 게이트를 런처 모드에서 영영 통과할 수 없었다.** 승인 대상이 `STATE.md`
  였는데 `state()` 가 불릴 때마다 `updated:`·`pid:` 를 새로 찍어 해시 마커가 즉시 낡았다.
  승인 후 재실행 3회 전부 exit 4 (수정 전 코드로 대조 확인). 지금은 내용이 환경에만
  의존하는 `PREFLIGHT.md` 를 승인 대상으로 쓴다

나머지 3건: 파킹본이 이전 파킹본을 덮던 것, 크래시 산출물이 `BLOCKED` 여도 막힌 이유가
안 가던 것, 죽은 경로가 모델 교체 감시를 건너뛰던 것.

**테스트 37 → 50** (`bash test/run-tests.sh`, API 0회). 기존 37개 전부 통과 유지.

> **판정 하나를 정정한다.** 리뷰어와 나의 첫 재현 둘 다 "exit 4가 세 번 났다"만 보고
> **어느 게이트인지**를 안 봤다. 수정 후 2차의 exit 4 는 실제로 다른 게이트(설계 검토)였다.
> 수정 전 코드로 대조해서야 원 진단이 맞았음이 확정됐다. **여러 게이트가 같은 exit
> 코드를 쓰는 파이프라인에서 exit 코드만으로 단언하지 말 것** — 테스트도 그래서
> "어디까지 갔는가"(`DESIGN.md` 존재)로 단언한다.

### 파이프라인 결함 (2026-08-25, `m4` 주행) — 미수정

M4 주행에서 새로 드러난 것 둘. **둘 다 아직 안 고쳤다.**

**1. 파킹본을 되살리면 `impl` 이 불필요하게 재주행한다.**

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
> `PowerShell` 도구로 불렀고 allow 는 전부 `Bash(...)` 였다.** 아래 "파이프라인 3차 주행
> 실측" 절 참조. 고치는 법도 거기 있다 — 아직 안 고쳤다.

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

### 파이프라인 3차 주행 실측 (2026-08-26, `auto-classify`)

**한 번에 완주했다** — 재시도 0회, 게이트 승인 2회(JUDGE·DESIGN), 예산 초과 없음.

| 단계 | 턴 | 비용 | 권한 거부 |
|---|---|---|---|
| design | 17 | $4.61 | 0 |
| judge | 33 | $4.08 | 2 |
| impl | 54 | $4.18 | 5 |
| verify | 24 | $4.70 | 1 |

합계 **$17.57**. `BUDGET_*=8`, `TURNS_JUDGE=60 TURNS_VERIFY=50` 으로 돌렸는데
**넷 다 $5 아래였다** — M4 주행(judge $5.27 · verify $5.12)보다 오히려 쌌다.
범위가 넓다고 항상 비싼 것은 아니다. **다만 올려 둔 덕에 죽지 않았는지는 알 수 없다** —
상한에 안 닿았으므로 이 주행은 $5 유지 여부에 대한 증거가 못 된다.

**빌드 게이트를 켜고 돌린 첫 주행이다.** worktree 에 `.env` 복사 + `npm install` +
`prisma generate` 를 미리 해서 프리플라이트를 녹색으로 만들었다. 검증 명령이
`npm test, npm run lint, npm run build` 셋이 됐다.

#### 권한 거부 16 → 8, 그런데 원인이 `.claude/settings.json` 에 있다

기준선(`document-detail` 주행)은 design 1 · impl 5 · judge 7 · verify 3 = **16건**이었다.
이번엔 design 0 · judge 2 · impl 5 · verify 1 = **8건**. 절반이다.

**하지만 남은 8건 중 4건이 `PowerShell(...)` 이다** — `npm run build` 2회(impl),
`npm test` 2회(judge·verify). `.claude/settings.json` 의 allow 는 **전부 `Bash(...)`** 라
같은 명령이라도 도구 이름이 다르면 안 걸린다.

**이것이 "결함 2번(`impl` 의 `npm run build` 권한 거부가 재발한다)"의 진짜 원인이다.**
M4 주행 기록은 "`Bash(npm run build)` 가 있는데도 거부됐다"고 적었는데, 정확히는
**에이전트가 `PowerShell` 도구로 불렀기 때문**이다. 규칙이 안 듣는 게 아니라 다른
도구를 막은 것이다. 윈도우 환경이라 에이전트가 PowerShell 을 자연스럽게 고른다.

고치는 법: allow 에 `PowerShell(npm test:*)` · `PowerShell(npm run build:*)` ·
`PowerShell(npm run lint:*)` 를 나란히 추가한다. **아직 안 했다.**

> 치명적이진 않다 — 판정권은 셸에 있고 `run_verify()` 가 별도로 돌린다. 이번에도
> 거부된 뒤 다른 도구로 재시도해 결국 돌았다. 하지만 **거부 한 건이 턴을 태운다.**

### 배포 성능 실측 (2026-08-25) — 리전 조치 완료

배포 후 "접속이 느리다"는 보고가 있어 재 봤다. **원인은 코드가 아니라 지리적 배치였다.**
함수 리전을 `icn1`(서울)로 옮겼고, 재측정까지 마쳤다. **남은 것은 콜드 스타트뿐이고
그건 무료 티어의 성질이라 코드로 못 고친다.**

**조치 전** (함수가 `iad1`, 미국 동부)

| 측정 | 값 |
|---|---|
| 프로덕션 `/login` 콜드 | 1680ms |
| 프로덕션 `/login` 웜 | ~315ms (이 페이지는 DB 를 안 쓴다) |
| 한국 → Neon(싱가포르) 쿼리 왕복 | 95ms |
| 한국 → Neon 최초 연결 | 1230ms (컴퓨트 절전에서 깨우는 시간) |
| **함수 실행 리전** | **`iad1` (미국 동부)** |

`x-vercel-id: icn1::iad1::...` — 앞은 엣지(서울), **뒤가 함수가 실제로 돈 리전**이다.
`MILESTONES.md` M6 는 싱가포르로 뒀다고 적혀 있었으나 실제로는 적용되지 않았다.
**대시보드에서 고르고 재배포해도 한 번은 안 먹었다** — 그래서 `vercel.json` 으로 못 박았다.

**조치 후** (함수가 `icn1`, 서울 · `/login` 13회)

| 측정 | 값 |
|---|---|
| DNS+TCP+TLS (네트워크 바닥) | **~42ms** |
| `/login` TTFB 최저 (진짜 웜) | **172ms** |
| `/login` TTFB 평균 | **254ms** |
| `/login` TTFB 최고 | **429ms** |
| **함수 실행 리전** | **`icn1` (서울)** — `x-vercel-id: icn1::icn1::...` |

확인 명령: `curl -sI https://nyangmeong-care-dms.vercel.app/login | grep -i x-vercel-id`
**두 번째 칸**을 본다. 첫 칸은 엣지라 항상 `icn1` 이고 리전 판정 근거가 아니다.

**리전으로 산 것은 60~140ms 인데 같은 페이지의 편차가 260ms 다.** 8회를 2초 안에
몰아쳐도 429ms 가 섞였다 — 트래픽이 없어 요청마다 반쯤 콜드로 뜨는 것으로 보인다(추정).
**"느리다"의 주범은 리전이 아니라 콜드 스타트였다.** 리전 최적화를 1순위로 뒀던 것은
아래 "쿼리 3개" 오판에 기댄 것이었다.

**서울로 정한 이유 — 자원이 갈려 있다.**

사용자와 S3(`ap-northeast-2`)는 서울에, Neon 은 싱가포르에 있다. 어느 쪽을 골라도
하나는 멀다. Seoul↔Singapore 왕복 95ms(실측), 같은 리전 내 DB 왕복 ~2ms(추정) 기준:

| 경로 | `icn1` 서울 | `sin1` 싱가포르 |
|---|---|---|
| 목록 (필터 없음) — DB 1 | 5 + 95 = **100ms** | 95 + 2 = **97ms** |
| 목록 (`?folder=`) — DB 2 | 5 + 190 = **195ms** | 95 + 4 = **99ms** |
| 다운로드 presign — DB 1 | **100ms** | **97ms** |
| **업로드 마무리 — DB 1 + S3 1** | 5 + 95 + 5 = **105ms** | 95 + 2 + 95 = **192ms** |
| `/login` — DB 0 | **~5ms** | **~95ms** |

업로드 마무리가 뒤집히는 이유는 `headObjectSize`(`s3.ts:67`)가 S3 에 **실제 네트워크
호출**을 하기 때문이다. presign 자체는 로컬 서명이라 왕복이 없다 — 그래서 다운로드는
영향이 없다.

> **서울의 대가는 코드가 늘 때 드러난다.** 사용자↔함수 왕복은 요청당 **한 번**이지만
> 함수↔DB 왕복은 **쿼리 깊이만큼** 곱해진다. 순차 DB 쿼리를 하나 더 붙일 때마다
> 서울은 +95ms, 싱가포르는 +2ms 다. **깊이가 3 을 넘으면 `sin1` 로 돌아올 것.**
> 그때는 `vercel.json` 의 `regions` 한 줄만 바꾸면 된다.

**목록 페이지의 DB 왕복 깊이는 3 이 아니라 1~2 다.** (2026-08-25 정정)

이 절은 원래 "목록 페이지는 DB 를 3번 **순차로** 친다"고 적혀 있었고, 그 위에서
"쿼리가 3개라 3배로 붙는다"며 싱가포르를 밀었다. **틀렸다.**

- `layout.tsx:28`(`getFolders`)과 `page.tsx` 의 쿼리는 **다른 세그먼트라 병렬**이다 —
  "By default, layouts and pages are rendered in parallel"
  (`node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md:458`)
- 순차인 것은 같은 컴포넌트 안의 `page.tsx:47`(`activeFolder`) → `page.tsx:50`(`getDocuments`)
  둘뿐이고, 앞의 것은 `?folder=` 가 있을 때만 돈다
- `getSession()`(`session.ts:34`)은 JWT 검증뿐이라 **DB 를 안 친다**

남은 항목:

1. ~~함수 리전~~ — **완료** (2026-08-25, `icn1`). `vercel.json` 에 박혀 있다
2. **`page.tsx:47,50` 을 `Promise.all` 로 병렬화** — 서울에서는 이득이 95ms 로 **커졌다**
   (싱가포르였다면 2ms 라 무의미했다). 다만 `?folder=` 가 있을 때만 효과가 있고,
   위 편차 260ms 에 묻힐 수 있다. **실사용 트래픽이 생겨 웜 비율을 잰 뒤에 판단할 것**
3. **Neon 콜드 스타트** — 무료 티어는 몇 분 유휴면 컴퓨트가 0 으로 내려간다. 위 1230ms
   가 그것이다. 코드로 못 고치고, 팀이 실제로 쓰기 시작하면 줄어든다
4. **Vercel 콜드 스타트** — 1680ms vs 웜 172ms. 서버리스의 구조적 특성이다

> 3·4 는 무료 티어의 성질이지 버그가 아니다. **2 를 하기 전에 웜/콜드 비율을 잴 것** —
> 사용자 7명짜리 사내 도구는 대부분의 시간이 유휴라, 콜드가 지배적이면 2 는 헛수고다.

> **Neon 리전은 바꿀 수 없고, 바꿀 곳도 없다.** Neon 은 서울(`ap-northeast-2`)을
> 지원하지 않는다 — 아시아는 싱가포르(`ap-southeast-1`)와 시드니뿐이고 도쿄도 없다.
> 게다가 **기존 프로젝트의 리전은 변경 불가**라 옮기려면 새 프로젝트 + 마이그레이션이다.
> 지금이 이미 최선의 선택지다 (2026-08-25 Neon 공식 문서 확인).

### 미룬 리뷰 항목 (상시 — 계기가 오면 처리)

2026-08-22 리뷰에서 나왔으나 지금 고치지 않기로 한 것들. 각 행의 "언제" 가 계기다.
그 리뷰의 진단 원문·해소된 항목은 `HANDOFF-ARCHIVE.md` 에 있다.

**미룬 8건** — 지금 고치지 않는다:

| 위치 | 내용 | 언제 |
|---|---|---|
| ~~`discord.ts:88`~~ | 임베드 `url` 이 없는 `/documents/[id]` 를 가리킴 | **해소됨** — M3 가 그 라우트를 만들었다. 다만 알림은 `NODE_ENV=production` 에서만 나가므로 임베드 링크가 실제로 열리는지는 배포(M6) 후 확인 |
| `documents/route.ts:37`<br>`[id]/versions/route.ts:35` | `keyToken` 이 5분간 재사용 가능 → 같은 S3 객체에 Document N개. **M3 에서 versions 라우트가 같은 구멍을 복제했다** (2026-08-24 리뷰). `verifyUploadToken`(`upload-token.ts:35`)은 검증만 하고 토큰을 소모하지 않아, TTL 300초 안에 같은 `(s3Key, keyToken)` 으로 **서로 다른 문서**의 `/versions` 에 반복 POST 가 된다 — 피해 범위가 한 문서 안에서 문서 **사이**로 넓어졌다 | **고아 객체 정리 때 같이** — 정리 배치가 붙는 순간 한 문서를 지우면 다른 문서 파일이 사라진다. **두 곳을 같이 막을 것.** 토큰 1회용화는 사용 기록 저장소가 필요해 스키마 변경을 부른다. **2026-08-25: 영구삭제(`[id]/purge`)가 이 구멍을 우회한다** — `deleteObject` 앞에서 같은 `s3Key` 를 가리키는 버전이 남아 있는지 세고 0 일 때만 지운다. 구멍 자체는 그대로이고, 공유된 객체는 고아로 남는다(파일 유실보다 낫다) |
| `session.ts:6`<br>`session.ts:34` | **길드 멤버십은 로그인 순간에만 검사된다.** 세션은 30일 JWT 이고 `getSession()` 은 서명만 검증한다 — 길드 멤버십을 다시 안 본다. 그래서 **팀원이 길드에서 나가거나 추방돼도 최대 30일간 문서 열람·업로드·삭제가 된다.** `CLAUDE.md` 는 "접근 제어는 디스코드 길드 멤버십 하나뿐"이라고 적었지만 실제로는 **로그인 시점의 스냅샷**이다. JWT 라 개별 무효화 수단이 없고, 전역 무효화는 `AUTH_SECRET` 교체(= 전원 재로그인)뿐이다 (2026-08-25 코드 확인) | **팀원 이탈이 생기면 즉시** — 그전까지는 노출이 없다. 7인 팀에 이탈이 없으면 계기가 안 온다. 고치는 방향 둘: (a) `MAX_AGE_SECONDS` 를 30일 → 1~7일로 줄여 창을 좁힌다(싸다, 재로그인이 잦아진다) (b) `getSession()` 에서 길드를 재확인한다(정확하다, 매 요청 디스코드 API 를 쳐서 비싸다). **급하면 `AUTH_SECRET` 교체가 즉효다** |
| `login/page.tsx:31` | `?error=` 값을 **화이트리스트 없이 그대로 렌더**한다. `page.tsx` 배너(`/`)는 `pageErrorMessage` 로 거르는데 `/login` 은 안 거른다 — 임의 문장이 빨간 배너로 뜬다. React 가 이스케이프하므로 XSS 는 아니고, 로그인 폼에 입력 필드가 없어 훔칠 것도 없다 (2026-08-25 코드 확인) | **계기 없음** — 심각도가 낮다. `/` 와 정책이 갈린다는 것만 기록해 둔다. 고친다면 `pageErrorMessage` 를 `/login` 에도 적용 |
| `s3.ts:71` | `catch { return null }` 이 403·503 을 "파일 없음"으로 뭉갬 | 로그 추가로 충분 |
| `upload-dialog.tsx:39,74,139`<br>`version-upload-dialog.tsx:39,50,98` | `inFlight` 에서 완료된 XHR 을 제거하지 않음. 줄번호는 `putToS3` 를 `lib/upload-xhr.ts` 로 뺀 뒤 기준(2026-08-24). 같은 결함이 재업로드 다이얼로그에 복제됐다 | 누수는 다이얼로그 수명 한정 |
| `(app)/error.tsx:17-28` | DB 연결 실패에 **"SSH 터널"** 안내를 띄운다. 개발 DB 를 Neon 으로 바꾼 뒤로는 상황과 안 맞고(터널이 없다), 운영은 RDS 직결이라 배포 후에도 안 맞는다 (2026-08-25 B11 실측에서 확인) | **M6 배포 때** — 그때 환경이 확정되므로 문구를 그 환경에 맞춘다 |
| `lib/tag.ts` (정규화) vs `lib/search.ts` (필터) | 영문 태그 대소문자 정책이 갈린다. **한 문서 안**에서는 `Plan`/`plan` 이 합쳐지는데(`normalizeTags` 가 대소문자 무시 중복 제거) **문서 사이**에서는 필터가 완전일치라 갈린다. `DESIGN.md` §4 가 "팀 태그는 한글 위주"를 근거로 의도적으로 수용한 것이다 | **영문 태그를 실제로 쓰기 시작하면** — 팀이 안 쓰면 계기가 안 온다. 고친다면 `Tag.name` 을 소문자로 저장하고 표시용 원본을 따로 두는 쪽인데 스키마 변경을 부른다 |
| `page.tsx` 배너 (2차 리뷰) | `?error=notfound` 가 주소창에 눌러앉는다. 배너를 띄운 화면에서 업로드하면 `close()` 의 `router.refresh()` 가 **URL 을 안 바꿔서** 방금 성공한 업로드 옆에 낡은 에러가 남는다 | 닫기 버튼(`history.replaceState`)이나 렌더 후 파라미터 제거. ~~M3 상세 페이지가 배너를 하나 더 쓸 것이므로 그때 같이~~ — **그 전제가 깨졌다.** 상세 페이지는 배너 대신 `notFound()` + 세그먼트 `not-found.tsx` 를 쓴다(URL 에 에러가 눌러앉지 않는다). 배너를 쓰는 곳은 목록의 다운로드 링크뿐이라 이 항목은 계기 없이 남는다 |
| `download/route.ts:36` (2차 리뷰) | 같은 핸들러의 401 만 여전히 내비게이션에 JSON 을 준다 | **의도된 것.** proxy 가 같은 쿠키를 같은 키로 먼저 검증하므로 도달 창은 프록시 통과와 라우트 도착 사이 수 ms 경합뿐이다. 이유를 `route.test.ts` 주석에 박아 뒀다 |

---

### M6 채택 타임라인 (2026-08-26 확인)

**배포 → 공유 → 팀원 유입 → 방어선 검증 순서가 지켜졌다.** 전부 2026-08-25 하루 안에 일어났다.
아래는 KST 다 (DB 저장값은 UTC — 바로 아래 지뢰 참조).

| KST | 무엇 | 근거 |
|---|---|---|
| 09:01 | 개발자 본인이 먼저 접속해 확인 | `users` 첫 행 |
| 13:44 | Vercel 배포 | 커밋 `008b7da` |
| 13:41 ~ 15:53 | **팀원 5명 유입** — 배포 직후 개발자가 전원에게 공유했다 | `users` 2~6행 |
| 21:00 | 길드 비멤버 거부 확인 (부계정) | 커밋 `f34a56a` |

**M6 의 완료 기준은 이걸로 충족됐다** — 6명이 각자 로그인했고 그중 5명이 문서를 올렸다.
`documents.created_by` 가 5명으로 갈리는 것이 더 강한 증거다. 로그인 행은 개발 중에도
생기지만 **업로드는 사람이 파일을 고른 것**이다.

> **순서에 관한 기존 서술을 정정한다.** "다음 작업" 절이 "URL 은 확인 전에 이미 팀에
> 배포됐다 — 순서가 뒤집혔다"고 적어 뒀는데, **뒤집힌 것은 맞지만 폭은 같은 날 7시간이다**
> (공유 13:41~15:53 → 검증 21:00). 하루 이상 벌어졌던 것으로 읽힐 여지가 있어 시각을 박아 둔다.

## 지뢰 (겪은 것들)

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
      [id]/purge/route.ts     DELETE 영구삭제 (휴지통 문서만)
      [id]/tags/route.ts      PUT 태그 교체
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
                              (ThemeProvider 가 없어 OS 다크에서 토스트만 검게 뜬다)
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

우선순위 순. **M6 → M5** 가 남았다. M4 는 2026-08-25 에 끝났다 (파이프라인 `m4` 주행 +
브라우저 실측 11/11). 원래 순서는 M4 → M6 → M5 였다.

> **함수 리전은 끝났다** (2026-08-25, `icn1` 서울 · `vercel.json` 에 고정). 이 목록의
> 1순위였으나 **효과가 예상보다 작았다** — 60~140ms 를 샀는데 콜드 스타트 편차가 260ms 다.
> 근거와 재측정값은 위 "배포 성능 실측" 절. **성능은 더 파지 말 것** — 팀이 실제로
> 쓰기 시작해 웜/콜드 비율이 잡히기 전까지는 측정 없이 최적화하는 셈이 된다.

> **길드 비멤버 거부는 확인됐다** (2026-08-25 21:00 KST, 부계정 실측 — 위 "현재 위치").
> M1 부터 미검증으로 끌려온 항목이었다. **다만 URL 은 확인 전에 이미 팀에 공유됐다**
> (13:41~15:53 KST) — **같은 날 7시간 차로 순서가 뒤집혔다.** 결과가 통과였으니 사고는
> 안 났다. 다음에 방어선을 검증할 때는 순서를 지킬 것. 타임라인은 위 "M6 채택 타임라인" 절.

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

0. **브라우저 실측 — 자동 분류 + UI 정비를 한 번에.** 둘 다 같은 화면(업로드 다이얼로그·
   폴더 트리)이라 따로 볼 이유가 없다. **M5 에 손대기 전에 먼저 본다** — M5 가 또 같은
   화면을 건드리므로 깨진 채로 쌓으면 어느 쪽이 깼는지 못 가른다.
   - 자동 분류 9종: `feature/auto-classify` worktree 의 `.pipeline/auto-classify/DESIGN.md` §4.2.
     핵심은 기준선 7건 드롭 → 미리보기 3그룹·근거 줄 / "만들지 않음" 체크 / 미리보기에서
     닫으면 폴더 0·문서 0 / 업로드 직후 취소 시 빈 폴더만 삭제 / 별칭 `와이어프레임` 실증
   - UI 정비: 토스트 7곳 · AlertDialog 3곳 · Dialog 폼 2곳 · 업로드 폴더 셀렉트
   - **`dev` 브랜치를 보므로 마음껏 해도 팀 문서에 안 닿는다** (2026-08-26 분리)
   - 통과하면 `main` 머지 → 푸시 → 배포. **스키마는 이미 운영에 있어 추가 작업 없다**

0-1. **`.claude/settings.json` 에 `PowerShell(...)` 규칙 추가.** allow 가 전부 `Bash(...)` 라
   에이전트가 PowerShell 로 부르면 안 걸린다 — 3차 주행 권한 거부 8건 중 4건이 이것이다.
   근거는 위 "파이프라인 3차 주행 실측".

1. ~~**`DISCORD_WEBHOOK_URL` 을 채워 재배포.**~~ **끝났다** (2026-08-26). 지금도 업로드할
   때마다 알림이 온다. **M5 의 알림 항목이 이걸로 닫혔다** — M5 에 남은 것은 미리보기뿐이다.

2. **M5 — 미리보기 + 디스코드 알림** (추정 2h). **알림 쪽은 코드 작업이 거의 없다** —
   `notifyUpload` 는 이미 `api/documents/route.ts:75` 와
   `api/documents/[id]/versions/route.ts:101` 두 곳에서 호출된다. 막고 있는 건
   `discord.ts:78` 의 `NODE_ENV !== 'production'` 게이트 하나뿐이라 **M6 배포가 곧
   그 기능의 스위치다.** 남는 실제 작업은 PDF·이미지 미리보기이고
   `canPreview` 는 `s3.ts:77` 에 이미 있다.

3. **S3 고아 객체 정리** — 업로드 취소와 소프트 삭제 경로에 `deleteObject` 연결.
   "휴지통 비우기"는 `MILESTONES.md` 에 없는 기능이므로 범위를 넓히지 말 것.
   **먼저 위 지뢰의 `s3:ListBucket` 항목을 읽을 것** — 사후에 훑어서 지우는 방식은 지금
   권한으로 불가능하고, 만든 쪽이 그 자리에서 지우는 형태로 설계해야 한다.
   `keyToken` 재사용 구멍(`documents/route.ts:37` · `[id]/versions/route.ts:35`)도 이때
   **두 곳을 같이** 막는다 — 정리 배치가 붙는 순간 한 문서를 지우면 다른 문서 파일이 사라진다.

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
도구로 불렀는데 allow 가 전부 `Bash(...)` 다. 상세와 조치는 "파이프라인 3차 주행 실측" 절.
