/**
 * 측정 실행 상태 판정 — 메인 패널의 검사 완료 · 검사 중 · 검사 실패. 입력은 `consistency_run` 한 행.
 *
 * 이것은 **실행 상태**다, 결과 판정이 아니다. 패널의 "신호등 금지"(결과 지표에 색을 입히면 파서 한계가
 * 문서 결함처럼 빨갛게 보인다)는 그대로고, 이 표시 하나만 예외다(2026-09-27 사람 결정).
 */

/**
 * 시작한 지 이만큼 지나도 끝 기록이 없으면 실패로 본다. 함수가 끊기면 끝 기록이 영영 안 와서 "검사 중" 에
 * 멈추기 때문이다. **라우트 한도(300초)와 같은 값이다** — 시작 기록은 응답 **뒤** `after()` 안에서 찍으므로
 * 측정이 이 시각을 넘겨 살아 있을 수 없다. 한도보다 짧게 잡으면 느리지만 살아 있는 측정을 실패로 보인다(리뷰, 사람 결정).
 * 시작 기록을 요청 앞쪽으로 옮기면 여유를 더해야 한다.
 * 평소 소요는 운영 실측 3.1초(메인 경로) · 업로드 경로 약 8초(5초 대기 포함, 추정).
 */
export const RUN_TIMEOUT_MS = 5 * 60 * 1000

export const RUN_TIMED_OUT = '5분이 지나도 끝나지 않았습니다 (서버에서 중단됐을 수 있습니다)'

export type RunRow = { startedAt: Date; finishedAt: Date | null; ok: boolean | null; reason: string | null }

/**
 * `remainingMs` — 서버가 시간 초과로 판정하기까지 남은 시간. **절대 시각을 넘기지 않는다** — 클라이언트가 자기
 * `Date.now()` 와 비교하면 사용자 PC 시계가 어긋난 만큼 폴링이 일찍 끊기거나 늦게 끝난다.
 */
export type RunStatus = { kind: 'done' } | { kind: 'running'; remainingMs: number } | { kind: 'failed'; reason: string }

/**
 * `measuredAt` 은 화면에 그리는 스냅샷의 측정 시각. 그것이 이 실행의 시작 이후면 **그 뒤에 성공한 측정이 있다**는
 * 뜻이라 완료로 본다 — 실행 행이 옛 실패를 가리킨 채 새 숫자 위에 "검사 실패" 를 띄우지 않게.
 */
export function runStatus(run: RunRow | null, measuredAt: Date, now: Date): RunStatus {
  // 이 표가 생기기 전의 스냅샷만 있는 경우 — 성공한 측정만 스냅샷을 남기므로 완료다
  if (!run) return { kind: 'done' }
  if (measuredAt.getTime() >= run.startedAt.getTime()) return { kind: 'done' }
  if (run.finishedAt) {
    return run.ok ? { kind: 'done' } : { kind: 'failed', reason: run.reason || '알 수 없는 오류' }
  }
  const remainingMs = run.startedAt.getTime() + RUN_TIMEOUT_MS - now.getTime()
  if (remainingMs <= 0) return { kind: 'failed', reason: RUN_TIMED_OUT }
  return { kind: 'running', remainingMs }
}
