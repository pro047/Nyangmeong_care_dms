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

## 현재 위치 (2026-09-12 갱신)

**다음 스트림은 정합성 지표 화면이다** (사람이 정함, 2026-09-12). 착수 지시서는
아래 "다음 작업" 0 번에 **자기완결로** 적혀 있다 — 정합성 저장소 리포를 열 필요 없다.
**MCP 서버 1단계는 같은 날 배포까지 갔다** — 운영에서 ⓪ⓐ①ⓒⓓ✚ 통과, ⓑⓔⓕⓖ 남음
(아래 0-3).

**최근 두 스트림이 배포까지 끝났다.** ① **붙이기**(2026-09-10 배포) — 업로드할 때 기존
문서의 새 판인지 묻는다. **다음 날 팀원이 실제로 썼고 새 갈라짐 0건**을 실측했다.
② **정합성 지표 수신 API**(2026-09-12) — `POST /api/consistency` 가 운영에서 동작한다
(왕복 8/8). **화면은 아직 없다** — 그것이 0 번이다. 일지는 아래 절과 `HANDOFF-ARCHIVE.md`.

**팀이 쓰기 시작했다** (2026-09-10 실측, 관찰 항목이 이걸로 닫혔다). 08-30 이후 업로더가
팀원 2명(`jdw152412` 4건 · `allrise_sjm` 2건) + 개발자 2건이다. *"7명 규모에서 검색이
실제로 필요한가"* 를 미측정으로 달고 다니던 전제가 충족됐다 — **다음 스트림을 검색으로
잡을 근거가 생겼다**(문서는 31건이다).

**MCP 서버 1단계**가 다른 스트림으로 들어와 있다(`c2e658d`). **2026-09-12 배포됐고
운영에서 ⓪ⓐ①ⓒⓓ✚ 가 통과했다** — 기록은 `MILESTONES.md` §'MCP 서버 · 1단계' 와
같은 절의 §'배포와 사람 확인'.

**여전히 관찰 단계다.** 성능도 검색도 *팀이 실제로 쓰는 것을 보고* 정한다.

**운영 DB 에 붙을 수 있게 됐다** (2026-09-09). 이 문서 곳곳과 "다음 작업" 1·2 번이
*"운영 DB 는 CLI 로 못 붙으므로 Neon 콘솔에서 본다"* 를 전제로 쓰여 있는데, **사람이 Neon
콘솔에서 접속 문자열을 건네면 세션이 직접 붙는다** — 오늘 그렇게 합치기를 돌렸다. 다만
`uselibpqcompat=true` 를 붙여야 하고(없으면 self-signed 오류), **운영 엔드포인트는
`ep-winter-meadow-azns3bbw`, dev 는 `ep-aged-king-az3kh35r`** 다. 1·2 번의 Neon 콘솔
수작업 지시는 그대로 유효하지만 더 이상 유일한 길은 아니다.

### 정합성 지표 수신 API (2026-09-12) — **API·저장 완료 · 표시는 다음 스트림**

정합성 저장소가 19개 문서를 파싱한 결과를 DMS 가 받아 쌓는다. 인계문은
`~/orca/Nyangmeong_care/claude/0911_DMS_정합성지표_인계문_v0.1.md` (자기완결).

**범위를 반으로 잘랐다** (사람이 정함). 이번은 **스키마 + `POST /api/consistency`** 까지이고
**표시는 다음 스트림**이다. 근거는 `MILESTONES.md` §'확정된 설계 결정' 의 *정합성 지표 수신* 행 —
저장·API 는 실제 왕복으로 계약을 확정하면 닫히지만, *메인 화면에 띄울 것인가* 는 제품
정체성(존재이유 3개)을 건드리는 결정이라 화면을 놓고 따로 해야 한다.

**스키마 모델이 6 → 10 이 됐다.** `ConsistencySnapshot` · `ConsistencyMetric` ·
`ConsistencyFinding` · `ConsistencySnapshotDoc`. dev 에 반영했고 **운영에는 아직 안 밀었다.**

**저쪽 인계문에서 안 따른 것이 하나 있다.** *"`proxy.ts` 가 전 경로를 덮으므로 라우트에
인증 코드를 더 넣을 필요 없다"* — 이 리포는 그렇게 쓰지 않는다. 인증 대상 라우트 11개가
전부 `getSession()` 을 직접 부르고, `CLAUDE.md` 가 *"보호 구간은 이중으로 검사한다"* 로
못박아 뒀다. 새 라우트도 같다.

**저쪽 스키마 제안 중 고친 것.** `@@unique([snapshotId, axis, fromKind, toKind])` 는
**from/to 가 null 인 축 4개를 못 막는다** — 포스트그레스가 유일 인덱스에서 NULL 을 서로
다른 값으로 보기 때문이고, 하필 그 넷이 화면에 큰 숫자로 나갈 축이다
(`referenceTotal`·`reqCoverage`·`reqCoverageWithDocs`·`scrCoverage`). 제약은 그대로 두되
**진짜 방어는 `lib/consistency.ts` 의 중복 축 검사**에 뒀다.

**검사를 하나 더 넣었다 — `counts` 체크섬.** 저쪽이 `counts` 를 *"findings 를 level 로 센
것과 같다 — 검산에 써도 된다"* 로 정의했으므로 그대로 체크섬으로 쓴다. **29KB 본문이 중간에
잘리면 findings 만 줄고 counts 는 그대로라 여기서만 드러난다.** 어긋나면 400 이고 아무것도
저장하지 않는다 — 어긋난 채 저장하면 화면의 `errors 14` 와 목록 건수가 안 맞는데 어느 쪽이
맞는지 알 길이 없다.

**검증**: `npm test` **531건**(신규 27건) · `build` · `eslint` 통과.
**실제 왕복 8/8** (`npm run test:e2e:consistency`).

| | 무엇을 봤나 | 결과 |
|---|---|---|
| K0 | 실측 규모 페이로드 | findings 149 · **29.2KB** |
| K1 | 쿠키 없이 | 401 |
| K2 | 29KB 본문 | **201** + id |
| K3 | 한 번에 들어가나 | 스냅샷 1 + metrics 9 + findings 149 + docs 19 = **177행** |
| K4 | counts 보존 | 14/107/28 · reqVer 0.6 |
| K5 | null 축 4개 | 전부 저장됨 |
| K6 | 재전송 | **409** · 행 안 늚 |
| K7 | 잘린 본문 | **400** · 반쪽 스냅샷 0 |

> **실제 왕복이 단위 테스트가 못 잡는 것을 잡았다.** 27건이 전부 통과한 상태에서 첫 왕복이
> **500** 이었다 — dev 서버가 5일 전에 떠 있어 `prisma generate` 결과를 못 본 것이다.
> 라우트 단위 테스트는 `vi.mock('@/lib/prisma')` 라 **원리상 이걸 못 잡는다.** 상세는
> §지뢰의 *"`next dev` 를 오래 띄워 두면…"*. 정합성 저장소가 302→307 로 겪은 것과 같은 종류다.

**운영 반영까지 끝났다 (2026-09-12).** 테이블 4개를 운영에 만들었고(`db execute`, 파괴적
구문 0건) `migrate diff` 가 비었다. 그리고 **배포된 앱 + 운영 DB 로 실제 왕복 8/8** 을 다시
돌렸다 — 29.2KB 가 201, 177행, 재전송 409, 잘린 본문 400. 뒤에 4테이블 전부 0행 · 활성
문서 31건 무사를 확인했다.

> **운영 왕복을 한 번 헛돌렸다** (같은 날). `APP=` 로 넘겼는데 `helpers.mjs` 가 읽는 이름은
> `APP_URL` 이라 **앱은 로컬을 치고 DB 조회만 운영을 봤다.** 앱은 201 을 냈고(로컬 dev DB 에
> 썼다) 조회는 아무것도 못 찾았으며 **정리도 0건이라 dev 에 행이 남았다**(찾아서 지웠다).
> 운영은 처음부터 끝까지 안 건드려졌다. **`node --env-file` 은 이미 설정된 env 를 덮지
> 않는다** — 그래서 내가 넘긴 DATABASE_URL 은 이기고 APP 은 이름이 틀려 졌다.
> **조치**: `test/e2e/consistency.mjs` 가 실행 전 APP·DB 를 둘 다 찍는다. 한쪽만 바꾸면
> 조용히 엇나가는 것을 눈으로 잡게 했다(합치기 스크립트의 대상 확인과 같은 이유).

**`AUTH_SECRET` 은 dev 와 운영이 같다** (2026-09-12 실측). `.env` 의 값으로 서명한 세션이
운영에서 통과했다 — E2E 를 운영에 그대로 돌릴 수 있는 이유이자, **dev 값을 아는 사람이
운영 세션을 만들 수 있다는 뜻**이기도 하다. 개발자 1명이라 지금 노출은 없지만 기록해 둔다.

**진짜 데이터가 운영에 들어왔다 (2026-09-12).** 저쪽이 `scripts/post_metrics.py` 를 붙여
실제 측정 1건을 보냈고 201 을 받았다. 세션이 운영 DB 로 대조한 결과:

| 확인 | 결과 |
|---|---|
| 행 수 | 스냅샷 1 + metrics 9 + findings 149 + docs 19 = **178** |
| `counts` ↔ findings | errors 14 · warnings 107 · unresolved 28 = **149, 일치** |
| `measuredAt` | `2026-09-11 11:14:48`(UTC) = 보낸 `20:14:48+09:00` — **정확** |
| `docs[].dmsId` 19건 | **19/19 실제 문서와 일치**, 없는 문서 0 · 버전 어긋남 0 |

> **`counts` 체크섬이 저쪽 버그를 저쪽이 먼저 잡게 했다.** `counts` 필드는 복수(`errors`)인데
> `level` 은 단수(`error`) 라, 이름으로 맞추려던 저쪽 첫 구현이 전부 0 으로 읽었다. 보냈으면
> 400 이었을 것을 **저쪽이 자기 검사에서 먼저 잡았다** — 계약을 값이 아니라 관계로 못박으면
> 양쪽이 다 쓴다.

**남은 것은 표시 하나다** (다음 스트림 = §다음 작업 0번). 저쪽 완료 판정
(*"메인에서 축 9개와 findings 149건이 보인다"*)은 **반쪽 닫혔다.**

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

### 저쪽이 넘겨 온 것 — 아직 우리 일 아님

- **`versionNo` 가 높은 쪽이 구판인 실물 사례가 나왔다** (건강기록 화면설계서). 저쪽이 내용을
  파싱해 `versionNo=3` 인 08-31 판이 09-04 판보다 구판임을 확인했다 — 빠진 ID 둘이 누락이
  아니라 "폐지 반영"이었다. **붙이기 기능으로는 못 막는다**(이미 갈라진 뒤다). 합쳐야 한다.
  다만 **판번호가 둘 다 v0.5** 라 `merge-versions.mjs` 의 판번호 정렬이 순서를 못 정한다 —
  **사람이 계획 파일의 `order` 에 명시해야 한다.** 저쪽이 준 순서(2026-09-10):

  | | id | 파일명 |
  |---|---|---|
  | 1 (앞 판) | `cmtgnjhvi000004jp8um1i6mr` | `03_건강기록_화면설계서_HLT_v0_5_2026-08-31.html` |
  | 2 (뒤 판 · keep) | `cmtsab94u000004l5gqm8atja` | `03_건강기록_화면설계서_v0_5_2026_09_04.html` |

  > **약한 고리를 저쪽이 밝혔다.** 화면설계서 HTML 에는 개정내역이 없어 폐지 근거가
  > **기능명세서 쪽 교차 근거**이고, `FN-HLT-004-*` ↔ `SCR-HLT-004` 대응은 ID 체계가 v0.3 에서
  > 바뀌어 직접 확인이 안 된다. **합치기는 되돌릴 수 없으므로 이 순서를 팀장이 확인하고 넣을 것.**

  FN-HLT 는 판번호가 갈려(`v0_1`·`v0_5` 둘) 자동 재배열로 충분하다 — 저쪽이 준 순서는
  `cmt9n3lt1`(v0.1) → `cmtgt3hcq`(v0.5 08-31) → `cmtsab94z`(v0.5 09-08, keep) 다.
- 통합 후보 3건(SCR-ACC · SCR-HLT · FN-HLT)은 **판정이 아니라 후보 목록**이고, 무엇과 무엇이
  같은 문서인지는 팀장 판단이다. **SCR-ACC 는 특히 확인 전까지 합치면 안 된다** (흡수 대상
  쪽에 FN 참조가 35개라 다른 계열일 수 있다).
- ~~**DMS 에 올려야 하는 것 3건**~~ — **전부 닫혔다 (2026-09-11).** `04_AI매니저_기능명세서_v0.1`
  은 올라갔고(`[AI매니저]` 폴더 · `versionNo=1`), **`SCR-PLC`·`FN-MYP` 는 올릴 것이 없었다** —
  저쪽 manifest 가 판번호를 잘못 적어 둔 것이었다(`SCR-PLC` 를 v0.2 인데 v0.5 로, `FN-MYP`
  를 v0.1 인데 v0.2 로). **저쪽 퇴행 가드가 잡은 2건이 둘 다 자기 오기였고 DMS 쪽 진짜
  퇴행은 0건이다.**

### 다음 통합을 실제로 돌릴 때 (순서 계약 A)

**되돌릴 수 없는 작업이라 사람 승인이 따로 필요하다.** 팀장이 *"무엇과 무엇이 같은 문서인가"*
를 확인한 것과 *"지금 운영 DB 에 파괴적 작업을 돌린다"* 는 다른 결정이다.

1. 계획 파일을 만들고 `node --env-file=.env scripts/merge-versions.mjs --plan <계획> --apply`
   를 돌린다 → **`--mapping-sent` 가 없으므로 사라질 id → keepId 매핑을 찍고 exit 4 로 멈춘다**
2. 그 출력을 정합성 저장소에 전달한다
3. 저쪽이 manifest 를 갱신했다고 알리면
4. 같은 명령에 `--mapping-sent` 를 붙여 실제로 적용한다

> **FN-HLT 는 폴더 이동이 선행이다.** `cmtsab94z`(`04_건강기록_기능명세서_v0_5_2026_09_08.xlsx`)
> 가 `화면설계서` 폴더에 있는데 `cmtgt3hcq` 는 `건강기록` 폴더다. **합치기 스크립트는 폴더가
> 갈린 그룹을 건너뛴다**(`merge-versions.mjs` 의 `problems` 검사) — 취향이 아니라 전제 조건이다.
> 폴더 이동은 전원 동등 권한이라 화면에서 할 수 있다.

> **`order` 가 낡을 수 있다.** 붙이기가 쓰이기 시작해서(2026-09-11 `sannabi1` 이 3건) 그
> 사이에 새 판이 붙으면 `versionNo` 가 1 이 아니게 되고, 스크립트가 그 그룹을 건너뛴다.
> **매핑을 보내기 직전에 그 시점 DB 로 다시 확인할 것.**

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

**0 번(정합성 지표 화면)이 다음 스트림이다** — 사람이 정했다(2026-09-12). 착수에 필요한
것은 0 번 안에 전부 있다(자기완결). 0-3(MCP 2단계)과 0-2 는 사람 결정 대기이고, 1~3 은
코드가 아니거나 계기 대기다. M0~M6 과 이 목록의 예전 0~4 번은 전부 끝났고, 그 기록은
`HANDOFF-ARCHIVE.md` 의 "§다음 작업 — 끝난 항목들" 절에 있다.

0. **정합성 지표 화면을 만든다** (다음 스트림 — 사람이 이걸로 정함, 2026-09-12).

   **데이터는 이미 운영에 쌓인다.** `POST /api/consistency` 가 운영에서 동작하고(왕복 8/8)
   스키마도 dev·운영 둘 다 맞다. **남은 것은 화면 하나뿐이다.** 착수 전 저쪽 리포를 열 필요
   없다 — 필요한 것은 전부 아래에 있다.

   ### 읽을 데이터

   테이블 4개. 모델 정의는 `prisma/schema.prisma` 끝, 값의 뜻은 아래.

   ```
   ConsistencySnapshot      측정 1회. measuredAt(유일) · reqVer · error/warning/pending/unresolvedCount
     └ ConsistencyMetric    축별 ok/total. axis · fromKind · toKind   (9행)
     └ ConsistencyFinding   문제 1건. level · check · doc · refId · where · message   (149행)
     └ ConsistencySnapshotDoc  이 측정에 쓴 문서. key · ver · dmsId · dmsVersion   (19행)
   ```

   **최신 1건은 `measuredAt desc` 로 고른다** — `createdAt` 이 아니다(전송 시각과 측정 시각은
   다르다). 인덱스가 `measuredAt(sort: Desc)` 로 있다.

   ### 축 9개 — 이 이름이 계약이다

   | axis | from/to | 뜻 | 실측(2026-09-11) |
   |---|---|---|---|
   | `reference` | FN→REQ | 쓴 ID 가 정의돼 있나 | 42/42 |
   | `reference` | FN→SCR | 〃 | 55/58 |
   | `reference` | SCR→FN | 〃 | 129/129 |
   | `reference` | SCR→REQ | 〃 | 48/48 |
   | `reference` | SCR→SCR | 〃 | 87/100 |
   | `referenceTotal` | null | 위 다섯의 합 | 361/377 |
   | `reqCoverage` | null | 화면·기능이 참조하는 REQ / 정의된 REQ 전체 | 37/62 |
   | `reqCoverageWithDocs` | null | 〃 / **좁은 분모** | 37/50 |
   | `scrCoverage` | null | 기능명세서가 덮은 SCR / 정의된 SCR | 54/54 |

   ### `check` 8종 (findings 를 묶는 축)

   `참조`(51) · `REQ커버리지`(25) · `기준REQ`(18) · `형식`(8) · `결번`(7) · `중복블록`(6) ·
   `프레임바`(6) · `unresolved`(28). **`기준REQ` 18건은 전 문서에 걸리는 같은 사유**라
   (표기 규칙이 아직 시행 전) 접거나 묶어도 된다고 저쪽이 명시했다.

   ### 표시 요건 — 저쪽이 근거와 함께 못박은 것 (뒤집지 말 것)

   1. **축 9개를 전부 띄운다.** 하나를 대표로 뽑으면 그게 *"정합성 = N%"* 라는 **판정**이
      되는데 그 판정은 팀장이 한다. 같은 데이터로 100% · 95.76% · 59.68% · 74.00% 가 다 나온다.
      강조가 필요하면 `참조 합계` 를 위에 두되 나머지도 같은 화면에 둔다.
   2. **`reqCoverage` 와 `reqCoverageWithDocs` 는 반드시 나란히.** 59.68% 만 띄우면 오해다 —
      빠진 25건 중 12건은 관리자(ADM 9)·비기능(NFR 3) 이라 화면설계서가 있을 수 없고 5건은
      방금 추가된 신규다. **실제 판정 대상은 8건이다.**
   3. **`measuredAt` 과 `reqVer` 을 크게.** **이 숫자는 자동 갱신되지 않는다** — 누가 문서를
      올려도 안 바뀌고 저쪽이 손으로 돌려야 새 값이 온다. 시각이 안 보이면 낡은 숫자가
      현재값으로 읽힌다. "N일 전 측정" 을 붙이는 것도 좋다.
   4. **신호등 금지.** 빨강/초록·"합격" 같은 표시를 붙이지 않는다. `errors 14` 는 *"14개가
      잘못됐다"* 가 아니라 *"14개를 사람이 봐야 한다"* 는 뜻이다. 실제로 2026-09-11 측정의
      errors 14건 중 **6건은 문서 결함이 아니라 저쪽 파서 한계**였다(화면설계서가 ID 를
      프레임에서 표로 옮겼는데 파서가 프레임만 읽는다). 신호등이 있었으면 빨강이었고 **그건
      틀린 신호다.** 그리고 **그 6건에 "파서 한계" 표시는 안 온다** — 사람이 손으로 가른
      것이지 도구 태그가 아니다. **없는 분류를 화면에 만들지 말 것.**
   5. **findings 149건을 다 보여주되 묶어서.** 최소한 `level`·`check`·`doc` 으로 걸러 볼 수
      있어야 한다. `where` 는 `SCR-COM-001@블록1` 처럼 문서 안 위치라 그대로 보여주면 된다.
   6. **`docs[].dmsId` 로 실제 문서에 링크를 걸 수 있다.** 단 **FK 가 없다** — 문서는 하드
      삭제되므로(2026-09-09 통합에서 9건) **없으면 링크를 빼는** 쪽으로 그린다.

   ### 아직 안 정한 것 — **이게 이 스트림의 첫 결정이다**

   **메인(`/`)에 띄울 것인가, 별도 페이지(`/consistency`)로 뺄 것인가.** 사람이 API 와 표시를
   가른 이유가 이 결정 때문이다.

   - 저쪽 완료 판정은 *"**메인**에서 축 9개와 findings 149건이 보인다"* 다 — 별도 페이지면
     협의가 필요하다
   - 메인은 지금 문서 목록이고 **그게 제품 존재이유 1번("한눈에 안 들어온다")의 답**이다.
     거기에 지표 9줄 + findings 149건이 붙으면 첫 화면이 무엇을 위한 것인지 갈린다
   - **정합성 지표는 존재이유 3개 중 어디에도 안 들어간다** — 네 번째 축이다. 제품 정의를
     넓히는 결정이라 사람이 해야 한다
   - 별도 페이지는 메인 정체성을 지키지만 **링크 뒤에 숨으면 아무도 안 본다**

   ### 함정

   - **`measuredAt` 을 그대로 찍으면 9시간 틀린다.** 컬럼이 `timestamp without time zone`
     이고 값은 **UTC 벽시계**다. node-postgres·Prisma 가 이걸 JS `Date` 로 줄 때 **로컬시
     (KST)로 해석**하므로 `toISOString()`·`toLocaleString()` 이 9시간 어긋난다.
     **이 스트림의 4번 요건이 "`measuredAt` 을 크게" 라 정면으로 밟는 자리다.**

     ```
     보낸 값        2026-09-11T20:14:48+09:00
     DB 저장(UTC)   2026-09-11 11:14:48          ← 정확하다
     그냥 읽으면    2026-09-11T02:14:48.000Z     ← 9시간 빠져 보인다
     ```

     2026-09-12 에 세션이 실제로 밟아서 "저장이 틀렸다"고 오진할 뻔했다. **저장은 정확하다 —
     읽는 쪽이 UTC 로 해석해야 한다.** §지뢰의 *"DB 시각을 읽을 때 9시간이 밀린다"* 와 같은 건이다.

     > **`measuredAt` 만 `timestamptz` 로 바꾸는 선택지가 있다** (착수 시 사람이 정할 것).
     > 이 컬럼은 이 앱에서 **유일하게 외부에서 타임존을 달고 들어오는 시각**이라 원래
     > `timestamptz` 가 맞는 자리다. 바꾸면 이 클래스의 버그가 사라진다. 대가는 다른 시각
     > 컬럼(`created_at`·`updated_at`·`deleted_at`)과 타입이 갈린다는 것 — 그때부터 "이 컬럼은
     > 어느 쪽인가"를 매번 봐야 한다. **안 바꾸면 화면 코드가 UTC 해석을 책임진다.**

   - **스키마를 건드렸으면 `next dev` 를 재시작할 것** — §지뢰 참조. 이 스트림에서 실제로
     500 을 맞았다
   - 화면은 서버 컴포넌트가 직접 조회한다(`page.tsx` 가 그렇다). `GET /api/consistency` 를
     새로 만들 이유가 없다 — 만들면 계약이 하나 더 는다
   - **비율은 화면에서 나눈다.** DB 에 비율이 없는 것이 사양이다
   - `findings` 149행을 한 번에 내리면 페이로드가 커진다. 서버 컴포넌트라 HTML 에 실린다 —
     **접기/필터를 서버에서 할지 클라이언트에서 할지가 설계 지점이다**

0-3. **MCP 서버 — 1단계 배포됨 · 운영 확인 일부 (2026-09-12).** Claude Code·Codex·claude.ai·
   ChatGPT 가 문서를 찾아 읽고(1단계) 새 판으로 올리게(2단계) 한다. 설계·주행 기록·검증 표는
   `MILESTONES.md` §'MCP 서버 · 1단계', 확정 근거는 같은 파일 '확정된 설계 결정'
   표의 MCP 행 3개(① 패키지 추가 ② 무상태 JWT ③ 파일은 URL 만·샌드박스 A 먼저 실측).
   1단계 = OAuth 인가 서버(DCR+PKCE, 동의 화면) + 읽기 도구 4개. 테스트 668건·lint·빌드
   통과. PR #1 로 `main` 에 머지(`c2e658d`)했고 Vercel Production 배포까지 끝났다.
   ⓪ **코드 리뷰는 돌렸고 3건을 전부 고쳤다** (2026-09-11) — 치명 1건은 **인증 없이 받는
   `client_id` 를 세션 쿠키로 쓰면 로그인이 되는 것**이었다(OAuth 토큰 키를 파생 키로 갈라
   닫음). 전문은 `MILESTONES.md` §'MCP 서버' 의 *코드 리뷰*. 미배포 상태에서 닫혔다.
   **운영 확인 (2026-09-12)**: ⓪ 웹 로그인 유지 · ⓐ Claude Code · ① 302(간접) ·
   ⓒ claude.ai 커넥터 · ⓓ 다운로드 URL 206→403 · ✚ `client_id` 세션 우회 차단 — **전부 통과**.
   표는 `MILESTONES.md` §'배포와 사람 확인'.
   **남은 것**: ⓑ Codex · ⓔ 1시간 뒤 리프레시 · ⓖ 비길드 차단(부계정이 없어 미확인) ·
   ⓕ ③ A 실측(**판정 불가** — claude.ai 컨테이너 허용 목록과 5분 만료가 섞였다. 허용 목록에
   버킷 도메인을 넣고 새 URL 로 즉시 재시도해야 가른다) →
   2단계(`upload-commit.ts` 추출 + 올리기 도구 5개) → 3단계(ⓕ 결과로 B 를 열지 정한다).
   **`CLAUDE.md` 인증 절에 MCP 한 줄은 아직 안 넣었다**(보호 파일 — 사람이 세션에서).
   worktree `../Nyangmeong_care_dms-pipeline-mcp-read` 와 브랜치 `pipeline/mcp-read` 는
   `feature/mcp` 에 합쳐졌으므로 지워도 된다(`.pipeline/mcp-read/` 산출물은 git 밖 —
   VERIFY.md 의 사람 체크리스트 전문이 거기 있다).

**다음 스트림은 관찰 결과로 고른다.** 1·2 번은 2026-09-10 에 둘 다 닫혔다
(팀이 쓴다 · 유일 제약 적용됨). **3 만 남았고 그건 계기 대기다.**
*이 문단은 2026-09-11 까지 "살아 있는 코드 작업이 없다"로 끝났는데, 그 뒤 MCP 1단계가
배포까지 갔고 정합성 지표 수신 API 도 들어왔다 (2026-09-12 정정).* **다음 스트림은 0 번
(정합성 지표 화면)으로 사람이 정했다.** 그 뒤의 스트림을 §운영 실측이 연 근거
(팀이 쓴다)로 고른다.

1. ~~**운영 문서 증가분의 출처를 가른다**~~ — **닫혔다 (2026-09-10). 팀이 쓴다.**
   08-30 이후 업로더는 `jdw152412` 4건 · `allrise_sjm` 2건 · `ijinseong2798`(개발자) 2건이다.
   실측 표와 해석은 위 §운영 실측. `MILESTONES.md:63` 이래 미측정으로 남아 있던
   *"7명 규모에서 검색이 실제로 필요한가"* 의 전제가 이것으로 충족됐다 — **다음 스트림을
   검색으로 잡을 근거가 생겼다.** 다만 *필요한가* 는 여전히 안 물어봤다(문서 27건이다).

2. ~~**운영에 `@@unique([s3Key])` 를 민다**~~ — **끝났다 (2026-09-10).** 적용 경로와
   검증(중복 거절 `23505` · 제약 이름 확인 · 롤백 후 무변경)은 위 §붙이기 배포됨 절.
   **운영 스키마가 코드와 일치한다** — `migrate diff` 가 비었다.

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
