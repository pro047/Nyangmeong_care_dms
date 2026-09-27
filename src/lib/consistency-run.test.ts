import { describe, expect, it } from 'vitest'
import { RUN_TIMED_OUT, RUN_TIMEOUT_MS, runStatus, type RunRow } from './consistency-run'

const NOW = new Date('2026-09-27T15:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms)
// 화면에 그리는 스냅샷 — 기본은 실행 시작보다 오래된 것(그래야 실행 행이 상태를 정한다)
const OLD = ago(60 * 60 * 1000)
const run = (extra: Partial<RunRow>): RunRow => ({ startedAt: ago(1000), finishedAt: null, ok: null, reason: null, ...extra })

describe('runStatus', () => {
  it('행이 없으면 완료다 (표가 생기기 전 스냅샷)', () => {
    expect(runStatus(null, OLD, NOW)).toEqual({ kind: 'done' })
  })

  it('끝나고 성공이면 완료다', () => {
    expect(runStatus(run({ finishedAt: ago(10), ok: true }), OLD, NOW)).toEqual({ kind: 'done' })
  })

  it('끝나고 실패면 사유와 함께 실패다', () => {
    expect(runStatus(run({ finishedAt: ago(10), ok: false, reason: '읽을 수 있는 문서가 없습니다' }), OLD, NOW))
      .toEqual({ kind: 'failed', reason: '읽을 수 있는 문서가 없습니다' })
  })

  it('사유 없이 실패로 끝나도 빈 문구를 보이지 않는다', () => {
    expect(runStatus(run({ finishedAt: ago(10), ok: false, reason: '' }), OLD, NOW)).toEqual({ kind: 'failed', reason: '알 수 없는 오류' })
  })

  it('끝 기록이 없고 5분 안이면 검사 중이다', () => {
    const startedAt = ago(RUN_TIMEOUT_MS - 1)
    expect(runStatus(run({ startedAt }), OLD, NOW)).toEqual({ kind: 'running', remainingMs: 1 })
  })

  it('실행 행이 실패여도 그 뒤에 성공한 스냅샷을 그리고 있으면 완료다', () => {
    const failed = run({ startedAt: ago(10 * 60 * 1000), finishedAt: ago(9 * 60 * 1000), ok: false, reason: '읽을 수 있는 문서가 없습니다' })
    expect(runStatus(failed, ago(60 * 1000), NOW)).toEqual({ kind: 'done' })
  })

  it('끝 기록 없이 5분이 지나면 시간 초과 실패다 — "검사 중" 에 멈추지 않는다', () => {
    expect(runStatus(run({ startedAt: ago(RUN_TIMEOUT_MS) }), OLD, NOW)).toEqual({ kind: 'failed', reason: RUN_TIMED_OUT })
  })
})
