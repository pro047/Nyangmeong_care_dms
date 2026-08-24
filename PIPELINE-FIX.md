> **이 파일은 일회성 작업 지시서다.** 수정이 끝나면 삭제하고, 남길 내용은 `HANDOFF.md` 로 옮긴다.
> 작성: 2026-08-24. 근거가 된 실측은 같은 날 `document-detail` 주행에서 나왔다.
>
> **이 작업을 파이프라인으로 돌리지 말 것.** `./orchestrate.sh` 가 자기 자신을 수정하게 되고,
> 재시도가 수정 전/후 셸로 섞여 돌아 원인 추적이 불가능해진다. 손으로 고친다.

# 작업: 직렬 에이전트 파이프라인의 "죽었을 때 아무것도 안 남는" 문제 고치기

대상 리포: `~/Documents/Nyangmeong_care_dms`
대상 파일: `orchestrate.sh`, `test/fake-claude`, `test/run-tests.sh`, `.claude/settings.json`, 필요시 `prompts/*.md`
**앱 코드(`src/`)는 건드리지 않는다.** 이 작업은 파이프라인 도구 자체에 대한 것이다.

## 배경

`./orchestrate.sh <feature>` 는 설계→판단검증→구현→검증을 각각 별도 `claude -p` 프로세스로
띄우고, 산출물 파일과 종료 코드로 물리적 게이트를 거는 셸 오케스트레이터다.
2026-08-24 하루에 **세 번 죽었는데 세 번 다 로그에 사인이 한 줄도 안 남았다.**
사람이 매번 `*.stream.jsonl` 을 jq 로 파서 원인을 알아냈다. 그걸 고친다.

---

## 1. 먼저 확인할 것 (주장을 그대로 믿지 말 것)

아래는 이 작업을 지시한 세션의 실측이다. **직접 재확인한 뒤 시작하라.**

### 확인 A — 죽는 지점

`orchestrate.sh:172` 가 사인을 읽기 **전에** 죽는다:

```bash
code=${PIPESTATUS[1]}
[ "$code" -eq 0 ] || die "$name: claude 프로세스 실패 (exit $code)"   # :172
jq -s '[.[] | select(.type? == "result")] | last' "$stream" > "$out"  # :175 도달 못 함
```

### 확인 B — 사인은 스트림에 있다 (실측, 재현 가능)

```bash
cd ~/Documents/Nyangmeong_care_dms
jq -s '[.[]|select(.type?=="result")]|last|{subtype,errors,num_turns,total_cost_usd,terminal_reason}' \
  .pipeline/document-detail/judge.stream.jsonl
```

2026-08-24 이 명령의 출력:

```json
{"subtype":"error_max_budget_usd","errors":["Reached maximum budget ($5)"],
 "num_turns":34,"total_cost_usd":5.080578,"terminal_reason":"budget_exhausted"}
```

즉 프로세스가 0 이 아닌 코드로 죽어도 **result 이벤트에 이유가 들어 있다.**
셸은 이 파일을 손에 쥐고도 exit code 숫자 하나만 보고 버렸다.

> 주의: `select(.type? == "result")` 는 스트림이 **끝까지 쓰인 뒤에만** 맞는다.
> 주행 중에 실행하면 result 이벤트가 아직 없어 빈 배열이 나온다. 죽은 뒤에 확인할 것.

### 확인 C — FAIL_LOG 에 쓰는 곳은 한 군데뿐

```bash
grep -n "FAIL_LOG" orchestrate.sh
```

`:515` 의 `} >> "$FAIL_LOG"` 하나뿐이고, 그 블록은 `run_verify` 가 실패했을 때만 도달한다
(`:487` 의 `if run_verify; then ... break; fi` 아래). `run_stage` 가 죽는 경로에는 없다.
`prompts/impl.md:12` 는 FAIL_LOG 를 "이전 시도가 왜 실패했나"의 유일한 창구로 쓴다.

### 확인 D — 재시도가 증거를 덮어쓴다

`run_stage` (`orchestrate.sh:136-137`):

```bash
local out="$WORK/$name.result.json" stream="$WORK/$name.stream.jsonl"
```

이름이 고정이라 attempt 2 가 attempt 1 의 스트림을 덮어쓴다.
**실제로 2026-08-24 impl 1차 실패(턴 상한 40 초과)의 증거가 2차 성공 주행에 덮여 사라졌다.**

---

## 2. 고칠 것 (우선순위 순)

각 항목은 독립적으로 커밋 가능하다. **1·2 를 먼저 하고 3 은 그 위에 얹는다** — 순서가 있다.

### 수정 1 · 사인을 먼저 확보한다 (`orchestrate.sh:170-176` 순서 뒤집기)

exit code 검사 **앞으로** result 이벤트 추출을 옮기고, 실패 시 `stage_postmortem` 을 부른다.

```bash
# 사인을 먼저 확보한다. claude 가 0 이 아닌 코드로 죽어도 스트림 마지막
# result 이벤트에는 이유가 들어 있다 (2026-08-24 실측: error_max_budget_usd).
jq -s '[.[] | select(.type? == "result")] | last' "$stream" > "$out" 2>/dev/null || true

if [ "$code" -ne 0 ]; then
  stage_postmortem "$name" "$out" "$stream" "$code" "$artifact"
fi
```

`stage_postmortem` 이 뽑아 로그·FAIL_LOG 에 남길 것: `.subtype`, `.errors`,
`.num_turns`, `.total_cost_usd`, `.terminal_reason`. result 이벤트가 아예 없으면
(스트림이 중간에 끊긴 경우) 그 사실 자체를 적는다 — 침묵하지 말 것.

- **왜**: 진단 가능성이 나머지 전부의 전제다. 사람이 jq 로 30분 파던 것이 로그 한 줄이 된다.
- **버린 대안**: `die` 메시지에 `tail $stream` 붙이기 — 600KB JSONL 의 꼬리는 사람이 못 읽는다.
- **틀렸다면**: 죽었는데 로그에 `(사인 확인 불가)` 만 남는다. 그건 그것대로 정직한 출력이다.

### 수정 2 · FAIL_LOG 를 "실패 로그"로 넓힌다

공용 함수로 빼고 `stage_postmortem` 과 기존 검증 실패 블록(`:504-515`) 둘 다 쓰게 한다.

```bash
fail_log() {   # fail_log <제목> ; 본문은 stdin
  { echo "## $1 — $(date -Iseconds)"; cat; echo; } >> "$FAIL_LOG"
}
```

- **왜**: 사인을 읽어도 적을 곳이 없으면 다음 구현 시도가 못 읽는다. 1 과 짝이다.
- **기존 동작을 깨지 말 것**: `:501-503` 주석이 "기록이 die 보다 먼저다 — 예전엔 순서가
  반대라 마지막 시도의 실패가 영영 안 남았다"는 수정 이력을 담고 있다. 그 순서를 유지하라.

### 수정 3 · 온전한 산출물은 사람에게 물어보고 살린다

`stage_postmortem` 안에서, FAIL_LOG 기록 **뒤에**:

```bash
verdict="$(grep -m1 '^STATUS:' "$artifact" 2>/dev/null | awk '{print $2}' || true)"
if [ "$verdict" = "DONE" ]; then
  log "  ⚠ 프로세스는 죽었으나 산출물은 STATUS: DONE ($reason)"
  gate_human "죽은 이유: $reason. 산출물이 온전해 보이는데 신뢰할까?" "$artifact" 1
  return 0
fi
die "$name: $reason → $stream"
```

- **왜**: 2026-08-24 judge 가 정확히 이 경우였다. `JUDGE.md` 는 완성본이었고
  (`STATUS: DONE` + `UNVERIFIED: 3 REFUTED: 2`) 그 뒤 확인용 grep 2 번을 더 돌리다
  예산에 닿았다. 셸이 버려서 **$4.72 를 다시 냈다.**
- **`gate_human` 의 세 번째 인자 `1`(force)이 핵심이다.** `AUTO=1` 에서도 반드시 멈춰야 한다.
  에이전트가 산출물을 쓴 **뒤** 더 검증하려다 죽었다면 내용이 의도보다 덜 검증된 상태다
  (judge 가 정확히 그랬다 — 마지막 grep 2 개가 파일에 반영 안 됨). 자동 통과는 안 된다.
- **버린 대안**: 무조건 살리기 → 잘린 산출물이 통과한다. 무조건 버리기 → 지금 동작이고 $4.72 를 태웠다.
- **틀렸다면**: 사람이 `n` 을 누르면 지금과 같은 동작(die)으로 떨어진다. 되돌릴 수 있는 실패다.
- **구현 명세 (리뷰에서 확인된 구멍 2개 — 안 지키면 회귀다)**:
  1. **승인 경로는 `is_error` 게이트를 건너뛴다.** 죽은 주행의 result 는 `is_error` 가
     true 다. 스니펫 그대로 두면 사람이 y 를 눌러도 바로 다음의
     `[ is_error = false ] || die` (:173) 에서 죽는다. 승인 시 result 검사들을 지나
     산출물 게이트(STATUS 검사)로 직행하게 짜라.
  2. **미승인 산출물이 재사용 로직에 걸리지 않게 하라.** design·judge 에는
     "STATUS: DONE 이면 재실행 시 재사용" 로직이 있다 (:394, :406). 죽은 주행의 산출물을
     제자리에 둔 채 게이트만 띄우면 — 사람이 n 을 누르든, tty 없이 exit 4 로 멈추든 —
     다음 실행이 그것을 **게이트 없이** 되살린다. 게이트를 띄우기 **전에** `$artifact` 를
     `$artifact.crashed` 로 옮겨 파킹하고(검토 대상 파일도 이 경로로 넘겨라), y 면
     제자리로 되돌린 뒤 진행하라. n·exit 4 면 파킹된 채로 둔다. exit 4 안내문에는
     "검토 후 살리려면 `mv <파일>.crashed <파일>` 후 재실행 — 재사용 로직이 집는다"를
     찍어라. mv 라는 사람의 행위 자체가 승인이다.

### 수정 4 · 스트림·result 파일을 시도별로 남긴다

`run_stage:136-137` 의 고정 이름을 attempt 번호로 나눈다
(예: `$WORK/$name.attempt$ATTEMPT.stream.jsonl`), 또는 덮어쓰기 전에 `.prev` 로 밀어둔다.

- **왜**: 확인 D 참조. 재시도 루프의 사인은 "1차가 왜 죽었나"인데 그 파일이 2차에 덮인다.
- **주의**: `ATTEMPT` 는 `while` 루프(`:470`) 안에서만 증가하고 design·judge 단계는
  루프 밖이라 항상 0 이다. 두 경우를 다 다뤄라.
- **디스크**: 스트림 1개가 400~600KB 다. `.pipeline/` 은 gitignore 대상(`.gitignore:48`)이니
  커밋에는 안 섞인다. 오래된 feature 디렉터리 정리는 이번 범위 밖.

### 수정 5 · 한도를 단계별로 나눈다 (`orchestrate.sh:143-144`)

지금은 전 단계 공통 `--max-turns 40 --max-budget-usd 5` 다. 2026-08-24 실측 4점:

| 단계 | 턴 | 비용 | 결과 |
|---|---|---|---|
| design | 20 | $4.80 | 통과 (돈이 아슬아슬) |
| judge (성공 주행) | 28 | $4.72 | 통과 |
| judge (다음 주행) | 34 | $5.08 | **돈 초과사** |
| impl (1차) | 41 | $3.84 | **턴 초과사** (40 상한) |
| impl (2차, 훅 수정 후) | 42 | $2.50 | 통과 |

**병목 축이 단계마다 다르다.** judge 는 읽고 대조하느라 턴당 토큰이 커서 돈이 먼저 닿고,
impl 은 파일을 많이 써서 턴이 먼저 닿는다. 하나의 세트로 묶은 것이 애초에 틀렸다.

**새로 설계하지 말고 스킬 신판에서 이식하라.**
`~/.claude/skills/serial-agent-pipeline/assets/orchestrate.sh` 에 이미 있다 —
`TURNS_<STAGE>`/`BUDGET_<STAGE>` 선언부(기본: 구현 80턴/$8, 나머지 40턴/$5),
`run_stage` 안의 간접 참조 블록, 그리고 같은 위치 `test/run-tests.sh` 의
"단계별 상한" 케이스 2개까지. 2026-08-23 전파가 gate_human 블록만 치환해서
이 리포에는 이 부분이 빠졌다. 이식 후 이 리포의 fake-claude 가
`--max-turns`/`--max-budget-usd` 를 `.args` 로 기록하는지 확인해 케이스를 살려라.

- **순서 주의**: 한도를 올리는 것 자체는 위험하다(폭주 시 비용). **1·2 가 먼저 들어가야**
  초과가 로그에 남아 "왜 넘었나"를 볼 수 있고, 그래야 올리는 것이 안전해진다.
- 위 표는 실측 4점뿐이다. 새 기본값은 **추정**이므로 `state` 에 적용된 한도를 적어
  다음 주행에서 근거가 쌓이게 하라.

### 수정 6 · 권한 거부를 줄인다 (턴·예산 초과사와 같은 뿌리)

2026-08-24 스트림 실측: WebFetch 거부 3회(judge 가 외부 문서 검증 시도),
Bash 복합 명령 거부 2회(`decision_reason_type: subcommandResults` — 복합 명령의
조각 하나가 allowlist 밖이면 전체가 거부된다. `ls -la .env` 가 섞여 있었다).
이 리포의 `.claude/settings.json` 은 빈 파일이라 allow 규칙이 0개다.
헤드리스 `claude -p` 는 물어볼 사람이 없으니 즉시 거부하고, 에이전트는 우회하느라
턴을 태운다 — 수정 5 로 한도를 올려도 이 낭비는 그대로 남는다.

할 일:
- **커밋되는** `.claude/settings.json` 에 파이프라인 단계가 쓰는 읽기 전용 명령
  (grep·ls·cat·jq·git status 등) allow 규칙을 넣어라. `settings.local.json` 은
  전역 gitignore 대상이라 worktree 에 안 따라간다 (실측) — 반드시 커밋되는 쪽에.
- WebFetch 는 허용하지 말고 `prompts/judge.md` 에 "근거는 저장소 안에서만 찾는다"를
  명시하라 (비용·재현성 — 외부 문서는 주행마다 다른 답을 준다).
- Bash 통짜 허용은 금지. `.env` 가 섞인 거부는 의도된 방어일 수 있다.
  복합 명령은 조각 전부가 허용돼야 통과하므로, 프롬프트에 "명령을 잘게 나눠 실행"을
  덧붙이는 것도 병행하라.
- 검증: run-tests 로는 CLI 의 거부 동작 자체를 재현할 수 없다. 이번 검증 범위는
  settings.json 문법 확인(`jq . .claude/settings.json`)까지다 — 실제 감소는
  다음 주행의 스트림에서 거부 카운트로 확인하고 그 수치를 기록해라.

### 수정 7 · 런처용 "다음 행동" 블록 — 스킬 신판에서 이식하라

2026-08-24 실전에서 런처 세션(메인 클로드)이 두 번 길을 잃었다: 스크립트 stderr 의
터미널 안내("다른 터미널에서 advisor.sh")를 그대로 사용자에게 전달했고, 단계가 끝난 뒤
뭘 해야 할지 몰랐다. 원인은 런처 계약이 문서(SKILL.md)에만 있고 런처가 실제로 읽는
파일에는 없었던 것이다.

**새로 설계하지 말고 스킬 신판에서 이식하라** (수정 5 와 같은 패턴):
`~/.claude/skills/serial-agent-pipeline/assets/orchestrate.sh` 의
- `state()` 3번째 인자와 `## 다음 행동` 블록
- 정지 지점별 next 텍스트: `die()`(DIED) / BLOCKED / GATE / AWAITING_APPROVAL / DONE
- 터미널 코칭 문구 중립화 ("터미널 2에서" → "상담역(advisor.sh 또는 런처 세션)에게",
  시작 시 "다른 터미널에서 advisor.sh" → STATE.md 안내 병기)
- `test/run-tests.sh` 의 단언 2개 (DONE 상태에 다음 행동 블록, exit 4 시 승인 안내)

이 리포는 `state()`·`die()` 가 커스터마이즈돼 있을 수 있다 — 블록이 다르면 통복사하지
말고 같은 의미로 손이식하라. 수정 3 의 `stage_postmortem` 이 만드는 정지 지점에도
next 텍스트를 붙여라 ("죽었지만 산출물 온전 — 사람에게 물어라" 안내).

참고: 이 리포 CLAUDE.md 의 런처 프로토콜은 이미 추가돼 있다(2026-08-24 별도 커밋).
중복 추가하지 말 것.

---

## 3. 검증 방법 (API 0 회)

`test/run-tests.sh` 와 `test/fake-claude` 가 이미 있다. `fake-claude` 는 `FAKE_SCENARIO`
환경변수로 에이전트 행동을 흉내내며 **`crash`(0 이 아닌 코드로 죽음) 시나리오가 이미 존재한다.**

추가할 시나리오:

- `crash_with_artifact` — `STATUS: DONE` 산출물을 쓰고, `type:"result"` + `subtype:"error_max_turns"`
  + `errors` 를 담은 이벤트를 스트림에 낸 뒤 exit 1
  → **수정 3 의 사람 게이트가 뜨는지**, FAIL_LOG 에 사인이 남는지
- `crash_no_result` — 산출물도 result 이벤트도 없이 죽음
  → 수정 1 이 "(사인 확인 불가)" 를 정직하게 남기는지

```bash
bash test/run-tests.sh
```

**기존 테스트가 전부 통과하는 것이 전제다.** 하나라도 깨지면 그게 회귀다.

---

## 4. 하지 말 것

- **게이트를 약화시키지 말 것.** 이 파이프라인의 존재 이유는 "근거 없는 판단이 구현까지
  흘러가는 것"을 막는 데 있다. 수정 3 은 게이트를 **추가**하는 것이지 우회로가 아니다.
  `gate_human` 의 force 인자를 빼거나 `AUTO=1` 로 자동 통과시키는 형태로 구현하지 말 것.
- **주행 중에 `orchestrate.sh` 를 고치지 말 것.** 2026-08-24 20:00 현재 `document-detail`
  주행이 진행 중일 수 있다. `.pipeline/*/STATE.md` 의 `phase` 를 먼저 확인하고,
  `RUNNING:*` 이면 끝날 때까지 기다린다. 진행 중인 주행 밑에서 셸이 바뀌면 다음 재시도가
  어제와 다른 코드로 돌아 원인 추적이 꼬인다.
- 앱 코드(`src/`)·`prisma/schema.prisma`·`package.json` 은 이 작업의 범위가 아니다.
- **`approve.sh` 는 이번 범위에서 제외다** (tty 전제 문제는 2026-08-24 사람이 보류 결정).
  고치지도, `--yes` 를 추가하지도 말 것. 스킬 + 4개 리포 공통 계약이라 한 리포에서만
  바꾸면 갈라진다 — 결정되면 스킬 레벨에서 일괄 전파한다.
- 커밋은 사람 승인 후에. 커밋 메시지는 한국어 conventional commit.

## 5. 산출물

수정 후 `HANDOFF.md` 나 `MILESTONES.md` 에 적을 것이 있으면 사람에게 제안만 하고
직접 쓰지 말 것 — 그 두 파일은 다른 스트림(M3 document-detail)이 지금 갱신 중이다.
