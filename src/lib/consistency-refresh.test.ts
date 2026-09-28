import { describe, expect, it } from 'vitest'
import { ARROW_AXES } from './consistency-arrow-keys'
import { REFRESH_COOLDOWN_MS, inRefreshCooldown, lacksArrowAxes, measuredDocsDiffer, type MeasuredDoc } from './consistency-refresh'

const NOW = new Date('2026-09-27T05:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms)

const SCR: MeasuredDoc = { key: 'SCR-TST', dmsId: 'd_scr', dmsVersion: 3 }
const FN: MeasuredDoc = { key: 'FN-TST', dmsId: 'd_fn', dmsVersion: 1 }

describe('measuredDocsDiffer', () => {
  it('같으면 다시 재지 않는다 (순서는 상관없다)', () => {
    expect(measuredDocsDiffer([SCR, FN], [FN, SCR])).toBe(false)
  })

  it('새 버전이 올라왔으면 다시 잰다', () => {
    expect(measuredDocsDiffer([SCR, FN], [{ ...SCR, dmsVersion: 4 }, FN])).toBe(true)
  })

  it('키가 다른 문서로 옮겨 갔으면 다시 잰다', () => {
    expect(measuredDocsDiffer([SCR, FN], [{ ...SCR, dmsId: 'd_other' }, FN])).toBe(true)
  })

  it('키가 새로 달렸으면 다시 잰다', () => {
    expect(measuredDocsDiffer([SCR], [SCR, FN])).toBe(true)
  })

  it('휴지통에 들어가 지금 목록에서 빠졌으면 다시 잰다', () => {
    expect(measuredDocsDiffer([SCR, FN], [SCR])).toBe(true)
  })

  it('영구삭제로 빠진 자리에 다른 키가 새로 달려도 개수만 보지 않고 다시 잰다', () => {
    expect(measuredDocsDiffer([SCR, FN], [SCR, { key: 'REQ-TST', dmsId: 'd_req', dmsVersion: 1 }])).toBe(true)
  })

  it('스냅샷이 없으면 다시 잰다', () => {
    expect(measuredDocsDiffer(null, [SCR])).toBe(true)
  })
})

describe('inRefreshCooldown', () => {
  it('마지막 측정이 10분 안이면 예약하지 않는다', () => {
    expect(inRefreshCooldown(ago(REFRESH_COOLDOWN_MS - 1), NOW)).toBe(true)
  })

  it('측정이 없으면 쿨다운도 없다', () => {
    expect(inRefreshCooldown(null, NOW)).toBe(false)
  })

  it('못 읽는 문서가 있어 계속 다르더라도 10분에 한 번만 잰다', () => {
    // 못 읽은 FN 은 스냅샷 docs 에서 빠진다 — 비교는 매번 "다르다"
    expect(measuredDocsDiffer([SCR], [SCR, FN])).toBe(true)
    expect(inRefreshCooldown(ago(60_000), NOW)).toBe(true)
    expect(inRefreshCooldown(ago(REFRESH_COOLDOWN_MS), NOW)).toBe(false)
  })
})

describe('lacksArrowAxes', () => {
  it('세 화살표 축이 다 있으면 false 여야 한다', () => {
    expect(lacksArrowAxes([{ axis: 'referenceTotal' }, ...Object.values(ARROW_AXES).map((axis) => ({ axis }))])).toBe(false)
  })

  it('화살표 축이 하나라도 없으면 true 여야 한다 — 화살표 전 스냅샷은 다시 잰다', () => {
    expect(lacksArrowAxes([{ axis: 'referenceTotal' }, { axis: ARROW_AXES.reqBySCR }])).toBe(true)
  })
})
