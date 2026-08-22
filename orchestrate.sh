#!/usr/bin/env bash
# 실행 역할 터미널 (터미널 1)
#
# 역할 분리:
#   이 스크립트  = 오케스트레이터. 진행 결정권을 독점한다.
#   advisor.sh   = 상담역. 읽기 전용. 진행 권한 없음.
#   사람         = 유일하게 게이트 버튼을 누르는 주체.
#
# 사용법:
#   ./orchestrate.sh <feature-name>
#   AUTO=1 ./orchestrate.sh <feature-name>     # 사람 게이트 건너뜀 (무인)
#   MAX_RETRY=3 ./orchestrate.sh <feature-name>

set -euo pipefail

# ─────────────────────────────────────────── 설정
ROOT="$(git rev-parse --show-toplevel)"
FEATURE="${1:?사용법: ./orchestrate.sh <feature-name>}"
WORK="$ROOT/.pipeline/$FEATURE"
PROMPTS="$ROOT/prompts"

MAX_RETRY="${MAX_RETRY:-2}"
AUTO="${AUTO:-0}"
# 이미 STATUS: DONE 인 DESIGN.md 가 있으면 설계 단계를 건너뛰고 재사용한다.
# (중단 후 재실행에서 비싼 설계를 다시 만들지 않기 위한 것 — 설계 게이트는 그대로 거친다)
# 설계를 새로 뽑고 싶으면 FRESH_DESIGN=1
FRESH_DESIGN="${FRESH_DESIGN:-0}"
# vitest 4 (`npm test` = `vitest run`). 테스트 파일이 0개면 실패한다
# (vitest.config.mts 의 passWithNoTests:false) — 검증 단계가 테스트를 안 쓰고
# 넘어간 것을 게이트가 통과시키면 안 되기 때문이다.
#
# `npm run build` 를 기본에 넣지 않은 이유: 빌드는 `.env`(zod 검증)와
# `prisma generate` 산출물이 있어야 도는데, `.env` 는 gitignore 대상이라
# 체크아웃에 따라 없을 수 있다. 게이트가 환경 탓으로 죽으면 재시도 루프가 헛돈다.
# 빌드는 `.env`(zod 검증)와 `prisma generate` 산출물에 의존한다. 그래서 무조건
# 돌리지 않고, **프리플라이트에서 환경을 먼저 판정한 뒤** 켤지 정한다 (아래 preflight).
# 환경 실패와 코드 실패를 구분하지 않으면, `.env` 없는 체크아웃에서 impl+verify
# 사이클이 단계당 $5 예산을 태우며 3회 헛돈다.
#
# TEST_CMD 를 직접 주면 기본 검증 목록 대신 그것만 쓴다 (하위 호환):
#   TEST_CMD="npm test && npm run build" ./orchestrate.sh <feature>
TEST_CMD_OVERRIDE="${TEST_CMD:-}"
TEST_CMD="${TEST_CMD:-npm test}"

# ── 검증 게이트 상태 ─────────────────────────────────
# state() 가 첫 호출부터 참조하므로 여기서 초기화한다 (set -u).
BUILD_GATE=0                       # 1 = 기준선 빌드가 녹색이라 빌드를 검증에 포함
BUILD_GATE_REASON="프리플라이트 전"
VERIFY_LIST_DESC="(프리플라이트 전)"
VERIFY_LAST=""
VERIFY_PASSED=""
VERIFY_FAILED=""

# ── 모델 티어링 ──────────────────────────────────────
# 별칭 대신 풀 ID를 박는다. 별칭은 어느 날 조용히 다른 모델을 가리킨다.
#
#   설계  : 최상위. 여기가 틀리면 뒤가 전부 낭비다.
#   구현  : 설계가 확정돼 있으면 난이도가 내려간다. 중간 티어로 충분.
#   검증  : 다시 최상위. "설계에서 벗어난 지점 찾기"는 적대적 추론이라 구현보다 어렵다.
#
# FALLBACK_* 은 가용성 폴백(529 과부하 등) 전용이다.
# 안전 분류기에 의한 모델 교체는 이걸로 막을 수 없다 — MODEL_LOG.md 로 감시한다.
MODEL_DESIGN="${MODEL_DESIGN:-claude-fable-5}"
# 판단 검증은 설계를 반박하는 일이라 verify 와 같은 적대적 추론이다. 상위 모델.
MODEL_JUDGE="${MODEL_JUDGE:-claude-fable-5}"
MODEL_IMPL="${MODEL_IMPL:-claude-opus-5}"
MODEL_VERIFY="${MODEL_VERIFY:-claude-fable-5}"

FALLBACK_DESIGN="${FALLBACK_DESIGN:-claude-opus-5,claude-sonnet-5}"
FALLBACK_JUDGE="${FALLBACK_JUDGE:-claude-opus-5,claude-sonnet-5}"
FALLBACK_IMPL="${FALLBACK_IMPL:-claude-sonnet-5}"
FALLBACK_VERIFY="${FALLBACK_VERIFY:-claude-opus-5,claude-sonnet-5}"

MODEL_LOG=""   # WORK 확정 후 아래에서 설정

mkdir -p "$WORK"
FAIL_LOG="$WORK/FAIL_LOG.md"     # append-only
STATE="$WORK/STATE.md"           # 상담역이 읽는 유일한 실시간 창구
MODEL_LOG="$WORK/MODEL_LOG.md"   # 요청 모델 vs 실제 실행 모델
touch "$FAIL_LOG" "$MODEL_LOG"

# TEST_CMD 도 내보낸다. prompts/verify.md 가 본문에서 참조하는데, export 하지 않으면
# envsubst 가 빈 문자열로 치환해서 "셸이 `` 를 실행해서 판정한다" 라는 깨진 문장이
# 에이전트에게 전달된다. 실제 명령을 보여주는 편이 리터럴보다 유용하다.
export FEATURE WORK ROOT TEST_CMD

log() { printf '\033[1;36m[orch]\033[0m %s\n' "$*" >&2; }
die() { state "DIED" "$*"; printf '\033[1;31m[FAIL]\033[0m %s\n' "$*" >&2; exit 2; }

# ─────────────────────────────────────────── 상담역용 상태 브로드캐스트
# 셸은 대화를 못 한다. 대신 상태를 파일로 흘려서 상담역이 읽게 한다.
state() {
  local phase=$1 note=${2:-}
  local bg
  if [ "${BUILD_GATE:-0}" = "1" ]; then
    bg="켜짐"
  elif [ -n "${TEST_CMD_OVERRIDE:-}" ]; then
    # 오버라이드가 빌드를 포함할 수도 있다. 셸은 모르므로 단정하지 않는다.
    bg="해당 없음 — ${BUILD_GATE_REASON:-TEST_CMD 오버라이드}"
  else
    bg="꺼짐 — ${BUILD_GATE_REASON:-사유 미기록}"
  fi
  cat > "$STATE" <<EOF
# 파이프라인 상태 (셸이 자동 생성 — 사람이 편집하지 말 것)

- feature: $FEATURE
- phase: $phase
- attempt: ${ATTEMPT:-0} / $((MAX_RETRY + 1))
- pid: $$
- updated: $(date -Iseconds)
- note: $note

## 검증 게이트

셸이 실제로 무엇을 돌렸는지. "DONE" 이 무엇을 뜻하는지는 여기를 봐야 안다.

- 빌드 게이트(타입 검사): $bg
- 검증 명령: $VERIFY_LIST_DESC
- 마지막 결과: ${VERIFY_LAST:-(아직 실행 안 함)}

## 지금까지 생성된 산출물
$(ls -1 "$WORK"/*.md 2>/dev/null | sed 's|.*/|- |' || echo "- (없음)")

## 마지막 테스트 출력 (tail 20)
\`\`\`
$(tail -20 "$WORK/test_out.txt" 2>/dev/null || echo "(아직 없음)")
\`\`\`
EOF
}

# ─────────────────────────────────────────── 단계 실행기
# run_stage <이름> <모델> <폴백체인> <프롬프트파일> <산출물경로>
#
# stream-json 으로 받아 진행 상황(도구 호출·중간 텍스트)을 실시간으로 흘리고,
# 스트림 마지막의 result 이벤트만 뽑아 게이트 판정에 쓴다.
# (--output-format json 은 완료까지 무출력이라 UX가 나빠서 교체함)
run_stage() {
  local name=$1 model=$2 fallback=$3 prompt_file=$4 artifact=$5
  local out="$WORK/$name.result.json" stream="$WORK/$name.stream.jsonl" code=0

  state "RUNNING:$name" "model=$model"
  log "▶ $name (model=$model, fallback=$fallback)"

  set +e
  envsubst < "$prompt_file" | claude -p \
    --model "$model" \
    --fallback-model "$fallback" \
    --output-format stream-json \
    --verbose \
    --max-turns 40 \
    --max-budget-usd 5 \
    --permission-mode acceptEdits \
    --append-system-prompt "$(cat "$PROMPTS/_contract.md")" \
    | tee "$stream" \
    | jq --unbuffered -r '
        select(.type? == "assistant") | .message.content[]? |
        if .type == "tool_use" then
          "  ⚙ \(.name)  \((.input.file_path // .input.command // .input.pattern // .input.description // "") | tostring | .[0:90])"
        elif .type == "text" and ((.text // "") | length) > 0 then
          "  💬 \(.text | gsub("\\s+"; " ") | .[0:160])"
        else empty end' >&2
  code=${PIPESTATUS[1]}   # [0]=envsubst [1]=claude [2]=tee [3]=jq — 판정 기준은 claude
  set -e

  [ "$code" -eq 0 ] || die "$name: claude 프로세스 실패 (exit $code)"

  # 스트림 마지막의 result 이벤트 = 기존 --output-format json 이 주던 것과 같은 오브젝트
  jq -s '[.[] | select(.type? == "result")] | last' "$stream" > "$out" 2>/dev/null || true
  [ "$(jq -r 'type' "$out" 2>/dev/null)" = "object" ] \
    || die "$name: 스트림에 result 이벤트가 없음 → $stream 확인"

  [ "$(jq -r '.is_error' "$out")" = "false" ] \
    || die "$name: 에이전트 에러 — $(jq -r '.result' "$out" | head -c 300)"

  log "  \$$(jq -r '.total_cost_usd' "$out") / 턴 $(jq -r '.num_turns' "$out")"

  # ── 모델 교체 감시 ────────────────────────────────
  # 안전 분류기가 걸리면 --model 로 지정한 모델이 아닌 다른 모델이 돈다.
  # 이건 --fallback-model 로 막을 수 없으므로, 막는 대신 기록해서 눈에 띄게 한다.
  # ※ 필드명은 버전마다 다를 수 있다. 첫 실행 후 `jq 'keys' result.json` 으로 확인할 것.
  local actual
  actual=$(jq -r '(.modelUsage // {} | keys | join(",")) // empty' "$out" 2>/dev/null || true)
  [ -z "$actual" ] && actual=$(jq -r '.model // empty' "$out" 2>/dev/null || true)

  if [ -n "$actual" ] && [[ "$actual" != *"$model"* ]]; then
    log "  ⚠ 모델 교체 감지: 요청=$model 실제=$actual"
    echo "- $(date -Iseconds) | $name | 요청 $model → 실제 $actual" >> "$MODEL_LOG"
    if [ "$AUTO" != "1" ]; then
      gate_human "요청한 모델이 안 돌았다. 결과를 신뢰할지 판단해라" "$MODEL_LOG"
    fi
  elif [ -z "$actual" ]; then
    echo "- $(date -Iseconds) | $name | 실제 모델 확인 불가 (필드명 점검 필요)" >> "$MODEL_LOG"
  fi

  # 게이트 1: 산출물 물리적 존재
  [ -f "$artifact" ] || die "$name: 산출물 없음 → $artifact"

  # 게이트 2: 종료 형식
  local verdict
  verdict="$(grep -m1 '^STATUS:' "$artifact" | awk '{print $2}' || true)"
  case "${verdict:-MISSING}" in
    DONE)
      log "  ✔ $name DONE" ;;
    BLOCKED)
      state "BLOCKED:$name" "사람 판단 필요"
      log "  ⛔ $name BLOCKED"
      sed -n '/^BLOCKED_REASON:/,$p' "$artifact" >&2
      printf '\n\033[1;33m→ 터미널 2에서 이렇게 물어봐:\033[0m\n  "%s BLOCKED 났어. 원인 뭐야?"\n\n' "$name" >&2
      exit 3 ;;
    *)
      die "$name: STATUS 라인 없음 또는 형식 위반 (DONE|BLOCKED 필수)" ;;
  esac
}

# ─────────────────────────────────────────── 사람 게이트
# 상담역은 여기에 손댈 수 없다. 오직 사람만 누른다.
# gate_human <메시지> <검토파일> [force]
#
# force=1 이면 AUTO=1 이어도 멈춘다. 검증되지 않은 주장을 무인으로 통과시키면
# 이 파이프라인이 막으려는 것(근거 없는 판단이 구현까지 흘러가는 것)이 그대로
# 일어난다 — 무인 모드는 "게이트를 없앤다"가 아니라 "판정 가능한 것만 자동으로
# 넘긴다"는 뜻이다.
gate_human() {
  local msg=$1 file=$2 force=${3:-0}
  [ "$AUTO" = "1" ] && [ "$force" != "1" ] \
    && { log "  (AUTO=1 — 게이트 통과: $msg)"; return 0; }

  state "GATE" "$msg"
  cat >&2 <<EOF

$(printf '\033[1;33m[게이트]\033[0m') $msg
  검토 대상: $file
  상담역에게: "$(basename "$file") 봐줘"

  y = 진행   e = 열어보기   n = 중단
EOF
  printf '  > ' >&2
  # `|| ans=n` 은 tty 가 없을 때(cron·백그라운드·CI)를 위한 것이다. 이 스크립트는
  # `set -e` 로 도는데, /dev/tty 를 못 열면 read 가 rc=1 로 끝나 **그 자리에서
  # exit 1** 이 된다 — 아래 case 도 die 도 타지 않아서 호출자는 "게이트에서 막힘"
  # 을 다른 실패와 구분할 수 없다. 없는 tty 는 "사람이 y 를 누르지 않았다" 와 같은
  # 뜻이므로 중단(n)으로 떨어뜨려 의도한 die 경로를 타게 한다.
  local ans; read -r ans < /dev/tty || ans=n
  case "$ans" in
    y|Y) return 0 ;;
    e|E) "${EDITOR:-less}" "$file"; gate_human "$msg" "$file" "$force" ;;
    *)   die "사람이 중단함" ;;
  esac
}

# ─────────────────────────────────────────── 프리플라이트: 환경 기준선
# 에이전트를 **띄우기 전에** 환경을 판정한다. 여기서 죽으면 비용이 $0 이다.
#
# 이 단계가 있는 이유: 이전 실행에서 phase:DONE 이 떴는데 타입 검사가 한 번도
# 안 돌았다. 셸은 npm test 만 돌렸고, 에이전트들이 각자 시도한 npm run build 는
# 전부 권한 거부됐다. 빌드를 검증에 넣으려면 **빌드 실패가 코드 탓임을 먼저
# 보장**해야 한다 — 그게 기준선의 역할이다.
preflight() {
  # 사용자가 검증 명령을 명시했으면 기본 목록을 안 쓰므로 기준선도 의미가 없다.
  # 여기서 빌드를 돌리면 .env 없는 CI 에서 쓸데없이 사람 게이트가 뜬다.
  if [ -n "$TEST_CMD_OVERRIDE" ]; then
    BUILD_GATE=0
    BUILD_GATE_REASON="TEST_CMD 오버라이드 — 검증 명령을 사용자가 직접 지정함"
    return 0
  fi

  local missing=""
  [ -f "$ROOT/.env" ] || missing="$missing .env"
  [ -d "$ROOT/src/generated/prisma" ] || missing="$missing src/generated/prisma"

  if [ -n "$missing" ]; then
    BUILD_GATE=0
    BUILD_GATE_REASON="누락:$missing"
    printf '\033[1;31m[orch]\033[0m ⚠ 타입 검사 OFF — 누락:%s\n' "$missing" >&2
    log "  빌드 없이 진행하면 타입 오류가 검증을 그대로 통과한다."
    log "  고치려면: cp .env.example .env 후 값 채우기 → npx prisma generate"
    # AUTO=1 이면 gate_human 이 알아서 통과시킨다. 사람이 볼 때는 한 번 멈춘다 —
    # "빌드가 안 돌았다"를 모르고 DONE 을 받는 것이 이번에 실제로 일어난 사고다.
    gate_human "타입 검사 없이 진행한다 (누락:$missing). 알고 넘어가는 게 맞나?" "$STATE"
    return 0
  fi

  log "▶ 프리플라이트: npm run build (기준선)"
  if (cd "$ROOT" && npm run build) > "$WORK/preflight_build.txt" 2>&1; then
    BUILD_GATE=1
    BUILD_GATE_REASON=""
    log "  ✔ 기준선 녹색 — 이후 빌드 실패는 에이전트가 만든 것이므로 재시도 대상이다"
  else
    tail -30 "$WORK/preflight_build.txt" >&2
    # 원인을 환경으로 단정하지 않는다. 이 파이프라인은 더러운 워킹트리에서 시작하는
    # 것을 전제하므로(check_protected 주석 참조), 이미 있던 미완성 코드가 원인일 수도
    # 있다. 확실한 것 하나만 말한다 — **에이전트가 만든 것은 아니다**.
    die "프리플라이트 빌드 실패 — 에이전트는 아직 한 번도 안 띄웠으므로(비용 \$0) **에이전트가 만든 문제가 아니다**. 환경(.env·prisma generate)이거나 이미 워킹트리에 있던 코드다. 고친 뒤 다시 실행해라 → $WORK/preflight_build.txt"
  fi
}

# 검증 목록을 만든다. 단일 문자열 대신 순서 있는 목록인 이유: 어느 명령이 실패했는지
# test_out.txt 를 읽지 않고도 알아야 FAIL_LOG 가 다음 시도에 쓸모가 있다.
#
# 순서 — 싼 것부터. npm test(~0.1s) → lint → build(~2.5s).
# 린트를 빌드 앞에 둔 이유는 린트가 훨씬 싸기 때문이다.
build_verify_list() {
  if [ -n "$TEST_CMD_OVERRIDE" ]; then
    VERIFY_CMDS=("$TEST_CMD_OVERRIDE")
  else
    VERIFY_CMDS=("npm test" "npm run lint")
    [ "$BUILD_GATE" = "1" ] && VERIFY_CMDS+=("npm run build")
    # 기능별 스모크 훅. 있으면 마지막에 돈다 — 오케스트레이터는 기능 중립이어야
    # 하므로 라우트나 포트를 여기 하드코딩하지 않는다.
    [ -f "$WORK/smoke.sh" ] && VERIFY_CMDS+=("bash '$WORK/smoke.sh'")
  fi

  # 표시용(쉼표)과 실행 가능한 형태(&&)를 나눈다. prompts/verify.md 가 본문에서
  # $TEST_CMD 를 참조하는데, 쉼표로 이어붙인 문자열을 받은 에이전트가 그걸 복사해
  # 재현하려 하면 셸 에러가 난다.
  VERIFY_LIST_DESC="$(printf '%s, ' "${VERIFY_CMDS[@]}")"
  VERIFY_LIST_DESC="${VERIFY_LIST_DESC%, }"
  TEST_CMD="$(printf '%s && ' "${VERIFY_CMDS[@]}")"
  TEST_CMD="${TEST_CMD% && }"
}

# 목록을 순서대로 돌리고 첫 실패에서 멈춘다.
#
# fail-fast 를 고른 근거: 이 목록은 의존 순서가 있다. 타입이 깨졌으면 린트 결과는
# 대개 파생 잡음이고 빌드도 같은 이유로 죽는다. 재시도 루프에 넘길 정보는 "무엇을
# 먼저 고쳐야 하는가" 하나면 충분하고, 실패 3개를 한꺼번에 주면 FAIL_LOG 가 길어져
# 다음 구현 에이전트가 우선순위를 못 잡는다. 이미 실패한 뒤에 뒤 명령을 돌리는 것은
# 재시도 횟수만큼 곱해지는 순수 낭비이기도 하다.
run_verify() {
  local cmd rc=0
  VERIFY_PASSED=""
  VERIFY_FAILED=""
  : > "$WORK/test_out.txt"

  for cmd in "${VERIFY_CMDS[@]}"; do
    log "  ▸ $cmd"
    echo "### \$ $cmd" >> "$WORK/test_out.txt"
    if (cd "$ROOT" && eval "$cmd") >> "$WORK/test_out.txt" 2>&1; then
      echo "→ 통과" >> "$WORK/test_out.txt"
      echo >> "$WORK/test_out.txt"
      VERIFY_PASSED="$VERIFY_PASSED${VERIFY_PASSED:+, }$cmd"
    else
      rc=$?
      VERIFY_FAILED="$cmd"
      echo "→ 실패 (exit $rc)" >> "$WORK/test_out.txt"
      return 1
    fi
  done
  return 0
}

# ─────────────────────────────────────────── 파이프라인
ATTEMPT=0
state "START"
log "=== $FEATURE 시작 ==="
log "상담역 띄우려면 다른 터미널에서: ./advisor.sh $FEATURE"

preflight
build_verify_list
state "PREFLIGHT" "검증 명령: $VERIFY_LIST_DESC"
log "검증 목록: $VERIFY_LIST_DESC"

if [ "$FRESH_DESIGN" != "1" ] && [ -f "$WORK/DESIGN.md" ] \
   && [ "$(grep -m1 '^STATUS:' "$WORK/DESIGN.md" | awk '{print $2}')" = "DONE" ]; then
  log "↺ 기존 DESIGN.md 재사용 ($(date -r "$WORK/DESIGN.md" '+%m-%d %H:%M') 생성) — 새로 뽑으려면 FRESH_DESIGN=1"
  state "REUSED:design" "기존 산출물 재사용"
else
  run_stage design "$MODEL_DESIGN" "$FALLBACK_DESIGN" "$PROMPTS/design.md" "$WORK/DESIGN.md"
fi

# ─────────────────────────────────────────── 판단 검증
# 설계의 '주장'을 별 프로세스가 감사한다. 구현물에는 테스트·게이트가 있는데
# 판단물(원인 판정·우선순위·"X 가 없다")은 아무 검사 없이 구현으로 흘러갔다.
# DESIGN.md 보다 새로우면 재사용한다 — 설계가 새로 돌면 판정도 다시 받아야 한다.
if [ -f "$WORK/JUDGE.md" ] && [ "$WORK/JUDGE.md" -nt "$WORK/DESIGN.md" ] \
   && [ "$(grep -m1 '^STATUS:' "$WORK/JUDGE.md" | awk '{print $2}')" = "DONE" ]; then
  log "↺ 기존 JUDGE.md 재사용 (DESIGN.md 보다 최신)"
  state "REUSED:judge" "기존 산출물 재사용"
else
  run_stage judge "$MODEL_JUDGE" "$FALLBACK_JUDGE" "$PROMPTS/judge.md" "$WORK/JUDGE.md"
fi

# ★ 판정권은 셸에 있다. 에이전트가 쓴 '판정' 문장을 읽지 않고, 자기가 신고한
#   카운트 한 줄만 파싱한다. 형식이 없으면 그것도 게이트 위반이다.
JUDGE_COUNTS="$(grep -m1 -E '^UNVERIFIED: *[0-9]+ +REFUTED: *[0-9]+' "$WORK/JUDGE.md" || true)"
if [ -z "$JUDGE_COUNTS" ]; then
  die "JUDGE.md 에 'UNVERIFIED: <n> REFUTED: <n>' 라인이 없다 → $WORK/JUDGE.md"
fi
UNVERIFIED="$(sed -E 's/^UNVERIFIED: *([0-9]+).*/\1/' <<<"$JUDGE_COUNTS")"
REFUTED="$(sed -E 's/.*REFUTED: *([0-9]+).*/\1/' <<<"$JUDGE_COUNTS")"
log "판단 검증: 미확인 $UNVERIFIED / 반박 $REFUTED"

if [ "$UNVERIFIED" -gt 0 ] || [ "$REFUTED" -gt 0 ]; then
  state "JUDGE_FLAGGED" "미확인 $UNVERIFIED / 반박 $REFUTED"
  gate_human \
    "설계의 주장 중 반박 $REFUTED 건·미확인 $UNVERIFIED 건 — 이대로 구현하면 그 위에 코드가 쌓인다" \
    "$WORK/JUDGE.md" 1
fi

gate_human "설계 검토 — 여기서 틀리면 뒤가 전부 낭비다" "$WORK/DESIGN.md"

# ─────────────────────────────────────────── 게이트 5: 보호 파일 (프로젝트 전용)
# CLAUDE.md 가 "손대면 안 되는 것"으로 못박은 파일들이다. 프롬프트에도 적혀 있지만
# 프롬프트는 게이트가 아니다 — 에이전트가 안 지켰을 때 막는 것이 없다.
#
# git diff 대신 지문 비교를 쓰는 이유: 파이프라인 시작 시점에 이미 더러운 워킹
# 트리(예: 이 파일들 자체를 커밋 안 한 상태)에서 돌리면 diff 기반 검사가 첫 시도부터
# 헛발질한다. 검사할 것은 "지금 더러운가"가 아니라 "이번 실행이 바꿨는가"다.
#
# package-lock.json 이 포함된 이유: 에이전트가 package.json 을 안 건드리고
# npm install <pkg> 만 돌려도 의존성은 추가된다.
PROTECTED="package.json package-lock.json prisma/schema.prisma .gitignore AGENTS.md .env.example vitest.config.mts"

sha() { command -v shasum >/dev/null && shasum -a 256 "$1" || sha256sum "$1"; }

protected_fingerprint() {
  local f
  for f in $PROTECTED; do
    if [ -f "$ROOT/$f" ]; then
      printf '%s %s\n' "$f" "$(sha "$ROOT/$f" | awk '{print $1}')"
    else
      printf '%s (없음)\n' "$f"
    fi
  done
}

PROTECTED_BASELINE="$(protected_fingerprint)"

# check_protected <단계이름>
# 구현 직후·검증 직후에 각각 부른다. 늦게 볼수록 그 위에 코드와 테스트가 쌓여
# 되돌리는 비용이 올라간다.
check_protected() {
  local stage=$1 changed
  changed="$(diff <(printf '%s\n' "$PROTECTED_BASELINE") <(protected_fingerprint) \
             | grep '^[<>]' | awk '{print $2}' | sort -u | tr '\n' ' ' || true)"
  [ -z "$changed" ] \
    || die "$stage 단계가 보호 파일을 수정함: $changed — git checkout 으로 되돌린 뒤 설계부터 다시 볼 것"
}

while :; do
  ATTEMPT=$((ATTEMPT + 1))
  log "── 시도 $ATTEMPT/$((MAX_RETRY + 1))"

  run_stage impl   "$MODEL_IMPL"   "$FALLBACK_IMPL"   "$PROMPTS/impl.md"   "$WORK/IMPL.md"

  # 구현 직후에 검사한다. 검증 단계까지 흘려보내면 그 위에 테스트가 쌓여서
  # 되돌리는 비용이 올라간다.
  check_protected impl

  run_stage verify "$MODEL_VERIFY" "$FALLBACK_VERIFY" "$PROMPTS/verify.md" "$WORK/VERIFY.md"

  # 검증 단계도 같은 검사를 받는다. 이 단계는 *.test.ts 만 쓸 수 있는데,
  # 통과시키려고 vitest.config.mts 의 include 나 passWithNoTests 를 바꾸는 것이
  # 가장 값싼 부정행위 경로다.
  check_protected verify

  # ★ 최종 판정은 셸이 한다. 에이전트에게 안 맡긴다.
  state "TESTING" "$VERIFY_LIST_DESC"
  if run_verify; then
    VERIFY_LAST="통과: $VERIFY_PASSED"
    log "✅ 검증 통과 ($VERIFY_PASSED)"
    break
  fi

  VERIFY_LAST="실패: $VERIFY_FAILED (그 앞까지 통과: ${VERIFY_PASSED:-없음})"
  log "❌ 검증 실패 — $VERIFY_FAILED"
  tail -30 "$WORK/test_out.txt" >&2
  state "TEST_FAILED" "attempt $ATTEMPT — $VERIFY_FAILED 실패"

  # 기록이 die 보다 먼저다. 예전엔 순서가 반대라 **마지막 시도의 실패가 FAIL_LOG 에
  # 영영 안 남았다** — 정작 가장 알고 싶은 실패가 그것이고, 아래 die 메시지가
  # 가리키는 파일도 이것이다.
  #
  # 첫 줄에 어느 명령이 실패했는지 둔다. 다음 구현 시도가 이걸 읽는데, 출력만 있고
  # 명령 이름이 없으면 무엇을 고쳐야 하는지 추측하게 된다.
  {
    echo "## attempt $ATTEMPT — $(date -Iseconds)"
    echo "실패한 명령: \`$VERIFY_FAILED\`"
    echo "그 앞까지 통과: ${VERIFY_PASSED:-없음}"
    echo '```'
    tail -60 "$WORK/test_out.txt"
    echo '```'
    echo
  } >> "$FAIL_LOG"

  [ "$ATTEMPT" -gt "$MAX_RETRY" ] \
    && die "검증 ${MAX_RETRY}회 재시도 후에도 실패 (마지막: $VERIFY_FAILED) → $FAIL_LOG"

  gate_human "재시도 $((ATTEMPT + 1)) 진행? (상담역에게 FAIL_LOG 물어봐도 됨)" "$FAIL_LOG"
done

state "DONE" "통과: $VERIFY_PASSED"
log "=== $FEATURE 완료 ==="
log "검증 통과: $VERIFY_PASSED"
# 오버라이드는 빌드를 포함할 수도 있어서 셸이 판단할 수 없다. 단정하지 않는다.
if [ "$BUILD_GATE" != "1" ] && [ -z "$TEST_CMD_OVERRIDE" ]; then
  log "⚠ 타입 검사는 돌지 않았다 ($BUILD_GATE_REASON)"
fi
log "산출물: $WORK/{DESIGN,JUDGE,IMPL,VERIFY}.md"
